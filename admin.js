const REPO = "wolfgamesfx-web/krenak";
const TOKEN_KEY = "yy_admin_token";

const statusEl = document.getElementById("status");
const tokenInput = document.getElementById("token");
const publishBtn = document.getElementById("publish");

let site = {
  name: "KRENAK",
  subtitle: "DOVUX LIFE RP",
  kicker: "",
  tagline: "",
  kickUrl: "https://kick.com",
  description: "",
  background: "img/wallpaper.webp",
  logo: "img/logo.png",
  ranks: [
    { id: 1, label: "Jefe" },
    { id: 2, label: "Campera" },
    { id: 3, label: "Krenak" },
    { id: 4, label: "Shatei" }
  ]
};
let people = [];
let shas = { "site.json": null, "data.json": null };
let editing = -1;

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 280) || res.statusText);
  return text ? JSON.parse(text) : {};
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function readSiteForm() {
  site.name = document.getElementById("site-name").value.trim();
  site.subtitle = document.getElementById("site-subtitle").value.trim();
  site.kicker = document.getElementById("site-kicker").value.trim();
  site.tagline = document.getElementById("site-tagline").value.trim();
  site.kickUrl = document.getElementById("site-kick").value.trim();
  site.description = document.getElementById("site-description").value.trim();
  site.background = document.getElementById("site-background").value.trim();
  site.logo = document.getElementById("site-logo").value.trim();
  site.ranks = [...document.querySelectorAll(".rank-row")].map((row, i) => ({
    id: i + 1,
    label: row.querySelector("input").value.trim() || `Rango ${i + 1}`
  }));
}

function fillSiteForm() {
  document.getElementById("site-name").value = site.name || "";
  document.getElementById("site-subtitle").value = site.subtitle || "";
  document.getElementById("site-kicker").value = site.kicker || "";
  document.getElementById("site-tagline").value = site.tagline || "";
  document.getElementById("site-kick").value = site.kickUrl || "";
  document.getElementById("site-description").value = site.description || "";
  document.getElementById("site-background").value = site.background || "";
  document.getElementById("site-logo").value = site.logo || "";
  document.getElementById("bg-preview").src = site.background || "";
  document.getElementById("logo-preview").src = site.logo || "";
  const box = document.getElementById("ranks");
  box.innerHTML = "";
  (site.ranks || []).forEach(rank => {
    const row = document.createElement("div");
    row.className = "rank-row";
    row.innerHTML = `<input value="${escapeAttr(rank.label)}" /><button type="button" class="ghost">Quitar</button>`;
    row.querySelector("button").onclick = () => {
      row.remove();
    };
    box.appendChild(row);
  });
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderPeople() {
  const box = document.getElementById("people");
  box.innerHTML = "";
  if (!people.length) {
    box.innerHTML = `<p class="hint">Todavía no hay streamers. Creá el primero.</p>`;
    return;
  }
  people.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "person" + (Number(p.activo) === 0 ? " off" : "");
    const rank = (site.ranks || []).find(r => String(r.id) === String(p.rango));
    row.innerHTML = `
      <img src="${escapeAttr(p.foto || site.logo)}" alt="" />
      <div class="who">
        <strong>${escapeAttr(p.nombre)}</strong>
        <span>${escapeAttr(p.ooc || "")}${p.kick ? " · kick:" + escapeAttr(p.kick) : ""} · ${escapeAttr(rank?.label || "sin rango")}</span>
      </div>
      <button type="button" class="ghost" data-edit>Editar</button>
      <button type="button" class="ghost" data-del>Borrar</button>`;
    row.querySelector("[data-edit]").onclick = () => openEditor(i);
    row.querySelector("[data-del]").onclick = () => {
      people.splice(i, 1);
      renderPeople();
    };
    box.appendChild(row);
  });
}

function rankOptions(selected) {
  return (site.ranks || []).map(r =>
    `<option value="${r.id}"${String(r.id) === String(selected) ? " selected" : ""}>${escapeAttr(r.label)}</option>`
  ).join("");
}

function linkRow(link = { label: "", href: "" }) {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = `
    <input name="label" placeholder="Instagram" value="${escapeAttr(link.label)}" />
    <input name="href" placeholder="https://" value="${escapeAttr(link.href)}" />
    <button type="button" class="ghost">×</button>`;
  row.querySelector("button").onclick = () => row.remove();
  return row;
}

function openEditor(index) {
  readSiteForm();
  editing = index;
  const p = index >= 0 ? people[index] : {
    nombre: "", ooc: "", alias: "", kick: "", rango: site.ranks?.[0]?.id || 1, foto: "", activo: 1, links: []
  };
  document.getElementById("editor-title").textContent = index >= 0 ? "Editar streamer" : "Nuevo streamer";
  const form = document.getElementById("editor-form");
  form.nombre.value = p.nombre || "";
  form.ooc.value = p.ooc || "";
  form.alias.value = p.alias || "";
  form.kick.value = p.kick || "";
  form.foto.value = p.foto || "";
  form.activo.checked = Number(p.activo ?? 1) !== 0;
  document.getElementById("editor-rank").innerHTML = rankOptions(p.rango);
  const links = document.getElementById("links");
  links.innerHTML = "";
  (p.links || []).forEach(l => links.appendChild(linkRow(l)));
  document.getElementById("editor").showModal();
}

