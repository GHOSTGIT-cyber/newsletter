/**
 * Base SQLite — un seul fichier, module intégré à Node (node:sqlite).
 * Le schéma est créé au démarrage s'il n'existe pas ; les migrations futures
 * s'ajoutent à la suite, dans l'ordre, avec un numéro de version.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const chemin = resolve(process.env.DB_PATH || "./data/newsletter.sqlite");
mkdirSync(dirname(chemin), { recursive: true });

export const db = new DatabaseSync(chemin);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const MIGRATIONS = [
  `
  CREATE TABLE utilisateurs (
    id        INTEGER PRIMARY KEY,
    email     TEXT NOT NULL UNIQUE,
    mdp_hash  TEXT NOT NULL,
    cree_le   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    expire_le       TEXT NOT NULL
  );
  CREATE TABLE reglages (
    cle     TEXT PRIMARY KEY,
    valeur  TEXT NOT NULL
  );
  CREATE TABLE newsletters (
    id          INTEGER PRIMARY KEY,
    id_public   TEXT NOT NULL UNIQUE,
    gabarit     TEXT NOT NULL,
    nom         TEXT NOT NULL,
    contenu     TEXT NOT NULL,
    statut      TEXT NOT NULL DEFAULT 'brouillon',
    cree_le     TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le  TEXT NOT NULL DEFAULT (datetime('now')),
    envoyee_le  TEXT
  );
  CREATE TABLE contacts (
    id                   INTEGER PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    nom                  TEXT,
    statut               TEXT NOT NULL DEFAULT 'actif',
    statut_date          TEXT NOT NULL DEFAULT (datetime('now')),
    statut_origine       TEXT,
    consentement_date    TEXT,
    consentement_source  TEXT,
    jeton                TEXT NOT NULL UNIQUE,
    cree_le              TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE envois (
    id             INTEGER PRIMARY KEY,
    newsletter_id  INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
    contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    email          TEXT NOT NULL,
    statut         TEXT NOT NULL DEFAULT 'attente',
    resend_id      TEXT,
    erreur         TEXT,
    cree_le        TEXT NOT NULL DEFAULT (datetime('now')),
    envoye_le      TEXT
  );
  CREATE INDEX envois_newsletter ON envois(newsletter_id, statut);
  CREATE INDEX envois_resend ON envois(resend_id);
  CREATE TABLE evenements (
    id         INTEGER PRIMARY KEY,
    resend_id  TEXT,
    type       TEXT NOT NULL,
    recu_le    TEXT NOT NULL DEFAULT (datetime('now')),
    brut       TEXT NOT NULL
  );
  `,
];

db.exec(`CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, appliquee_le TEXT NOT NULL DEFAULT (datetime('now')))`);
const faites = new Set(db.prepare("SELECT version FROM migrations").all().map((r) => r.version));
MIGRATIONS.forEach((sql, i) => {
  const version = i + 1;
  if (faites.has(version)) return;
  db.exec("BEGIN");
  db.exec(sql);
  db.prepare("INSERT INTO migrations (version) VALUES (?)").run(version);
  db.exec("COMMIT");
  console.log(`· migration ${version} appliquée`);
});

// ── Réglages ───────────────────────────────────────────────────────────────
export function reglage(cle, defaut = "") {
  const r = db.prepare("SELECT valeur FROM reglages WHERE cle = ?").get(cle);
  return r ? r.valeur : defaut;
}

export function definirReglage(cle, valeur) {
  db.prepare(
    "INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur"
  ).run(cle, String(valeur));
}

export { chemin as cheminBase };
