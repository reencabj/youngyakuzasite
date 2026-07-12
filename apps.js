    // ===== Utilidades =====
    const RANKS = { "1": "Jefe", "2": "Yakuza", "3": "Shatei" };
    const FALLBACK_AVATAR = 'img/logo.png';
    const rankLabel = v => RANKS[String(v)] ?? "-";
    const norm = s => (s || "").toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
    const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

    function sanitizeCharacters(list = []) {
      const seen = new Set();
      const sanitized = [];
      list.forEach(item => {
        const entry = normalizeCharacter(item);
        if (!entry) return;
        const key = `${entry.nombre.toLowerCase()}|${entry.kick || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        sanitized.push(entry);
      });
      return sanitized;
    }

    function normalizeCharacter(raw = {}) {
      const nombre = (raw.nombre || '').trim();
      if (!nombre) return null;
      const alias = (raw.alias || '').trim();
      const ooc = (raw.ooc || '').trim();
      const rango = Number(raw.rango ?? raw.rank);
      const kick = raw.kick ? String(raw.kick).trim().toLowerCase() : undefined;
      const foto = (raw.foto || '').trim() || FALLBACK_AVATAR;
      const links = normalizeLinks(raw.links);

      return {
        ...raw,
        nombre,
        alias,
        ooc,
        rango: Number.isFinite(rango) ? rango : undefined,
        kick,
        foto,
        links,
      };
    }

    function normalizeLinks(list) {
      if (!Array.isArray(list)) return [];
      return list
        .map(link => {
          if (!link) return null;
          const label = (link.label || '').trim();
          const href = safeUrl(link.href);
          if (!href) return null;
          return { label, href, type: link.type };
        })
        .filter(Boolean);
    }

    function safeUrl(value) {
      try {
        const url = new URL(String(value));
        return url.href;
      } catch {
        return null;
      }
    }

    function driveIdFrom(url){
      try{
        const u = new URL(url);
        if (u.hostname.includes('googleusercontent.com')) {
          const part = u.pathname.split('/d/')[1] || "";
          return (part.split('=')[0] || "").trim();
        }
        return (u.searchParams.get('id') || "").trim();
      }catch{ return ""; }
    }
    const driveThumb = id => `https://lh3.googleusercontent.com/d/${id}=w800`;   // grilla
    const driveFull  = id => `https://lh3.googleusercontent.com/d/${id}=w2400`;  // lightbox
    const driveDL    = id => `https://drive.google.com/uc?export=download&id=${id}`;


    let DATA = [];
    let liveRefreshTimer = null;
    let rotateTimer = null;
    let LIVE_QUEUE = [];
    let LIVE_INDEX = 0;
    let ROTATOR_OPEN = true;

    // Videos
    let videosLoaded = false;
    let videosTimer = null;
    const VIDEOS_REFRESH_MS = 5 * 60_000;

    // ===== LIVE STATUS desde live.json (generado por GitHub Actions) =====
    const LIVE_TTL = 60_000; // revalida cada 60s
    let LIVE_CACHE = { t: 0, map: new Map() };
    let lastLiveSnapshot = new Map();
    
    async function getLiveMap() {
      const now = Date.now();
      if (now - LIVE_CACHE.t < LIVE_TTL) return LIVE_CACHE.map;
    
      const res = await fetch('live.json', { cache: 'no-cache' });
      if (!res.ok) return LIVE_CACHE.map;
      const raw = await res.json();
      
      // ðŸ”§ Filtra entradas nulas o sin slug
      const arr = (Array.isArray(raw) ? raw : []).filter(x => x && x.slug);
      
      const map = new Map(arr.map(x => [String(x.slug).toLowerCase(), x]));
      LIVE_CACHE = { t: now, map };
      return map;

    }

    // ===== MULTIKICK (sin "return" y leyendo live.json) =====
    const MK = {};
    (() => {
      let selected = new Set();
      let timer = null;

      async function liveListAsync() {
        const LIVE_MAP = await getLiveMap();
        return DATA.filter(p => p.kick && LIVE_MAP.get(p.kick)?.live === true);
      }

      function renderChips(live) {
        const box = document.getElementById('mk-live-list');
        const countEl = document.getElementById('mk-count');
        if (!box || !countEl) return;

        if (!live.length) {
          box.innerHTML = '<p class="text-neutral-400">No hay streams en vivo.</p>';
          countEl.textContent = '0 seleccionados';
          document.getElementById('mk-grid').innerHTML = '';
          return;
        }

        box.innerHTML = live.map(p => {
          const sel = selected.has(p.kick);
          const cls = sel ? 'border-yakuza bg-yakuza/20'
                          : 'border-neutral-800 bg-neutral-900/70 hover:bg-neutral-800';
          return `
            <button class="mk-item inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${cls}"
                    data-slug="${p.kick}">
              <img src="${p.foto || FALLBACK_AVATAR}" class="w-8 h-8 rounded-full object-cover" alt="" loading="lazy" decoding="async">
              <span class="text-sm">${p.nombre}</span>
              ${sel ? '<span class="text-emerald-400 text-xs">â—</span>' : ''}
            </button>
          `;
        }).join('');

        countEl.textContent = `${selected.size} seleccionados`;
      }

      function setGridCols(n) {
        const grid = document.getElementById('mk-grid');
        if (!grid) return;
        let cols = 'md:grid-cols-1';
        if (n === 2) cols = 'md:grid-cols-2';
        else if (n === 3) cols = 'md:grid-cols-3';
        else if (n === 4) cols = 'md:grid-cols-2 xl:grid-cols-2';
        else if (n >= 5 && n <= 6) cols = 'md:grid-cols-3';
        else if (n >= 7) cols = 'md:grid-cols-4';
        grid.className = `grid gap-4 pb-10 ${cols}`;
      }

      function renderGrid() {
        const grid = document.getElementById('mk-grid');
        const countEl = document.getElementById('mk-count');
        if (!grid || !countEl) return;

        const sel = [...selected];
        setGridCols(sel.length);
        grid.innerHTML = sel.map(slug => `
          <div class="rounded-2xl overflow-hidden bg-black border border-neutral-800">
            <iframe class="w-full aspect-video" loading="lazy"
                    src="" data-src="https://player.kick.com/${encodeURIComponent(slug)}?autoplay=true&muted=true"
                    allow="autoplay; fullscreen" allowfullscreen frameborder="0"></iframe>
          </div>
        `).join('');

        grid.querySelectorAll('iframe[data-src]').forEach(fr => {
          fr.src = fr.dataset.src;
          fr.removeAttribute('data-src');
        });

        countEl.textContent = `${selected.size} seleccionados`;
      }

      async function refresh(first = false) {
        const live = await liveListAsync();
        const liveSlugs = live.map(p => p.kick);
        selected = new Set([...selected].filter(s => liveSlugs.includes(s)));
        if (first && selected.size === 0) live.forEach(p => selected.add(p.kick));
        renderChips(live);
        renderGrid();
      }

      async function open() {
        if (!Array.isArray(DATA) || DATA.length === 0) {
          const onReady = () => { refresh(true); };
          document.addEventListener('yy:data-ready', onReady, { once: true });
          return;
        }
        await refresh(true);
        clearInterval(timer);
        timer = setInterval(() => refresh(false), 60_000);
      }

      function stop() { clearInterval(timer); timer = null; }

      document.getElementById('view-multikick')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.mk-item');
        if (chip) {
          const slug = chip.dataset.slug;
          if (selected.has(slug)) selected.delete(slug); else selected.add(slug);
          refresh(false);
        }
        if (e.target.closest('#mk-clear'))      { selected.clear(); refresh(false); }
        if (e.target.closest('#mk-select-all')) { liveListAsync().then(l => { selected = new Set(l.map(p => p.kick)); refresh(false); }); }
      });

      // Exponer sin "return"
      MK.open = open; MK.stop = stop; MK.refresh = refresh;
    })();

    // ==== Fullscreen para MultiKick ====
    (function () {
      const btn = document.getElementById('mk-full');
      if (!btn) return;

      const root = document.getElementById('view-multikick');

      const isFS = () =>
        document.fullscreenElement === root ||
        document.webkitFullscreenElement === root ||
        document.msFullscreenElement === root;

      const enterFS = () => {
        const req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
        if (req) req.call(root);
      };

      const exitFS = () => {
        const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (ex) ex.call(document);
      };

      const updateLabel = () => {
        btn.textContent = isFS() ? 'Salir de pantalla completa' : 'Pantalla completa';
        try { if (typeof MK.refresh === 'function') MK.refresh(false); } catch {}
      };

      btn.addEventListener('click', () => (isFS() ? exitFS() : enterFS()));
      document.addEventListener('fullscreenchange', updateLabel);
      document.addEventListener('webkitfullscreenchange', updateLabel);
      updateLabel();
    })();

    // ===== Tabs =====
    const VIEWS = ['inicio','personajes','galeria','videos','lore','multikick'];
    const TAB_ACTIVE   = 'tab tab-active';
    const TAB_INACTIVE = 'tab';

    function styleTabs(activeId) {
      document.querySelectorAll('.tab[data-view]').forEach(btn => {
        const id = btn.dataset.view;
        btn.className = (id === activeId) ? TAB_ACTIVE : TAB_INACTIVE;
      });
    }
    function showView(v) {
      VIEWS.forEach(id => {
        const el = document.getElementById('view-'+id);
        if (el) el.classList.toggle('hidden', id !== v);
      });
      styleTabs(v);
      if (v === 'inicio') { renderHome(); }
      if (v === 'personajes' && DATA.length) { render(); }
      if (v === 'galeria') { loadGallery(); }
      if (v === 'videos'  && !videosLoaded)  loadVideos();
      if (v === 'lore'    && !loreLoaded)    loadLore();

      if (v === 'multikick') { MK.open?.(); }
      else { MK.stop?.(); }

      const rotator = document.getElementById('live-rotator');
      if (v === 'inicio') {
        rotator?.classList.add('hidden');
        clearInterval(rotateTimer);
        rotateTimer = null;
      } else if (ROTATOR_OPEN && LIVE_QUEUE.length > 0) {
        rotator?.classList.remove('hidden');
        if (!rotateTimer) startRotation();
      }
    }
    document.addEventListener('click', (e) => {
      const goto = e.target.closest('[data-goto]');
      if (goto) { showView(goto.dataset.goto); return; }
      const tab = e.target.closest('.tab[data-view]');
      if (tab) showView(tab.dataset.view);
    });

    // ===== Data & render Personajes =====
    async function loadData() {
      try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error(`No se pudieron cargar los datos (HTTP ${res.status})`);
        const json = await res.json();
        DATA = sanitizeCharacters(Array.isArray(json) ? json : []);
        document.dispatchEvent(new CustomEvent('yy:data-ready'));
        await renderHome();
      } catch (e) {
        console.error('Error cargando data.json', e);
        document.getElementById('grid').innerHTML =
          '<div class="text-red-400">Error cargando datos. Asegúrate de subir <code>data.json</code> válido.</div>';
      }
    }

    function renderLinkButtons(p) {
      if (!p.links?.length) return '';
      return p.links.map(l => {
        const t = linkType(l);
        const title = l.label || t.charAt(0).toUpperCase() + t.slice(1);
        return `
          <a class="yy-icon-btn" href="${l.href}" target="_blank" rel="noreferrer" aria-label="${title}" title="${title}">
            ${iconSvg(t)}
          </a>
        `;
      }).join('');
    }

    function renderCharacterCard(p) {
      const kickHtml = p.kick ? `
        <a id="kick-${p.kick}"
           data-slug="${p.kick}"
           href="https://kick.com/${p.kick}"
           target="_blank" rel="noreferrer"
           class="kick-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-neutral-700/50 bg-neutral-800/50 hover:bg-neutral-700/50">
          <span class="kick-dot inline-block w-2 h-2 rounded-full bg-neutral-500"></span>
          <span class="kick-label">Kick</span>
        </a>
      ` : '';

      const linksHtml = renderLinkButtons(p);
      const actionsHtml = (kickHtml || linksHtml) ? `
        <div class="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-white/5">
          ${kickHtml}
          ${linksHtml}
        </div>
      ` : '';

      return `
        <article class="char-card group fade-in rounded-xl overflow-hidden bg-neutral-900/50 border border-white/5 backdrop-blur-sm hover:border-yakuza/25">
          <div class="relative aspect-[3/4] overflow-hidden bg-neutral-950">
            <img src="${p.foto || FALLBACK_AVATAR}" alt="${p.nombre}"
                 class="char-photo w-full h-full object-cover object-top" loading="lazy" decoding="async" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"></div>
            <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-black/55 text-yakuza border border-yakuza/35 backdrop-blur-sm">
              ${rankLabel(p.rango)}
            </span>
            ${p.alias ? `
              <span class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] bg-black/55 text-neutral-200 border border-white/10 backdrop-blur-sm max-w-[48%] truncate">
                ${p.alias}
              </span>
            ` : ''}
            <div class="absolute bottom-0 inset-x-0 p-3">
              <h3 class="font-semibold text-neutral-100 truncate leading-tight">${p.nombre}</h3>
              <p class="text-xs text-neutral-400 truncate mt-0.5">${p.ooc || '—'}</p>
            </div>
          </div>
          ${actionsHtml ? `<div class="p-3">${actionsHtml}</div>` : ''}
        </article>
      `;
    }

    function renderCharacterLinks(p) {
      const btns = renderLinkButtons(p);
      if (!btns) return '';
      return `<div class="flex flex-wrap gap-1.5 mt-3">${btns}</div>`;
    }

    let HOME_LIVE_LIST = [];
    let HOME_LIVE_INDEX = 0;

    function setHomeStream(index) {
      if (!HOME_LIVE_LIST.length) return;
      HOME_LIVE_INDEX = ((index % HOME_LIVE_LIST.length) + HOME_LIVE_LIST.length) % HOME_LIVE_LIST.length;
      const p = HOME_LIVE_LIST[HOME_LIVE_INDEX];
      const slug = p.kick;

      const player = document.getElementById('home-player');
      const chat = document.getElementById('home-chat');
      if (player) {
        player.src = `https://player.kick.com/${encodeURIComponent(slug)}?autoplay=true&muted=true`;
      }
      if (chat) {
        chat.src = `https://kick.com/popout/${encodeURIComponent(slug)}/chat`;
      }

      const avatar = document.getElementById('home-info-avatar');
      const nameEl = document.getElementById('home-info-name');
      const aliasEl = document.getElementById('home-info-alias');
      const oocEl = document.getElementById('home-info-ooc');
      const rankEl = document.getElementById('home-info-rank');
      const linksEl = document.getElementById('home-info-links');
      const kickLink = document.getElementById('home-info-kick');
      const chatLink = document.getElementById('home-chat-link');

      if (avatar) { avatar.src = p.foto || FALLBACK_AVATAR; avatar.alt = p.nombre; }
      if (nameEl) nameEl.textContent = p.nombre;
      if (aliasEl) {
        aliasEl.textContent = p.alias ? `"${p.alias}"` : '';
        aliasEl.classList.toggle('hidden', !p.alias);
      }
      if (oocEl) oocEl.textContent = p.ooc ? `OOC: ${p.ooc}` : '';
      if (rankEl) rankEl.textContent = rankLabel(p.rango);
      if (linksEl) linksEl.innerHTML = renderCharacterLinks(p).replace('mt-3', 'mt-0') || '';
      const kickUrl = `https://kick.com/${encodeURIComponent(slug)}`;
      if (kickLink) kickLink.href = kickUrl;
      if (chatLink) chatLink.href = `https://kick.com/popout/${encodeURIComponent(slug)}/chat`;

      document.querySelectorAll('.home-picker-btn').forEach((btn, i) => {
        btn.classList.toggle('home-picker-btn-active', i === HOME_LIVE_INDEX);
      });
    }

    function renderHomePicker(liveList) {
      const picker = document.getElementById('home-live-picker');
      if (!picker) return;

      if (liveList.length <= 1) {
        picker.innerHTML = '';
        picker.classList.add('hidden');
        return;
      }

      picker.classList.remove('hidden');
      picker.innerHTML = liveList.map((p, i) => `
        <button type="button" class="home-picker-btn ${i === HOME_LIVE_INDEX ? 'home-picker-btn-active' : ''}"
                data-home-index="${i}">
          <img src="${p.foto || FALLBACK_AVATAR}" alt="" class="w-8 h-8 rounded-full object-cover ring-1 ring-white/10" loading="lazy" decoding="async" />
          <span class="text-sm font-medium text-neutral-200 max-w-[120px] truncate">${p.nombre}</span>
          <span class="w-1.5 h-1.5 rounded-full bg-yakuza animate-pulse shrink-0"></span>
        </button>
      `).join('');
    }

    async function renderHome() {
      if (!DATA.length) return;

      const LIVE_MAP = await getLiveMap();
      HOME_LIVE_LIST = DATA
        .filter(p => p.kick && LIVE_MAP.get(p.kick)?.live === true)
        .sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));

      const theater = document.getElementById('home-live-theater');
      const empty = document.getElementById('home-live-empty');
      const countEl = document.getElementById('home-live-count');

      if (countEl) countEl.textContent = String(HOME_LIVE_LIST.length);

      if (!HOME_LIVE_LIST.length) {
        theater?.classList.add('hidden');
        empty?.classList.remove('hidden');
        const player = document.getElementById('home-player');
        const chat = document.getElementById('home-chat');
        if (player) player.src = '';
        if (chat) chat.src = '';
      } else {
        empty?.classList.add('hidden');
        theater?.classList.remove('hidden');

        if (HOME_LIVE_INDEX >= HOME_LIVE_LIST.length) HOME_LIVE_INDEX = 0;
        renderHomePicker(HOME_LIVE_LIST);
        setHomeStream(HOME_LIVE_INDEX);
      }

      await updateLiveUI_fromMap(LIVE_MAP);
      syncLiveSnapshotFromData(LIVE_MAP);
      scheduleRender();
    }

    function getFilteredList(LIVE_MAP) {
      const q = norm(document.getElementById('q').value);
      const rango = document.getElementById('rango').value;
      const sort = document.getElementById('sort').value;

      const list = DATA.filter(p => {
        const matchQ =
          !q ||
          norm(p.nombre).includes(q) ||
          norm(p.ooc).includes(q) ||
          norm(p.alias || '').includes(q) ||
          norm(rankLabel(p.rango)).includes(q);
        const matchRango = !rango || String(p.rango) === String(rango);
        return matchQ && matchRango;
      });

      list.sort((a, b) => {
        const liveA = LIVE_MAP.get(a.kick)?.live ? 1 : 0;
        const liveB = LIVE_MAP.get(b.kick)?.live ? 1 : 0;
        if (liveB !== liveA) return liveB - liveA;
        switch (sort) {
          case 'rango-asc':  return (b.rango ?? -999) - (a.rango ?? -999);
          case 'rango-desc': return (a.rango ??  999) - (b.rango ??  999);
          case 'nombre-desc': return norm(b.nombre).localeCompare(norm(a.nombre));
          case 'live-desc':   return 0;
          default:            return norm(a.nombre).localeCompare(norm(b.nombre));
        }
      });

      return { list, sort };
    }

    function syncLiveSnapshotFromData(LIVE_MAP) {
      lastLiveSnapshot.clear();
      DATA.forEach(p => {
        if (!p.kick) return;
        lastLiveSnapshot.set(p.kick, LIVE_MAP.get(p.kick)?.live ?? false);
      });
    }

    function isViewVisible(id) {
      return !document.getElementById('view-' + id)?.classList.contains('hidden');
    }

    async function refreshLiveState() {
      const LIVE_MAP = await getLiveMap();

      let liveChanged = false;
      DATA.forEach(p => {
        if (!p.kick) return;
        const live = LIVE_MAP.get(p.kick)?.live ?? false;
        const prev = lastLiveSnapshot.get(p.kick);
        if (prev !== undefined && prev !== live) liveChanged = true;
        paintKickButton(p.kick, { live });
      });

      await updateLiveUI_fromMap(LIVE_MAP);

      if (liveChanged) {
        if (isViewVisible('inicio')) {
          const prevSlug = HOME_LIVE_LIST[HOME_LIVE_INDEX]?.kick;
          await renderHome();
          if (prevSlug) {
            const newIdx = HOME_LIVE_LIST.findIndex(p => p.kick === prevSlug);
            if (newIdx >= 0) setHomeStream(newIdx);
          }
        }
        if (isViewVisible('personajes')) await render();
        else syncLiveSnapshotFromData(LIVE_MAP);
      } else {
        syncLiveSnapshotFromData(LIVE_MAP);
        scheduleRender();
      }
    }

      async function render() {
        const LIVE_MAP = await getLiveMap();
        const { list, sort } = getFilteredList(LIVE_MAP);
      
        const grid = document.getElementById('grid');
        const empty = document.getElementById('empty');
      
        if (!list.length) {
          grid.innerHTML = '';
          empty.classList.remove('hidden');
          await updateLiveUI_fromMap(LIVE_MAP);
          syncLiveSnapshotFromData(LIVE_MAP);
          scheduleRender();
          return;
        }
        empty.classList.add('hidden');

        grid.innerHTML = list.map(renderCharacterCard).join('');
      
        list.forEach(p => {
          if (!p.kick) return;
          const live = LIVE_MAP.get(p.kick)?.live ?? false;
          paintKickButton(p.kick, { live });
        });
      
        await updateLiveUI_fromMap(LIVE_MAP);
        syncLiveSnapshotFromData(LIVE_MAP);
        scheduleRender();
      }

    function scheduleRender(){
      clearTimeout(liveRefreshTimer);
      const needsRefresh = (isViewVisible('personajes') || isViewVisible('inicio')) && !document.hidden;
      if (needsRefresh) {
        liveRefreshTimer = setTimeout(() => refreshLiveState(), 65_000);
      }
    }

    // Eventos Personajes (debounced)
    document.getElementById('q').addEventListener('input', debounce(render, 200));
    document.getElementById('rango').addEventListener('change', render);
    document.getElementById('sort').addEventListener('change', render);
    document.getElementById('clear').addEventListener('click', () => {
      document.getElementById('q').value = '';
      document.getElementById('rango').value = '';
      document.getElementById('sort').value = 'rango-desc';
      render();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveState(); });

    // Click en boton Kick: abrir canal
    document.getElementById('grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.kick-btn');
      if (!btn) return;
      e.preventDefault();
      const slug = (btn.getAttribute('data-slug') || '').trim().toLowerCase();
      if (!slug) return;
      window.open(`https://kick.com/${encodeURIComponent(slug)}`, '_blank', 'noopener,noreferrer');
    });
    document.getElementById('home-live-picker')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-index]');
      if (!btn) return;
      setHomeStream(Number(btn.dataset.homeIndex || 0));
    });

    async function updateLiveUI_fromMap(LIVE_MAP) {
      const liveNow = DATA
        .filter(p => p.kick && (LIVE_MAP.get(p.kick)?.live === true))
        .map(p => String(p.kick).toLowerCase());
    
      const pill = document.getElementById('live-pill');
      const count = liveNow.length;
      if (count > 0) {
        pill.classList.remove('hidden');
        pill.querySelector('span:last-child').textContent = `En vivo (${count})`;
      } else { pill.classList.add('hidden'); }
    
      const changed = JSON.stringify(liveNow) !== JSON.stringify(LIVE_QUEUE);
      LIVE_QUEUE = liveNow;
      if (changed) { LIVE_INDEX = 0; startRotation(); }
    
      const panel = document.getElementById('live-rotator');
      const onInicio = isViewVisible('inicio');
      if (LIVE_QUEUE.length === 0 || onInicio) {
        panel.classList.add('hidden');
        if (onInicio) {
          clearInterval(rotateTimer);
          rotateTimer = null;
        }
      } else if (ROTATOR_OPEN) {
        panel.classList.remove('hidden');
        setIframeTo(LIVE_QUEUE[LIVE_INDEX % LIVE_QUEUE.length]);
        if (!rotateTimer) startRotation();
      }
    
      try {
        const mkVisible = !document.getElementById('view-multikick')?.classList.contains('hidden');
        if (mkVisible && typeof MK.refresh === 'function') MK.refresh(false);
      } catch {}
    }

    function setIframeTo(slug) {
      const iframe = document.getElementById('live-iframe');
      const link = document.getElementById('live-link');
      if (!slug) return;
      iframe.src = `https://player.kick.com/${encodeURIComponent(slug)}?autoplay=true&muted=true`;
      link.href = `https://kick.com/${encodeURIComponent(slug)}`;
    }
    function startRotation() {
      clearInterval(rotateTimer);
      if (LIVE_QUEUE.length === 0) return;
      setIframeTo(LIVE_QUEUE[LIVE_INDEX % LIVE_QUEUE.length]);
      rotateTimer = setInterval(() => {
        LIVE_INDEX = (LIVE_INDEX + 1) % LIVE_QUEUE.length;
        setIframeTo(LIVE_QUEUE[LIVE_INDEX]);
      }, 20_000);
    }
    document.getElementById('live-pill').addEventListener('click', () => {
      if (LIVE_QUEUE.length === 0 || isViewVisible('inicio')) return;
      ROTATOR_OPEN = !ROTATOR_OPEN;
      document.getElementById('live-rotator').classList.toggle('hidden', !ROTATOR_OPEN);
      if (ROTATOR_OPEN) startRotation();
    });
    document.getElementById('live-close').addEventListener('click', () => {
      ROTATOR_OPEN = false;
      document.getElementById('live-rotator').classList.add('hidden');
    });
    document.getElementById('live-prev').addEventListener('click', () => {
      if (LIVE_QUEUE.length === 0) return;
      LIVE_INDEX = (LIVE_INDEX - 1 + LIVE_QUEUE.length) % LIVE_QUEUE.length;
      setIframeTo(LIVE_QUEUE[LIVE_INDEX]);
    });
    document.getElementById('live-next').addEventListener('click', () => {
      if (LIVE_QUEUE.length === 0) return;
      LIVE_INDEX = (LIVE_INDEX + 1) % LIVE_QUEUE.length;
      setIframeTo(LIVE_QUEUE[LIVE_INDEX]);
    });

    // ===== Pintar estado boton Kick =====
    function paintKickButton(slug, state) {
      const esc = (s) =>
        (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
          ? CSS.escape(s)
          : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const selector = `#kick-${esc(slug)}, a.kick-btn[data-slug="${esc(slug)}"]`;
      document.querySelectorAll(selector).forEach(el => {
        let dot = el.querySelector('.kick-dot');
        let label = el.querySelector('.kick-label');
        if (!dot) { dot = document.createElement('span'); dot.className='kick-dot inline-block w-2 h-2 rounded-full'; el.prepend(dot); }
        if (!label) { label = document.createElement('span'); label.className='kick-label'; el.appendChild(label); }

        if (state.live === true) {
          el.className = 'kick-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-yakuza/50 bg-yakuza/10 hover:bg-yakuza/20';
          dot.className = 'kick-dot inline-block w-2 h-2 rounded-full bg-yakuza animate-pulse';
          label.textContent = 'En vivo';
        } else if (state.live === false) {
          el.className = 'kick-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-neutral-700/50 bg-neutral-800/50 hover:bg-neutral-700/50';
          dot.className = 'kick-dot inline-block w-2 h-2 rounded-full bg-neutral-500';
          label.textContent = 'Offline';
        } else {
          el.className = 'kick-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-neutral-700/50 bg-neutral-800/50 hover:bg-neutral-700/50';
          dot.className = 'kick-dot inline-block w-2 h-2 rounded-full bg-neutral-500';
          label.textContent = 'Kick';
        }
      });
    }
    // ===== Galería =====
    let galleryLoaded = false;
    let YY_GALLERY = [];    // [{src, alt}]
    let YY_INDEX = 0;
    let galleryLastFetch = 0;
    let galleryListenersBound = false;
    const GALLERY_TTL = 5 * 60_000;

   async function loadGallery(options = {}) {
      const force = options.force === true;
      const now = Date.now();
    
      if (!force && galleryLoaded && YY_GALLERY.length && (now - galleryLastFetch) < GALLERY_TTL) {
        return;
      }
    
      try {
        const r = await fetch('gallery.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('gallery.json no encontrado');
        YY_GALLERY = await r.json();
    
        const html = YY_GALLERY.map((i, idx) => {
          const id = driveIdFrom(i.src) || i.id;
          const thumb = id ? driveThumb(id) : (i.src || "");
          const alt = i.alt || "";
          return `
            <figure class="gallery-item relative group overflow-hidden cursor-zoom-in aspect-square bg-neutral-900/50">
              <a href="${id ? driveDL(id) : i.src}" download
                 class="yy-dl-btn text-neutral-200 hover:text-white" title="Descargar">â¬‡ï¸Ž</a>
              <img src="${thumb}" alt="${alt}"
                   class="yy-zoomable w-full h-full object-cover"
                   loading="lazy" decoding="async"
                   data-idx="${idx}" data-id="${id || ""}">
              ${alt ? `
                <figcaption class="absolute inset-x-0 bottom-0 px-3 py-2.5 text-xs text-white bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  ${alt}
                </figcaption>
              ` : ''}
            </figure>
          `;
        }).join('');
    
        const grid = document.getElementById('galeria-grid');
        grid.innerHTML = html || '<p class="text-neutral-400">Sin imágenes.</p>';
        galleryLoaded = true;
        galleryLastFetch = now;
    
        // ðŸ”½ Fallback si alguna miniatura no carga
        document.querySelectorAll('#galeria-grid img').forEach(img => {
          img.addEventListener('error', () => {
            try {
              const id = new URL(img.src).pathname.split('/d/')[1]?.split('=')[0] 
                         || new URL(img.src).searchParams.get('id');
              if (id) img.src = `https://lh3.googleusercontent.com/d/${id}=w1600`;
            } catch {}
          });
        });
    
        // ðŸ”½ Listener para abrir el lightbox al click
        if (!galleryListenersBound) {
          grid.addEventListener('click', (e) => {
            const img = e.target.closest('img[data-idx]');
            if (!img) return;
            e.preventDefault();
            const i = Number(img.dataset.idx || 0);
            yyOpen(i);
          });
          galleryListenersBound = true;
        }
    
      } catch (e) {
        document.getElementById('galeria-grid').innerHTML =
          '<div class="text-red-400">No se pudo cargar <code>gallery.json</code>.</div>';
      }
    }
   
    function yyRender() {
      const item = YY_GALLERY[YY_INDEX];
      if (!item) return;
    
      // intentamos ID desde el DOM (data-id) o URL original
      const imgDom = document.querySelector(`#galeria-grid img[data-idx="${YY_INDEX}"]`);
      const id = imgDom?.dataset?.id || driveIdFrom(item.src);
    
      const img = document.getElementById('yy-img');
      const cap = document.getElementById('yy-caption');
      const dl  = document.getElementById('yy-dl');
    
      const bigSrc = id ? driveFull(id) : (item.src || "");
      const dlHref = id ? driveDL(id)   : (item.src || "");
    
      img.src = bigSrc;
      img.alt = item.alt || '';
      cap.textContent = item.alt || '';
      dl.href = dlHref;                 // descarga forzada
      dl.download = (item.alt || `imagen-${YY_INDEX+1}`).replace(/[^\w.-]+/g,'_');
    }
    
    function yyOpen(i=0) {
      YY_INDEX = Math.max(0, Math.min(i, YY_GALLERY.length-1));
      yyRender();
      document.getElementById('yy-lightbox').classList.remove('hidden'); // mostrar overlay
      document.addEventListener('keydown', yyKeys);
    }

    function yyClose() {
      document.getElementById('yy-lightbox').classList.add('hidden');
      document.removeEventListener('keydown', yyKeys);
    }
    function yyPrev() { if (!YY_GALLERY.length) return; YY_INDEX = (YY_INDEX - 1 + YY_GALLERY.length) % YY_GALLERY.length; yyRender(); }
    function yyNext() { if (!YY_GALLERY.length) return; YY_INDEX = (YY_INDEX + 1) % YY_GALLERY.length; yyRender(); }
    function yyKeys(e) {
      if (e.key === 'Escape') yyClose();
      if (e.key === 'ArrowLeft') yyPrev();
      if (e.key === 'ArrowRight') yyNext();
    }
    // Detecta tipo desde l.type o desde hostname
    function linkType(l){
      const t = (l.type || '').toLowerCase();
      if (t) return t;
      try {
        const h = new URL(l.href).hostname.toLowerCase();
        if (h.includes('instagram')) return 'instagram';
        if (h.includes('twitter') || h.includes('x.com')) return 'twitter';
        if (h.includes('tiktok')) return 'tiktok';
        if (h.includes('youtube')) return 'youtube';
        if (h.includes('twitch')) return 'twitch';
        if (h.includes('kick.com')) return 'kick';
        return 'link';
      } catch { return 'link'; }
    }
    
    // SVGs inline (simples y livianos)
    function iconSvg(type){
      switch(type){
        case 'instagram': return `<svg class="yy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="5" stroke-width="1.5"/><circle cx="12" cy="12" r="3.5" stroke-width="1.5"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/></svg>`;
        case 'twitter':   return `<svg class="yy-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21L14.326 10.63 22 22h-6.31l-4.94-7.18L5.24 22H3l7.23-9.16L2 2h6.42l4.47 6.48L18.244 2Z"/></svg>`; // 'X'
        case 'tiktok':    return `<svg class="yy-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7.6a7.5 7.5 0 0 1-4.3-1.6v6.9a5.6 5.6 0 1 1-4.8-5.5v2.6a2.9 2.9 0 1 0 2.1 2.8V2h2.7A7.5 7.5 0 0 0 19 5.2v2.4z"/></svg>`;
        case 'youtube':   return `<svg class="yy-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.4-.44-5.06a3 3 0 0 0-2.1-2.12C18.68 4.25 12 4.25 12 4.25s-6.68 0-8.46.57A3 3 0 0 0 1.44 6.94C1 8.6 1 12 1 12s0 3.4.44 5.06a3 3 0 0 0 2.1 2.12c1.78.57 8.46.57 8.46.57s6.68 0 8.46-.57a3 3 0 0 0 2.1-2.12C23 15.4 23 12 23 12ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>`;
        case 'twitch':    return `<svg class="yy-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v10.5l-4 4h-3.5L9 20v-2.5H6V6h12v6.5l-3 3V17h-3l-2 2v-2H8V5H4v-2z"/><path d="M13 7h2v4h-2V7zm-4 0h2v4H9V7z"/></svg>`;
        case 'kick':      return `<svg class="yy-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18v4h-6v3h6v9h-5v-5h-5v5H6V8H3V4zm8 4v3H9V8h2z"/></svg>`;
        default:          return `<svg class="yy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1" stroke-width="1.5"/></svg>`;
      }
    }


    // botones del lightbox
    document.getElementById('yy-close')?.addEventListener('click', yyClose);
    document.getElementById('yy-prev')?.addEventListener('click', yyPrev);
    document.getElementById('yy-next')?.addEventListener('click', yyNext);
    // click en fondo oscuro cierra
    document.getElementById('yy-lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'yy-lightbox') yyClose();
    });



  // ===== Videos (estático desde videos.json) =====
    async function loadVideos() {
      try {
        const r = await fetch('videos.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('videos.json no encontrado');
        const items = await r.json();
    
        const html = (Array.isArray(items) ? items : []).map((v, i) => {
          const featured = i === 0 ? 'md:col-span-2' : '';
          const title = (v.title || 'Video').replace(/"/g, '&quot;');
          const date = new Date(v.published).toLocaleString('es-UY', { dateStyle: 'medium', timeStyle: 'short' });
          const channel = v._channelName || '';
          return `
          <article class="video-item ${featured}">
            <div class="rounded-lg overflow-hidden bg-black ring-1 ring-white/10 shadow-xl shadow-black/30">
              <iframe class="w-full aspect-video" loading="lazy" src="https://www.youtube-nocookie.com/embed/${v.id}"
                title="${title}" frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            </div>
            <div class="mt-3 px-0.5">
              <h3 class="font-medium text-neutral-100 leading-snug line-clamp-2">${v.title || ''}</h3>
              <p class="text-sm text-neutral-500 mt-1">${date}${channel ? ` · ${channel}` : ''}</p>
            </div>
          </article>
        `;
        }).join('');
    
        document.getElementById('videos-grid').innerHTML = html || '<p class="text-neutral-400">Sin resultados.</p>';
        videosLoaded = true;
    
        clearInterval(videosTimer);
        videosTimer = setInterval(() => {
          const visible = !document.getElementById('view-videos')?.classList.contains('hidden');
          if (visible) loadVideos();
        }, VIDEOS_REFRESH_MS);
    
      } catch (e) {
        document.getElementById('videos-grid').innerHTML =
          '<div class="text-red-400">No se pudo cargar la pestaña Videos. Revisa <code>videos.json</code> y <code>channels.json</code>.</div>';
      }
    }



    // ===== Lore =====
    let loreLoaded = false;
    async function loadLore() {
      try {
        const r = await fetch('lore.html');
        if (!r.ok) throw new Error('lore.html no encontrado');
        const html = await r.text();
        document.getElementById('lore-body').innerHTML = html;
        loreLoaded = true;
      } catch {
        document.getElementById('lore-body').innerHTML =
          '<p class="text-red-400">Subí <code>lore.html</code> con tu historia.</p>';
      }
    }

    // ===== Go! =====
    showView('inicio');
    loadData();