document.getElementById("editor-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const links = [...document.querySelectorAll("#links .link-row")].map(row => ({
    label: row.querySelector('[name="label"]').value.trim(),
    href: row.querySelector('[name="href"]').value.trim()
  })).filter(l => l.href);
  const entry = {
    nombre: form.nombre.value.trim(),
    ooc: form.ooc.value.trim(),
    alias: form.alias.value.trim(),
    kick: form.kick.value.trim().toLowerCase(),
    rango: Number(form.rango.value),
    foto: form.foto.value.trim(),
    activo: form.activo.checked ? 1 : 0,
    links
  };
  if (!entry.nombre) return;
  if (editing >= 0) people[editing] = entry;
  else people.push(entry);
  document.getElementById("editor").close();
  renderPeople();
});

document.getElementById("editor-cancel").onclick = () => document.getElementById("editor").close();
document.getElementById("add-person").onclick = () => openEditor(-1);
document.getElementById("add-link").onclick = () => document.getElementById("links").appendChild(linkRow());
document.getElementById("add-rank").onclick = () => {
  readSiteForm();
  site.ranks.push({ id: site.ranks.length + 1, label: "Nuevo rango" });
  fillSiteForm();
};

["site-background", "site-logo"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    const key = id === "site-background" ? "bg-preview" : "logo-preview";
    document.getElementById(key).src = document.getElementById(id).value.trim();
  });
});

async function loadLocal() {
  const [siteRes, dataRes] = await Promise.all([
    fetch("site.json", { cache: "no-cache" }),
    fetch("data.json", { cache: "no-cache" })
  ]);
  if (siteRes.ok) site = await siteRes.json();
  if (dataRes.ok) {
    const json = await dataRes.json();
    people = Array.isArray(json) ? json : [];
  }
}

async function connect() {
  const value = tokenInput.value.trim();
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  if (!token()) {
    setStatus("Sin token: podés editar, pero Publicar necesita un token con permiso de escritura al repo.", "err");
    publishBtn.disabled = true;
    return;
  }
  setStatus("Conectando…");
  const siteFile = await gh("site.json");
  const dataFile = await gh("data.json");
  shas["site.json"] = siteFile.sha;
  shas["data.json"] = dataFile.sha;
  site = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(siteFile.content.replace(/\n/g, "")), c => c.charCodeAt(0))));
  const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(dataFile.content.replace(/\n/g, "")), c => c.charCodeAt(0))));
  people = Array.isArray(decoded) ? decoded : [];
  publishBtn.disabled = false;
  fillSiteForm();
  renderPeople();
  setStatus(`Conectado a ${REPO}. ${people.length} streamers en el repo.`, "ok");
}

async function publish() {
  readSiteForm();
  if (!token()) {
    setStatus("Falta el token de GitHub.", "err");
    return;
  }
  publishBtn.disabled = true;
  setStatus("Publicando…");
  try {
    await saveFile("site.json", JSON.stringify(site, null, 2) + "\n", "Actualiza identidad del sitio");
    await saveFile("data.json", JSON.stringify(people, null, 2) + "\n", "Actualiza streamers");
    setStatus("Publicado. GitHub Pages lo muestra en uno o dos minutos.", "ok");
  } catch (err) {
    setStatus(err.message || "No se pudo publicar", "err");
  } finally {
    publishBtn.disabled = false;
  }
}

async function saveFile(path, text, message) {
  if (!shas[path]) {
    const cur = await gh(path);
    shas[path] = cur.sha;
  }
  const saved = await gh(path, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: b64utf8(text),
      sha: shas[path]
    })
  });
  shas[path] = saved.content && saved.content.sha;
}

document.getElementById("connect").onclick = () => {
  connect().catch(err => setStatus(err.message || "No conectó", "err"));
};
document.getElementById("publish").onclick = () => publish();
document.getElementById("import-legacy").onclick = async () => {
  const res = await fetch("data.legacy.json", { cache: "no-cache" });
  if (!res.ok) {
    setStatus("No está data.legacy.json", "err");
    return;
  }
  const json = await res.json();
  if (!Array.isArray(json)) return;
  people = json;
  renderPeople();
  setStatus(`Roster anterior cargado en el panel (${people.length}). Todavía no está publicado.`, "ok");
};

loadLocal().then(() => {
  fillSiteForm();
  renderPeople();
  const saved = token();
  if (saved) {
    tokenInput.value = saved;
    publishBtn.disabled = false;
    setStatus("Token guardado en esta pestaña. Conectá para traer lo que está en GitHub.");
  } else {
    setStatus("El roster público está vacío. Editá y publicá con un token de GitHub.");
  }
}).catch(err => setStatus(err.message || "No se pudo leer la config local", "err"));
