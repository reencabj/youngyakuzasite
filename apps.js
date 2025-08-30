// ====== CONFIG ======
const DATA_URL = './data.json';      // ruta a tu JSON
const REFRESH_MS = 60000;            // refresco de estado cada 60s

// ====== DOM ======
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const searchInput = document.getElementById('search');
const orderBtn = document.getElementById('live-only'); // lo usamos como botón de orden

// ====== Estado ======
let allChars = [];     // personajes originales (del JSON)
let merged = [];       // personajes + estado Kick
let orderMode = 'live-first'; // 'live-first' | 'name' | 'rank' (usa el botón para alternar)

// ====== Utilidades ======
function getKickSlugFrom(item) {
  // Acepta distintos nombres de campo para el slug
  if (item.kick) return normSlug(item.kick);
  if (item.kick_slug) return normSlug(item.kick_slug);
  if (item.kickSlug) return normSlug(item.kickSlug);
  if (item.kickUrl) {
    try {
      const u = new URL(item.kickUrl);
      if (u.hostname.includes('kick.com')) {
        const parts = u.pathname.split('/').filter(Boolean);
        return parts[0] ? normSlug(parts[0]) : null;
      }
    } catch {}
  }
  return null;
}
const normSlug = s => String(s).trim().replace(/^@/, '').toLowerCase();

async function fetchKick(slug, { signal } = {}) {
  const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
    headers: { 'accept': 'application/json' },
    signal
  });
  if (!r.ok) throw new Error(`Kick ${slug} status ${r.status}`);
  const data = await r.json();
  const live = !!data?.livestream;
  return {
    live,
    title: data?.livestream?.session_title ?? null,
    viewers: data?.livestream?.viewers ?? 0,
    thumb: data?.livestream?.thumbnail?.url ?? null,
    playback: data?.livestream?.source || data?.playback_url || null
  };
}

function matchesQuery(ch, q) {
  if (!q) return true;
  const hay = [
    ch.name, ch.alias, ch.role, ch.kickSlug,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortItems(arr) {
  if (orderMode === 'live-first') {
    return arr.sort((a, b) => Number(b.live) - Number(a.live) || byText(a.name, b.name));
  }
  if (orderMode === 'rank') {
    // Si tu data.json tiene un campo numérico 'rank' o 'rango', lo usamos
    const ra = (a.rank ?? a.rango ?? 9999);
    const rb = (b.rank ?? b.rango ?? 9999);
    return arr.sort((x, y) => (x.live === y.live ? (ra - rb) : Number(y.live) - Number(x.live)));
  }
  // name
  return arr.sort((a, b) => byText(a.name, b.name));
}
const byText = (a, b) => (String(a||'').localeCompare(String(b||''), 'es', { sensitivity: 'base' }));

function render(items) {
  if (!items.length) {
    empty.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = items.map(renderCard).join('');
}

function renderCard(ch) {
  const {
    name, alias, role, avatar, kickSlug,
    live, title, viewers, thumb
  } = ch;

  const badge = live
    ? `<span class="ml-auto px-2 py-0.5 text-xs font-semibold rounded bg-red-600/90">LIVE</span>`
    : `<span class="ml-auto px-2 py-0.5 text-xs font-semibold rounded bg-slate-700/70">offline</span>`;

  const preview = live && thumb
    ? `<img src="${thumb}" alt="live thumb" class="w-full h-40 object-cover rounded-lg ring-1 ring-slate-800 mb-3">`
    : '';

  const liveTitle = live && title
    ? `<p class="text-sm text-slate-400 line-clamp-2 mt-1">${escapeHTML(title)}</p>`
    : '';

  const avatarSrc = avatar || 'img/default-avatar.png';

  return `
  <article class="rounded-2xl p-4 ring-1 ring-slate-800 bg-slate-900/70 hover:bg-slate-900 transition">
    <div class="flex items-center gap-3">
      <img src="${avatarSrc}" alt="${escapeHTML(name || '')}" class="w-12 h-12 rounded-full object-cover ring-1 ring-slate-800">
      <div class="min-w-0">
        <h3 class="font-semibold">${escapeHTML(name || '')} ${alias ? `<span class="text-slate-400">(${escapeHTML(alias)})</span>` : ''}</h3>
        ${role ? `<p class="text-xs text-slate-400">${escapeHTML(role)}</p>` : ''}
      </div>
      ${badge}
    </div>

    ${preview}
    ${liveTitle}

    <div class="mt-3 flex items-c
