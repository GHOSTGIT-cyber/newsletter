/**
 * Mise en page libre : une newsletter construite bloc par bloc.
 *
 * Le contenu est { meta: { objet, preheader }, blocs: [ { id, type, ...champs } ] }.
 * Chaque type de bloc est décrit une seule fois dans TYPES : l'éditeur
 * construit ses formulaires à partir de cette description, le serveur s'en sert
 * pour valider ce qu'il reçoit, et le rendu produit un HTML email en tableaux
 * (même charte et mêmes précautions Outlook / Gmail que les gabarits).
 *
 * Tout ce qui vient de l'utilisatrice est échappé. Seules deux marques de mise
 * en forme existent dans les textes : **gras** et [texte du lien](https://…).
 */

import { randomBytes } from "node:crypto";

// ── Charte ─────────────────────────────────────────────────────────────────
const F_TITRE = "'Oswald','Arial Narrow',Arial,sans-serif";
const F_CORPS = "'Assistant',Arial,Helvetica,sans-serif";
const TURQUOISE = "#1cc4bf";

export const COULEURS = [
  { valeur: "#ffffff", nom: "Blanc" },
  { valeur: "#f2f2f2", nom: "Gris clair" },
  { valeur: "#111111", nom: "Noir" },
  { valeur: "#1cc4bf", nom: "Turquoise" },
];

// ── Description des blocs ──────────────────────────────────────────────────
// Types de champ : texte (une ligne), zone (plusieurs lignes), url, image
// ({ src, alt }), choix, couleur, liste (sous-champs répétés).
const fond = (defaut = "#ffffff") => ({ cle: "fond", type: "couleur", libelle: "Couleur de fond", defaut });
const alignement = (defaut = "centre") => ({
  cle: "align", type: "choix", libelle: "Alignement", defaut,
  options: [{ valeur: "gauche", nom: "À gauche" }, { valeur: "centre", nom: "Centré" }],
});

export const TYPES = {
  banniere: {
    nom: "Bannière",
    aide: "Grand titre sur fond de couleur, avec un bouton. Idéal en haut d'une promotion.",
    champs: [
      { cle: "surtitre", type: "texte", libelle: "Petit texte au-dessus", defaut: "Offre limitée" },
      { cle: "titre", type: "zone", libelle: "Titre", defaut: "Votre grand titre" },
      { cle: "texte", type: "zone", libelle: "Texte", defaut: "" },
      { cle: "boutonTexte", type: "texte", libelle: "Texte du bouton (vide = pas de bouton)", defaut: "Découvrir" },
      { cle: "boutonUrl", type: "url", libelle: "Lien du bouton", defaut: "https://liftfoils.fr/" },
      fond("#111111"),
    ],
  },
  titre: {
    nom: "Titre",
    aide: "Un titre de section, avec un petit texte au-dessus si besoin.",
    champs: [
      { cle: "surtitre", type: "texte", libelle: "Petit texte au-dessus", defaut: "" },
      { cle: "titre", type: "zone", libelle: "Titre", defaut: "Titre de la section" },
      {
        cle: "taille", type: "choix", libelle: "Taille", defaut: "moyen",
        options: [{ valeur: "grand", nom: "Grand" }, { valeur: "moyen", nom: "Moyen" }, { valeur: "petit", nom: "Petit" }],
      },
      alignement(),
      fond(),
    ],
  },
  texte: {
    nom: "Texte",
    aide: "Un ou plusieurs paragraphes. Ligne vide = nouveau paragraphe.",
    champs: [
      { cle: "texte", type: "zone", libelle: "Texte", defaut: "Votre texte ici.", grand: true, formatage: true },
      alignement("gauche"),
      fond(),
    ],
  },
  image: {
    nom: "Image",
    aide: "Une photo, en pleine largeur ou avec une marge.",
    champs: [
      { cle: "image", type: "image", libelle: "Image", largeur: 600, defaut: { src: "", alt: "" } },
      { cle: "lien", type: "url", libelle: "Lien au clic (facultatif)", defaut: "" },
      {
        cle: "marge", type: "choix", libelle: "Largeur", defaut: "pleine",
        options: [{ valeur: "pleine", nom: "Pleine largeur" }, { valeur: "marge", nom: "Avec une marge" }],
      },
      fond(),
    ],
  },
  bouton: {
    nom: "Bouton",
    aide: "Un bouton qui renvoie vers une page.",
    champs: [
      { cle: "texte", type: "texte", libelle: "Texte du bouton", defaut: "Voir la boutique" },
      { cle: "url", type: "url", libelle: "Lien", defaut: "https://liftfoils.fr/" },
      {
        cle: "style", type: "choix", libelle: "Couleur du bouton", defaut: "turquoise",
        options: [{ valeur: "turquoise", nom: "Turquoise" }, { valeur: "noir", nom: "Noir" }, { valeur: "blanc", nom: "Blanc" }],
      },
      alignement(),
      fond(),
    ],
  },
  produit: {
    nom: "Produit",
    aide: "Photo, nom, prix (et prix barré), bouton.",
    champs: [
      { cle: "image", type: "image", libelle: "Photo du produit", largeur: 260, defaut: { src: "", alt: "" } },
      { cle: "badge", type: "texte", libelle: "Pastille (ex. -20 %)", defaut: "" },
      { cle: "nom", type: "texte", libelle: "Nom", defaut: "Nom du produit" },
      { cle: "description", type: "zone", libelle: "Description", defaut: "", formatage: true },
      { cle: "prix", type: "texte", libelle: "Prix", defaut: "" },
      { cle: "prixBarre", type: "texte", libelle: "Ancien prix, barré (facultatif)", defaut: "" },
      { cle: "boutonTexte", type: "texte", libelle: "Texte du bouton (vide = pas de bouton)", defaut: "Voir le produit" },
      { cle: "boutonUrl", type: "url", libelle: "Lien du bouton", defaut: "https://liftfoils.fr/" },
      {
        cle: "disposition", type: "choix", libelle: "Disposition", defaut: "cote",
        options: [{ valeur: "cote", nom: "Photo à gauche" }, { valeur: "cote-droite", nom: "Photo à droite" }, { valeur: "dessus", nom: "Photo au-dessus" }],
      },
      fond(),
    ],
  },
  colonnes: {
    nom: "Colonnes",
    aide: "Deux ou trois cartes côte à côte (empilées sur téléphone).",
    champs: [
      {
        cle: "items", type: "liste", libelle: "Colonne", min: 2, max: 3,
        champs: [
          { cle: "image", type: "image", libelle: "Image", largeur: 260, defaut: { src: "", alt: "" } },
          { cle: "titre", type: "texte", libelle: "Titre", defaut: "Titre" },
          { cle: "texte", type: "zone", libelle: "Texte", defaut: "", formatage: true },
          { cle: "lienTexte", type: "texte", libelle: "Texte du lien (vide = pas de lien)", defaut: "Voir" },
          { cle: "lienUrl", type: "url", libelle: "Lien", defaut: "https://liftfoils.fr/" },
        ],
      },
      fond(),
    ],
  },
  code: {
    nom: "Code promo",
    aide: "Un code de réduction bien visible.",
    champs: [
      { cle: "libelle", type: "texte", libelle: "Texte au-dessus", defaut: "Votre code" },
      { cle: "code", type: "texte", libelle: "Code", defaut: "CODE" },
      { cle: "texte", type: "zone", libelle: "Conditions (facultatif)", defaut: "" },
      fond("#f2f2f2"),
    ],
  },
  separateur: {
    nom: "Séparateur",
    aide: "Un trait fin entre deux parties.",
    champs: [fond()],
  },
  espace: {
    nom: "Espace",
    aide: "Un espace vide, pour aérer.",
    champs: [
      {
        cle: "hauteur", type: "choix", libelle: "Hauteur", defaut: "32",
        options: [{ valeur: "16", nom: "Petit" }, { valeur: "32", nom: "Moyen" }, { valeur: "56", nom: "Grand" }],
      },
      fond(),
    ],
  },
};

