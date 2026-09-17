/**
 * Moteur de gabarits.
 *
 * Un gabarit est une maquette HTML de D:\newsletter, à l'octet près, à laquelle
 * on a ajouté quatre attributs :
 *
 *   data-edit="chemin"          sur p, h1, h2, h3, a, span, td, strong : le texte intérieur
 *   data-edit-multiline         avec data-edit : Entrée autorisée (→ <br />)
 *   data-edit-href="chemin"     sur a : l'URL du lien
 *   data-edit-src="chemin"      sur img : l'image (chemin.src + chemin.alt)
 *
 * Le contenu par défaut est extrait du gabarit lui-même ; le rendu ne touche
 * que l'intérieur des zones marquées. Tout le reste du HTML est recopié tel
 * quel — c'est ce qui garantit que la compatibilité Gmail / Outlook des
 * maquettes d'origine est conservée.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "../gabarits");

// ── Catalogue ──────────────────────────────────────────────────────────────
// { "02": { fichier, nom, objet } }
export const CATALOGUE = JSON.parse(readFileSync(resolve(DIR, "catalogue.json"), "utf-8"));

const cache = new Map();

/** Charge un gabarit (HTML + zones + contenu par défaut), avec cache. */
export function gabarit(cle) {
  if (!CATALOGUE[cle]) throw new Error(`Gabarit inconnu : ${cle}`);
  if (!cache.has(cle)) {
    const html = readFileSync(resolve(DIR, CATALOGUE[cle].fichier), "utf-8");
    const zones = listerZones(html);
    const defaut = extraire(html);
    defaut.meta = { objet: CATALOGUE[cle].objet, ...(defaut.meta || {}) };
    cache.set(cle, { cle, ...CATALOGUE[cle], html, zones, defaut });
  }
  return cache.get(cle);
}

// ── Expressions régulières des zones ───────────────────────────────────────
// L'intérieur d'une zone texte ne contient jamais une balise du même nom : le
// quantificateur paresseux s'arrête donc à la bonne fermeture.
const RE_TEXTE = /<(p|h1|h2|h3|a|span|td|strong)\b([^>]*?)\sdata-edit="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
const RE_HREF = /<a\b[^>]*\sdata-edit-href="([^"]+)"[^>]*>/g;
const RE_IMG = /<img\b[^>]*\sdata-edit-src="([^"]+)"[^>]*>/g;

// ── Accès par chemin : "gamme.produits.0.nom" ──────────────────────────────
export function lire(obj, chemin) {
  return chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function ecrire(obj, chemin, valeur) {
  const cles = chemin.split(".");
  let o = obj;
  for (let i = 0; i < cles.length - 1; i++) {
    const k = cles[i];
    if (o[k] == null || typeof o[k] !== "object") {
      // Un segment numérique crée un tableau, sinon un objet.
      o[k] = /^\d+$/.test(cles[i + 1]) ? [] : {};
    }
    o = o[k];
  }
  o[cles[cles.length - 1]] = valeur;
  return obj;
}

// ── Entités HTML ───────────────────────────────────────────────────────────
const ENTITES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", euro: "€",
  hellip: "…", ndash: "–", mdash: "—", laquo: "«", raquo: "»", rsquo: "’",
  lsquo: "‘", copy: "©", reg: "®", deg: "°", times: "×", middot: "·",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç",
  ugrave: "ù", ucirc: "û", ocirc: "ô", icirc: "î", iuml: "ï", Prime: "″", prime: "′",
  bull: "•", rarr: "→", larr: "←", trade: "™", frac12: "½", plusmn: "±", oelig: "œ",
};

function decoder(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITES[e] ?? m;
  });
}

/** Échappe du texte pour l'intérieur d'un élément ou d'un attribut. */
function echapper(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\u00a0/g, "&nbsp;");
}

/** Intérieur HTML d'une zone → texte brut ("\n" pour <br />). */
function versTexte(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\u0000")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .split("\u0000")
    .map((l) => decoder(l).trim())
    .join("\n")
    .trim();
}

/** Texte brut → intérieur HTML. */
function versHtml(texte, multiline) {
  const t = multiline ? String(texte) : String(texte).replace(/\s*\n\s*/g, " ");
  return echapper(t).replace(/\n/g, "<br />");
}

function attribut(tag, nom) {
  const m = tag.match(new RegExp(`\\s${nom}="([^"]*)"`));
  return m ? decoder(m[1]) : "";
}

