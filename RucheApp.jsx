import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, X, Settings, Archive, Camera, Check, ChevronLeft, Star, Users,
  BookOpen, Calendar, Upload, Download, Sparkles, Trash2, Edit3, Pin,
  UserPlus, FolderPlus, Loader2, AlertTriangle, ChevronRight, Search,
  ClipboardList, GraduationCap, Layers, CalendarClock, FileDown, FileUp,
  CheckCircle2, Circle, Hexagon as HexIcon, Home, ImagePlus, Palette,
  ListPlus, Copy, FolderOpen, ShieldAlert, RotateCcw, History, Undo2
} from "lucide-react";
import Papa from "papaparse";
import * as fs from "./stockage.js";

/* ============================================================
   RUCHE — outil de suivi pour enseignant(e)
   Stockage : File System Access API (dossier local choisi une fois)
   ============================================================ */

/* ---------- constantes & tokens ---------- */

const NIVEAUX = [
  { id: "3e", label: "3e année", prefix: "3" },
  { id: "4e", label: "4e année", prefix: "4" },
  { id: "5e", label: "5e année", prefix: "5" },
  { id: "6e", label: "6e année", prefix: "6" },
];

const HEX_STATIQUES = [
  { id: "3e", label: "3e année" },
  { id: "4e", label: "4e année" },
  { id: "5e", label: "5e année" },
  { id: "6e", label: "6e année" },
  { id: "personnel", label: "Personnel" },
  { id: "suite", label: "Suite" },
  { id: "plan", label: "Plan de match" },
];

const COULEURS_PAR_DEFAUT = {
  "3e": "#E8A33D", "4e": "#6E7F4F", "5e": "#C1543D", "6e": "#B8863A",
  personnel: "#7A5C8E", suite: "#4C7A8C", plan: "#2B1B0F",
};

const STATUTS_SPECIAUX = ["Absent(e)", "NÉ"];

const PALETTE_TEXTE = [
  { id: "noir", label: "Noir", valeur: "#1A1109" },
  { id: "blanc", label: "Blanc", valeur: "#FFFFFF" },
  { id: "brun", label: "Brun", valeur: "#3D2817" },
  { id: "creme", label: "Crème", valeur: "#FBF3E3" },
  { id: "dore", label: "Doré", valeur: "#C67F1E" },
];

const TYPES_CHAMP = [
  { id: "texte", label: "Texte" },
  { id: "nombre", label: "Nombre" },
  { id: "date", label: "Date" },
  { id: "liste", label: "Liste déroulante" },
];

const DEFAULT_CONFIG = {
  matieres: [],
  cotes: [],
  etapes: [],
  couleurs: { ...COULEURS_PAR_DEFAUT },
  couleursTexte: {},
  imagesHexagones: {},
  categoriesNotes: ["Académique", "Comportement", "Communication-parent", "Santé", "Autre"],
  categoriesPhotos: ["Travail d'élève", "Expérience scientifique", "Photo de groupe", "Autre"],
  champsPersonnalisesEleves: [],
  champsPersonnalisesPersonnel: [],
  masquerNumerosPersonnel: false,
};

const DONNEES_VIDES = {
  version: 1,
  config: DEFAULT_CONFIG,
  eleves: [],
  personnel: [],
  groupes: [],
  notes: [],
  evaluations: [],
  pi: [],
  taches: [],
  evenements: [],
  photos: [],
  archives: [],
  corbeille: [],
};

/* ---------- icône abeille (style cohérent avec lucide-react) ---------- */

function BeeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="14" rx="5" ry="6.2" />
      <path d="M7.1 11.6h9.8" />
      <path d="M7 14.4h10" />
      <path d="M7.4 17.2h9.2" />
      <circle cx="12" cy="6.3" r="2.1" />
      <path d="M10.6 4.7L9.3 3.2" />
      <path d="M13.4 4.7l1.3-1.5" />
      <path d="M6.9 10.6c-2-1.7-4.1-1.1-4.5.5-.4 1.6 1.3 2.6 3.1 2" />
      <path d="M17.1 10.6c2-1.7 4.1-1.1 4.5.5.4 1.6-1.3 2.6-3.1 2" />
    </svg>
  );
}

/* ---------- utilitaires génériques ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* Trie des dossiers par numéro (301, 302, 303…) plutôt que par ordre de création.
   La partie chiffrée est comparée numériquement pour que 303 ne se retrouve pas après 324. */
function trierParNumero(liste) {
  return liste.slice().sort((a, b) => {
    const na = parseInt(String(a.numero).replace(/\D/g, ""), 10);
    const nb = parseInt(String(b.numero).replace(/\D/g, ""), 10);
    if (isNaN(na) || isNaN(nb)) return String(a.numero).localeCompare(String(b.numero));
    if (na !== nb) return na - nb;
    return String(a.numero).localeCompare(String(b.numero));
  });
}

/* un événement daté d'hier ou avant appartient au passé ; sans date, il reste au plan de match */
function estPasse(ev) {
  if (!ev.date) return false;
  return ev.date < todayISO();
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; } }
        else { if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; } }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function closestCote(valeur, cotes) {
  if (!cotes || !cotes.length) return null;
  let best = cotes[0], bestDiff = Math.abs(cotes[0].valeur - valeur);
  cotes.forEach((c) => { const d = Math.abs(c.valeur - valeur); if (d < bestDiff) { bestDiff = d; best = c; } });
  return best;
}

function getEtapeForDate(dateISO, etapes) {
  if (!etapes) return null;
  return etapes.find((et) => et.dateDebut && et.dateFin && dateISO >= et.dateDebut && dateISO <= et.dateFin) || null;
}

function assombrir(hex, amount = 0.3) {
  try {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const num = parseInt(full, 16);
    if (isNaN(num)) return hex;
    let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    r = Math.round(r * (1 - amount)); g = Math.round(g * (1 - amount)); b = Math.round(b * (1 - amount));
    return `rgb(${r},${g},${b})`;
  } catch (e) { return hex; }
}

function migrerDonnees(brut) {
  if (!brut) return JSON.parse(JSON.stringify(DONNEES_VIDES));
  const config = {
    ...DEFAULT_CONFIG,
    ...(brut.config || {}),
    couleurs: { ...COULEURS_PAR_DEFAUT, ...((brut.config || {}).couleurs || {}) },
    imagesHexagones: { ...((brut.config || {}).imagesHexagones || {}) },
    champsPersonnalisesEleves: (brut.config || {}).champsPersonnalisesEleves || [],
    champsPersonnalisesPersonnel: (brut.config || {}).champsPersonnalisesPersonnel || [],
  };
  return {
    version: 1,
    config,
    eleves: brut.eleves || [],
    personnel: brut.personnel || [],
    groupes: brut.groupes || [],
    notes: brut.notes || [],
    evaluations: brut.evaluations || [],
    pi: brut.pi || brut.ehdaa || [], // migration EHDAA -> PI
    taches: brut.taches || [],
    evenements: brut.evenements || [],
    photos: brut.photos || [],
    archives: brut.archives || [],
    corbeille: brut.corbeille || [],
  };
}

/* ---------- corbeille : détacher / rattacher tout ce qui gravite autour d'un dossier ----------
   Les notes et les photos peuvent être partagées entre plusieurs dossiers. On distingue donc
   celles qui deviennent orphelines (retirées des données, conservées telles quelles dans la
   corbeille) de celles qui survivent ailleurs (on ne mémorise que leur id pour pouvoir se
   rebrancher dessus à la restauration).                                                        */

function detacherEntite(d, id, type) {
  const estEleve = type === "eleve";

  const notesTouchees = d.notes.filter((n) => n.entityIds.includes(id));
  const notesOrphelines = notesTouchees.filter((n) => n.entityIds.length === 1);
  const notesPartagees = notesTouchees.filter((n) => n.entityIds.length > 1).map((n) => n.id);

  const photosTouchees = d.photos.filter((p) => p.entityIds.includes(id));
  const photosOrphelines = photosTouchees.filter((p) => p.entityIds.length === 1);
  const photosPartagees = photosTouchees.filter((p) => p.entityIds.length > 1).map((p) => p.id);

  const bagage = {
    notesOrphelines, notesPartagees, photosOrphelines, photosPartagees,
    evaluations: estEleve ? d.evaluations.filter((e) => e.eleveId === id) : [],
    pi: estEleve ? d.pi.filter((o) => o.eleveId === id) : [],
    groupeIds: estEleve ? d.groupes.filter((g) => g.membres.includes(id)).map((g) => g.id) : [],
  };

  const orphNoteIds = new Set(notesOrphelines.map((n) => n.id));
  const orphPhotoIds = new Set(photosOrphelines.map((p) => p.id));

  const donnees = {
    ...d,
    notes: d.notes.filter((n) => !orphNoteIds.has(n.id))
      .map((n) => (n.entityIds.includes(id) ? { ...n, entityIds: n.entityIds.filter((x) => x !== id) } : n)),
    photos: d.photos.filter((p) => !orphPhotoIds.has(p.id))
      .map((p) => (p.entityIds.includes(id) ? { ...p, entityIds: p.entityIds.filter((x) => x !== id) } : p)),
    evaluations: estEleve ? d.evaluations.filter((e) => e.eleveId !== id) : d.evaluations,
    pi: estEleve ? d.pi.filter((o) => o.eleveId !== id) : d.pi,
    groupes: estEleve ? d.groupes.map((g) => ({ ...g, membres: g.membres.filter((m) => m !== id) })) : d.groupes,
  };

  return { donnees, bagage };
}

function rattacherEntite(d, entree) {
  const b = entree.bagage;
  const id = entree.entity.id;
  const notesPartagees = new Set(b.notesPartagees || []);
  const photosPartagees = new Set(b.photosPartagees || []);
  const groupeIds = new Set(b.groupeIds || []);

  return {
    ...d,
    notes: [
      ...(b.notesOrphelines || []),
      ...d.notes.map((n) => (notesPartagees.has(n.id) && !n.entityIds.includes(id) ? { ...n, entityIds: [...n.entityIds, id] } : n)),
    ],
    photos: [
      ...(b.photosOrphelines || []),
      ...d.photos.map((p) => (photosPartagees.has(p.id) && !p.entityIds.includes(id) ? { ...p, entityIds: [...p.entityIds, id] } : p)),
    ],
    evaluations: [...d.evaluations, ...(b.evaluations || [])],
    pi: [...d.pi, ...(b.pi || [])],
    groupes: d.groupes.map((g) => (groupeIds.has(g.id) && !g.membres.includes(id) ? { ...g, membres: [...g.membres, id] } : g)),
  };
}

/* fichiers image à effacer du disque quand on vide définitivement une entrée de corbeille */
function fichiersDeLEntree(entree) {
  const f = [];
  if (entree.entity && entree.entity.imageFichier) f.push(entree.entity.imageFichier);
  (entree.bagage && entree.bagage.photosOrphelines ? entree.bagage.photosOrphelines : []).forEach((p) => { if (p.fichier) f.push(p.fichier); });
  return f;
}

/* ============================================================
   MISE EN NID D'ABEILLE (grille hexagonale compacte, générique)
   ============================================================ */

const HEX_W = 108, HEX_H = 124, HEX_GAP_X = 12, HEX_GAP_Y = 10;

function HiveGrid({ items, renderItem, minCols = 2 }) {
  const ref = useRef(null);
  const [cols, setCols] = useState(6);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const calc = () => {
      const w = el.clientWidth || 600;
      const c = Math.max(minCols, Math.floor((w + HEX_GAP_X) / (HEX_W + HEX_GAP_X)));
      setCols(c);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minCols]);

  const rows = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

  return (
    <div className="hive-grid" ref={ref}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="hive-grid-row"
          style={{
            marginLeft: ri % 2 === 1 ? (HEX_W + HEX_GAP_X) / 2 : 0,
            marginTop: ri === 0 ? 0 : -(HEX_H * 0.25),
          }}
        >
          {row.map((item) => renderItem(item))}
        </div>
      ))}
      {!items.length && null}
    </div>
  );
}

/* ---------- hexagone réutilisable (bordure couleur + image + libellé lisible) ---------- */

function useImageURL(fichier) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true, created = null;
    if (!fichier) { setUrl(null); return; }
    fs.lirePhotoURL(fichier).then((u) => { if (active) { created = u; setUrl(u); } });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [fichier]);
  return url;
}

/* ---------- sélecteur de couleur de texte (5 choix + « par défaut ») ---------- */

function TextColorPicker({ value, onChange }) {
  return (
    <div className="text-color-picker">
      {PALETTE_TEXTE.map((c) => (
        <button
          key={c.id} type="button" title={c.label}
          className={"tc-swatch" + (value === c.valeur ? " active" : "")}
          style={{ background: c.valeur }}
          onClick={() => onChange(c.valeur)}
        />
      ))}
      <button type="button" title="Par défaut" className={"tc-swatch tc-reset" + (!value ? " active" : "")} onClick={() => onChange(null)}>×</button>
    </div>
  );
}

function TextColorModal({ title, initial, onApply, onClose }) {
  const [value, setValue] = useState(initial || null);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-hint">Choisis la couleur du texte affiché sur ces hexagones.</p>
      <TextColorPicker value={value} onChange={setValue} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={() => { onApply(value); onClose(); }}>Appliquer à tous</button>
      </div>
    </Modal>
  );
}

function HexCell({ size = "mini", couleur, couleurTexte, imageFichier, label, sub, icon, onClick, className = "" }) {
  const url = useImageURL(imageFichier);
  const fond = url ? { backgroundImage: `url(${url})` } : { background: `linear-gradient(155deg, ${couleur}, ${assombrir(couleur)})` };
  return (
    <button className={`hexcell hexcell-${size} ${className}`} style={{ background: couleur, ...(couleurTexte ? { "--hex-text": couleurTexte } : {}) }} onClick={onClick}>
      <div className="hexcell-fill" style={fond}>
        {icon}
        {label ? <span className="hexcell-label">{label}</span> : null}
        {sub && <span className="hexcell-sub">{sub}</span>}
      </div>
    </button>
  );
}

/* ============================================================
   COMPOSANT PRINCIPAL
   ============================================================ */