export const MAX_BLOCS = 80;

// ── Outils ─────────────────────────────────────────────────────────────────
export const nouvelId = () => randomBytes(6).toString("hex");

function echapper(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Une URL qu'on accepte de mettre dans un href ou un src. */
export function urlSure(u, { image = false } = {}) {
  let s = String(u ?? "").trim();
  if (!s) return "";
  if (/^\/\//.test(s)) s = "https:" + s;
  // « liftfoils.fr/boutique » tapé sans https:// : on le complète.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(s)) s = "https://" + s;
  const ok = image ? /^https?:\/\//i : /^(https?:\/\/|mailto:|tel:)/i;
  if (!ok.test(s)) return "";
  if (/[\s<>"]/.test(s)) s = s.replace(/[\s<>"]/g, (c) => encodeURIComponent(c));
  return s.slice(0, 2000);
}

/** Couleur sombre ? (luminance relative) — décide de la couleur du texte. */
function sombre(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}

/** Les couleurs de texte qui vont avec un fond. */
function palette(fondHex) {
  const s = sombre(fondHex);
  const turquoise = fondHex.toLowerCase() === TURQUOISE;
  return {
    titre: s ? "#ffffff" : "#111111",
    corps: s ? "rgba(255,255,255,0.72)" : turquoise ? "#0b3b39" : "#4a4a4a",
    discret: s ? "rgba(255,255,255,0.5)" : turquoise ? "#0b3b39" : "#8a8a8a",
    accent: s ? TURQUOISE : turquoise ? "#000000" : TURQUOISE,
    lien: s ? TURQUOISE : "#111111",
    carte: s ? "#1f1f1f" : fondHex.toLowerCase() === "#f2f2f2" ? "#ffffff" : turquoise ? "#ffffff" : "#f2f2f2",
    trait: s ? "rgba(255,255,255,0.16)" : "#dddddd",
  };
}

/** Texte → HTML : paragraphes, retours à la ligne, **gras**, [lien](url). */
function formater(texte, couleurLien, { paragraphes = false, styleP = "" } = {}) {
  const ligne = (t) =>
    echapper(t)
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong style="font-weight:700;">$1</strong>')
      .replace(/\[([^\]\n]+?)\]\(([^)\s]+?)\)/g, (tout, libelle, url) => {
        // L'URL a déjà été échappée ; on la décode pour la vérifier.
        const brute = url.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        const sure = urlSure(brute);
        if (!sure) return libelle;
        return `<a href="${echapper(sure)}" target="_blank" style="color:${couleurLien}; text-decoration:underline;">${libelle}</a>`;
      })
      .replace(/\n/g, "<br />");
  const t = String(texte ?? "").replace(/\r\n?/g, "\n").trim();
  if (!paragraphes) return ligne(t);
  const blocs = t.split(/\n\s*\n/).filter((p) => p.trim());
  return blocs
    .map((p, i) => `<p style="${styleP} margin:0 0 ${i === blocs.length - 1 ? 0 : 16}px 0;">${ligne(p.trim())}</p>`)
    .join("\n");
}

