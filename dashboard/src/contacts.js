/**
 * Les contacts : import, statuts, jetons de désabonnement.
 *
 * Règle absolue du projet : un contact désabonné, en rebond ou en plainte ne
 * reçoit plus jamais rien, même s'il réapparaît dans un import ultérieur.
 * C'est la raison principale d'avoir construit ce dashboard.
 */

import { randomBytes } from "node:crypto";
import { db } from "./db.js";

export const STATUTS = {
  actif: "Actif",
  desabonne: "Désabonné",
  rebond: "Rebond",
  plainte: "Plainte",
};

/** Un contact dans un de ces états ne doit plus jamais être réactivé. */
const DEFINITIFS = new Set(["desabonne", "rebond", "plainte"]);

// Le jeton vit dans les emails envoyés, pour toujours : 256 bits aléatoires,
// stockés en base. Pas de secret à protéger, pas de lien qui meurt si une clé
// est perdue — seule la sauvegarde SQLite compte.
export const nouveauJeton = () => randomBytes(32).toString("base64url");

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[a-z]{2,}/i;

export const emailValide = (s) => EMAIL_RE.test(String(s || "").trim());

/**
 * Extrait les adresses et les noms d'un fichier .txt (une par ligne) ou .csv.
 * Reprend la logique de `send.js` à la racine du dépôt, étendue au nom :
 * colonne `nom` / `prenom` déclarée en en-tête, ou forme `"Nom" <adresse>`.
 * Un export WooCommerce ou Mailchimp passe tel quel.
 */
export function lireListe(contenu) {
  const lignes = String(contenu)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lignes.length === 0) return [];

  const entete = lignes[0]
    .split(/[,;\t]/)
    .map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
  const colEmail = entete.findIndex((c) => ["email", "e-mail", "adresse email", "mail"].includes(c));
  const colNom = entete.findIndex((c) => ["nom", "name", "nom complet", "full name"].includes(c));
  const colPrenom = entete.findIndex((c) => ["prenom", "prénom", "first name", "firstname"].includes(c));
  const corps = colEmail !== -1 ? lignes.slice(1) : lignes;

  const vus = new Set();
  const sortie = [];
  for (const ligne of corps) {
    const cellules = ligne.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const cellule = colEmail !== -1 && cellules[colEmail] !== undefined ? cellules[colEmail] : ligne;
    const trouve = (cellule.match(EMAIL_RE) || ligne.match(EMAIL_RE) || [])[0];
    if (!trouve) continue;
    const email = trouve.toLowerCase();
    if (vus.has(email)) continue;
    vus.add(email);

    let nom = "";
    if (colNom !== -1 || colPrenom !== -1) {
      nom = [colPrenom !== -1 ? cellules[colPrenom] : "", colNom !== -1 ? cellules[colNom] : ""]
        .filter(Boolean)
        .join(" ")
        .trim();
    } else {
      // Forme `"Nom" <adresse>` ou `Nom <adresse>`
      const m = ligne.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
      if (m) nom = m[1].trim();
    }
    sortie.push({ email, nom });
  }
  return sortie;
}

/**
 * Importe une liste. Les contacts déjà désabonnés sont comptés « protégés » et
 * laissés intacts ; les nouveaux arrivent en `actif`.
 */
export function importer(liste, { source = "import", date = null } = {}) {
  const consentementDate = date || new Date().toISOString().slice(0, 10);
  const rapport = { ajoutes: 0, existants: 0, proteges: 0, invalides: 0, details: [] };

  const lire = db.prepare("SELECT id, statut FROM contacts WHERE email = ?");
  const inserer = db.prepare(
    `INSERT INTO contacts (email, nom, statut, statut_origine, consentement_date, consentement_source, jeton)
     VALUES (?, ?, 'actif', 'import', ?, ?, ?)`
  );
  const completerNom = db.prepare("UPDATE contacts SET nom = ? WHERE id = ? AND (nom IS NULL OR nom = '')");

  db.exec("BEGIN");
  try {
    for (const { email, nom } of liste) {
      if (!emailValide(email)) {
        rapport.invalides++;
        rapport.details.push({ email, resultat: "adresse invalide" });
        continue;
      }
      const existant = lire.get(email);
      if (existant) {
        if (DEFINITIFS.has(existant.statut)) {
          rapport.proteges++;
          rapport.details.push({ email, resultat: `ignoré — ${STATUTS[existant.statut].toLowerCase()}` });
        } else {
          rapport.existants++;
          if (nom) completerNom.run(nom, existant.id);
        }
        continue;
      }
      inserer.run(email, nom || null, consentementDate, source, nouveauJeton());
      rapport.ajoutes++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rapport;
}

/** Change le statut d'un contact et note d'où vient le changement. */
export function changerStatut(id, statut, origine) {
  db.prepare(
    "UPDATE contacts SET statut = ?, statut_date = datetime('now'), statut_origine = ? WHERE id = ?"
  ).run(statut, origine, id);
}

export function parJeton(jeton) {
  return db.prepare("SELECT * FROM contacts WHERE jeton = ?").get(String(jeton || ""));
}

export function parEmail(email) {
  return db.prepare("SELECT * FROM contacts WHERE email = ?").get(String(email || "").trim().toLowerCase());
}

export function actifs() {
  return db.prepare("SELECT * FROM contacts WHERE statut = 'actif' ORDER BY id").all();
}

export function compteParStatut() {
  const lignes = db.prepare("SELECT statut, COUNT(*) AS n FROM contacts GROUP BY statut").all();
  const c = { actif: 0, desabonne: 0, rebond: 0, plainte: 0, total: 0 };
  for (const l of lignes) {
    c[l.statut] = l.n;
    c.total += l.n;
  }
  return c;
}

/** Ajout manuel d'un contact. Renvoie { ok, message }. */
export function ajouter(email, nom, source) {
  const propre = String(email || "").trim().toLowerCase();
  if (!emailValide(propre)) return { ok: false, message: "Adresse invalide." };
  const existant = parEmail(propre);
  if (existant) {
    if (DEFINITIFS.has(existant.statut)) {
      return { ok: false, message: `${propre} est ${STATUTS[existant.statut].toLowerCase()} : il ne peut pas être réinscrit ici.` };
    }
    return { ok: false, message: `${propre} est déjà dans la liste.` };
  }
  db.prepare(
    `INSERT INTO contacts (email, nom, statut, statut_origine, consentement_date, consentement_source, jeton)
     VALUES (?, ?, 'actif', 'manuel', date('now'), ?, ?)`
  ).run(propre, String(nom || "").trim() || null, String(source || "ajout manuel").trim(), nouveauJeton());
  return { ok: true, message: `${propre} ajouté.` };
}
