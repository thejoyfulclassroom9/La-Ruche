/* ============================================================
   Stockage sur le disque de l'utilisatrice (File System Access API).

   Disposition du dossier choisi :
     ruche-donnees.json     toutes les données structurées
     photos/                images compressées, un fichier .jpg par photo
     sauvegardes/           une copie datée de ruche-donnees.json, une fois par jour
     archives/              un fichier .json par année archivée

   Rien ne quitte l'ordinateur de l'utilisatrice : aucun appel réseau ici.
   ============================================================ */

const DB_NAME = "ruche-fs";
const DB_STORE = "handles";
const DB_KEY = "dossier";
const FICHIER_DONNEES = "ruche-donnees.json";

/* ---------- IndexedDB : mémoriser le dossier choisi ---------- */

function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- état du module ---------- */

let dirHandle = null;

export function estSupporte() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function recupererDossierMemorise() {
  try {
    const h = await idbGet(DB_KEY);
    if (!h) return null;
    dirHandle = h;
    return h;
  } catch (e) {
    return null;
  }
}

export async function verifierPermission(handle) {
  const h = handle || dirHandle;
  if (!h) return "aucun";
  try {
    const q = await h.queryPermission({ mode: "readwrite" });
    if (q === "granted") return "accorde";
    return "a-demander";
  } catch (e) {
    return "aucun";
  }
}

export async function demanderPermission(handle) {
  const h = handle || dirHandle;
  if (!h) return false;
  try {
    const r = await h.requestPermission({ mode: "readwrite" });
    return r === "granted";
  } catch (e) {
    return false;
  }
}

export async function choisirDossier() {
  const h = await window.showDirectoryPicker({ mode: "readwrite" });
  dirHandle = h;
  await idbSet(DB_KEY, h);
  return h;
}

function assertDossier() {
  if (!dirHandle) throw new Error("Aucun dossier sélectionné.");
}

async function sousDossier(nom, { creer = true } = {}) {
  assertDossier();
  return dirHandle.getDirectoryHandle(nom, { create: creer });
}

/* ---------- lecture / écriture du fichier principal ---------- */

export async function chargerDonnees() {
  assertDossier();
  try {
    const fh = await dirHandle.getFileHandle(FICHIER_DONNEES, { create: false });
    const file = await fh.getFile();
    const texte = await file.text();
    return JSON.parse(texte);
  } catch (e) {
    return null; // premier lancement : rien à charger encore
  }
}

let ecritureEnCours = Promise.resolve();

export function enregistrerDonnees(data) {
  // sérialise les écritures pour éviter deux createWritable() concurrents
  ecritureEnCours = ecritureEnCours
    .catch(() => {})
    .then(async () => {
      assertDossier();
      const fh = await dirHandle.getFileHandle(FICHIER_DONNEES, { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    });
  return ecritureEnCours;
}

/* ---------- sauvegarde quotidienne ---------- */

export async function sauvegardeQuotidienneSiNecessaire(data) {
  try {
    const dossier = await sousDossier("sauvegardes");
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const nomFichier = `ruche-${aujourdhui}.json`;
    try {
      await dossier.getFileHandle(nomFichier, { create: false });
      return; // déjà fait aujourd'hui
    } catch (e) {
      // n'existe pas encore, on la crée
    }
    const fh = await dossier.getFileHandle(nomFichier, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (e) {
    // une sauvegarde manquée n'est jamais bloquante
  }
}

/* ---------- photos (fichiers .jpg réels) ---------- */

function dataUrlVersBlob(dataUrl) {
  const [entete, base64] = dataUrl.split(",");
  const mime = /data:(.*);base64/.exec(entete)[1];
  const octets = atob(base64);
  const tableau = new Uint8Array(octets.length);
  for (let i = 0; i < octets.length; i++) tableau[i] = octets.charCodeAt(i);
  return new Blob([tableau], { type: mime });
}

export async function ecrirePhoto(nomFichier, dataUrl) {
  const dossier = await sousDossier("photos");
  const fh = await dossier.getFileHandle(nomFichier, { create: true });
  const writable = await fh.createWritable();
  await writable.write(dataUrlVersBlob(dataUrl));
  await writable.close();
}

export async function lirePhotoURL(nomFichier) {
  try {
    const dossier = await sousDossier("photos", { creer: false });
    const fh = await dossier.getFileHandle(nomFichier, { create: false });
    const file = await fh.getFile();
    return URL.createObjectURL(file);
  } catch (e) {
    return null;
  }
}

export async function supprimerPhoto(nomFichier) {
  try {
    const dossier = await sousDossier("photos", { creer: false });
    await dossier.removeEntry(nomFichier);
  } catch (e) {
    // déjà absente, tant mieux
  }
}

/* ---------- archives (une année complète, un fichier par année) ---------- */

export async function ecrireArchive(id, snapshot) {
  const dossier = await sousDossier("archives");
  const fh = await dossier.getFileHandle(id + ".json", { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(snapshot, null, 2));
  await writable.close();
}

export async function lireArchive(id) {
  try {
    const dossier = await sousDossier("archives", { creer: false });
    const fh = await dossier.getFileHandle(id + ".json", { create: false });
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch (e) {
    return null;
  }
}
