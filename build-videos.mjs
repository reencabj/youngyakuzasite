#!/usr/bin/env node
// Genera videos.json a partir de channels.json usando el RSS público de YouTube.
// Sin dependencias ni API key. Node 20 trae fetch nativo.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CFG  = path.join(ROOT, "channels.json");
const OUT  = path.join(ROOT, "videos.json");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchText(url, { retries = 2, backoffMs = 600 } = {}) {
  for (let a = 0; a <= retries; a++) {
    try {
      const r = await fetch(url, { headers: { "accept": "application/xml,text/xml;q=0.9,*/*;q=0.8" } });
      if (r.ok) return await r.text();
      if (r.status === 429 || r.status >= 500) {
        const wait = backoffMs * Math.pow(2, a);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (a === retries) throw e;
      const wait = backoffMs * Math.pow(2, a);
      await sleep(wait);
    }
  }
  throw new Error("Unexpected");
}

function parseFeed(xml, channelName) {
  // parseo mínimo por regex (suficiente para yt rss)
  const entries = [];
  const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
  const idRegex = /<yt:videoId>([^<]+)<\/yt:videoId>/;
  const titleRegex = /<title>([^<]+)<\/title>/;
  const pubRegex = /<published>([^<]+)<\/published>/;

  for (const m of xml.matchAll(entryRegex)) {
    const e = m[0];
    const id = (e.match(idRegex)?.[1] || "").trim();
    const title = (e.match(titleRegex)?.[1] || "").trim();
    const published = (e.match(pubRegex)?.[1] || "").trim();
    if (id) entries.push({ id, title, published, _channelName: channelName });
  }
  return entries;
}

async function main() {
  let cfg;
  try {
    cfg = JSON.parse(await fs.readFile(CFG, "utf8"));
  } catch {
    await fs.writeFile(OUT, "[]\n", "utf8");
    return;
  }
  const channels = Array.isArray(cfg?.channels) ? cfg.channels : [];
  const per = Number(cfg?.max_per_channel || 4);

  const all = [];
  for (const ch of channels) {
    const id = ch?.id?.trim();
    if (!id) continue;
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;
    try {
      const xml = await fetchText(url);
      const list = parseFeed(xml, ch.name || id).slice(0, per);
      all.push(...list);
    } catch (e) {
      // sigue con otros canales
    }
  }

  // dedupe por video id y ordenar por fecha
  const byId = new Map();
  for (const v of all) if (!byId.has(v.id)) byId.set(v.id, v);
  const items = [...byId.values()].sort((a,b) => new Date(b.published) - new Date(a.published));

  await fs.writeFile(OUT, JSON.stringify(items, null, 2) + "\n", "utf8");
  console.log(`[videos] ${items.length} videos agregados a videos.json`);
}

main().catch(async () => { try { await fs.writeFile(OUT, "[]\n", "utf8"); } catch {} });
