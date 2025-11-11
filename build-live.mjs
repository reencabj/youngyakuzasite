#!/usr/bin/env node
/**
 * build-live.mjs (robusto)
 * Lee slugs Kick desde data.json y genera live.json en la raiz.
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
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8000); // 8s timeout

      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 (compatible; YY-LiveBot/1.0)",
          referer: "https://youngyakuza.reenz.site/"
        },
        signal: ac.signal,
        cache: "no-store",
        redirect: "follow"
      });

      clearTimeout(t);

      if (res.ok) {
        // Evitar respuestas vacias con 200
        const text = await res.text();
        if (!text?.trim()) throw new Error("respuesta vacia");
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error("json invalido");
        }
      }

      if (res.status === 429 || res.status >= 500) {
        const wait = backoffMs * Math.pow(2, a);
        console.log(`[kick] ${res.status} -> retry en ${wait}ms`);
        await sleep(wait);
        continue;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (a === retries) throw e;
      const wait = backoffMs * Math.pow(2, a);
      console.log(`[net] ${e?.message || e} -> retry en ${wait}ms`);
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

    // Normalizar posibles cambios de API: si no hay livestream pero hay flags
    // conocidos que indiquen live, se puede adaptar aca en el futuro.

    return {
      slug,
      platform: "kick",
      live,
      viewers,
      thumb,
      updatedAt: new Date().toISOString()
    };
  } catch (e) {
    console.log(`[kick] ${slug}: ${e?.message || e}`);
    return {
      slug,
      platform: "kick",
      live: false,
      viewers: 0,
      thumb: null,
      updatedAt: new Date().toISOString(),
      error: String(e?.message || e)
    };
  }
}

async function main() {
  let data;
  try {
    const raw = await fs.readFile(INPUT, "utf8");
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`[data.json] no encontrado o invalido (${e?.message || e}). Genero live.json vacio.`);
    await fs.writeFile(OUTPUT, "[]\n", "utf8");
    return;
  }

  if (!Array.isArray(data)) data = [];

  // Extraer slugs kick unicos
  const slugs = [...new Set(
    data
      .map(x => (x?.kick ? String(x.kick).trim().toLowerCase() : ""))
      .filter(Boolean)
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
      results.push(r); // array denso
    }
  }

  // Lanzar N workers en paralelo (min para no lanzar 0)
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, slugs.length)) }, worker)
  );

  // Ordenar: live primero, luego por viewers desc, luego alfabetico por slug
  results.sort((a, b) =>
    (Number(b.live) - Number(a.live)) ||
    (b.viewers - a.viewers) ||
    a.slug.localeCompare(b.slug)
  );

  await fs.writeFile(OUTPUT, JSON.stringify(results, null, 2) + "\n", "utf8");

  const liveCount = results.filter(x => x.live).length;
  console.log(`[done] live.json generado: ${results.length} canales, ${liveCount} en vivo.`);
}

main().catch(async (err) => {
  console.error(`[fatal] ${err?.stack || err}`);
  try { await fs.writeFile(OUTPUT, "[]\n", "utf8"); } catch {}
  // No hacemos process.exit(1) para que el workflow no falle.
});