/** Texte sans les marques de mise en forme (version texte de l'email). */
function sansMarques(t) {
  return String(t ?? "")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/\[([^\]\n]+?)\]\(([^)\s]+?)\)/g, "$1 ($2)")
    .trim();
}

// ── Validation ─────────────────────────────────────────────────────────────
function valeurChamp(champ, v) {
  switch (champ.type) {
    case "texte":
      return typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, 300) : champ.defaut;
    case "zone":
      return typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, 5000) : champ.defaut;
    case "url":
      // On garde ce qui a été tapé (l'éditeur le réaffiche), le rendu filtre.
      return typeof v === "string" ? v.trim().slice(0, 2000) : champ.defaut;
    case "image": {
      const o = v && typeof v === "object" ? v : {};
      return {
        src: typeof o.src === "string" ? o.src.trim().slice(0, 2000) : "",
        alt: typeof o.alt === "string" ? o.alt.replace(/\s+/g, " ").slice(0, 300) : "",
      };
    }
    case "choix":
      return champ.options.some((o) => o.valeur === v) ? v : champ.defaut;
    case "couleur":
      return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : champ.defaut;
    case "liste": {
      const liste = Array.isArray(v) ? v.slice(0, champ.max) : [];
      while (liste.length < champ.min) liste.push({});
      return liste.map((item) => nettoyerChamps(champ.champs, item && typeof item === "object" ? item : {}));
    }
    default:
      return undefined;
  }
}

function nettoyerChamps(champs, source) {
  const o = {};
  for (const c of champs) o[c.cle] = valeurChamp(c, source[c.cle]);
  return o;
}

/** Valeurs par défaut d'un nouveau bloc. */
export function blocVide(type) {
  const t = TYPES[type];
  if (!t) throw new Error(`Type de bloc inconnu : ${type}`);
  return { id: nouvelId(), type, ...nettoyerChamps(t.champs, {}) };
}

/** Ce que le serveur accepte d'enregistrer. Lève une erreur si c'est inutilisable. */
export function nettoyerBlocs(blocs) {
  if (!Array.isArray(blocs)) throw new Error("La liste des blocs est invalide.");
  if (blocs.length > MAX_BLOCS) throw new Error(`Au plus ${MAX_BLOCS} blocs par newsletter.`);
  const vus = new Set();
  return blocs.map((b) => {
    if (!b || typeof b !== "object" || !TYPES[b.type]) throw new Error(`Type de bloc inconnu : ${b?.type}`);
    let id = typeof b.id === "string" && /^[a-z0-9]{4,24}$/i.test(b.id) ? b.id : nouvelId();
    if (vus.has(id)) id = nouvelId();
    vus.add(id);
    return { id, type: b.type, ...nettoyerChamps(TYPES[b.type].champs, b) };
  });
}

// ── Rendu des blocs ────────────────────────────────────────────────────────
const ALIGN = { gauche: "left", centre: "center" };