export default function RucheApp() {
  const [etat, setEtat] = useState("verification"); // verification | non-supporte | premier-lancement | reconnexion | pret
  const [nomDossier, setNomDossier] = useState("");
  const [data, setData] = useState(null);
  const [erreurDossier, setErreurDossier] = useState("");

  const [screen, setScreen] = useState({ name: "home" });
  const [showConfig, setShowConfig] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [saveNote, setSaveNote] = useState("");

  const saveTimer = useRef(null);

  /* ---------- démarrage : trouver / vérifier le dossier ---------- */
  useEffect(() => {
    (async () => {
      if (!fs.estSupporte()) { setEtat("non-supporte"); return; }
      const h = await fs.recupererDossierMemorise();
      if (!h) { setEtat("premier-lancement"); return; }
      setNomDossier(h.name || "");
      const perm = await fs.verifierPermission(h);
      if (perm === "accorde") {
        await ouvrirDossier(h);
      } else {
        setEtat("reconnexion");
      }
    })();
  }, []);

  async function ouvrirDossier(handle) {
    setNomDossier(handle.name || "");
    const brut = await fs.chargerDonnees();
    const propre = migrerDonnees(brut);
    setData(propre);
    setEtat("pret");
    fs.sauvegardeQuotidienneSiNecessaire(propre);
  }

  async function actionChoisirDossier() {
    setErreurDossier("");
    try {
      const h = await fs.choisirDossier();
      await ouvrirDossier(h);
    } catch (e) {
      setErreurDossier("Sélection annulée ou refusée.");
    }
  }

  async function actionAutoriser() {
    setErreurDossier("");
    const ok = await fs.demanderPermission();
    if (ok) {
      const h = await fs.recupererDossierMemorise();
      await ouvrirDossier(h);
    } else {
      setErreurDossier("Permission refusée. Clique à nouveau pour réessayer.");
    }
  }

  const flashSave = (msg) => { setSaveNote(msg); setTimeout(() => setSaveNote(""), 1600); };

  /* toutes les mutations passent par ici : état React immédiat, écriture disque groupée (~500ms) */
  const persist = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fs.enregistrerDonnees(next).then(() => flashSave("Enregistré")).catch(() => flashSave("⚠ Erreur de sauvegarde"));
      }, 450);
      return next;
    });
  }, []);

  const goTo = (s) => setScreen(s);
  const goHome = () => setScreen({ name: "home" });

  /* ---------- CRUD élèves ---------- */
  /* Les numéros des dossiers en corbeille restent réservés : sans ça, on pourrait créer
     un doublon puis restaurer le dossier supprimé et se retrouver avec deux fois le même
     numéro. Pour récupérer un numéro, il faut passer par « Réutiliser le numéro ». */
  function nextEleveNumero(niveauId, eleves, corbeille = []) {
    const niveau = NIVEAUX.find((n) => n.id === niveauId);
    const reserves = [
      ...eleves.filter((e) => e.niveauId === niveauId),
      ...corbeille.filter((c) => c.type === "eleve" && c.entity.niveauId === niveauId).map((c) => c.entity),
    ];
    const existing = reserves.map((e) => parseInt(e.numero.slice(1), 10)).filter((n) => !isNaN(n));
    const seq = existing.length ? Math.max(...existing) + 1 : 1;
    return niveau.prefix + String(seq).padStart(2, "0");
  }
  function addEleve(niveauId) {
    let created = null;
    persist((d) => {
      const numero = nextEleveNumero(niveauId, d.eleves, d.corbeille);
      created = { id: uid(), numero, niveauId, groupes: [], champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() };
      return { ...d, eleves: [...d.eleves, created] };
    });
    return created;
  }
  function updateEleve(id, patch) {
    persist((d) => ({ ...d, eleves: d.eleves.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }

  /* Crée un élève en choisissant son numéro à la main (élève qui arrive en cours d'année,
     numéro laissé libre par un départ, etc.). Retourne null si créé, sinon un message. */
  function addEleveAvecNumero(niveauId, numeroBrut) {
    const niveau = NIVEAUX.find((n) => n.id === niveauId);
    const numero = String(numeroBrut || "").trim();
    if (!numero) return "Entre un numéro.";
    if (!new RegExp("^" + niveau.prefix + "\\d{2,}$").test(numero)) {
      return "Un numéro de " + niveau.label + " commence par " + niveau.prefix + " et compte au moins trois chiffres (ex. " + niveau.prefix + "03).";
    }
    if (data.eleves.some((e) => e.numero === numero)) return "Le numéro " + numero + " est déjà porté par un élève actif.";
    const enCorbeille = data.corbeille.find((c) => c.type === "eleve" && c.entity.numero === numero);
    if (enCorbeille) return "Le numéro " + numero + " appartient à un dossier en corbeille. Restaure-le, ou utilise « Réutiliser le numéro » dans Paramètres › Corbeille.";

    persist((d) => ({
      ...d,
      eleves: [...d.eleves, { id: uid(), numero, niveauId, groupes: [], champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() }],
    }));
    return null;
  }
  function deleteEleve(id) {
    persist((d) => {
      const eleve = d.eleves.find((e) => e.id === id);
      if (!eleve) return d;
      const { donnees, bagage } = detacherEntite(d, id, "eleve");
      return {
        ...donnees,
        eleves: donnees.eleves.filter((e) => e.id !== id),
        corbeille: [{ id: uid(), type: "eleve", entity: eleve, bagage, supprimeLe: new Date().toISOString() }, ...donnees.corbeille],
      };
    });
  }

  /* ---------- CRUD personnel ---------- */
  function nextPersonnelNumero(personnel, corbeille = []) {
    const reserves = [
      ...personnel,
      ...corbeille.filter((c) => c.type === "personnel").map((c) => c.entity),
    ];
    const existing = reserves.map((p) => parseInt(p.numero.slice(1), 10)).filter((n) => !isNaN(n));
    const seq = existing.length ? Math.max(...existing) + 1 : 1;
    return "P" + String(seq).padStart(3, "0");
  }
  function addPersonnel() {
    let created = null;
    persist((d) => {
      created = { id: uid(), numero: nextPersonnelNumero(d.personnel, d.corbeille), gouts: "", matieres: "", champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() };
      return { ...d, personnel: [...d.personnel, created] };
    });
    return created;
  }
  function updatePersonnel(id, patch) {
    persist((d) => ({ ...d, personnel: d.personnel.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }

  /* Même chose pour le personnel : numéro choisi à la main. */
  function addPersonnelAvecNumero(numeroBrut) {
    const numero = String(numeroBrut || "").trim().toUpperCase();
    if (!numero) return "Entre un numéro.";
    if (!/^P\d{3,}$/.test(numero)) return "Un numéro de personnel s'écrit P suivi d'au moins trois chiffres (ex. P003).";
    if (data.personnel.some((p) => p.numero === numero)) return "Le numéro " + numero + " est déjà porté par un membre actif.";
    const enCorbeille = data.corbeille.find((c) => c.type === "personnel" && c.entity.numero === numero);
    if (enCorbeille) return "Le numéro " + numero + " appartient à un dossier en corbeille. Restaure-le, ou utilise « Réutiliser le numéro » dans Paramètres › Corbeille.";

    persist((d) => ({
      ...d,
      personnel: [...d.personnel, { id: uid(), numero, gouts: "", matieres: "", champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() }],
    }));
    return null;
  }
  function deletePersonnel(id) {
    persist((d) => {
      const membre = d.personnel.find((p) => p.id === id);
      if (!membre) return d;
      const { donnees, bagage } = detacherEntite(d, id, "personnel");
      return {
        ...donnees,
        personnel: donnees.personnel.filter((p) => p.id !== id),
        corbeille: [{ id: uid(), type: "personnel", entity: membre, bagage, supprimeLe: new Date().toISOString() }, ...donnees.corbeille],
      };
    });
  }

  /* ---------- corbeille ---------- */
  /* Retourne null si la restauration a eu lieu, sinon un message d'erreur. */
  function restaurerCorbeille(entreeId) {
    const e = data.corbeille.find((x) => x.id === entreeId);
    if (!e) return "Cette entrée n'existe plus.";
    const numero = e.entity.numero;
    const pris = e.type === "eleve"
      ? data.eleves.some((x) => x.numero === numero)
      : data.personnel.some((x) => x.numero === numero);
    if (pris) return "Impossible de restaurer : le numéro " + numero + " est déjà porté par un dossier actif.";

    persist((d) => {
      const entree = d.corbeille.find((x) => x.id === entreeId);
      if (!entree) return d;
      const base = rattacherEntite(d, entree);
      return {
        ...base,
        eleves: entree.type === "eleve" ? [...base.eleves, entree.entity] : base.eleves,
        personnel: entree.type === "personnel" ? [...base.personnel, entree.entity] : base.personnel,
        corbeille: base.corbeille.filter((x) => x.id !== entreeId),
      };
    });
    return null;
  }

  /* Recrée un dossier vierge portant le même numéro, et jette l'ancien.
     Retourne null si tout va bien, ou un message d'erreur. */
  async function reutiliserNumero(entreeId) {
    const e = data.corbeille.find((x) => x.id === entreeId);
    if (!e) return "Cette entrée n'existe plus.";
    const numero = e.entity.numero;
    const pris = e.type === "eleve"
      ? data.eleves.some((x) => x.numero === numero)
      : data.personnel.some((x) => x.numero === numero);
    if (pris) return "Le numéro " + numero + " est déjà porté par un dossier actif.";

    const neuf = e.type === "eleve"
      ? { id: uid(), numero, niveauId: e.entity.niveauId, groupes: [], champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() }
      : { id: uid(), numero, gouts: "", matieres: "", champs: {}, champsLocaux: [], imageFichier: null, couleurTexte: null, creeLe: new Date().toISOString() };

    persist((d) => ({
      ...d,
      eleves: e.type === "eleve" ? [...d.eleves, neuf] : d.eleves,
      personnel: e.type === "personnel" ? [...d.personnel, neuf] : d.personnel,
      corbeille: d.corbeille.filter((x) => x.id !== entreeId),
    }));

    for (const f of fichiersDeLEntree(e)) { try { await fs.supprimerPhoto(f); } catch { /* fichier déjà absent */ } }
    return null;
  }

  async function supprimerDefinitivement(entreeId) {
    const e = data.corbeille.find((x) => x.id === entreeId);
    if (!e) return;
    persist((d) => ({ ...d, corbeille: d.corbeille.filter((x) => x.id !== entreeId) }));
    for (const f of fichiersDeLEntree(e)) { try { await fs.supprimerPhoto(f); } catch { /* fichier déjà absent */ } }
  }

  async function viderCorbeille() {
    const entrees = data.corbeille;
    persist((d) => ({ ...d, corbeille: [] }));
    for (const e of entrees) {
      for (const f of fichiersDeLEntree(e)) { try { await fs.supprimerPhoto(f); } catch { /* fichier déjà absent */ } }
    }
  }

  /* ---------- CRUD groupes (« Suite ») ---------- */
  function addGroupe(nom) {
    let created = null;
    persist((d) => { created = { id: uid(), nom, membres: [], imageFichier: null }; return { ...d, groupes: [...d.groupes, created] }; });
    return created;
  }
  function updateGroupe(id, patch) {
    persist((d) => ({ ...d, groupes: d.groupes.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  }
  function deleteGroupe(id) {
    persist((d) => ({ ...d, groupes: d.groupes.filter((g) => g.id !== id) }));
  }
  function toggleMembreGroupe(groupeId, eleveId) {
    persist((d) => ({
      ...d,
      groupes: d.groupes.map((g) => {
        if (g.id !== groupeId) return g;
        const membres = g.membres.includes(eleveId) ? g.membres.filter((x) => x !== eleveId) : [...g.membres, eleveId];
        return { ...g, membres };
      }),
    }));
  }

  /* ---------- CRUD notes ---------- */
  function addNote(note) {
    persist((d) => ({ ...d, notes: [{ id: uid(), pinned: false, statutSpecial: null, ...note, date: new Date().toISOString() }, ...d.notes] }));
  }
  function updateNote(id, patch) {
    persist((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }
  function deleteNote(id) {
    persist((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }));
  }

  /* ---------- CRUD évaluations (toujours liées à une compétence + un nom) ---------- */
  function addEvaluation(ev) {
    persist((d) => {
      const etape = getEtapeForDate(ev.date || todayISO(), d.config.etapes);
      const full = { id: uid(), date: todayISO(), etapeId: etape ? etape.id : null, ...ev };
      return { ...d, evaluations: [full, ...d.evaluations] };
    });
  }
  function addEvaluationsBatch(list) {
    persist((d) => {
      const withMeta = list.map((ev) => {
        const etape = getEtapeForDate(ev.date || todayISO(), d.config.etapes);
        return { id: uid(), date: todayISO(), etapeId: etape ? etape.id : null, ...ev };
      });
      return { ...d, evaluations: [...withMeta, ...d.evaluations] };
    });
  }
  function deleteEvaluation(id) {
    persist((d) => ({ ...d, evaluations: d.evaluations.filter((e) => e.id !== id) }));
  }

  /* ---------- CRUD PI (plan d'intervention) ---------- */
  function addObjectifPI(eleveId, objectif) {
    persist((d) => ({ ...d, pi: [{ id: uid(), eleveId, objectif, date: new Date().toISOString() }, ...d.pi] }));
  }
  function deleteObjectifPI(id) {
    persist((d) => ({ ...d, pi: d.pi.filter((o) => o.id !== id) }));
  }

  /* ---------- CRUD tâches (plan de match) ---------- */
  function addTache(t) {
    persist((d) => ({ ...d, taches: [{ id: uid(), fait: false, creeLe: new Date().toISOString(), priorite: "normale", recurrence: "aucune", ...t }, ...d.taches] }));
  }
  function updateTache(id, patch) {
    persist((d) => ({ ...d, taches: d.taches.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }
  function deleteTache(id) {
    persist((d) => ({ ...d, taches: d.taches.filter((t) => t.id !== id) }));
  }
  function toggleTacheFait(id) {
    setData((prev) => {
      const t = prev.taches.find((x) => x.id === id);
      if (!t) return prev;
      let taches = prev.taches.map((x) => (x.id === id ? { ...x, fait: !x.fait, faitLe: x.fait ? null : new Date().toISOString() } : x));
      if (!t.fait && t.recurrence && t.recurrence !== "aucune" && t.date) {
        const dNext = new Date(t.date + "T00:00:00");
        if (t.recurrence === "quotidienne") dNext.setDate(dNext.getDate() + 1);
        if (t.recurrence === "hebdomadaire") dNext.setDate(dNext.getDate() + 7);
        if (t.recurrence === "mensuelle") dNext.setMonth(dNext.getMonth() + 1);
        taches = [{ id: uid(), fait: false, creeLe: new Date().toISOString(), titre: t.titre, description: t.description, date: dNext.toISOString().slice(0, 10), priorite: t.priorite, recurrence: t.recurrence, linkedEntityId: t.linkedEntityId }, ...taches];
      }
      const next = { ...prev, taches };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { fs.enregistrerDonnees(next).then(() => flashSave("Enregistré")); }, 450);
      return next;
    });
  }

  /* ---------- CRUD événements (plan de match) ---------- */
  function addEvenement(ev) {
    persist((d) => ({ ...d, evenements: [{ id: uid(), creeLe: new Date().toISOString(), ...ev }, ...d.evenements] }));
  }
  function updateEvenement(id, patch) {
    persist((d) => ({ ...d, evenements: d.evenements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }
  function deleteEvenement(id) {
    persist((d) => ({ ...d, evenements: d.evenements.filter((e) => e.id !== id) }));
  }

  /* ---------- couleur du texte en lot (par section) ---------- */
  function bulkSetCouleurTexteEleves(ids, couleur, niveauId) {
    persist((d) => ({
      ...d,
      eleves: d.eleves.map((e) => (ids.includes(e.id) ? { ...e, couleurTexte: couleur } : e)),
      config: niveauId ? { ...d.config, couleursTexte: { ...d.config.couleursTexte, [niveauId]: couleur } } : d.config,
    }));
  }
  function bulkSetCouleurTextePersonnel(couleur) {
    persist((d) => ({
      ...d,
      personnel: d.personnel.map((p) => ({ ...p, couleurTexte: couleur })),
      config: { ...d.config, couleursTexte: { ...d.config.couleursTexte, personnel: couleur } },
    }));
  }

  /* ---------- photos (galerie multi-photos d'un dossier) ---------- */
  async function addPhoto({ file, categorie, entityIds }) {
    const dataUrl = await compressImage(file);
    const id = uid();
    const nomFichier = "photo-" + id + ".jpg";
    await fs.ecrirePhoto(nomFichier, dataUrl);
    const meta = { id, fichier: nomFichier, categorie, entityIds, date: new Date().toISOString() };
    persist((d) => ({ ...d, photos: [meta, ...d.photos] }));
  }
  async function deletePhoto(id, fichier) {
    persist((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
    await fs.supprimerPhoto(fichier);
  }

  /* ---------- image de couverture d'un hexagone (élève, personnel, groupe, ou hexagone statique) ---------- */
  async function setHexImage(type, id, file) {
    const dataUrl = await compressImage(file, 500, 0.75);
    const nomFichier = `hex-${type}-${id}.jpg`;
    await fs.ecrirePhoto(nomFichier, dataUrl);
    if (type === "eleve") updateEleve(id, { imageFichier: nomFichier });
    else if (type === "personnel") updatePersonnel(id, { imageFichier: nomFichier });
    else if (type === "groupe") updateGroupe(id, { imageFichier: nomFichier });
    else if (type === "statique") persist((d) => ({ ...d, config: { ...d.config, imagesHexagones: { ...d.config.imagesHexagones, [id]: nomFichier } } }));
  }
  async function retirerHexImage(type, id, fichierActuel) {
    if (fichierActuel) await fs.supprimerPhoto(fichierActuel);
    if (type === "eleve") updateEleve(id, { imageFichier: null });
    else if (type === "personnel") updatePersonnel(id, { imageFichier: null });
    else if (type === "groupe") updateGroupe(id, { imageFichier: null });
    else if (type === "statique") persist((d) => { const img = { ...d.config.imagesHexagones }; delete img[id]; return { ...d, config: { ...d.config, imagesHexagones: img } }; });
  }

  /* ---------- champs personnalisés ---------- */
  function ajouterChampPersonnalise({ portee, nom, type, options, valeur, global, entityId }) {
    persist((d) => {
      let next = { ...d };
      if (global) {
        const champId = uid();
        const listeKey = portee === "eleve" ? "champsPersonnalisesEleves" : "champsPersonnalisesPersonnel";
        next.config = { ...d.config, [listeKey]: [...d.config[listeKey], { id: champId, nom, type, options: options || [] }] };
        const cible = portee === "eleve" ? "eleves" : "personnel";
        next[cible] = d[cible].map((e) => e.id === entityId ? { ...e, champs: { ...e.champs, [champId]: valeur } } : e);
      } else {
        const cible = portee === "eleve" ? "eleves" : "personnel";
        next[cible] = d[cible].map((e) => e.id === entityId ? { ...e, champsLocaux: [...(e.champsLocaux || []), { id: uid(), nom, type, options: options || [], valeur }] } : e);
      }
      return next;
    });
  }
  function retirerChampGlobal(portee, champId) {
    persist((d) => {
      const listeKey = portee === "eleve" ? "champsPersonnalisesEleves" : "champsPersonnalisesPersonnel";
      return { ...d, config: { ...d.config, [listeKey]: d.config[listeKey].filter((c) => c.id !== champId) } };
    });
  }
  function retirerChampLocal(portee, entityId, champLocalId) {
    const cible = portee === "eleve" ? "eleves" : "personnel";
    persist((d) => ({ ...d, [cible]: d[cible].map((e) => e.id === entityId ? { ...e, champsLocaux: (e.champsLocaux || []).filter((c) => c.id !== champLocalId) } : e) }));
  }

  /* ---------- config ---------- */
  function saveConfig(next) {
    persist((d) => ({ ...d, config: next }));
  }

  /* ---------- import en lot ---------- */
  function bulkAddEleves(nouveaux) {
    persist((d) => ({ ...d, eleves: [...d.eleves, ...nouveaux] }));
    flashSave(nouveaux.length + " élève(s) importé(s)");
  }
  function bulkAddPersonnel(nouveaux) {
    persist((d) => ({ ...d, personnel: [...d.personnel, ...nouveaux] }));
    flashSave(nouveaux.length + " membre(s) importé(s)");
  }

  /* ---------- calculs ---------- */
  function computeMatiereMoyenne(eleveId, matiereId, etapeFiltre) {
    const mat = data.config.matieres.find((m) => m.id === matiereId);
    if (!mat || !mat.competences || !mat.competences.length) return null;
    let totalPondere = 0, totalPoids = 0;
    mat.competences.forEach((comp) => {
      let evs = data.evaluations.filter((e) => e.eleveId === eleveId && e.matiereId === matiereId && e.competenceId === comp.id);
      if (etapeFiltre && etapeFiltre !== "toutes") evs = evs.filter((e) => e.etapeId === etapeFiltre);
      const vals = evs.map((e) => { const c = data.config.cotes.find((c) => c.id === e.cote); return c ? c.valeur : null; }).filter((v) => v != null);
      if (!vals.length) return;
      const moyComp = vals.reduce((a, b) => a + b, 0) / vals.length;
      totalPondere += moyComp * (comp.pourcentage / 100);
      totalPoids += comp.pourcentage / 100;
    });
    if (totalPoids === 0) return null;
    const moyenne = totalPondere / totalPoids;
    return { moyenne, coteProche: closestCote(moyenne, data.config.cotes) };
  }

  /* ---------- nouvelle année ---------- */
  async function demarrerNouvelleAnnee(label) {
    const archiveId = uid();
    const eleveIds = new Set(data.eleves.map((e) => e.id));
    const snapshot = {
      label, dateArchivage: new Date().toISOString(),
      eleves: data.eleves, groupes: data.groupes, evaluations: data.evaluations, pi: data.pi,
      notes: data.notes.filter((n) => n.entityIds.some((id) => eleveIds.has(id))),
      photos: data.photos.filter((p) => p.entityIds.some((id) => eleveIds.has(id))),
      corbeille: data.corbeille,
    };
    await fs.ecrireArchive(archiveId, snapshot);
    persist((d) => ({
      ...d,
      archives: [{ id: archiveId, label, date: new Date().toISOString() }, ...d.archives],
      notes: d.notes.filter((n) => !n.entityIds.some((id) => eleveIds.has(id))),
      eleves: [], groupes: [], evaluations: [], pi: [], corbeille: [],
    }));
  }

  const ctx = data ? {
    data, config: data.config,
    eleves: data.eleves, personnel: data.personnel, groupes: data.groupes, notes: data.notes,
    evaluations: data.evaluations, pi: data.pi, taches: data.taches, evenements: data.evenements, photos: data.photos, archives: data.archives,
    corbeille: data.corbeille,
    goTo, goHome, screen,
    addEleve, addEleveAvecNumero, updateEleve, deleteEleve,
    addPersonnel, addPersonnelAvecNumero, updatePersonnel, deletePersonnel,
    restaurerCorbeille, reutiliserNumero, supprimerDefinitivement, viderCorbeille,
    addGroupe, updateGroupe, deleteGroupe, toggleMembreGroupe,
    addNote, updateNote, deleteNote,
    addEvaluation, addEvaluationsBatch, deleteEvaluation,
    addObjectifPI, deleteObjectifPI,
    addTache, updateTache, deleteTache, toggleTacheFait,
    addEvenement, updateEvenement, deleteEvenement,
    bulkSetCouleurTexteEleves, bulkSetCouleurTextePersonnel,
    addPhoto, deletePhoto,
    setHexImage, retirerHexImage,
    ajouterChampPersonnalise, retirerChampGlobal, retirerChampLocal,
    saveConfig, computeMatiereMoyenne, demarrerNouvelleAnnee,
    bulkAddEleves, bulkAddPersonnel,
  } : null;

  /* ---------- écrans avant que la ruche soit prête ---------- */

  if (etat === "verification") {
    return (
      <div className="hive-app"><Style />
        <div className="loading-screen"><Loader2 className="spin" size={28} /><span>Ouverture de la ruche…</span></div>
      </div>
    );
  }

  if (etat === "non-supporte") {
    return (
      <div className="hive-app"><Style />
        <div className="onboarding-screen">
          <HexIcon size={40} />
          <h2>Navigateur non compatible</h2>
          <p>La Ruche a besoin d'un navigateur qui sait écrire de vrais fichiers sur ton ordinateur.<br />Utilise Chrome, Edge ou Opera sur ordinateur (pas Firefox, pas Safari, pas de cellulaire).</p>
        </div>
      </div>
    );
  }

  if (etat === "premier-lancement") {
    return (
      <div className="hive-app"><Style />
        <div className="onboarding-screen">
          <HexIcon size={40} />
          <h2>Bienvenue dans ta ruche</h2>
          <p>Choisis (ou crée) un dossier sur ton ordinateur — par exemple « Documents/Ruche ». Tes données, tes photos et tes sauvegardes y vivront, en vrais fichiers, sous ton contrôle.</p>
          <button className="btn btn-primary" onClick={actionChoisirDossier}><FolderOpen size={16} /> Choisir un dossier</button>
          {erreurDossier && <p className="error-text">{erreurDossier}</p>}
        </div>
      </div>
    );
  }

  if (etat === "reconnexion") {
    return (
      <div className="hive-app"><Style />
        <div className="onboarding-screen">
          <ShieldAlert size={40} />
          <h2>Autoriser l'accès</h2>
          <p>Ton navigateur redemande la permission d'écrire dans « {nomDossier || "ton dossier"} » — c'est normal à chaque nouvelle session, et ça protège tes fichiers.</p>
          <button className="btn btn-primary" onClick={actionAutoriser}><FolderOpen size={16} /> Autoriser l'accès</button>
          {erreurDossier && <p className="error-text">{erreurDossier}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="hive-app">
      <Style />
      <Header screen={screen} goHome={goHome} goTo={goTo} onConfig={() => setShowConfig(true)} onArchives={() => setShowArchives(true)} saveNote={saveNote} />
      <main className={"hive-main" + (screen.name === "home" ? " hive-main-home" : "")}>
        <div key={JSON.stringify(screen)} className="screen-enter">
          <ScreenRouter screen={screen} ctx={ctx} />
        </div>
      </main>
      <FloatingAdd onClick={() => setShowQuickTask(true)} />
      {showQuickTask && <TaskModal ctx={ctx} onClose={() => setShowQuickTask(false)} presetEntity={screen.name === "eleve" ? screen.eleveId : screen.name === "personnel" ? screen.personnelId : null} />}
      {showConfig && <ConfigPanel ctx={ctx} onClose={() => setShowConfig(false)} />}
      {showArchives && <ArchivesPanel ctx={ctx} onClose={() => setShowArchives(false)} />}
    </div>
  );
}

/* ============================================================
   ROUTEUR D'ÉCRANS
   ============================================================ */

function ScreenRouter({ screen, ctx }) {
  switch (screen.name) {
    case "home": return <HiveHome ctx={ctx} />;
    case "niveau": return <GroupeEleves ctx={ctx} niveauId={screen.niveauId} />;
    case "groupe": return <GroupeEleves ctx={ctx} groupeId={screen.groupeId} />;
    case "eleve": return <EleveDossier ctx={ctx} eleveId={screen.eleveId} />;
    case "personnel-list": return <PersonnelGrid ctx={ctx} />;
    case "personnel": return <PersonnelDossier ctx={ctx} personnelId={screen.personnelId} />;
    case "plan": return <PlanDeMatch ctx={ctx} />;
    case "historique": return <Historique ctx={ctx} />;
    case "suite": return <Suite ctx={ctx} />;
    default: return <HiveHome ctx={ctx} />;
  }
}

/* ============================================================
   ACCUEIL — LA RUCHE
   ============================================================ */

function HiveHome({ ctx }) {
  const compteNiveau = (id) => ctx.eleves.filter((e) => e.niveauId === id).length;
  const couleurs = ctx.config.couleurs;
  const images = ctx.config.imagesHexagones || {};
  const hexes = [
    { id: "3e", label: "3e année", sub: compteNiveau("3e") + " élève(s)", icon: <GraduationCap size={22} />, onClick: () => ctx.goTo({ name: "niveau", niveauId: "3e" }) },
    { id: "4e", label: "4e année", sub: compteNiveau("4e") + " élève(s)", icon: <GraduationCap size={22} />, onClick: () => ctx.goTo({ name: "niveau", niveauId: "4e" }) },
    { id: "5e", label: "5e année", sub: compteNiveau("5e") + " élève(s)", icon: <GraduationCap size={22} />, onClick: () => ctx.goTo({ name: "niveau", niveauId: "5e" }) },
    { id: "6e", label: "6e année", sub: compteNiveau("6e") + " élève(s)", icon: <GraduationCap size={22} />, onClick: () => ctx.goTo({ name: "niveau", niveauId: "6e" }) },
    { id: "personnel", label: "Personnel", sub: ctx.personnel.length + " membre(s)", icon: <Users size={22} />, onClick: () => ctx.goTo({ name: "personnel-list" }) },
    { id: "suite", label: "Suite", sub: ctx.groupes.length + " groupe(s)", icon: <Layers size={22} />, onClick: () => ctx.goTo({ name: "suite" }) },
  ];
  const tachesOuvertes = ctx.taches.filter((t) => !t.fait).length;
  const couleursTexte = ctx.config.couleursTexte || {};

  const R = 150;
  const positioned = hexes.map((h, i) => {
    const angle = (-60 + i * 60) * (Math.PI / 180);
    return { ...h, x: R * Math.cos(angle), y: R * Math.sin(angle) };
  });

  return (
    <div className="home-wrap">
      <div className="hive-ring">
        <HomeHex
          style={{ transform: "translate(-50%,-50%)" }}
          couleur={couleurs.plan} couleurTexte={couleursTexte.plan} imageFichier={images.plan}
          onClick={() => ctx.goTo({ name: "plan" })}
          icon={<ClipboardList size={26} />} label="Plan de match" sub={tachesOuvertes + " tâche(s) à faire"}
          size="center"
        />
        {positioned.map((h) => (
          <HomeHex
            key={h.id}
            style={{ transform: `translate(calc(-50% + ${h.x}px), calc(-50% + ${h.y}px))` }}
            couleur={couleurs[h.id]} couleurTexte={couleursTexte[h.id]} imageFichier={images[h.id]}
            onClick={h.onClick} icon={h.icon} label={h.label} sub={h.sub}
            size="ring"
          />
        ))}
      </div>
    </div>
  );
}

function HomeHex({ style, couleur, couleurTexte, imageFichier, onClick, icon, label, sub, size }) {
  const url = useImageURL(imageFichier);
  const fond = url ? { backgroundImage: `url(${url})` } : { background: `linear-gradient(155deg, ${couleur}, ${assombrir(couleur)})` };
  return (
    <button className={"hex hex-" + size} style={{ ...style, background: couleur, ...(couleurTexte ? { "--hex-text": couleurTexte } : {}) }} onClick={onClick}>
      <div className="hex-fill" style={fond}>
        <span className="hex-label">{label}</span>
        <span className="hex-sub">{sub}</span>
        <span className="hex-icon">{icon}</span>
      </div>
    </button>
  );
}

/* ============================================================
   GRILLE D'ÉLÈVES (niveau ou groupe) — nid d'abeille
   ============================================================ */

function GroupeEleves({ ctx, niveauId, groupeId }) {
  const [showBatch, setShowBatch] = useState(false);
  const [showGroupPick, setShowGroupPick] = useState(false);
  const [showColorBulk, setShowColorBulk] = useState(false);
  const [showNumeroManuel, setShowNumeroManuel] = useState(false);

  let titre, sousTitre, listeEleves, onAdd, isGroupe = false, groupe = null;  if (niveauId) {
    const niveau = NIVEAUX.find((n) => n.id === niveauId);
    titre = niveau.label;
    listeEleves = trierParNumero(ctx.eleves.filter((e) => e.niveauId === niveauId));
    sousTitre = listeEleves.length + " élève(s)";
    onAdd = () => ctx.addEleve(niveauId);
  } else {
    isGroupe = true;
    groupe = ctx.groupes.find((g) => g.id === groupeId);
    titre = groupe ? groupe.nom : "Groupe";
    listeEleves = trierParNumero(ctx.eleves.filter((e) => groupe && groupe.membres.includes(e.id)));
    sousTitre = listeEleves.length + " membre(s)";
  }
  const couleurBase = niveauId ? ctx.config.couleurs[niveauId] : ctx.config.couleurs.suite;
  const couleurTexteSection = (ctx.config.couleursTexte || {})[niveauId ? niveauId : "suite"];

  return (
    <div className="section">
      <BackBar titre={titre} sousTitre={sousTitre} onBack={() => ctx.goTo(isGroupe ? { name: "suite" } : { name: "home" })} />
      <div className="toolbar">
        {!isGroupe && <button className="btn btn-primary" onClick={onAdd}><UserPlus size={16} /> Créer un élève</button>}
        {!isGroupe && <button className="btn" onClick={() => setShowNumeroManuel(true)} title="Choisir le numéro à la main"><Edit3 size={16} /> Numéro précis</button>}
        {isGroupe && <button className="btn btn-primary" onClick={() => setShowGroupPick(true)}><UserPlus size={16} /> Gérer les membres</button>}
        {listeEleves.length > 0 && <button className="btn" onClick={() => setShowBatch(true)}><ClipboardList size={16} /> Saisie en lot</button>}
        {listeEleves.length > 0 && <button className="btn" onClick={() => setShowColorBulk(true)}><Palette size={16} /> Couleur du texte (tous)</button>}
      </div>
      <HiveGrid
        items={listeEleves}
        renderItem={(e) => (
          <HexCell key={e.id} size="mini" couleur={couleurBase} couleurTexte={e.couleurTexte || couleurTexteSection} imageFichier={e.imageFichier}
            label={e.numero} onClick={() => ctx.goTo({ name: "eleve", eleveId: e.id })} />
        )}
      />
      {!listeEleves.length && <EmptyState text={isGroupe ? "Ce groupe n'a pas encore de membres. Clique sur « Gérer les membres »." : "Aucun élève pour l'instant. Clique sur « Créer un élève »."} />}
      {showBatch && <BatchEvalModal ctx={ctx} eleves={listeEleves} onClose={() => setShowBatch(false)} />}
      {showNumeroManuel && niveauId && (
        <NumeroManuelModal
          titre="Créer un élève avec un numéro précis"
          exemple={(NIVEAUX.find((n) => n.id === niveauId) || {}).prefix + "03"}
          onValider={(num) => ctx.addEleveAvecNumero(niveauId, num)}
          onClose={() => setShowNumeroManuel(false)}
        />
      )}
      {showGroupPick && groupe && <GroupMembersModal ctx={ctx} groupe={groupe} onClose={() => setShowGroupPick(false)} />}
      {showColorBulk && (
        <TextColorModal
          title={"Couleur du texte — " + titre}
          initial={couleurTexteSection}
          onClose={() => setShowColorBulk(false)}
          onApply={(v) => ctx.bulkSetCouleurTexteEleves(listeEleves.map((e) => e.id), v, niveauId || null)}
        />
      )}
    </div>
  );
}

function GroupMembersModal({ ctx, groupe, onClose }) {
  return (
    <Modal title={"Membres de « " + groupe.nom + " »"} onClose={onClose} wide>
      <p className="modal-hint">Choisis parmi tous les élèves déjà créés, peu importe leur niveau.</p>
      <div className="pick-list">
        {ctx.eleves.length === 0 && <EmptyState text="Aucun élève n'a encore été créé." />}
        {NIVEAUX.map((niv) => {
          const list = trierParNumero(ctx.eleves.filter((e) => e.niveauId === niv.id));
          if (!list.length) return null;
          return (
            <div key={niv.id} className="pick-group">
              <div className="pick-group-title">{niv.label}</div>
              {list.map((e) => (
                <label key={e.id} className="pick-row">
                  <input type="checkbox" checked={groupe.membres.includes(e.id)} onChange={() => ctx.toggleMembreGroupe(groupe.id, e.id)} />
                  <span>{e.numero}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ============================================================
   DOSSIER ÉLÈVE
   ============================================================ */

function EleveDossier({ ctx, eleveId }) {
  const eleve = ctx.eleves.find((e) => e.id === eleveId);
  const [tab, setTab] = useState("notes");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showEvalForm, setShowEvalForm] = useState(false);
  const [showPiForm, setShowPiForm] = useState(false);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showChampForm, setShowChampForm] = useState(false);
  const [etapeFiltre, setEtapeFiltre] = useState("toutes");

  if (!eleve) return <EmptyState text="Cet élève n'existe plus." />;

  const niveau = NIVEAUX.find((n) => n.id === eleve.niveauId);
  const mesNotes = ctx.notes.filter((n) => n.entityIds.includes(eleveId)).sort((a, b) => (b.pinned - a.pinned) || new Date(b.date) - new Date(a.date));
  const mesEval = ctx.evaluations.filter((e) => e.eleveId === eleveId);
  const mesObjectifs = ctx.pi.filter((o) => o.eleveId === eleveId);
  const mesPhotos = ctx.photos.filter((p) => p.entityIds.includes(eleveId));
  const mesGroupes = ctx.groupes.filter((g) => g.membres.includes(eleveId));

  return (
    <div className="section">
      <BackBar titre={eleve.numero} sousTitre={niveau ? niveau.label : ""} onBack={() => ctx.goTo(eleve.niveauId ? { name: "niveau", niveauId: eleve.niveauId } : { name: "home" })} />

      <div className="dossier-top">
        <ImageDeCouverture ctx={ctx} type="eleve" id={eleveId} fichier={eleve.imageFichier} />
        {mesGroupes.length > 0 && (
          <div className="chip-row">{mesGroupes.map((g) => <span key={g.id} className="chip">{g.nom}</span>)}</div>
        )}
        <div className="field-inline">
          <span>Couleur du texte (hexagone)</span>
          <TextColorPicker value={eleve.couleurTexte} onChange={(v) => ctx.updateEleve(eleveId, { couleurTexte: v })} />
        </div>
        <ChampsPersonnalisesBloc ctx={ctx} portee="eleve" entity={eleve} onAdd={() => setShowChampForm(true)} />
        <button className="btn btn-ghost btn-danger-ghost" onClick={() => setShowDelete(true)}><Trash2 size={14} /> Supprimer ce dossier</button>
      </div>

      <div className="tabs">
        <TabBtn active={tab === "notes"} onClick={() => setTab("notes")} icon={<BookOpen size={15} />}>Notes ({mesNotes.length})</TabBtn>
        <TabBtn active={tab === "eval"} onClick={() => setTab("eval")} icon={<GraduationCap size={15} />}>Évaluations</TabBtn>
        <TabBtn active={tab === "pi"} onClick={() => setTab("pi")} icon={<Star size={15} />}>PI ({mesObjectifs.length})</TabBtn>
        <TabBtn active={tab === "photos"} onClick={() => setTab("photos")} icon={<Camera size={15} />}>Photos ({mesPhotos.length})</TabBtn>
      </div>

      {tab === "notes" && (
        <div className="tab-panel">
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => setShowNoteForm(true)}><Plus size={16} /> Nouvelle note</button>
            <button className="btn" onClick={() => setShowClaude(true)}><Sparkles size={16} /> Préparer pour Claude</button>
          </div>
          <NotesList notes={mesNotes} onTogglePin={(id, p) => ctx.updateNote(id, { pinned: !p })} onDelete={ctx.deleteNote} categories={ctx.config.categoriesNotes} />
        </div>
      )}

      {tab === "eval" && (
        <div className="tab-panel">
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => setShowEvalForm(true)} disabled={!ctx.config.matieres.length}><Plus size={16} /> Nouvelle évaluation</button>
            <select value={etapeFiltre} onChange={(e) => setEtapeFiltre(e.target.value)}>
              <option value="toutes">Toutes les étapes</option>
              {ctx.config.etapes.map((et) => <option key={et.id} value={et.id}>{et.nom}</option>)}
            </select>
          </div>
          {!ctx.config.matieres.length && <EmptyState text="Ajoute d'abord des matières et compétences dans les Paramètres (⚙)." />}
          {ctx.config.matieres.map((mat) => {
            const res = ctx.computeMatiereMoyenne(eleveId, mat.id, etapeFiltre);
            const evsMat = mesEval.filter((e) => e.matiereId === mat.id && (etapeFiltre === "toutes" || e.etapeId === etapeFiltre));
            return (
              <div key={mat.id} className="matiere-block">
                <div className="matiere-head">
                  <span className="matiere-nom">{mat.nom}</span>
                  {res ? (
                    <span className="matiere-moy">{res.moyenne.toFixed(1)} {res.coteProche ? "(≈ " + res.coteProche.label + ")" : ""}</span>
                  ) : <span className="matiere-moy muted">— aucune donnée —</span>}
                </div>
                <div className="eval-list">
                  {evsMat.map((ev) => {
                    const comp = mat.competences.find((c) => c.id === ev.competenceId);
                    const cote = ctx.config.cotes.find((c) => c.id === ev.cote);
                    const etape = ctx.config.etapes.find((et) => et.id === ev.etapeId);
                    return (
                      <div key={ev.id} className="eval-row">
                        <span>{ev.nom ? ev.nom + " — " : ""}{comp ? comp.nom : "?"}</span>
                        <span className="eval-cote">{cote ? cote.label : "?"}</span>
                        <span className="muted small">{etape ? etape.nom : "hors étape"} · {formatDate(ev.date)}</span>
                        <button className="icon-btn" onClick={() => ctx.deleteEvaluation(ev.id)}><X size={13} /></button>
                      </div>
                    );
                  })}
                  {!evsMat.length && <span className="muted small">Aucune évaluation.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "pi" && (
        <div className="tab-panel">
          <div className="toolbar"><button className="btn btn-primary" onClick={() => setShowPiForm(true)}><Plus size={16} /> Nouvel objectif</button></div>
          {mesObjectifs.map((o) => (
            <div key={o.id} className="ehdaa-row">
              <Star size={14} className="ehdaa-icon" />
              <span>{o.objectif}</span>
              <span className="muted small">{formatDate(o.date.slice(0, 10))}</span>
              <button className="icon-btn" onClick={() => ctx.deleteObjectifPI(o.id)}><X size={13} /></button>
            </div>
          ))}
          {!mesObjectifs.length && <EmptyState text="Aucun objectif de plan d'intervention pour l'instant." />}
        </div>
      )}

      {tab === "photos" && (
        <div className="tab-panel">
          <div className="toolbar"><button className="btn btn-primary" onClick={() => setShowPhotoForm(true)}><Camera size={16} /> Ajouter une photo</button></div>
          <PhotoGrid photos={mesPhotos} onDelete={(id, fichier) => ctx.deletePhoto(id, fichier)} />
        </div>
      )}

      {showNoteForm && <NoteFormModal ctx={ctx} entityIds={[eleveId]} onClose={() => setShowNoteForm(false)} />}
      {showEvalForm && <EvalFormModal ctx={ctx} eleveId={eleveId} onClose={() => setShowEvalForm(false)} />}
      {showPiForm && <PiFormModal ctx={ctx} eleveId={eleveId} onClose={() => setShowPiForm(false)} />}
      {showPhotoForm && <PhotoFormModal ctx={ctx} entityIds={[eleveId]} onClose={() => setShowPhotoForm(false)} />}
      {showClaude && <PreparerClaudeModal ctx={ctx} eleve={eleve} onClose={() => setShowClaude(false)} />}
      {showChampForm && <ChampPersonnaliseModal portee="eleve" portéeLabel="les élèves" ctx={ctx} entityId={eleveId} onClose={() => setShowChampForm(false)} />}
      {showDelete && (
        <ConfirmModal
          title="Mettre ce dossier à la corbeille ?"
          text={"Le dossier " + eleve.numero + " part à la corbeille avec ses notes, évaluations, objectifs et photos. Tu pourras le restaurer — ou réutiliser son numéro — depuis Paramètres › Corbeille."}
          onCancel={() => setShowDelete(false)}
          onConfirm={() => { ctx.deleteEleve(eleveId); ctx.goTo(eleve.niveauId ? { name: "niveau", niveauId: eleve.niveauId } : { name: "home" }); }}
        />
      )}
    </div>
  );
}

/* ---------- bloc image de couverture (utilisé par élève, personnel, groupe) ---------- */
function ImageDeCouverture({ ctx, type, id, fichier }) {
  const url = useImageURL(fichier);
  const inputRef = useRef(null);
  return (
    <div className="cover-row">
      <div className="cover-thumb" style={url ? { backgroundImage: `url(${url})` } : {}}>
        {!url && <ImagePlus size={20} />}
      </div>
      <div className="cover-actions">
        <button className="btn btn-ghost" onClick={() => inputRef.current && inputRef.current.click()}>
          <ImagePlus size={14} /> {url ? "Changer l'image de l'hexagone" : "Ajouter une image à l'hexagone"}
        </button>
        {url && <button className="btn btn-ghost btn-danger-ghost" onClick={() => ctx.retirerHexImage(type, id, fichier)}><X size={13} /> Retirer</button>}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) ctx.setHexImage(type, id, f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

/* ---------- bloc champs personnalisés (utilisé par élève et personnel) ---------- */
function ChampsPersonnalisesBloc({ ctx, portee, entity, onAdd }) {
  const listeGlobale = portee === "eleve" ? ctx.config.champsPersonnalisesEleves : ctx.config.champsPersonnalisesPersonnel;
  const setValeurGlobale = (champId, valeur) => {
    if (portee === "eleve") ctx.updateEleve(entity.id, { champs: { ...entity.champs, [champId]: valeur } });
    else ctx.updatePersonnel(entity.id, { champs: { ...entity.champs, [champId]: valeur } });
  };
  const setValeurLocale = (champLocalId, valeur) => {
    const champsLocaux = (entity.champsLocaux || []).map((c) => c.id === champLocalId ? { ...c, valeur } : c);
    if (portee === "eleve") ctx.updateEleve(entity.id, { champsLocaux });
    else ctx.updatePersonnel(entity.id, { champsLocaux });
  };
  return (
    <div className="champs-bloc">
      {listeGlobale.map((c) => (
        <label key={c.id} className="field-inline">
          <span>{c.nom}</span>
          <ChampInput type={c.type} options={c.options} value={(entity.champs || {})[c.id] || ""} onChange={(v) => setValeurGlobale(c.id, v)} />
        </label>
      ))}
      {(entity.champsLocaux || []).map((c) => (
        <label key={c.id} className="field-inline">
          <span>{c.nom} <button className="icon-btn" onClick={() => ctx.retirerChampLocal(portee, entity.id, c.id)}><X size={11} /></button></span>
          <ChampInput type={c.type} options={c.options} value={c.valeur || ""} onChange={(v) => setValeurLocale(c.id, v)} />
        </label>
      ))}
      <button className="btn btn-ghost" onClick={onAdd}><ListPlus size={14} /> Ajouter un champ</button>
    </div>
  );
}

function ChampInput({ type, options, value, onChange }) {
  if (type === "nombre") return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (type === "date") return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (type === "liste") return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {(options || []).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return <input value={value} onChange={(e) => onChange(e.target.value)} />;
}

/* ============================================================
   PERSONNEL
   ============================================================ */

function PersonnelGrid({ ctx }) {
  const [showColorBulk, setShowColorBulk] = useState(false);
  const [showNumeroManuel, setShowNumeroManuel] = useState(false);
  const afficherNumeros = !ctx.config.masquerNumerosPersonnel;
  const couleurTexteSection = (ctx.config.couleursTexte || {}).personnel;
  return (
    <div className="section">
      <BackBar titre="Personnel" sousTitre={ctx.personnel.length + " membre(s)"} onBack={ctx.goHome} />
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => ctx.addPersonnel()}><UserPlus size={16} /> Ajouter un membre</button>
        <button className="btn" onClick={() => setShowNumeroManuel(true)} title="Choisir le numéro à la main"><Edit3 size={16} /> Numéro précis</button>
        {ctx.personnel.length > 0 && <button className="btn" onClick={() => setShowColorBulk(true)}><Palette size={16} /> Couleur du texte (tous)</button>}
        <label className="pick-row inline">
          <input type="checkbox" checked={afficherNumeros} onChange={() => ctx.saveConfig({ ...ctx.config, masquerNumerosPersonnel: afficherNumeros })} />
          <span>Afficher les numéros</span>
        </label>
      </div>
      <HiveGrid
        items={trierParNumero(ctx.personnel)}
        renderItem={(p) => (
          <HexCell key={p.id} size="mini" couleur={ctx.config.couleurs.personnel} couleurTexte={p.couleurTexte || couleurTexteSection} imageFichier={p.imageFichier}
            label={afficherNumeros ? p.numero : ""} onClick={() => ctx.goTo({ name: "personnel", personnelId: p.id })} />
        )}
      />
      {!ctx.personnel.length && <EmptyState text="Aucun membre du personnel pour l'instant." />}
      {showNumeroManuel && (
        <NumeroManuelModal
          titre="Ajouter un membre avec un numéro précis"
          exemple="P003"
          onValider={(num) => ctx.addPersonnelAvecNumero(num)}
          onClose={() => setShowNumeroManuel(false)}
        />
      )}
      {showColorBulk && (
        <TextColorModal
          title="Couleur du texte — Personnel"
          initial={couleurTexteSection}
          onClose={() => setShowColorBulk(false)}
          onApply={(v) => ctx.bulkSetCouleurTextePersonnel(v)}
        />
      )}
    </div>
  );
}

function PersonnelDossier({ ctx, personnelId }) {
  const p = ctx.personnel.find((x) => x.id === personnelId);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showChampForm, setShowChampForm] = useState(false);
  if (!p) return <EmptyState text="Ce membre n'existe plus." />;
  const mesNotes = ctx.notes.filter((n) => n.entityIds.includes(personnelId)).sort((a, b) => (b.pinned - a.pinned) || new Date(b.date) - new Date(a.date));

  return (
    <div className="section">
      <BackBar titre={p.numero} sousTitre="Personnel" onBack={() => ctx.goTo({ name: "personnel-list" })} />
      <div className="dossier-top">
        <ImageDeCouverture ctx={ctx} type="personnel" id={personnelId} fichier={p.imageFichier} />
        <label className="field-inline">
          <span>Goûts</span>
          <input value={p.gouts} onChange={(e) => ctx.updatePersonnel(personnelId, { gouts: e.target.value })} placeholder="ex. café, chocolat noir…" />
        </label>
        <label className="field-inline">
          <span>Matière(s) enseignée(s)</span>
          <input value={p.matieres} onChange={(e) => ctx.updatePersonnel(personnelId, { matieres: e.target.value })} placeholder="ex. art plastique, tous niveaux" />
        </label>
        <div className="field-inline">
          <span>Couleur du texte (hexagone)</span>
          <TextColorPicker value={p.couleurTexte} onChange={(v) => ctx.updatePersonnel(personnelId, { couleurTexte: v })} />
        </div>
        <ChampsPersonnalisesBloc ctx={ctx} portee="personnel" entity={p} onAdd={() => setShowChampForm(true)} />
        <button className="btn btn-ghost btn-danger-ghost" onClick={() => setShowDelete(true)}><Trash2 size={14} /> Supprimer ce dossier</button>
      </div>
      <div className="tab-panel">
        <div className="toolbar"><button className="btn btn-primary" onClick={() => setShowNoteForm(true)}><Plus size={16} /> Nouvelle note</button></div>
        <NotesList notes={mesNotes} onTogglePin={(id, pin) => ctx.updateNote(id, { pinned: !pin })} onDelete={ctx.deleteNote} categories={ctx.config.categoriesNotes} />
      </div>
      {showNoteForm && <NoteFormModal ctx={ctx} entityIds={[personnelId]} onClose={() => setShowNoteForm(false)} />}
      {showChampForm && <ChampPersonnaliseModal portee="personnel" portéeLabel="le personnel" ctx={ctx} entityId={personnelId} onClose={() => setShowChampForm(false)} />}
      {showDelete && (
        <ConfirmModal title="Mettre ce dossier à la corbeille ?" text={"Le dossier " + p.numero + " part à la corbeille avec ses notes et ses photos. Tu pourras le restaurer depuis Paramètres › Corbeille."} onCancel={() => setShowDelete(false)} onConfirm={() => { ctx.deletePersonnel(personnelId); ctx.goTo({ name: "personnel-list" }); }} />
      )}
    </div>
  );
}

/* ============================================================
   SUITE — groupes transversaux (7e hexagone)
   ============================================================ */

function Suite({ ctx }) {
  const [showNew, setShowNew] = useState(false);
  const [nom, setNom] = useState("");
  return (
    <div className="section">
      <BackBar titre="Suite" sousTitre="Groupes transversaux (ex. Option sciences, Mon groupe)" onBack={ctx.goHome} />
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><FolderPlus size={16} /> Créer une catégorie</button>
      </div>
      <HiveGrid
        items={ctx.groupes}
        renderItem={(g) => (
          <HexCell key={g.id} size="mini" couleur={ctx.config.couleurs.suite} couleurTexte={g.couleurTexte || (ctx.config.couleursTexte || {}).suite} imageFichier={g.imageFichier}
            label={g.nom} sub={g.membres.length + " membre(s)"} onClick={() => ctx.goTo({ name: "groupe", groupeId: g.id })} />
        )}
      />
      {!ctx.groupes.length && <EmptyState text="Crée une première catégorie, ex. « Option sciences » ou « Mon groupe »." />}
      {showNew && (
        <Modal title="Nouvelle catégorie" onClose={() => setShowNew(false)}>
          <label className="field"><span>Nom</span><input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Option sciences" /></label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowNew(false)}>Annuler</button>
            <button className="btn btn-primary" disabled={!nom.trim()} onClick={() => { const g = ctx.addGroupe(nom.trim()); setShowNew(false); setNom(""); ctx.goTo({ name: "groupe", groupeId: g.id }); }}>Créer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   PLAN DE MATCH
   ============================================================ */

function PlanDeMatch({ ctx }) {
  const [vue, setVue] = useState("semaine");
  const [showForm, setShowForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTaches, setShowTaches] = useState(true);
  const [filtrePriorite, setFiltrePriorite] = useState("toutes");
  const [showEvenements, setShowEvenements] = useState(true);

  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23, 59, 59, 999);

  function inRange(t) {
    if (!t.date) return vue === "toutes";
    const d = new Date(t.date + "T12:00:00");
    if (vue === "jour") return t.date === todayISO();
    if (vue === "semaine") return d >= startOfWeek && d <= endOfWeek;
    if (vue === "mois") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (vue === "etape") { const et = getEtapeForDate(t.date, ctx.config.etapes); return !!et; }
    return true;
  }

  /* le Plan de match ne montre que ce qui reste à faire ; le passé vit dans l'Historique */
  const tachesFiltrees = showTaches
    ? ctx.taches.filter((t) => !t.fait).filter(inRange).filter((t) => filtrePriorite === "toutes" || t.priorite === filtrePriorite)
    : [];
  const evenementsFiltres = showEvenements ? ctx.evenements.filter((e) => !estPasse(e)).filter(inRange) : [];

  const nbHistorique = ctx.taches.filter((t) => t.fait).length + ctx.evenements.filter(estPasse).length;

  const items = [
    ...tachesFiltrees.map((t) => ({ type: "tache", date: t.date, data: t })),
    ...evenementsFiltres.map((e) => ({ type: "evenement", date: e.date, data: e })),
  ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  function entityLabel(id) {
    const e = ctx.eleves.find((x) => x.id === id); if (e) return e.numero;
    const p = ctx.personnel.find((x) => x.id === id); if (p) return p.numero;
    return null;
  }

  return (
    <div className="section">
      <BackBar titre="Plan de match" sousTitre="Ce qu'il y a à faire" onBack={ctx.goHome} />
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Nouvelle tâche</button>
        <button className="btn" onClick={() => setShowEventForm(true)}><Calendar size={16} /> Nouvel événement</button>
        <button className="btn" onClick={() => ctx.goTo({ name: "historique" })}>
          <History size={16} /> Historique{nbHistorique ? " (" + nbHistorique + ")" : ""}
        </button>
        <div className="view-switch">
          {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["etape", "Étape"], ["toutes", "Toutes"]].map(([k, l]) => (
            <button key={k} className={"view-btn" + (vue === k ? " active" : "")} onClick={() => setVue(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="toolbar plan-filtres">
        <label className="pick-row inline">
          <input type="checkbox" checked={showTaches} onChange={() => setShowTaches((v) => !v)} />
          <span>Tâches</span>
        </label>
        {showTaches && (
          <select value={filtrePriorite} onChange={(e) => setFiltrePriorite(e.target.value)}>
            <option value="toutes">Normale + Haute</option>
            <option value="normale">Normale seulement</option>
            <option value="haute">Haute seulement</option>
          </select>
        )}
        <label className="pick-row inline">
          <input type="checkbox" checked={showEvenements} onChange={() => setShowEvenements((v) => !v)} />
          <span>Événements</span>
        </label>
      </div>
      <div className="tache-list">
        {items.map(({ type, data: t }) => type === "tache" ? (
          <div key={"t-" + t.id} className={"tache-row" + (t.priorite === "haute" ? " haute" : "")}>
            <button className="icon-btn" onClick={() => ctx.toggleTacheFait(t.id)} title="Marquer comme fait"><Circle size={18} /></button>
            <div className="tache-body">
              <span className="tache-titre">{t.titre}</span>
              {t.description && <span className="tache-desc">{t.description}</span>}
              <span className="tache-meta">
                {t.date ? formatDate(t.date) : "sans date"}
                {t.priorite === "haute" ? " · priorité haute" : ""}
                {t.recurrence !== "aucune" ? " · récurrent (" + t.recurrence + ")" : ""}
                {t.linkedEntityId && entityLabel(t.linkedEntityId) ? " · lié à " + entityLabel(t.linkedEntityId) : ""}
              </span>
            </div>
            <button className="icon-btn" onClick={() => ctx.deleteTache(t.id)}><X size={14} /></button>
          </div>
        ) : (
          <div key={"e-" + t.id} className="tache-row evenement-row">
            <Calendar size={18} className="evenement-icon" />
            <div className="tache-body">
              <span className="tache-titre">{t.titre}</span>
              {t.description && <span className="tache-desc">{t.description}</span>}
              <span className="tache-meta">
                {t.date ? formatDate(t.date) : "sans date"}{t.heure ? " · " + t.heure : ""} · événement
              </span>
            </div>
            <button className="icon-btn" onClick={() => ctx.deleteEvenement(t.id)}><X size={14} /></button>
          </div>
        ))}
        {!items.length && <EmptyState text="Rien à faire pour cette vue." />}
      </div>
      {showForm && <TaskModal ctx={ctx} onClose={() => setShowForm(false)} />}
      {showEventForm && <EventModal ctx={ctx} onClose={() => setShowEventForm(false)} />}
    </div>
  );
}

/* ============================================================
   HISTORIQUE — tâches complétées et événements passés
   ============================================================ */

function Historique({ ctx }) {
  const [onglet, setOnglet] = useState("taches");
  const [confirmVider, setConfirmVider] = useState(false);

  const tachesFaites = useMemo(
    () => ctx.taches.filter((t) => t.fait)
      .slice()
      .sort((a, b) => new Date(b.faitLe || b.date || b.creeLe || 0) - new Date(a.faitLe || a.date || a.creeLe || 0)),
    [ctx.taches]
  );
  const evenementsPasses = useMemo(
    () => ctx.evenements.filter(estPasse).slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    [ctx.evenements]
  );

  function entityLabel(id) {
    const e = ctx.eleves.find((x) => x.id === id); if (e) return e.numero;
    const p = ctx.personnel.find((x) => x.id === id); if (p) return p.numero;
    return null;
  }

  return (
    <div className="section">
      <BackBar titre="Historique" sousTitre="Ce qui est derrière toi" onBack={() => ctx.goTo({ name: "plan" })} />
      <div className="toolbar">
        <div className="view-switch">
          <button className={"view-btn" + (onglet === "taches" ? " active" : "")} onClick={() => setOnglet("taches")}>
            Tâches complétées ({tachesFaites.length})
          </button>
          <button className={"view-btn" + (onglet === "evenements" ? " active" : "")} onClick={() => setOnglet("evenements")}>
            Événements passés ({evenementsPasses.length})
          </button>
        </div>
        {onglet === "taches" && !!tachesFaites.length && (
          <button className="btn btn-danger" onClick={() => setConfirmVider(true)}><Trash2 size={15} /> Tout effacer</button>
        )}
      </div>

      {onglet === "taches" && (
        <div className="tache-list">
          {tachesFaites.map((t) => (
            <div key={t.id} className="tache-row fait">
              <CheckCircle2 size={18} className="historique-check" />
              <div className="tache-body">
                <span className="tache-titre">{t.titre}</span>
                {t.description && <span className="tache-desc">{t.description}</span>}
                <span className="tache-meta">
                  {t.faitLe ? "fait le " + formatDate(t.faitLe.slice(0, 10)) : t.date ? "prévue le " + formatDate(t.date) : "sans date"}
                  {t.priorite === "haute" ? " · priorité haute" : ""}
                  {t.recurrence && t.recurrence !== "aucune" ? " · récurrent (" + t.recurrence + ")" : ""}
                  {t.linkedEntityId && entityLabel(t.linkedEntityId) ? " · lié à " + entityLabel(t.linkedEntityId) : ""}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => ctx.toggleTacheFait(t.id)} title="Remettre au plan de match">
                <Undo2 size={14} /> Rouvrir
              </button>
              <button className="icon-btn" onClick={() => ctx.deleteTache(t.id)} title="Supprimer"><X size={14} /></button>
            </div>
          ))}
          {!tachesFaites.length && <EmptyState text="Aucune tâche complétée pour l'instant. Elles viendront s'empiler ici." />}
        </div>
      )}

      {onglet === "evenements" && (
        <div className="tache-list">
          {evenementsPasses.map((e) => (
            <div key={e.id} className="tache-row fait evenement-row">
              <Calendar size={18} className="evenement-icon" />
              <div className="tache-body">
                <span className="tache-titre">{e.titre}</span>
                {e.description && <span className="tache-desc">{e.description}</span>}
                <span className="tache-meta">{formatDate(e.date)}{e.heure ? " · " + e.heure : ""} · événement passé</span>
              </div>
              <button className="icon-btn" onClick={() => ctx.deleteEvenement(e.id)} title="Supprimer"><X size={14} /></button>
            </div>
          ))}
          {!evenementsPasses.length && <EmptyState text="Aucun événement passé." />}
        </div>
      )}

      {confirmVider && (
        <ConfirmModal
          title="Effacer les tâches complétées ?"
          text={"Les " + tachesFaites.length + " tâche(s) complétée(s) seront supprimées définitivement. Les événements passés ne sont pas touchés."}
          onCancel={() => setConfirmVider(false)}
          onConfirm={() => { tachesFaites.forEach((t) => ctx.deleteTache(t.id)); setConfirmVider(false); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   FORMULAIRES / MODALES
   ============================================================ */

/* ---------- création avec un numéro choisi à la main ---------- */

function NumeroManuelModal({ titre, exemple, onValider, onClose }) {
  const [numero, setNumero] = useState("");
  const [erreur, setErreur] = useState("");

  function valider() {
    const msg = onValider(numero);
    if (msg) { setErreur(msg); return; }
    onClose();
  }

  return (
    <Modal title={titre} onClose={onClose}>
      <p className="modal-hint">
        Utile pour un élève qui arrive en cours d'année, ou pour combler un numéro laissé libre.
        La création normale attribue toujours le numéro suivant le plus élevé et ne redescend jamais.
      </p>
      <label className="field">
        <span>Numéro</span>
        <input
          autoFocus
          value={numero}
          placeholder={exemple}
          onChange={(e) => { setNumero(e.target.value); setErreur(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") valider(); }}
        />
      </label>
      {erreur && <p className="error-text">{erreur}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!numero.trim()} onClick={valider}>Créer</button>
      </div>
    </Modal>
  );
}

function NoteFormModal({ ctx, entityIds, onClose }) {
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [categorie, setCategorie] = useState(ctx.config.categoriesNotes[0] || "");
  const [statutSpecial, setStatutSpecial] = useState("");
  return (
    <Modal title="Nouvelle note" onClose={onClose}>
      <label className="field"><span>Titre</span><input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} /></label>
      <label className="field"><span>Contenu</span><textarea rows={4} value={contenu} onChange={(e) => setContenu(e.target.value)} /></label>
      <label className="field"><span>Catégorie</span>
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
          {ctx.config.categoriesNotes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="field"><span>Statut spécial (optionnel)</span>
        <select value={statutSpecial} onChange={(e) => setStatutSpecial(e.target.value)}>
          <option value="">— aucun —</option>
          {STATUTS_SPECIAUX.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!titre.trim()} onClick={() => { ctx.addNote({ titre, contenu, categorie, entityIds, statutSpecial: statutSpecial || null }); onClose(); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function NotesList({ notes, onTogglePin, onDelete, categories }) {
  const [filtre, setFiltre] = useState("toutes");
  const list = filtre === "toutes" ? notes : notes.filter((n) => n.categorie === filtre);
  return (
    <div>
      <div className="chip-filters">
        <button className={"chip-filter" + (filtre === "toutes" ? " active" : "")} onClick={() => setFiltre("toutes")}>Toutes</button>
        {categories.map((c) => <button key={c} className={"chip-filter" + (filtre === c ? " active" : "")} onClick={() => setFiltre(c)}>{c}</button>)}
      </div>
      {list.map((n) => (
        <div key={n.id} className={"note-card" + (n.pinned ? " pinned" : "")}>
          <div className="note-head">
            <span className="note-titre">{n.titre}</span>
            {n.statutSpecial && <span className="badge">{n.statutSpecial}</span>}
            <button className="icon-btn" onClick={() => onTogglePin(n.id, n.pinned)}><Pin size={14} fill={n.pinned ? "currentColor" : "none"} /></button>
            <button className="icon-btn" onClick={() => onDelete(n.id)}><X size={14} /></button>
          </div>
          {n.contenu && <p className="note-contenu">{n.contenu}</p>}
          <span className="note-meta">{n.categorie} · {formatDateTime(n.date)}</span>
        </div>
      ))}
      {!list.length && <EmptyState text="Aucune note." />}
    </div>
  );
}

function EvalFormModal({ ctx, eleveId, onClose }) {
  const [nom, setNom] = useState("");
  const [matiereId, setMatiereId] = useState(ctx.config.matieres[0]?.id || "");
  const matiere = ctx.config.matieres.find((m) => m.id === matiereId);
  const [competenceId, setCompetenceId] = useState(matiere?.competences[0]?.id || "");
  const [cote, setCote] = useState(ctx.config.cotes[0]?.id || "");
  const [date, setDate] = useState(todayISO());

  useEffect(() => { const m = ctx.config.matieres.find((x) => x.id === matiereId); setCompetenceId(m?.competences[0]?.id || ""); }, [matiereId]);

  if (!ctx.config.cotes.length) return <Modal title="Nouvelle évaluation" onClose={onClose}><EmptyState text="Ajoute d'abord une échelle de cotes dans les Paramètres (⚙)." /></Modal>;

  const pasDeCompetence = matiere && !matiere.competences.length;

  return (
    <Modal title="Nouvelle évaluation" onClose={onClose}>
      <label className="field"><span>Nom de l'évaluation</span><input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Contrôle chapitre 3" /></label>
      <label className="field"><span>Matière</span>
        <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
          {ctx.config.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      </label>
      <label className="field"><span>Compétence</span>
        <select value={competenceId} onChange={(e) => setCompetenceId(e.target.value)} disabled={pasDeCompetence}>
          {matiere?.competences.map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.pourcentage}%)</option>)}
        </select>
        {pasDeCompetence && <span className="error-text small">Cette matière n'a pas encore de compétence — ajoute-en une dans les Paramètres avant de continuer.</span>}
      </label>
      <label className="field"><span>Cote</span>
        <select value={cote} onChange={(e) => setCote(e.target.value)}>
          {ctx.config.cotes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!nom.trim() || !matiereId || !competenceId || !cote} onClick={() => { ctx.addEvaluation({ nom: nom.trim(), eleveId, matiereId, competenceId, cote, date }); onClose(); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function BatchEvalModal({ ctx, eleves, onClose }) {
  const [nom, setNom] = useState("");
  const [matiereId, setMatiereId] = useState(ctx.config.matieres[0]?.id || "");
  const matiere = ctx.config.matieres.find((m) => m.id === matiereId);
  const [competenceId, setCompetenceId] = useState(matiere?.competences[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [cotes, setCotes] = useState({});

  useEffect(() => { const m = ctx.config.matieres.find((x) => x.id === matiereId); setCompetenceId(m?.competences[0]?.id || ""); }, [matiereId]);

  if (!ctx.config.matieres.length || !ctx.config.cotes.length) {
    return <Modal title="Saisie en lot" onClose={onClose} wide><EmptyState text="Ajoute d'abord des matières/compétences et une échelle de cotes dans les Paramètres (⚙)." /></Modal>;
  }

  const pasDeCompetence = matiere && !matiere.competences.length;

  function submit() {
    const list = Object.entries(cotes).filter(([, v]) => v).map(([eleveId, cote]) => ({ nom: nom.trim(), eleveId, matiereId, competenceId, cote, date }));
    if (list.length) ctx.addEvaluationsBatch(list);
    onClose();
  }

  return (
    <Modal title="Saisie en lot" onClose={onClose} wide>
      <div className="batch-header">
        <label className="field"><span>Nom de l'évaluation</span><input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Contrôle chapitre 3" /></label>
        <label className="field"><span>Matière</span>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
            {ctx.config.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </label>
        <label className="field"><span>Compétence</span>
          <select value={competenceId} onChange={(e) => setCompetenceId(e.target.value)} disabled={pasDeCompetence}>
            {matiere?.competences.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {pasDeCompetence && <p className="error-text small">Cette matière n'a pas encore de compétence — ajoute-en une dans les Paramètres avant de continuer.</p>}
      <div className="batch-list">
        {eleves.map((e) => (
          <div key={e.id} className="batch-row">
            <span>{e.numero}</span>
            <select value={cotes[e.id] || ""} onChange={(ev) => setCotes({ ...cotes, [e.id]: ev.target.value })}>
              <option value="">—</option>
              {ctx.config.cotes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!nom.trim() || !competenceId} onClick={submit}>Enregistrer tout</button>
      </div>
    </Modal>
  );
}

function PiFormModal({ ctx, eleveId, onClose }) {
  const [objectif, setObjectif] = useState("");
  return (
    <Modal title="Nouvel objectif — PI" onClose={onClose}>
      <label className="field"><span>Objectif</span><textarea autoFocus rows={3} value={objectif} onChange={(e) => setObjectif(e.target.value)} /></label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!objectif.trim()} onClick={() => { ctx.addObjectifPI(eleveId, objectif.trim()); onClose(); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function ChampPersonnaliseModal({ ctx, portee, portéeLabel, entityId, onClose }) {
  const [nom, setNom] = useState("");
  const [type, setType] = useState("texte");
  const [optionsTxt, setOptionsTxt] = useState("");
  const [valeur, setValeur] = useState("");
  const [global, setGlobal] = useState(true);
  const options = optionsTxt.split(",").map((o) => o.trim()).filter(Boolean);

  return (
    <Modal title="Ajouter un champ" onClose={onClose}>
      <label className="field"><span>Nom du champ</span><input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Sexe, Âge…" /></label>
      <label className="field"><span>Type</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES_CHAMP.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      {type === "liste" && <label className="field"><span>Options (séparées par des virgules)</span><input value={optionsTxt} onChange={(e) => setOptionsTxt(e.target.value)} placeholder="ex. Garçon, Fille, Autre" /></label>}
      <label className="field"><span>Valeur pour ce dossier</span><ChampInput type={type} options={options} value={valeur} onChange={setValeur} /></label>
      <label className="pick-row"><input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} /><span>Utiliser ce champ pour tous {portéeLabel}</span></label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!nom.trim()} onClick={() => { ctx.ajouterChampPersonnalise({ portee, nom: nom.trim(), type, options, valeur, global, entityId }); onClose(); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function PhotoFormModal({ ctx, entityIds, onClose }) {
  const [file, setFile] = useState(null);
  const [categorie, setCategorie] = useState(ctx.config.categoriesPhotos[0] || "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Ajouter une photo" onClose={onClose}>
      <label className="field"><span>Fichier</span><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></label>
      <label className="field"><span>Catégorie</span>
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
          {ctx.config.categoriesPhotos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <p className="modal-hint">La photo est automatiquement compressée et écrite comme fichier .jpg dans ton dossier « photos ».</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!file || busy} onClick={async () => { setBusy(true); await ctx.addPhoto({ file, categorie, entityIds }); setBusy(false); onClose(); }}>{busy ? "Compression…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

function PhotoGrid({ photos, onDelete }) {
  return (
    <div className="photo-grid">
      {photos.map((p) => <PhotoCard key={p.id} photo={p} onDelete={onDelete} />)}
      {!photos.length && <EmptyState text="Aucune photo." />}
    </div>
  );
}

function PhotoCard({ photo, onDelete }) {
  const url = useImageURL(photo.fichier);
  return (
    <div className="photo-card">
      {url ? <img src={url} alt={photo.categorie} /> : <div className="photo-loading"><Loader2 className="spin" size={18} /></div>}
      <div className="photo-meta">
        <span>{photo.categorie}</span>
        <button className="icon-btn" onClick={() => onDelete(photo.id, photo.fichier)}><X size={13} /></button>
      </div>
    </div>
  );
}

function TaskModal({ ctx, onClose, presetEntity }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [priorite, setPriorite] = useState("normale");
  const [recurrence, setRecurrence] = useState("aucune");
  return (
    <Modal title="Nouvelle tâche" onClose={onClose}>
      <label className="field"><span>Titre</span><input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} /></label>
      <label className="field"><span>Détails (optionnel)</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><span>Priorité</span>
        <select value={priorite} onChange={(e) => setPriorite(e.target.value)}>
          <option value="normale">Normale</option>
          <option value="haute">Haute</option>
        </select>
      </label>
      <label className="field"><span>Récurrence</span>
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
          <option value="aucune">Aucune</option>
          <option value="quotidienne">Quotidienne</option>
          <option value="hebdomadaire">Hebdomadaire</option>
          <option value="mensuelle">Mensuelle</option>
        </select>
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!titre.trim()} onClick={() => { ctx.addTache({ titre, description, date, priorite, recurrence, linkedEntityId: presetEntity || null }); onClose(); }}>Créer</button>
      </div>
    </Modal>
  );
}

function EventModal({ ctx, onClose }) {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [heure, setHeure] = useState("");
  return (
    <Modal title="Nouvel événement" onClose={onClose}>
      <label className="field"><span>Titre</span><input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex. Sortie scolaire, réunion d'équipe…" /></label>
      <label className="field"><span>Détails (optionnel)</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><span>Heure (optionnel)</span><input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} /></label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!titre.trim()} onClick={() => { ctx.addEvenement({ titre, description, date, heure }); onClose(); }}>Créer</button>
      </div>
    </Modal>
  );
}

/* ---------- « Préparer pour Claude » : portrait Markdown, copié dans le presse-papier ---------- */
function PreparerClaudeModal({ ctx, eleve, onClose }) {
  const [texte, setTexte] = useState("");
  const [copie, setCopie] = useState(false);

  function generer() {
    const lignes = [];
    ctx.config.matieres.forEach((m) => {
      const res = ctx.computeMatiereMoyenne(eleve.id, m.id, "toutes");
      if (res) lignes.push("- " + m.nom + " : moyenne " + res.moyenne.toFixed(1) + (res.coteProche ? " (≈ " + res.coteProche.label + ")" : ""));
    });
    const objectifs = ctx.pi.filter((o) => o.eleveId === eleve.id).map((o) => "- " + o.objectif).join("\n");
    const notesRecentes = ctx.notes.filter((n) => n.entityIds.includes(eleve.id)).slice(0, 12)
      .map((n) => "- [" + n.categorie + (n.statutSpecial ? " / " + n.statutSpecial : "") + "] " + n.titre + (n.contenu ? " : " + n.contenu : "")).join("\n");

    const md = `# Dossier de ${eleve.numero} — pour Claude

Élève identifié seulement par un numéro (aucun nom). Voici un portrait factuel à utiliser pour préparer un résumé de progrès, une rencontre de parents, ou toute autre analyse.

## Moyennes par matière
${lignes.join("\n") || "aucune donnée"}

## Objectifs — plan d'intervention (PI)
${objectifs || "aucun"}

## Notes récentes
${notesRecentes || "aucune"}

## Suggestion de prompt
« Voici le dossier d'un(e) élève de niveau primaire. Rédige un résumé bref, concret et utile pour une rencontre de parents, en français québécois, avec trois sections : Progrès académique, Observations, Suggestions de suivi. Reste factuel, basé uniquement sur les données ci-dessus. »`;
    setTexte(md);
  }

  async function copier() {
    try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 1800); }
    catch (e) { /* presse-papier indisponible, la personne peut sélectionner le texte manuellement */ }
  }

  function exporterMd() {
    downloadText(texte, "dossier_" + eleve.numero + ".md", "text/markdown");
  }

  return (
    <Modal title={"Préparer pour Claude — " + eleve.numero} onClose={onClose} wide>
      {!texte && <p className="modal-hint">Assemble un portrait de cet élève (moyennes, PI, notes récentes) prêt à coller dans une conversation avec Claude. Rien n'est envoyé automatiquement — tu copies et colles toi-même.</p>}
      {texte && <textarea className="ai-output" rows={16} value={texte} readOnly />}
      <div className="modal-actions">
        {!texte && <button className="btn btn-primary" onClick={generer}><Sparkles size={16} /> Assembler le dossier</button>}
        {texte && <>
          <button className="btn" onClick={() => setTexte("")}>Recommencer</button>
          <button className="btn" onClick={exporterMd}><FileDown size={16} /> Exporter en .md</button>
          <button className="btn btn-primary" onClick={copier}>{copie ? <><Check size={16} /> Copié</> : <><Copy size={16} /> Copier</>}</button>
        </>}
      </div>
    </Modal>
  );
}

/* ============================================================
   PARAMÈTRES (⚙)
   ============================================================ */

function ConfigPanel({ ctx, onClose }) {
  const [tab, setTab] = useState("matieres");
  const cfg = ctx.config;

  function setCfg(next) { ctx.saveConfig(next); }

  /* matières */
  const [nouvelleMatiere, setNouvelleMatiere] = useState("");
  function addMatiere() {
    if (!nouvelleMatiere.trim()) return;
    setCfg({ ...cfg, matieres: [...cfg.matieres, { id: uid(), nom: nouvelleMatiere.trim(), competences: [] }] });
    setNouvelleMatiere("");
  }
  function deleteMatiere(id) { setCfg({ ...cfg, matieres: cfg.matieres.filter((m) => m.id !== id) }); }
  function addCompetence(matiereId, nom, pourcentage) {
    setCfg({ ...cfg, matieres: cfg.matieres.map((m) => m.id === matiereId ? { ...m, competences: [...m.competences, { id: uid(), nom, pourcentage }] } : m) });
  }
  function deleteCompetence(matiereId, compId) {
    setCfg({ ...cfg, matieres: cfg.matieres.map((m) => m.id === matiereId ? { ...m, competences: m.competences.filter((c) => c.id !== compId) } : m) });
  }

  /* cotes */
  const [coteLabel, setCoteLabel] = useState("");
  const [coteValeur, setCoteValeur] = useState("");
  function addCote() {
    if (!coteLabel.trim() || coteValeur === "") return;
    setCfg({ ...cfg, cotes: [...cfg.cotes, { id: uid(), label: coteLabel.trim(), valeur: parseFloat(coteValeur) }].sort((a, b) => b.valeur - a.valeur) });
    setCoteLabel(""); setCoteValeur("");
  }
  function deleteCote(id) { setCfg({ ...cfg, cotes: cfg.cotes.filter((c) => c.id !== id) }); }

  /* étapes */
  const [etapeNom, setEtapeNom] = useState("");
  const [etapeDebut, setEtapeDebut] = useState("");
  const [etapeFin, setEtapeFin] = useState("");
  function addEtape() {
    if (!etapeNom.trim() || !etapeDebut || !etapeFin) return;
    setCfg({ ...cfg, etapes: [...cfg.etapes, { id: uid(), nom: etapeNom.trim(), dateDebut: etapeDebut, dateFin: etapeFin }] });
    setEtapeNom(""); setEtapeDebut(""); setEtapeFin("");
  }
  function deleteEtape(id) { setCfg({ ...cfg, etapes: cfg.etapes.filter((e) => e.id !== id) }); }

  /* catégories */
  function addCategorie(field, val) { if (!val.trim()) return; setCfg({ ...cfg, [field]: [...cfg[field], val.trim()] }); }
  function deleteCategorie(field, val) { setCfg({ ...cfg, [field]: cfg[field].filter((c) => c !== val) }); }
  const [catNoteInput, setCatNoteInput] = useState("");
  const [catPhotoInput, setCatPhotoInput] = useState("");

  /* couleurs */
  function setCouleur(id, val) { setCfg({ ...cfg, couleurs: { ...cfg.couleurs, [id]: val } }); }
  function setCouleurTexte(id, val) { setCfg({ ...cfg, couleursTexte: { ...cfg.couleursTexte, [id]: val } }); }

  return (
    <Modal title="Paramètres" onClose={onClose} wide>
      <div className="tabs">
        <TabBtn active={tab === "matieres"} onClick={() => setTab("matieres")} icon={<BookOpen size={15} />}>Matières</TabBtn>
        <TabBtn active={tab === "cotes"} onClick={() => setTab("cotes")} icon={<GraduationCap size={15} />}>Cotes</TabBtn>
        <TabBtn active={tab === "etapes"} onClick={() => setTab("etapes")} icon={<CalendarClock size={15} />}>Étapes</TabBtn>
        <TabBtn active={tab === "categories"} onClick={() => setTab("categories")} icon={<Layers size={15} />}>Catégories</TabBtn>
        <TabBtn active={tab === "couleurs"} onClick={() => setTab("couleurs")} icon={<Palette size={15} />}>Couleurs & images</TabBtn>
        <TabBtn active={tab === "champs"} onClick={() => setTab("champs")} icon={<ListPlus size={15} />}>Champs personnalisés</TabBtn>
        <TabBtn active={tab === "data"} onClick={() => setTab("data")} icon={<FileDown size={15} />}>Import / Export</TabBtn>
        <TabBtn active={tab === "corbeille"} onClick={() => setTab("corbeille")} icon={<Trash2 size={15} />}>
          Corbeille{ctx.corbeille.length ? " (" + ctx.corbeille.length + ")" : ""}
        </TabBtn>
      </div>

      {tab === "corbeille" && <CorbeillePanel ctx={ctx} />}

      {tab === "matieres" && (
        <div className="tab-panel">
          <div className="row-form">
            <input placeholder="Nouvelle matière (ex. Mathématiques)" value={nouvelleMatiere} onChange={(e) => setNouvelleMatiere(e.target.value)} />
            <button className="btn btn-primary" onClick={addMatiere}><Plus size={15} /></button>
          </div>
          {cfg.matieres.map((m) => {
            const total = m.competences.reduce((s, c) => s + Number(c.pourcentage || 0), 0);
            return (
              <div key={m.id} className="config-block">
                <div className="config-block-head">
                  <span>{m.nom}</span>
                  <span className={"total-badge" + (total === 100 ? " ok" : " warn")}>% total = {total}{total !== 100 && <AlertTriangle size={13} />}</span>
                  <button className="icon-btn" onClick={() => deleteMatiere(m.id)}><Trash2 size={14} /></button>
                </div>
                {!m.competences.length && <p className="modal-hint small">Aucune compétence — une évaluation doit toujours être liée à une compétence, ajoute-en au moins une.</p>}
                {m.competences.map((c) => (
                  <div key={c.id} className="competence-row">
                    <span>{c.nom}</span><span>{c.pourcentage}%</span>
                    <button className="icon-btn" onClick={() => deleteCompetence(m.id, c.id)}><X size={13} /></button>
                  </div>
                ))}
                <CompetenceAdder onAdd={(nom, pct) => addCompetence(m.id, nom, pct)} />
              </div>
            );
          })}
        </div>
      )}

      {tab === "cotes" && (
        <div className="tab-panel">
          <p className="modal-hint">Échelle vierge : ajoute chaque cote avec la valeur numérique utilisée pour les calculs.</p>
          <div className="row-form">
            <input placeholder="Étiquette (ex. B+)" value={coteLabel} onChange={(e) => setCoteLabel(e.target.value)} style={{ maxWidth: 120 }} />
            <input placeholder="Valeur (ex. 82)" type="number" value={coteValeur} onChange={(e) => setCoteValeur(e.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn btn-primary" onClick={addCote}><Plus size={15} /></button>
          </div>
          {cfg.cotes.map((c) => (
            <div key={c.id} className="competence-row">
              <span>{c.label}</span><span>{c.valeur}</span>
              <button className="icon-btn" onClick={() => deleteCote(c.id)}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === "etapes" && (
        <div className="tab-panel">
          <div className="row-form">
            <input placeholder="Nom (ex. Étape 1)" value={etapeNom} onChange={(e) => setEtapeNom(e.target.value)} />
            <input type="date" value={etapeDebut} onChange={(e) => setEtapeDebut(e.target.value)} />
            <input type="date" value={etapeFin} onChange={(e) => setEtapeFin(e.target.value)} />
            <button className="btn btn-primary" onClick={addEtape}><Plus size={15} /></button>
          </div>
          {cfg.etapes.map((e) => (
            <div key={e.id} className="competence-row">
              <span>{e.nom}</span><span className="muted small">{formatDate(e.dateDebut)} → {formatDate(e.dateFin)}</span>
              <button className="icon-btn" onClick={() => deleteEtape(e.id)}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === "categories" && (
        <div className="tab-panel">
          <div className="config-block">
            <div className="config-block-head"><span>Catégories de notes</span></div>
            <div className="chip-row">{cfg.categoriesNotes.map((c) => <span key={c} className="chip removable">{c}<button onClick={() => deleteCategorie("categoriesNotes", c)}><X size={11} /></button></span>)}</div>
            <div className="row-form"><input placeholder="Nouvelle catégorie" value={catNoteInput} onChange={(e) => setCatNoteInput(e.target.value)} /><button className="btn btn-primary" onClick={() => { addCategorie("categoriesNotes", catNoteInput); setCatNoteInput(""); }}><Plus size={15} /></button></div>
          </div>
          <div className="config-block">
            <div className="config-block-head"><span>Catégories de photos</span></div>
            <div className="chip-row">{cfg.categoriesPhotos.map((c) => <span key={c} className="chip removable">{c}<button onClick={() => deleteCategorie("categoriesPhotos", c)}><X size={11} /></button></span>)}</div>
            <div className="row-form"><input placeholder="Nouvelle catégorie" value={catPhotoInput} onChange={(e) => setCatPhotoInput(e.target.value)} /><button className="btn btn-primary" onClick={() => { addCategorie("categoriesPhotos", catPhotoInput); setCatPhotoInput(""); }}><Plus size={15} /></button></div>
          </div>
        </div>
      )}

      {tab === "couleurs" && (
        <div className="tab-panel">
          <p className="modal-hint">La couleur reste visible en bordure même quand un hexagone a une image. Les images des élèves, du personnel et des groupes se règlent directement dans leur dossier. La couleur du texte ci-dessous s'applique à tous les hexagones de cette section (sauf ceux avec une couleur individuelle définie dans leur dossier).</p>
          {HEX_STATIQUES.map((h) => (
            <ImageEtCouleurRow key={h.id} ctx={ctx} hexId={h.id} label={h.label} couleur={cfg.couleurs[h.id]} onCouleur={(v) => setCouleur(h.id, v)}
              couleurTexte={(cfg.couleursTexte || {})[h.id]} onCouleurTexte={(v) => setCouleurTexte(h.id, v)}
              fichier={cfg.imagesHexagones[h.id]} />
          ))}
        </div>
      )}

      {tab === "champs" && (
        <div className="tab-panel">
          <div className="config-block">
            <div className="config-block-head"><span>Champs personnalisés — élèves</span></div>
            {cfg.champsPersonnalisesEleves.map((c) => (
              <div key={c.id} className="competence-row"><span>{c.nom}</span><span className="muted small">{TYPES_CHAMP.find((t) => t.id === c.type)?.label}</span><button className="icon-btn" onClick={() => ctx.retirerChampGlobal("eleve", c.id)}><Trash2 size={13} /></button></div>
            ))}
            {!cfg.champsPersonnalisesEleves.length && <p className="modal-hint small">Aucun champ partagé pour l'instant — crée-en un depuis le dossier d'un élève, en cochant « utiliser pour tous les élèves ».</p>}
          </div>
          <div className="config-block">
            <div className="config-block-head"><span>Champs personnalisés — personnel</span></div>
            {cfg.champsPersonnalisesPersonnel.map((c) => (
              <div key={c.id} className="competence-row"><span>{c.nom}</span><span className="muted small">{TYPES_CHAMP.find((t) => t.id === c.type)?.label}</span><button className="icon-btn" onClick={() => ctx.retirerChampGlobal("personnel", c.id)}><Trash2 size={13} /></button></div>
            ))}
            {!cfg.champsPersonnalisesPersonnel.length && <p className="modal-hint small">Aucun champ partagé pour l'instant — crée-en un depuis un dossier du personnel, en cochant « utiliser pour tout le personnel ».</p>}
          </div>
        </div>
      )}

      {tab === "data" && <ImportExportPanel ctx={ctx} />}
    </Modal>
  );
}

/* ---------- corbeille : restaurer, réutiliser un numéro, jeter pour de bon ---------- */

function CorbeillePanel({ ctx }) {
  const [erreur, setErreur] = useState("");
  const [confirmVider, setConfirmVider] = useState(false);
  const [confirmEntree, setConfirmEntree] = useState(null);

  const entrees = ctx.corbeille;

  function decrire(e) {
    const b = e.bagage || {};
    const nbNotes = (b.notesOrphelines || []).length + (b.notesPartagees || []).length;
    const nbPhotos = (b.photosOrphelines || []).length + (b.photosPartagees || []).length;
    const morceaux = [];
    if (nbNotes) morceaux.push(nbNotes + " note(s)");
    if ((b.evaluations || []).length) morceaux.push(b.evaluations.length + " évaluation(s)");
    if ((b.pi || []).length) morceaux.push(b.pi.length + " objectif(s) PI");
    if (nbPhotos) morceaux.push(nbPhotos + " photo(s)");
    if ((b.groupeIds || []).length) morceaux.push(b.groupeIds.length + " groupe(s)");
    return morceaux.length ? morceaux.join(" · ") : "dossier vide";
  }

  return (
    <div className="tab-panel">
      <p className="modal-hint">
        Les dossiers supprimés atterrissent ici et y restent tant que tu ne les vides pas toi-même.
        Restaurer ramène tout : notes, évaluations, objectifs PI, photos et appartenances aux groupes.
      </p>
      {erreur && <p className="error-text">{erreur}</p>}

      {entrees.map((e) => (
        <div key={e.id} className="config-block corbeille-entree">
          <div className="config-block-head">
            <span className="corbeille-numero">{e.entity.numero}</span>
            <span className="muted small">
              {e.type === "eleve" ? (NIVEAUX.find((n) => n.id === e.entity.niveauId) || {}).label || "élève" : "Personnel"}
              {" · supprimé le " + formatDateTime(e.supprimeLe)}
            </span>
          </div>
          <p className="modal-hint small">{decrire(e)}</p>
          <div className="corbeille-actions">
            <button className="btn btn-primary" onClick={() => { setErreur(""); const msg = ctx.restaurerCorbeille(e.id); if (msg) setErreur(msg); }}>
              <RotateCcw size={14} /> Restaurer
            </button>
            <button
              className="btn"
              title={"Créer un dossier vierge portant le numéro " + e.entity.numero}
              onClick={async () => { setErreur(""); const msg = await ctx.reutiliserNumero(e.id); if (msg) setErreur(msg); }}
            >
              <Copy size={14} /> Réutiliser le numéro
            </button>
            <button className="btn btn-danger" onClick={() => { setErreur(""); setConfirmEntree(e); }}>
              <Trash2 size={14} /> Supprimer pour de bon
            </button>
          </div>
        </div>
      ))}

      {!entrees.length && <EmptyState text="La corbeille est vide." />}

      {entrees.length > 1 && (
        <div className="corbeille-vider">
          <button className="btn btn-danger" onClick={() => setConfirmVider(true)}><Trash2 size={15} /> Vider la corbeille</button>
        </div>
      )}

      {confirmEntree && (
        <ConfirmModal
          title={"Supprimer " + confirmEntree.entity.numero + " pour de bon ?"}
          text="Ce dossier et tout ce qu'il contient — notes, évaluations, objectifs, photos — seront effacés sans retour possible. Les fichiers photo seront supprimés de ton dossier."
          onCancel={() => setConfirmEntree(null)}
          onConfirm={() => { ctx.supprimerDefinitivement(confirmEntree.id); setConfirmEntree(null); }}
        />
      )}

      {confirmVider && (
        <ConfirmModal
          title="Vider toute la corbeille ?"
          text={"Les " + entrees.length + " dossiers de la corbeille seront effacés sans retour possible."}
          onCancel={() => setConfirmVider(false)}
          onConfirm={() => { ctx.viderCorbeille(); setConfirmVider(false); }}
        />
      )}
    </div>
  );
}

function ImageEtCouleurRow({ ctx, hexId, label, couleur, onCouleur, couleurTexte, onCouleurTexte, fichier }) {
  const url = useImageURL(fichier);
  const inputRef = useRef(null);
  return (
    <div className="couleur-row couleur-row-full">
      <div className="couleur-row-main">
        <div className="couleur-thumb" style={{ background: couleur, ...(url ? { backgroundImage: `url(${url})` } : {}) }} />
        <span className="couleur-label">{label}</span>
        <input type="color" value={couleur} onChange={(e) => onCouleur(e.target.value)} />
        <button className="btn btn-ghost" onClick={() => inputRef.current && inputRef.current.click()}><ImagePlus size={14} /> Image</button>
        {url && <button className="icon-btn" onClick={() => ctx.retirerHexImage("statique", hexId, fichier)}><X size={13} /></button>}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) ctx.setHexImage("statique", hexId, f); e.target.value = ""; }} />
      </div>
      <div className="couleur-row-texte">
        <span className="muted small">Texte</span>
        <TextColorPicker value={couleurTexte} onChange={onCouleurTexte} />
      </div>
    </div>
  );
}

function CompetenceAdder({ onAdd }) {
  const [nom, setNom] = useState(""); const [pct, setPct] = useState("");
  return (
    <div className="row-form small">
      <input placeholder="Compétence" value={nom} onChange={(e) => setNom(e.target.value)} />
      <input placeholder="%" type="number" value={pct} onChange={(e) => setPct(e.target.value)} style={{ maxWidth: 80 }} />
      <button className="btn" onClick={() => { if (nom.trim() && pct !== "") { onAdd(nom.trim(), Number(pct)); setNom(""); setPct(""); } }}><Plus size={14} /></button>
    </div>
  );
}

function ImportExportPanel({ ctx }) {
  function exportElevesCSV() { downloadText(Papa.unparse(ctx.eleves.map((e) => ({ numero: e.numero, niveau: e.niveauId }))), "eleves.csv", "text/csv"); }
  function exportPersonnelCSV() { downloadText(Papa.unparse(ctx.personnel.map((p) => ({ numero: p.numero, gouts: p.gouts, matieres: p.matieres }))), "personnel.csv", "text/csv"); }

  function exportMd() {
    let md = "# Export de la ruche\n\n";
    NIVEAUX.forEach((niv) => {
      const list = trierParNumero(ctx.eleves.filter((e) => e.niveauId === niv.id));
      if (!list.length) return;
      md += "## " + niv.label + "\n\n";
      list.forEach((e) => {
        md += "### " + e.numero + "\n";
        ctx.config.matieres.forEach((m) => {
          const res = ctx.computeMatiereMoyenne(e.id, m.id, "toutes");
          if (res) md += "- " + m.nom + ": " + res.moyenne.toFixed(1) + (res.coteProche ? " (≈ " + res.coteProche.label + ")" : "") + "\n";
        });
        const objs = ctx.pi.filter((o) => o.eleveId === e.id);
        if (objs.length) { md += "- Objectifs PI: " + objs.map((o) => o.objectif).join("; ") + "\n"; }
        md += "\n";
      });
    });
    downloadText(md, "resume_classe.md", "text/markdown");
  }

  function importElevesFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const existants = new Set([
          ...ctx.eleves.map((x) => x.numero),
          ...ctx.corbeille.filter((c) => c.type === "eleve").map((c) => c.entity.numero),
        ]);
        const nouveaux = res.data
          .filter((r) => r.numero && r.niveau && !existants.has(r.numero))
          .map((r) => ({ id: uid(), numero: String(r.numero).trim(), niveauId: String(r.niveau).trim(), groupes: [], champs: {}, champsLocaux: [], imageFichier: null, creeLe: new Date().toISOString() }));
        if (nouveaux.length) ctx.bulkAddEleves(nouveaux);
      },
    });
    e.target.value = "";
  }

  function importPersonnelFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const existants = new Set([
          ...ctx.personnel.map((x) => x.numero),
          ...ctx.corbeille.filter((c) => c.type === "personnel").map((c) => c.entity.numero),
        ]);
        const nouveaux = res.data
          .filter((r) => r.numero && !existants.has(r.numero))
          .map((r) => ({ id: uid(), numero: String(r.numero).trim(), gouts: r.gouts || "", matieres: r.matieres || "", champs: {}, champsLocaux: [], imageFichier: null, creeLe: new Date().toISOString() }));
        if (nouveaux.length) ctx.bulkAddPersonnel(nouveaux);
      },
    });
    e.target.value = "";
  }

  return (
    <div className="tab-panel">
      <p className="modal-hint">Formats pensés pour être transmis à Claude (analyse, rapport) ou réimportés dans un tableur.</p>
      <div className="config-block">
        <div className="config-block-head"><span>Exporter</span></div>
        <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="btn" onClick={exportElevesCSV}><FileDown size={15} /> Élèves (.csv)</button>
          <button className="btn" onClick={exportPersonnelCSV}><FileDown size={15} /> Personnel (.csv)</button>
          <button className="btn" onClick={exportMd}><FileDown size={15} /> Résumé classe (.md)</button>
        </div>
      </div>
      <div className="config-block">
        <div className="config-block-head"><span>Importer des élèves</span></div>
        <p className="modal-hint small">Colonnes attendues : numero, niveau (3e/4e/5e/6e). Les numéros déjà existants sont ignorés.</p>
        <input type="file" accept=".csv" onChange={importElevesFile} />
      </div>
      <div className="config-block">
        <div className="config-block-head"><span>Importer du personnel</span></div>
        <p className="modal-hint small">Colonnes attendues : numero, gouts, matieres. Les numéros déjà existants sont ignorés.</p>
        <input type="file" accept=".csv" onChange={importPersonnelFile} />
      </div>
    </div>
  );
}

/* ============================================================
   ARCHIVES / NOUVELLE ANNÉE
   ============================================================ */

function ArchivesPanel({ ctx, onClose }) {
  const [label, setLabel] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [viewing, setViewing] = useState(null);

  if (viewing) return <ArchiveViewer archiveId={viewing} onClose={() => setViewing(null)} />;

  return (
    <Modal title="Archives et nouvelle année" onClose={onClose} wide>
      <div className="config-block">
        <div className="config-block-head"><span>Démarrer une nouvelle année scolaire</span></div>
        <p className="modal-hint">Les élèves, groupes, évaluations et objectifs PI actuels seront archivés (consultables en lecture seule) puis la ruche repartira à zéro pour les élèves. Le personnel, les matières, cotes et catégories restent inchangés.</p>
        <div className="row-form">
          <input placeholder="Nom de l'année à archiver (ex. 2025-2026)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary" disabled={!label.trim()} onClick={() => setConfirmArchive(true)}><Archive size={15} /> Archiver et recommencer</button>
        </div>
      </div>
      <div className="config-block">
        <div className="config-block-head"><span>Années archivées</span></div>
        {ctx.archives.map((a) => (
          <div key={a.id} className="competence-row">
            <span>{a.label}</span><span className="muted small">archivé le {formatDate(a.date.slice(0, 10))}</span>
            <button className="btn btn-ghost" onClick={() => setViewing(a.id)}>Consulter</button>
          </div>
        ))}
        {!ctx.archives.length && <EmptyState text="Aucune année archivée pour l'instant." />}
      </div>
      {confirmArchive && (
        <ConfirmModal
          title="Confirmer l'archivage"
          text={"L'année « " + label + " » sera archivée et la ruche repartira à zéro pour les élèves. Cette action ne peut pas être annulée facilement."}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => { ctx.demarrerNouvelleAnnee(label.trim()); setConfirmArchive(false); setLabel(""); onClose(); }}
        />
      )}
    </Modal>
  );
}

function ArchiveViewer({ archiveId, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    fs.lireArchive(archiveId).then((d) => { if (active) setData(d); });
    return () => { active = false; };
  }, [archiveId]);

  if (!data) return <Modal title="Archive" onClose={onClose}><div className="loading-inline"><Loader2 className="spin" size={18} /> Chargement…</div></Modal>;

  return (
    <Modal title={"Archive — " + data.label} onClose={onClose} wide>
      <p className="modal-hint">Lecture seule.</p>
      {NIVEAUX.map((niv) => {
        const list = trierParNumero(data.eleves.filter((e) => e.niveauId === niv.id));
        if (!list.length) return null;
        return (
          <div key={niv.id} className="config-block">
            <div className="config-block-head"><span>{niv.label}</span></div>
            {list.map((e) => {
              const evs = data.evaluations.filter((ev) => ev.eleveId === e.id);
              const objs = (data.pi || data.ehdaa || []).filter((o) => o.eleveId === e.id);
              return (
                <div key={e.id} className="archive-eleve">
                  <div className="archive-eleve-head">{e.numero}</div>
                  <span className="muted small">{evs.length} évaluation(s) · {objs.length} objectif(s) PI</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {!data.eleves.length && <EmptyState text="Aucun élève dans cette archive." />}
    </Modal>
  );
}

/* ============================================================
   PETITS COMPOSANTS UI
   ============================================================ */

function Header({ screen, goHome, onConfig, onArchives, saveNote }) {
  return (
    <header className="hive-header">
      <button className="brand" onClick={goHome}><BeeIcon size={22} /> <span>The Beehive</span></button>
      <div className="header-right">
        {saveNote && <span className="save-flash">{saveNote}</span>}
        <button className="icon-btn-lg" onClick={goHome} title="Accueil"><Home size={18} /></button>
        <button className="icon-btn-lg" onClick={onArchives} title="Archives"><Archive size={18} /></button>
        <button className="icon-btn-lg" onClick={onConfig} title="Paramètres"><Settings size={18} /></button>
      </div>
    </header>
  );
}

function BackBar({ titre, sousTitre, onBack }) {
  return (
    <div className="back-bar">
      <button className="btn btn-ghost" onClick={onBack}><ChevronLeft size={16} /> Retour</button>
      <div className="back-titles"><h2>{titre}</h2>{sousTitre && <span className="muted">{sousTitre}</span>}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }) {
  return <button className={"tab-btn" + (active ? " active" : "")} onClick={onClick}>{icon}{children}</button>;
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function FloatingAdd({ onClick }) {
  return <button className="fab" onClick={onClick} title="Nouvelle tâche"><Plus size={22} /></button>;
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={"modal-box" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, text, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3></div>
        <div className="modal-body">
          <p>{text}</p>
          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Annuler</button>
            <button className="btn btn-danger" onClick={onConfirm}>Confirmer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STYLE
   ============================================================ */

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

      .hive-app {
        --honey: #E8A33D;
        --honey-dark: #C67F1E;
        --comb: #2B1B0F;
        --cream: #FBF3E3;
        --card: #FFFDF8;
        --ink: #3D2817;
        --muted: #8A7A5C;
        --muted2: #9C8C74;
        --sage: #6E7F4F;
        --rose: #C1543D;
        --hex-text: #201206;
        font-family: 'Inter', sans-serif;
        color: var(--ink);
        background: radial-gradient(ellipse at top, #FFF7E8 0%, var(--cream) 60%);
        min-height: 100vh;
        position: relative;
      }
      .hive-app * { box-sizing: border-box; }
      .hive-app h1, .hive-app h2, .hive-app h3 { font-family: 'Fraunces', serif; margin: 0; }

      .loading-screen, .onboarding-screen { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:14px; color: var(--honey-dark); text-align:center; padding: 20px; }
      .onboarding-screen h2 { color: var(--comb); font-size: 22px; }
      .onboarding-screen p { color: var(--muted); font-size: 14px; max-width: 420px; line-height:1.6; }
      .loading-screen { font-family:'Fraunces',serif; font-size:18px; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .hive-header { display:flex; align-items:center; justify-content:flex-end; height:64px; padding:0 22px; border-bottom: 1px solid #EBD9B8; background: rgba(255,253,248,0.85); backdrop-filter: blur(6px); position:sticky; top:0; z-index:20; }
      .brand { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; font-family:'Fraunces',serif; font-size:19px; font-weight:600; color: var(--comb); white-space:nowrap; }
      .brand svg { color: var(--honey-dark); }
      .header-right { display:flex; align-items:center; gap:6px; }
      .save-flash { font-size:12px; color: var(--sage); margin-right:8px; font-family:'JetBrains Mono',monospace; }
      .icon-btn-lg { background:none; border:1px solid #E4CFA0; color: var(--comb); border-radius:10px; padding:7px; cursor:pointer; transition: all .15s; }
      .icon-btn-lg:hover { background: var(--honey); border-color: var(--honey); color:#fff; }

      .hive-main { max-width: 1000px; margin: 0 auto; padding: 28px 20px 100px; }
      .hive-main-home { display:flex; align-items:center; justify-content:center; min-height: calc(100vh - 64px); padding: 8px 20px; }
      .screen-enter { animation: hiveZoom .38s cubic-bezier(.2,.8,.2,1); }
      @keyframes hiveZoom { from { opacity:0; transform: scale(.94);} to { opacity:1; transform: scale(1);} }
      .section { /* la transition vient de .screen-enter — une seule animation par navigation */ }

      .home-wrap { text-align:center; }
      .hive-ring { position: relative; width: 480px; height: 456px; margin: 0 auto; max-width: 100%; }
      .hex {
        --press: 1;
        position:absolute; top:50%; left:50%;
        width:150px; height:173px;
        clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        border:none; cursor:pointer; padding: 0;
        transition: filter .2s;
        filter: drop-shadow(0 6px 10px rgba(43,27,15,0.18));
      }
      .hex-center { z-index:2; }
      .hex:hover { filter: drop-shadow(0 10px 18px rgba(43,27,15,0.3)) brightness(1.06); z-index: 5; }
      .hex:active { --press: .96; }
      .hex-fill {
        position:absolute; inset: 4px; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        background-size: cover; background-position:center;
        display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:2px;
        padding: 30px 12px 10px; text-align:center; color: var(--hex-text);
        transform: scale(var(--press));
        transition: transform .12s;
      }
      .hex-label { font-family:'Fraunces',serif; font-weight:700; font-size:16px; line-height:1.15; }
      .hex-sub { font-size:12px; font-weight:600; font-family:'JetBrains Mono',monospace; }
      .hex-icon { margin-top:6px; opacity:.85; }
      .hex-center .hex-fill { justify-content:center; padding: 14px; }

      .back-bar { display:flex; align-items:center; gap:16px; margin-bottom: 18px; }
      .back-titles { display:flex; flex-direction:column; }
      .back-titles h2 { font-size: 22px; color: var(--comb); }
      .muted { color: var(--muted2); font-size: 13px; }
      .small { font-size: 12px; }

      .toolbar { display:flex; gap:10px; align-items:center; margin-bottom: 16px; flex-wrap:wrap; }
      .btn { display:inline-flex; align-items:center; gap:6px; padding:9px 14px; border-radius:10px; border:1px solid #E4CFA0; background:#fff; color:var(--comb); font-size:13.5px; font-weight:500; cursor:pointer; transition: all .15s; }
      .btn:hover { border-color: var(--honey); background:#FFF8EA; }
      .btn:disabled { opacity:.4; cursor:not-allowed; }
      .btn-primary { background: var(--honey); border-color: var(--honey-dark); color:#fff; }
      .btn-primary:hover { background: var(--honey-dark); }
      .btn-ghost { border:none; background:none; }
      .btn-danger { background: var(--rose); border-color:#9C3D2A; color:#fff; }
      .btn-danger-ghost { color: var(--rose); }
      .icon-btn { background:none; border:none; cursor:pointer; color: var(--muted2); padding:4px; border-radius:6px; display:inline-flex; }
      .icon-btn:hover { background:#F1E3C6; color: var(--comb); }

      /* ---- nid d'abeille : grille hexagonale compacte, rangées imbriquées ---- */
      .hive-grid { display:flex; flex-direction:column; align-items:flex-start; }
      .hive-grid-row { display:flex; gap:12px; }
      .hexcell { width:${HEX_W}px; height:${HEX_H}px; border:none; padding:0; cursor:pointer; position:relative; flex-shrink:0;
        clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        transition: transform .15s, filter .15s; filter: drop-shadow(0 3px 6px rgba(43,27,15,0.15)); }
      .hexcell:hover { transform: translateY(-3px); filter: drop-shadow(0 6px 12px rgba(43,27,15,0.25)); }
      .hexcell-fill { position:absolute; inset:3px; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        background-size:cover; background-position:center;
        display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:3px; padding:22px 8px 8px; }
      .hexcell-label { font-family:'JetBrains Mono',monospace; font-weight:700; font-size:15px; color: var(--hex-text); text-align:center; }
      .hexcell-sub { font-size:11px; color: var(--hex-text); text-align:center; }

      .empty-state { padding: 30px 16px; text-align:center; color: var(--muted2); font-size: 13.5px; border: 1px dashed #E4CFA0; border-radius: 14px; margin-top: 14px; }

      .dossier-top { background: var(--card); border:1px solid #EBD9B8; border-radius:14px; padding:16px; margin-bottom:18px; display:flex; flex-direction:column; gap:12px; }
      .cover-row { display:flex; align-items:center; gap:12px; }
      .cover-thumb { width:56px; height:56px; border-radius:12px; background: #F1E3C6 center/cover no-repeat; display:flex; align-items:center; justify-content:center; color: var(--muted2); flex-shrink:0; }
      .cover-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .champs-bloc { display:flex; flex-direction:column; gap:10px; }
      .field-inline { display:flex; flex-direction:column; gap:4px; font-size:12.5px; color: var(--muted2); }
      .field-inline input, .field-inline select { border:1px solid #E4CFA0; border-radius:8px; padding:8px 10px; font-size:14px; font-family:'Inter',sans-serif; }
      .chip-row { display:flex; gap:6px; flex-wrap:wrap; }
      .chip { background:#F1E3C6; color: var(--comb); font-size:11.5px; padding:4px 9px; border-radius:20px; display:inline-flex; align-items:center; gap:4px; }
      .chip.removable button { background:none; border:none; cursor:pointer; color:inherit; display:flex; }

      .tabs { display:flex; gap:4px; border-bottom:1px solid #EBD9B8; margin-bottom:16px; flex-wrap:wrap; }
      .tab-btn { display:flex; align-items:center; gap:6px; padding:9px 14px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; color: var(--muted2); font-size:13.5px; font-weight:500; }
      .tab-btn.active { color: var(--honey-dark); border-bottom-color: var(--honey); }
      .tab-panel { animation: fadeUp .2s ease; }
      @keyframes fadeUp { from { opacity:0;} to {opacity:1;} }

      .chip-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
      .chip-filter { background:#fff; border:1px solid #E4CFA0; border-radius:20px; padding:5px 12px; font-size:12px; cursor:pointer; color: var(--comb); }
      .chip-filter.active { background: var(--honey); border-color: var(--honey-dark); color:#fff; }

      .note-card { background: var(--card); border:1px solid #EBD9B8; border-radius:12px; padding:12px 14px; margin-bottom:10px; }
      .note-card.pinned { border-color: var(--honey); background: #FFFBF0; }
      .note-head { display:flex; align-items:center; gap:8px; }
      .note-titre { font-weight:600; color: var(--comb); flex:1; }
      .badge { background: var(--rose); color:#fff; font-size:10.5px; padding:2px 8px; border-radius:8px; }
      .note-contenu { font-size:13.5px; margin: 6px 0; color: var(--ink); white-space: pre-wrap; }
      .note-meta { font-size:11px; color: var(--muted2); }

      .matiere-block { background: var(--card); border:1px solid #EBD9B8; border-radius:12px; padding:12px 14px; margin-bottom:12px; }
      .matiere-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .matiere-nom { font-family:'Fraunces',serif; font-weight:600; color: var(--comb); }
      .matiere-moy { font-family:'JetBrains Mono',monospace; font-weight:600; color: var(--honey-dark); }
      .matiere-moy.muted { color: var(--muted2); font-weight:400; }
      .eval-row { display:grid; grid-template-columns: 1fr auto 1.4fr auto; gap:10px; align-items:center; font-size:13px; padding:6px 0; border-top:1px solid #F1E3C6; }
      .eval-cote { font-family:'JetBrains Mono',monospace; font-weight:600; }

      .ehdaa-row, .tache-row { display:flex; align-items:center; gap:10px; background: var(--card); border:1px solid #EBD9B8; border-radius:10px; padding:10px 12px; margin-bottom:8px; }
      .ehdaa-icon { color: var(--honey-dark); }
      .tache-row.fait { opacity:.72; }
      .tache-row.fait .tache-titre { text-decoration: line-through; text-decoration-color: rgba(0,0,0,.28); }
      .historique-check { color: var(--sage); flex:0 0 auto; }
      .corbeille-entree { border-left:3px solid #D9C6A0; }
      .corbeille-numero { font-weight:700; font-size:15px; color: var(--comb); }
      .corbeille-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      .corbeille-vider { display:flex; justify-content:flex-end; margin-top:14px; padding-top:12px; border-top:1px solid #EBD9B8; }
      .tache-row.haute { border-left: 3px solid var(--rose); }
      .tache-body { flex:1; display:flex; flex-direction:column; gap:2px; }
      .tache-titre { font-weight:600; color: var(--comb); font-size:14px; }
      .tache-desc { font-size:12.5px; color: var(--muted2); }
      .tache-meta { font-size:11px; color: var(--muted2); font-family:'JetBrains Mono',monospace; }
      .evenement-row { border-left: 3px solid var(--sage); }
      .evenement-icon { color: var(--sage); flex-shrink:0; }
      .plan-filtres { margin-top:-8px; margin-bottom:16px; font-size:13.5px; color: var(--comb); }
      .plan-filtres select { border:1px solid #E4CFA0; border-radius:9px; padding:6px 8px; font-size:12.5px; }

      .view-switch { display:flex; gap:4px; background:#F1E3C6; padding:3px; border-radius:10px; }
      .view-btn { background:none; border:none; padding:6px 11px; border-radius:8px; font-size:12.5px; cursor:pointer; color: var(--comb); }
      .view-btn.active { background:#fff; font-weight:600; }

      .photo-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap:12px; }
      .photo-card { border:1px solid #EBD9B8; border-radius:12px; overflow:hidden; background:#fff; }
      .photo-card img { width:100%; height:110px; object-fit:cover; display:block; }
      .photo-loading { height:110px; display:flex; align-items:center; justify-content:center; color: var(--muted2); }
      .photo-meta { display:flex; justify-content:space-between; align-items:center; padding:6px 8px; font-size:11px; color: var(--muted2); }

      .fab { position:fixed; bottom:26px; right:26px; width:54px; height:54px; border-radius:50%; background: var(--honey); color:#fff; border:none; box-shadow:0 8px 20px rgba(198,127,30,0.4); cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:30; transition: transform .15s; }
      .fab:hover { transform: scale(1.08); background: var(--honey-dark); }

      .modal-overlay { position:fixed; inset:0; background: rgba(43,27,15,0.4); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px; backdrop-filter: blur(2px); }
      .modal-box { background: var(--cream); border-radius:18px; width:100%; max-width:420px; max-height:85vh; overflow-y:auto; box-shadow: 0 20px 50px rgba(43,27,15,0.3); animation: modalIn .2s ease; }
      .modal-box.wide { max-width:660px; }
      @keyframes modalIn { from { opacity:0; transform: scale(.95) translateY(6px);} to {opacity:1; transform:scale(1) translateY(0);} }
      .modal-head { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #EBD9B8; }
      .modal-head h3 { font-size:18px; color: var(--comb); }
      .modal-body { padding:18px 20px; }
      .modal-hint { font-size:12.5px; color: var(--muted2); margin: 0 0 12px; }
      .modal-hint.small { font-size:11px; margin-top:6px; }
      .modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; flex-wrap:wrap; }
      .error-text { color: var(--rose); font-size:13px; }
      .error-text.small { font-size: 11.5px; display:block; margin-top:4px; }

      .field { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; font-size:12.5px; color: var(--muted2); }
      .field input, .field select, .field textarea { border:1px solid #E4CFA0; border-radius:9px; padding:9px 11px; font-size:14px; font-family:'Inter',sans-serif; color: var(--ink); background:#fff; }
      .field textarea { resize: vertical; }

      .pick-list { max-height: 55vh; overflow-y:auto; }
      .pick-group { margin-bottom: 14px; }
      .pick-group-title { font-family:'Fraunces',serif; font-weight:600; color: var(--comb); margin-bottom:6px; font-size:14px; }
      .pick-row { display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:13.5px; }
      .pick-row.inline { padding:0; gap:6px; margin-right:2px; }

      .row-form { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center; }
      .row-form.small input { padding:6px 8px; font-size:12.5px; }
      .row-form input, .row-form select { border:1px solid #E4CFA0; border-radius:9px; padding:8px 10px; font-size:13.5px; flex:1; min-width:140px; }
      .config-block { background: var(--card); border:1px solid #EBD9B8; border-radius:12px; padding:14px; margin-bottom:14px; }
      .config-block-head { display:flex; align-items:center; gap:10px; font-weight:600; color: var(--comb); margin-bottom:10px; font-family:'Fraunces',serif; }
      .total-badge { font-size:11px; padding:2px 8px; border-radius:8px; display:inline-flex; align-items:center; gap:4px; font-family:'JetBrains Mono',monospace; }
      .total-badge.ok { background:#E3ECD9; color: var(--sage); }
      .total-badge.warn { background:#F5DAD3; color: var(--rose); }
      .competence-row { display:flex; align-items:center; gap:10px; font-size:13px; padding:5px 0; border-top:1px solid #F1E3C6; }
      .competence-row span:first-child { flex:1; }

      .couleur-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid #F1E3C6; flex-wrap:wrap; }
      .couleur-thumb { width:32px; height:32px; border-radius:8px; background-size:cover; background-position:center; flex-shrink:0; }
      .couleur-label { flex:1; font-size:13.5px; color: var(--comb); }
      .couleur-row input[type=color] { width:38px; height:32px; border:1px solid #E4CFA0; border-radius:8px; padding:2px; background:#fff; cursor:pointer; }
      .couleur-row-full { flex-direction:column; align-items:stretch; gap:8px; }
      .couleur-row-main { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .couleur-row-texte { display:flex; align-items:center; gap:10px; padding-left:42px; }

      .text-color-picker { display:flex; align-items:center; gap:6px; }
      .tc-swatch { width:22px; height:22px; border-radius:50%; border:2px solid #E4CFA0; cursor:pointer; padding:0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }
      .tc-swatch.active { border-color: var(--honey-dark); box-shadow: 0 0 0 2px var(--honey); }
      .tc-reset { background:#fff; color: var(--muted2); font-size:13px; line-height:1; display:flex; align-items:center; justify-content:center; }

      .batch-header { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
      .batch-list { max-height: 45vh; overflow-y:auto; }
      .batch-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 2px; border-top:1px solid #F1E3C6; font-size:13.5px; }
      .batch-row select { border:1px solid #E4CFA0; border-radius:8px; padding:5px 8px; }

      .ai-output { width:100%; white-space: pre-wrap; font-family:'JetBrains Mono',monospace; font-size:12.5px; background:#fff; border:1px solid #EBD9B8; border-radius:12px; padding:14px; line-height:1.6; }
      .loading-inline { display:flex; align-items:center; gap:8px; color: var(--muted2); font-size:13.5px; }

      .archive-eleve { padding:6px 0; border-top:1px solid #F1E3C6; }
      .archive-eleve-head { font-weight:600; color: var(--comb); font-size:13.5px; }

      @media (max-width: 640px) {
        .hive-ring { transform: scale(0.62); }
        .hive-main { padding: 10px 12px 90px; }
      }
      @media (max-height: 720px) {
        .hive-ring { transform: scale(0.82); }
      }
    `}</style>
  );
}
