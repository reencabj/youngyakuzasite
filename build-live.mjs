#!/usr/bin/env node
/**
 * build-live.mjss
 * Genera live.json a partir de los slugs "kick" en data.json
 * - Sin dependencias externas (Node 20+ trae fetch nativo).
 * - Concurrencia limitada y reintentos con backoff suave.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, "data.json");     // tu fuente de personajes
const OUTPUT = path.join(process.cwd(), "live.json");
    // lo que consumirá index.html

// ---------- Utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const running = new Set();
  async function run() {
    if (i >= items.length) return;
    const idx = i++;
    const p = (async () => {
      out[idx] = await worker(items[idx], idx);
    })().finally(() => running.delete(p));
    running.add(p);
    if (running.size >= limit) await Promise.race(running);
    return run();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function fetchJson(url, opts = {}, { retries = 3, backoffMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { "accept": "application/json", ...(opts.headers || {}) },
      ...opts
    }).catch(() => null);

    if (!res) {
      if (attempt === retries) throw new Error("Network error");
    } else if (res.ok) {
      return res.json();
    } else if (res.status === 429 || res.status >= 500) {
      // rate limit o error temporal → backoff y reintento
      const wait = backoffMs * Math.pow(2, attempt);
      await sleep(wait);
      continue;
    } else {
      // error duro
      throw new Error(`HTTP ${res.status}`);
    }
  }
  throw new Error("Exhausted retries");
}

// ---------- Kick ----------
async function fetchKickStatus(slug) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(String(slug).toLowerCase())}`;
  try {
    const data = await fetchJson(url, {}, { retries: 2, backoffMs: 700 });
    const live = Boolean(data?.livestream);
    const viewers = live ? (data?.livestream?.viewers ?? 0) : 0;
    const thumb = live ? (data?.livestream?.thumbnail?.url ?? null) : null;
    return { live, viewers, thumb, error: null };
  } catch (e) {
    return { live: false, viewers: 0, thumb: null, error: String(e.message || e) };
  }
}

// ---------- Main ----------
async function main() {
  // 1) leer data.json
  const raw = await fs.readFile(DATA_PATH, "utf8").catch(() => "[]");
  let data = [];
  try { data = JSON.parse(raw); } catch { data = []; }
  if (!Array.isArray(data)) data = [];

  // 2) slugs únicos (solo kick)
  const slugs = [...new Set(
    data
      .map(p => (p?.kick ? String(p.kick).trim().toLowerCase() : ""))
      .filter(Boolean)
  )];

  // 3) consultar con concurrencia limitada
  const CONCURRENCY = 5;
  const results = await mapLimit(slugs, CONCURRENCY, async (slug) => {
    const s = await fetchKickStatus(slug);
    return {
      slug,
      platform: "kick",
      live: s.live,
      viewers: s.viewers,
      thumb: s.thumb,
      updatedAt: new Date().toISOString(),
      ...(s.error ? { error: s.error } : {})
    };
  });

  // 4) ordenar: en vivo primero, luego por viewers desc
  results.sort((a, b) => (b.live - a.live) || (b.viewers - a.viewers));

  // 5) escribir live.json
  await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2) + "\n", "utf8");

  // 6) logs útiles para depurar en Actions
  const liveCount = results.filter(r => r.live).length;
  console.log(`live.json generado: ${results.length} canales, ${liveCount} en vivo.`);
}

main().catch(err => {
  console.error("Error generando live.json:", err);
  process.exit(1);
});