function bouton(texte, url, { fond: f = TURQUOISE, couleur = "#000000", align = "center" } = {}) {
  const u = urlSure(url);
  if (!String(texte || "").trim() || !u) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="${align}" style="margin:0 ${align === "center" ? "auto" : "0"};">
        <tr>
          <td align="center" bgcolor="${f}" style="background-color:${f}; border-radius:30px;">
            <a href="${echapper(u)}" target="_blank" style="display:inline-block; padding:15px 38px; font-family:${F_TITRE}; font-size:13px; line-height:17px; font-weight:600; letter-spacing:1.6px; color:${couleur}; text-transform:uppercase; text-decoration:none;">${echapper(texte)}</a>
          </td>
        </tr>
      </table>`;
}

function image(img, largeur, { lien = "", style = "" } = {}) {
  const src = urlSure(img?.src, { image: true });
  if (!src) return "";
  const balise = `<img src="${echapper(src)}" width="${largeur}" alt="${echapper(img.alt || "")}" style="width:100%; max-width:${largeur}px; height:auto; display:block; ${style}" />`;
  const u = urlSure(lien);
  return u ? `<a href="${echapper(u)}" target="_blank">${balise}</a>` : balise;
}

const surtitre = (t, couleur, align = "center", marge = 14) =>
  String(t || "").trim()
    ? `<p style="margin:0 0 ${marge}px 0; font-family:${F_TITRE}; font-size:13px; line-height:17px; font-weight:600; letter-spacing:2.4px; color:${couleur}; text-transform:uppercase; text-align:${align};">${echapper(t)}</p>`
    : "";

const RENDUS = {
  banniere(b) {
    const p = palette(b.fond);
    const couleurBouton = sombre(b.fond) ? TURQUOISE : b.fond === TURQUOISE ? "#111111" : TURQUOISE;
    const texteBouton = couleurBouton === "#111111" ? "#ffffff" : "#000000";
    return `<td align="center" class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:52px 44px 54px 44px;">
      ${surtitre(b.surtitre, p.accent)}
      ${String(b.titre).trim() ? `<h1 class="h1 ttl" style="margin:0 0 ${b.texte.trim() ? 18 : 28}px 0; font-family:${F_TITRE}; font-size:44px; line-height:50px; font-weight:700; letter-spacing:-0.3px; color:${p.titre}; text-transform:uppercase; text-align:center;">${formater(b.titre, p.lien)}</h1>` : ""}
      ${b.texte.trim() ? `<div style="margin:0 0 30px 0;">${formater(b.texte, p.lien, { paragraphes: true, styleP: `font-family:${F_CORPS}; font-size:17px; line-height:28px; color:${p.corps}; text-align:center;` })}</div>` : ""}
      ${bouton(b.boutonTexte, b.boutonUrl, { fond: couleurBouton, couleur: texteBouton })}
    </td>`;
  },

  titre(b) {
    const p = palette(b.fond);
    const align = ALIGN[b.align];
    const tailles = { grand: [40, 46, "h1"], moyen: [31, 37, "h2"], petit: [22, 28, ""] };
    const [fs, lh, cls] = tailles[b.taille];
    return `<td class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:40px 44px 8px 44px; text-align:${align};">
      ${surtitre(b.surtitre, p.accent, align)}
      <h2 class="${cls} ttl" style="margin:0 0 14px 0; font-family:${F_TITRE}; font-size:${fs}px; line-height:${lh}px; font-weight:700; color:${p.titre}; text-transform:uppercase; text-align:${align};">${formater(b.titre, p.lien)}</h2>
    </td>`;
  },

  texte(b) {
    const p = palette(b.fond);
    const align = ALIGN[b.align];
    return `<td class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:14px 44px 22px 44px;">
      ${formater(b.texte, p.lien, { paragraphes: true, styleP: `font-family:${F_CORPS}; font-size:16px; line-height:28px; color:${p.corps}; text-align:${align};` })}
    </td>`;
  },

  image(b) {
    const pleine = b.marge === "pleine";
    const img = image(b.image, pleine ? 600 : 512, { lien: b.lien, style: "margin:0 auto;" });
    const vide = `<p style="margin:0; padding:60px 20px; font-family:${F_CORPS}; font-size:14px; color:#8a8a8a; text-align:center; background-color:#f2f2f2;">Aucune image choisie</p>`;
    return `<td align="center" ${pleine ? "" : 'class="px"'} bgcolor="${b.fond}" style="background-color:${b.fond}; padding:${pleine ? "0" : "16px 44px"};">
      ${img || vide}
    </td>`;
  },

  bouton(b) {
    const styles = { turquoise: [TURQUOISE, "#000000"], noir: ["#111111", "#ffffff"], blanc: ["#ffffff", "#111111"] };
    const [f, c] = styles[b.style];
    const align = ALIGN[b.align];
    return `<td class="px" align="${align}" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:18px 44px 26px 44px;">
      ${bouton(b.texte, b.url, { fond: f, couleur: c, align }) || "&nbsp;"}
    </td>`;
  },

  produit(b) {
    const p = palette(b.fond);
    const badge = b.badge.trim()
      ? `<p style="margin:0 0 12px 0;"><span style="display:inline-block; background-color:${TURQUOISE}; color:#000000; font-family:${F_TITRE}; font-size:12px; line-height:16px; font-weight:700; letter-spacing:1.4px; padding:5px 11px; border-radius:20px; text-transform:uppercase;">${echapper(b.badge)}</span></p>`
      : "";
    const prix = b.prix.trim() || b.prixBarre.trim()
      ? `<p style="margin:0 0 18px 0; font-family:${F_TITRE}; font-size:24px; line-height:30px; font-weight:700; color:${p.titre};">${echapper(b.prix)}${b.prixBarre.trim() ? `&nbsp;&nbsp;<span style="font-size:17px; font-weight:500; color:${p.discret}; text-decoration:line-through;">${echapper(b.prixBarre)}</span>` : ""}</p>`
      : "";
    const desc = b.description.trim()
      ? `<div style="margin:0 0 16px 0;">${formater(b.description, p.lien, { paragraphes: true, styleP: `font-family:${F_CORPS}; font-size:15px; line-height:24px; color:${p.corps};` })}</div>`
      : "";
    const nom = `<p class="ttl" style="margin:0 0 8px 0; font-family:${F_TITRE}; font-size:24px; line-height:29px; font-weight:700; color:${p.titre}; text-transform:uppercase;">${echapper(b.nom)}</p>`;
    const btn = bouton(b.boutonTexte, b.boutonUrl, {
      fond: sombre(b.fond) ? TURQUOISE : "#111111",
      couleur: sombre(b.fond) ? "#000000" : "#ffffff",
      align: b.disposition === "dessus" ? "center" : "left",
    });

    if (b.disposition === "dessus") {
      return `<td align="center" class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:24px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${p.carte}" style="background-color:${p.carte};">
        <tr><td align="center" style="padding:30px 24px 32px 24px; text-align:center;">
          ${image(b.image, 300, { lien: b.boutonUrl, style: "margin:0 auto 18px auto;" })}
          ${badge}${nom}${desc}${prix}${btn}
        </td></tr>
      </table>
    </td>`;
    }

    const cellImage = `<td class="col" width="46%" valign="middle" style="width:46%; padding:0;">${image(b.image, 260, { lien: b.boutonUrl, style: "margin:0 auto;" })}</td>`;
    const cellTexte = `<td class="col col-texte" width="54%" valign="middle" style="width:54%; padding:0 0 0 ${b.disposition === "cote" ? 26 : 0}px;">${badge}${nom}${desc}${prix}${btn}</td>`;
    const cellTexteDroite = cellTexte.replace("padding:0 0 0 0px;", "padding:0 26px 0 0;");
    return `<td class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:24px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>${b.disposition === "cote" ? cellImage + cellTexte : cellTexteDroite + cellImage}</tr>
      </table>
    </td>`;
  },

  colonnes(b) {
    const p = palette(b.fond);
    const n = b.items.length;
    const largeur = n === 3 ? 160 : 250;
    const pct = n === 3 ? "33.33%" : "50%";
    const cellules = b.items
      .map((it, i) => {
        const gauche = i === 0 ? 0 : 6;
        const droite = i === n - 1 ? 0 : 6;
        const lien = String(it.lienTexte || "").trim() && urlSure(it.lienUrl)
          ? `<a href="${echapper(urlSure(it.lienUrl))}" target="_blank" style="font-family:${F_TITRE}; font-size:12px; letter-spacing:1.5px; font-weight:600; color:${p.titre}; text-transform:uppercase; border-bottom:2px solid ${TURQUOISE}; padding-bottom:2px; text-decoration:none;">${echapper(it.lienTexte)}</a>`
          : "";
        return `<td class="col" width="${pct}" valign="top" style="width:${pct}; padding:0 ${droite}px 12px ${gauche}px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${p.carte}" style="background-color:${p.carte};">
              <tr><td align="center" style="padding:20px 14px 22px 14px; text-align:center;">
                ${image(it.image, largeur, { lien: it.lienUrl, style: "margin:0 auto 14px auto;" })}
                ${String(it.titre).trim() ? `<p class="ttl" style="margin:0 0 6px 0; font-family:${F_TITRE}; font-size:18px; line-height:23px; font-weight:700; color:${p.titre}; text-transform:uppercase;">${echapper(it.titre)}</p>` : ""}
                ${String(it.texte).trim() ? `<div style="margin:0 0 14px 0;">${formater(it.texte, p.lien, { paragraphes: true, styleP: `font-family:${F_CORPS}; font-size:14px; line-height:21px; color:${p.corps}; text-align:center;` })}</div>` : ""}
                ${lien}
              </td></tr>
            </table>
          </td>`;
      })
      .join("\n");
    return `<td class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:20px 24px 12px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${cellules}
      </tr></table>
    </td>`;
  },

  code(b) {
    const p = palette(b.fond);
    const bordure = sombre(b.fond) ? TURQUOISE : "#111111";
    return `<td align="center" class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:34px 44px 36px 44px;">
      ${surtitre(b.libelle, p.accent, "center", 12)}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr><td align="center" style="border:2px dashed ${bordure}; padding:14px 34px;">
          <p style="margin:0; font-family:${F_TITRE}; font-size:30px; line-height:36px; font-weight:700; letter-spacing:4px; color:${p.titre}; text-transform:uppercase;">${echapper(b.code)}</p>
        </td></tr>
      </table>
      ${b.texte.trim() ? `<div style="margin:14px 0 0 0;">${formater(b.texte, p.lien, { paragraphes: true, styleP: `font-family:${F_CORPS}; font-size:14px; line-height:22px; color:${p.corps}; text-align:center;` })}</div>` : ""}
    </td>`;
  },

  separateur(b) {
    const p = palette(b.fond);
    return `<td class="px" bgcolor="${b.fond}" style="background-color:${b.fond}; padding:18px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${p.trait}; font-size:1px; line-height:1px; height:1px;">&nbsp;</td></tr></table>
    </td>`;
  },

  espace(b) {
    return `<td bgcolor="${b.fond}" style="background-color:${b.fond}; height:${b.hauteur}px; font-size:1px; line-height:1px;">&nbsp;</td>`;
  },
};

// ── Document complet ───────────────────────────────────────────────────────
const ENTETE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>{{titre}}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet" />
<!--[if mso]>
<style type="text/css">
  .ttl { font-family: 'Arial Narrow', Arial, sans-serif !important; }
  body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
<style type="text/css">
  body { margin:0; padding:0; width:100% !important; background-color:#e8e8e8; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }
  @media screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:32px !important; line-height:37px !important; }
    .h2 { font-size:26px !important; line-height:31px !important; }
    .navcell { padding:0 9px !important; font-size:10px !important; }
    .col { display:block !important; width:100% !important; padding-left:0 !important; padding-right:0 !important; }
    .col-texte { padding-top:20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#e8e8e8;">

<div style="display:none; font-size:1px; color:#e8e8e8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
  {{preheader}}
  &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8e8e8;">
<tr><td align="center" style="padding:0;">

<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff;">

  <tr>
    <td align="center" style="background-color:#e8e8e8; padding:12px 20px;">
      <p style="margin:0; font-family:'Assistant',Arial,Helvetica,sans-serif; font-size:12px; line-height:17px; color:#8a8a8a;">
        Cet email s'affiche mal ? <a href="{{preview_url}}" target="_blank" style="color:#6a6a6a; text-decoration:underline;">Voir dans le navigateur</a>
      </p>
    </td>
  </tr>

  <tr>
    <td align="center" style="background-color:#000000; padding:30px 20px 22px 20px;">
      <a href="https://liftfoils.fr/" target="_blank">
        <img src="https://liftfoils.fr/wp-content/uploads/2022/01/LIFT_retailer_white.png" width="118" alt="Lift Foils France" style="width:118px; height:auto; margin:0 auto;" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" style="background-color:#000000; padding:0 12px 26px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td class="navcell" align="center" style="padding:0 14px; font-family:'Oswald','Arial Narrow',Arial,sans-serif; font-size:12px; letter-spacing:1.6px;"><a href="https://liftfoils.fr/efoil-lift5/" target="_blank" style="color:#ffffff; font-weight:600;">eFOILS</a></td>
          <td class="navcell" align="center" style="padding:0 14px; font-family:'Oswald','Arial Narrow',Arial,sans-serif; font-size:12px; letter-spacing:1.6px;"><a href="https://liftfoils.fr/boutique/planches/" target="_blank" style="color:#ffffff; font-weight:600;">PLANCHES</a></td>
          <td class="navcell" align="center" style="padding:0 14px; font-family:'Oswald','Arial Narrow',Arial,sans-serif; font-size:12px; letter-spacing:1.6px;"><a href="https://liftfoils.fr/boutique/ailes/" target="_blank" style="color:#ffffff; font-weight:600;">AILES</a></td>
          <td class="navcell" align="center" style="padding:0 14px; font-family:'Oswald','Arial Narrow',Arial,sans-serif; font-size:12px; letter-spacing:1.6px;"><a href="https://liftfoils.fr/boutique/accessoires/" target="_blank" style="color:#ffffff; font-weight:600;">ACCESSOIRES</a></td>
        </tr>
      </table>
    </td>
  </tr>
`;

const PIED = `
  <tr>
    <td align="center" class="px" style="background-color:#000000; padding:36px 44px 40px 44px; border-top:1px solid rgba(255,255,255,0.08);">
      <img src="https://liftfoils.fr/wp-content/uploads/2022/01/LIFT_retailer_white.png" width="96" alt="Lift Foils France" style="width:96px; height:auto; margin:0 auto 20px auto;" />

      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 22px auto;">
        <tr>
{{icones}}
        </tr>
      </table>

      <p style="margin:0 0 14px 0; font-family:'Assistant',Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; color:rgba(255,255,255,0.4);">
        Une question ? Répondez simplement à cet email, on lit tout.
      </p>

      <p style="margin:0 0 14px 0; font-family:'Assistant',Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:rgba(255,255,255,0.32);">
        Vous recevez cet email parce que vous vous êtes inscrit sur liftfoils.fr.<br />
        Lift Foils France &nbsp;·&nbsp; SAV et stock à Cannes &nbsp;·&nbsp; 06 35 30 50 67<br />{{adresse_postale}}
      </p>

      <p style="margin:0; font-family:'Assistant',Arial,Helvetica,sans-serif; font-size:13px; line-height:21px;">
        <a href="{{preview_url}}" target="_blank" style="color:rgba(255,255,255,0.45); text-decoration:underline;">Voir en ligne</a>
        <span style="color:rgba(255,255,255,0.25);">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
        <a href="{{unsubscribe_url}}" target="_blank" style="color:#1cc4bf; text-decoration:underline;">Se désabonner</a>
        <span style="color:rgba(255,255,255,0.25);">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
        <a href="https://liftfoils.fr/" target="_blank" style="color:rgba(255,255,255,0.45);">liftfoils.fr</a>
      </p>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>
`;

// Icônes du pied de page : des PNG (Gmail et Outlook n'affichent pas le SVG),
// servis par le dashboard lui-même, d'où l'URL publique absolue.
const URL_PUBLIQUE = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
const ICONES_PIED = [
  { fichier: "site", alt: "liftfoils.fr", href: "https://liftfoils.fr/" },
  { fichier: "email", alt: "Email", href: "mailto:info@liftfoils.fr" },
  { fichier: "whatsapp", alt: "WhatsApp", href: "https://wa.me/33635305067" },
  { fichier: "instagram", alt: "Instagram", href: "https://www.instagram.com/efoil_cotedazur/" },
];
const HTML_ICONES = ICONES_PIED.map(
  (i) => `          <td align="center" style="padding:0 7px;"><a href="${i.href}" target="_blank" style="text-decoration:none;"><img src="${URL_PUBLIQUE}/static/icones/${i.fichier}.png" width="40" height="40" alt="${i.alt}" style="width:40px; height:40px; display:block; border:0; font-family:Arial,sans-serif; font-size:10px; color:#ffffff;" /></a></td>`
).join("\n");

/**
 * Rend une newsletter en mise en page libre.
 *   mode "cadre"  : aperçu de l'éditeur — chaque bloc porte data-bloc, script injecté
 *   mode "apercu" / "email" : HTML final
 */
export function rendreLibre(contenu, options = {}) {
  const { mode = "apercu", previewUrl = "#", unsubscribeUrl = "#", adressePostale = "" } = options;
  const blocs = Array.isArray(contenu.blocs) ? contenu.blocs : [];

  const lignes = blocs
    .filter((b) => RENDUS[b.type])
    .map((b) => {
      const attr = mode === "cadre" ? ` data-bloc="${echapper(b.id)}"` : "";
      return `  <tr${attr}>\n    ${RENDUS[b.type](b)}\n  </tr>`;
    });

  if (lignes.length === 0 && mode === "cadre") {
    lignes.push(`  <tr><td align="center" style="padding:80px 40px; font-family:${F_CORPS}; font-size:16px; line-height:26px; color:#8a8a8a;">
      Votre newsletter est vide.<br />Ajoutez un premier bloc avec le bouton « + Ajouter un bloc » à gauche.
    </td></tr>`);
  }

  // Les remplacements passent par une fonction : un « $ » tapé dans un texte
  // ne doit pas être interprété par String.replace.
  let html = (ENTETE + lignes.join("\n") + PIED)
    .replace("{{titre}}", () => echapper(contenu.meta?.objet || "Lift Foils France"))
    .replace("{{preheader}}", () => echapper(contenu.meta?.preheader || ""))
    .replace("{{icones}}", () => HTML_ICONES)
    .replaceAll("{{preview_url}}", () => echapper(previewUrl))
    .replaceAll("{{unsubscribe_url}}", () => echapper(unsubscribeUrl))
    .replaceAll("{{adresse_postale}}", () =>
      adressePostale ? echapper(adressePostale) : "[adresse postale à renseigner dans les réglages]"
    );

  if (mode === "cadre") html = html.replace(/<\/body>/i, () => '<script src="/static/cadre-libre.js"></script>\n</body>');
  return html;
}

/** Version texte de l'email, dans l'ordre des blocs. */
export function texteLibre(contenu, { previewUrl = "", unsubscribeUrl = "" } = {}) {
  const l = [];
  const lien = (texte, url) => {
    const u = urlSure(url);
    if (String(texte || "").trim() && u) l.push(`${texte.trim()} : ${u}`);
  };
  for (const b of contenu.blocs || []) {
    switch (b.type) {
      case "banniere":
        l.push([b.surtitre, b.titre].filter((x) => String(x).trim()).map(sansMarques).join("\n"));
        if (b.texte.trim()) l.push(sansMarques(b.texte));
        lien(b.boutonTexte, b.boutonUrl);
        break;
      case "titre":
        l.push([b.surtitre, b.titre].filter((x) => String(x).trim()).map(sansMarques).join("\n"));
        break;
      case "texte":
        l.push(sansMarques(b.texte));
        break;
      case "image":
        if (urlSure(b.lien)) l.push(`${b.image.alt || "Image"} : ${urlSure(b.lien)}`);
        break;
      case "bouton":
        lien(b.texte, b.url);
        break;
      case "produit":
        l.push([b.badge, b.nom, sansMarques(b.description), [b.prix, b.prixBarre && `(au lieu de ${b.prixBarre})`].filter(Boolean).join(" ")]
          .filter((x) => String(x).trim()).join("\n"));
        lien(b.boutonTexte, b.boutonUrl);
        break;
      case "colonnes":
        for (const it of b.items) {
          l.push([it.titre, sansMarques(it.texte)].filter((x) => String(x).trim()).join("\n"));
          lien(it.lienTexte, it.lienUrl);
        }
        break;
      case "code":
        l.push(`${b.libelle ? b.libelle + " : " : ""}${b.code}${b.texte.trim() ? "\n" + sansMarques(b.texte) : ""}`);
        break;
      case "separateur":
        l.push("—");
        break;
    }
  }
  if (previewUrl) l.unshift(`Voir dans le navigateur : ${previewUrl}`);
  if (unsubscribeUrl) l.push(`Se désabonner : ${unsubscribeUrl}`);
  return l.filter((x) => String(x).trim()).join("\n\n").replace(/\n{3,}/g, "\n\n");
}

// ── Modèles de départ ──────────────────────────────────────────────────────
const IMG = {
  hero: "https://liftfoils.fr/wp-content/uploads/2021/03/0162_LiftLaunch_Actionshot_Blue_Nick_011425-1280x853.jpg",
  lift5: "https://liftfoils.fr/wp-content/uploads/2026/04/2025_LIFT5_4_9_STEELBLUE_Package_Iso_Shadow_2000x2000_5a4014ba-a3ec-4a38-8006-2e4d32168877-1024x1024.png",
  liftx: "https://liftfoils.fr/wp-content/uploads/2026/04/2025_LIFTX_4_8_SPARKBLUE_Package_Iso_Shadow_2000x2000_a6ae3fee-ff22-4811-ab12-ba5e5242a9af-1024x1024.png",
  ailes: "https://liftfoils.fr/wp-content/uploads/2026/05/2025_270CamberProLCS_Combo_2000x2000-1024x1024.png",
  batterie: "https://liftfoils.fr/wp-content/uploads/2026/07/liftfoils-batterie-gen5-full-range-2025_Gen5_FullRangeB-1280x1280.png",
};

const bloc = (type, champs) => ({ ...blocVide(type), ...champs });

export const MODELES = {
  vierge: {
    nom: "Page blanche",
    description: "Vous ajoutez vos blocs un par un.",
    meta: { objet: "", preheader: "" },
    blocs: () => [],
  },
  promotion: {
    nom: "Promotion (Black Friday, soldes…)",
    description: "Bannière, code promo, produits en avant, bouton boutique.",
    meta: { objet: "Black Friday chez Lift Foils France", preheader: "[Votre offre en une ligne]" },
    blocs: () => [
      bloc("banniere", {
        surtitre: "[Dates de l'offre]",
        titre: "Black Friday",
        texte: "[Votre offre en une phrase : jusqu'à -XX % sur …]",
        boutonTexte: "Voir les offres",
        boutonUrl: "https://liftfoils.fr/",
        fond: "#111111",
      }),
      bloc("image", { image: { src: IMG.hero, alt: "Rider en eFoil Lift" }, lien: "https://liftfoils.fr/", marge: "pleine" }),
      bloc("texte", {
        texte: "[Quelques lignes pour présenter l'offre : ce qui est en promotion, jusqu'à quand, pour qui.]",
        align: "centre",
      }),
      bloc("code", { libelle: "Votre code", code: "BLACKFRIDAY", texte: "[Conditions et date de fin de l'offre]", fond: "#1cc4bf" }),
      bloc("titre", { surtitre: "Sélection", titre: "Les offres", taille: "moyen", align: "centre" }),
      bloc("produit", {
        image: { src: IMG.lift5, alt: "eFoil LIFT5" },
        badge: "-XX %", nom: "LIFT5", description: "Carbone, trois volumes.",
        prix: "[prix promo]", prixBarre: "[prix normal]",
        boutonTexte: "J'en profite", boutonUrl: "https://liftfoils.fr/efoil-lift5/", disposition: "cote",
      }),
      bloc("separateur", {}),
      bloc("produit", {
        image: { src: IMG.liftx, alt: "eFoil LIFTX" },
        badge: "-XX %", nom: "LIFTX", description: "Hybride, trois tailles.",
        prix: "[prix promo]", prixBarre: "[prix normal]",
        boutonTexte: "J'en profite", boutonUrl: "https://liftfoils.fr/efoil-liftx/", disposition: "cote-droite",
      }),
      bloc("colonnes", {
        items: [
          { image: { src: IMG.ailes, alt: "Ailes Lift" }, titre: "Ailes & mâts", texte: "[Offre sur les ailes]", lienTexte: "Voir", lienUrl: "https://liftfoils.fr/boutique/ailes/" },
          { image: { src: IMG.batterie, alt: "Batterie Lift" }, titre: "Accessoires", texte: "[Offre sur les accessoires]", lienTexte: "Voir", lienUrl: "https://liftfoils.fr/boutique/accessoires/" },
        ],
      }),
      bloc("bouton", { texte: "Voir toute la boutique", url: "https://liftfoils.fr/", style: "noir" }),
      bloc("espace", { hauteur: "16" }),
    ],
  },
  actualite: {
    nom: "Actualité / annonce",
    description: "Photo, titre, texte, bouton, puis trois cartes.",
    meta: { objet: "", preheader: "" },
    blocs: () => [
      bloc("image", { image: { src: IMG.hero, alt: "Rider en eFoil Lift" }, marge: "pleine" }),
      bloc("titre", { surtitre: "Actualité", titre: "Votre titre", taille: "grand", align: "centre" }),
      bloc("texte", { texte: "Votre texte ici.\n\nUne ligne vide crée un nouveau paragraphe. **Ce qui est entre deux étoiles doubles** passe en gras.", align: "centre" }),
      bloc("bouton", { texte: "En savoir plus", url: "https://liftfoils.fr/" }),
      bloc("separateur", {}),
      bloc("colonnes", {
        items: [
          { image: { src: IMG.lift5, alt: "eFoils Lift" }, titre: "eFoils", texte: "", lienTexte: "Voir", lienUrl: "https://liftfoils.fr/efoil-lift5/" },
          { image: { src: IMG.ailes, alt: "Ailes Lift" }, titre: "Ailes", texte: "", lienTexte: "Voir", lienUrl: "https://liftfoils.fr/boutique/ailes/" },
          { image: { src: IMG.batterie, alt: "Accessoires Lift" }, titre: "Accessoires", texte: "", lienTexte: "Voir", lienUrl: "https://liftfoils.fr/boutique/accessoires/" },
        ],
      }),
      bloc("banniere", {
        surtitre: "Une question, un projet", titre: "Parlez à quelqu'un\nqui ride.",
        texte: "Donnez-nous votre poids, votre spot habituel et votre niveau : on vous dit quelle configuration a du sens.",
        boutonTexte: "Nous contacter", boutonUrl: "https://liftfoils.fr/contact/", fond: "#111111",
      }),
    ],
  },
};

/** Contenu de départ d'une nouvelle newsletter libre. */
export function contenuModele(cle) {
  const m = MODELES[cle] || MODELES.vierge;
  return { meta: { ...m.meta }, blocs: nettoyerBlocs(m.blocs()) };
}
