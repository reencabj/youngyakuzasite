#!/usr/bin/env node
/**
 * build-live.mjs (robusto)
 * Lee slugs Kick desde data.json y genera live.json en la raíz.
 * Si algo falla, escribe [] para no romper el workflow.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT   = process.cwd();
const INPUT  = path.join(ROOT, "data.json");
const OUTPUT = path.join(ROOT, "live.json");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, { retries = 2, backoffMs = 600 } = {}) {
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) {
        const wait = backoffMs * Math.pow(2, a);
        console.log(`[kick] ${res.status} → retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (a === retries) throw e;
      const wait = backoffMs * Math.pow(2, a);
      console.log(`[net] ${e?.message || e} → retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error("Unexpected");
}

async function fetchKick(slug) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  try {
    const data = await fetchJson(url);
    const live = Boolean(data?.livestream);
    const viewers = live ? (data?.livestream?.viewers ?? 0) : 0;
    const thumb = live ? (data?.livestream?.thumbnail?.url ?? null) : null;
    return { slug, platform: "kick", live, viewers, thumb, updatedAt: new Date().toISOString() };
  } catch (e) {
    console.log(`[kick] ${slug}: ${e?.message || e}`);
    return { slug, platform: "kick", live: false, viewers: 0, thumb: null, updatedAt: new Date().toISOString(), error: String(e?.message || e) };
  }
}

async function main() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(INPUT, "utf8"));
  } catch (e) {
    console.log(`[data.json] no encontrado o inválido (${e?.message || e}). Genero live.json vacío.`);
    await fs.writeFile(OUTPUT, "[]\n", "utf8");
    return;
  }
  if (!Array.isArray(data)) data = [];

  const slugs = [...new Set(
    data.map(x => x?.kick ? String(x.kick).trim().toLowerCase() : "").filter(Boolean)
  )];

  console.log(`[info] ${slugs.length} slugs Kick encontrados.`);

  const CONCURRENCY = 5;
  const results = [];
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= slugs.length) break;
      const slug = slugs[idx];
      const r = await fetchKick(slug);
      results.push(r);             // <<<< push (array denso), no results[idx]
    }
  }
  // lanzar N workers en paralelo
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, worker));

  // ordenar: en vivo primero, luego viewers
  results.sort((a, b) => (Number(b.live) - Number(a.live)) || (b.viewers - a.viewers));

  await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2) + "\n", "utf8");
  const liveCount = results.filter(x => x.live).length;
  console.log(`[done] live.json generado: ${results.length} canales, ${liveCount} en vivo.`);
}


main().catch(async (err) => {
  console.error(`[fatal] ${err?.stack || err}`);
  try { await fs.writeFile(OUTPUT, "[]\n", "utf8"); } catch {}
  // NO hacemos process.exit(1) para que el workflow no falle.
});