function remplacerAttribut(tag, nom, valeur) {
  const re = new RegExp(`(\\s${nom}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, `$1${echapper(valeur)}$2`);
  return tag.replace(/^<(\w+)/, `<$1 ${nom}="${echapper(valeur)}"`);
}

// ── Extraction ─────────────────────────────────────────────────────────────

/** Liste les zones dans l'ordre du document. */
export function listerZones(html) {
  const zones = [];
  const pousser = (index, z) => zones.push({ index, ...z });

  for (const m of html.matchAll(RE_TEXTE)) {
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    pousser(m.index, { chemin: m[3], type: "texte", multiline: /\sdata-edit-multiline\b/.test(tag) });
  }
  for (const m of html.matchAll(RE_HREF)) pousser(m.index, { chemin: m[1], type: "href" });
  for (const m of html.matchAll(RE_IMG)) pousser(m.index, { chemin: m[1], type: "image" });

  zones.sort((a, b) => a.index - b.index);
  return zones.map(({ index, ...z }) => z);
}

/** Contenu par défaut : ce que le gabarit contient déjà. */
export function extraire(html) {
  const contenu = {};
  for (const m of html.matchAll(RE_TEXTE)) ecrire(contenu, m[3], versTexte(m[5]));
  for (const m of html.matchAll(RE_HREF)) ecrire(contenu, m[1], attribut(m[0], "href"));
  for (const m of html.matchAll(RE_IMG)) {
    ecrire(contenu, `${m[1]}.src`, attribut(m[0], "src"));
    ecrire(contenu, `${m[1]}.alt`, attribut(m[0], "alt"));
  }
  return contenu;
}

/** Les chemins qu'un PATCH a le droit de modifier. */
export function cheminsAutorises(g) {
  const s = new Set(["meta.objet"]);
  for (const z of g.zones) {
    if (z.type === "image") {
      s.add(`${z.chemin}.src`);
      s.add(`${z.chemin}.alt`);
    } else s.add(z.chemin);
  }
  return s;
}

// ── Rendu ──────────────────────────────────────────────────────────────────

/**
 * Rend un gabarit avec un contenu.
 *
 *   mode "cadre"  : pour l'iframe de l'éditeur — attributs conservés, script injecté
 *   mode "apercu" : page publique en lecture seule
 *   mode "email"  : ce qui part chez un destinataire
 */
export function rendre(g, contenu, options = {}) {
  const { mode = "apercu", previewUrl = "#", unsubscribeUrl = "#", adressePostale = "" } = options;
  const valeur = (chemin, secours = "") => {
    const v = lire(contenu, chemin);
    return v == null ? secours : v;
  };

  let html = g.html;

  html = html.replace(RE_TEXTE, (tout, tag, a1, chemin, a2, interieur) => {
    const multiline = /\sdata-edit-multiline\b/.test(a1 + a2);
    return `<${tag}${a1} data-edit="${chemin}"${a2}>${versHtml(valeur(chemin, versTexte(interieur)), multiline)}</${tag}>`;
  });

  html = html.replace(RE_HREF, (tag, chemin) =>
    remplacerAttribut(tag, "href", valeur(chemin, attribut(tag, "href")))
  );

  html = html.replace(RE_IMG, (tag, chemin) => {
    let t = remplacerAttribut(tag, "src", valeur(`${chemin}.src`, attribut(tag, "src")));
    return remplacerAttribut(t, "alt", valeur(`${chemin}.alt`, attribut(tag, "alt")));
  });

  html = html
    .replaceAll("{{preview_url}}", echapper(previewUrl))
    .replaceAll("{{unsubscribe_url}}", echapper(unsubscribeUrl))
    .replaceAll("{{adresse_postale}}", adressePostale ? echapper(adressePostale) : "[adresse postale à renseigner dans les réglages]");

  if (mode === "cadre") {
    // Le script de l'éditeur vit dans l'iframe : il rend les zones éditables et
    // remonte chaque modification à la page parente.
    html = html.replace(/<\/body>/i, '<script src="/static/cadre.js"></script>\n</body>');
  } else {
    html = html.replace(/\s+data-edit(?:-\w+)?(?:="[^"]*")?/g, "");
  }

  return html;
}

/** Version texte de l'email, dans l'ordre de lecture. */
export function versionTexte(g, contenu, { previewUrl = "", unsubscribeUrl = "" } = {}) {
  const lignes = [];
  for (const z of g.zones) {
    if (z.chemin.startsWith("meta.")) continue;
    if (z.type === "texte") lignes.push(String(lire(contenu, z.chemin) ?? ""));
    else if (z.type === "href") lignes.push(`→ ${lire(contenu, z.chemin) ?? ""}`);
  }
  if (previewUrl) lignes.unshift(`Voir dans le navigateur : ${previewUrl}`, "");
  if (unsubscribeUrl) lignes.push("", `Se désabonner : ${unsubscribeUrl}`);
  return lignes.join("\n\n").replace(/\n{3,}/g, "\n\n");
}
