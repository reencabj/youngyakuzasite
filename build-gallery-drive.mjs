// build-gallery-drive.mjs
// Genera gallery.json desde una carpeta pública de Google Drive

import { writeFile } from "node:fs/promises";

const API_KEY   = process.env.GDRIVE_API_KEY;
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;

if (!API_KEY || !FOLDER_ID) {
  console.error("Faltan GDRIVE_API_KEY o GDRIVE_FOLDER_ID");
  process.exit(1);
}

// Campos que queremos para cada archivo
const fields = "files(id,name,mimeType,modifiedTime,imageMediaMetadata)";

// Query: solo imágenes dentro de la carpeta, sin papelera
const q = encodeURIComponent(
  `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`
);

const base = "https://www.googleapis.com/drive/v3/files";
const url  = `${base}?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=1000&key=${API_KEY}`;

const r = await fetch(url);
if (!r.ok) {
  console.error("Drive API error:", r.status, await r.text());
  process.exit(1);
}

const { files = [] } = await r.json();

// URL directa para <img>: uc?export=view devuelve la imagen inline
const toSrc = (id) => `https://drive.google.com/uc?export=view&id=${id}`;

const gallery = files.map(f => ({
  src: toSrc(f.id),
  alt: f.name?.replace(/\.[a-z0-9]+$/i, "") || "",
  // opcionales útiles:
  // width:  f.imageMediaMetadata?.width,
  // height: f.imageMediaMetadata?.height,
  // date:   f.modifiedTime
}));

await writeFile("gallery.json", JSON.stringify(gallery, null, 2), "utf8");
console.log(`OK: ${gallery.length} imágenes → gallery.json`);
