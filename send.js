#!/usr/bin/env node
/**
 * Envoi des maquettes newsletter Lift Foils France via l'API Resend.
 *
 *   node send.js --to ghost@exemple.fr                 → les 3 maquettes, 1 destinataire
 *   node send.js --list contacts.csv --only 03         → une maquette, toute la liste
 *   node send.js --list contacts.csv --dry             → simulation, aucun envoi
 *
 * Chaque destinataire reçoit son propre email : personne ne voit l'adresse des
 * autres. Les envois réussis sont journalisés dans .sent.log — relancer la même
 * commande reprend où elle s'est arrêtée au lieu de renvoyer.
 *
 * Variables d'environnement requises (fichier .env) :
 *   RESEND_API_KEY   clé API Resend
 *   MAIL_FROM        expéditeur, ex. "Ghost <maquettes@tondomaine.fr>"
 *   PREVIEW_BASE     URL publique des maquettes, ex. https://lift-preview.tondomaine.fr
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(__dirname, ".sent.log");

// ── Catalogue des maquettes ────────────────────────────────────────────────
const MAQUETTES = {
  "01": {
    file: "01-guide-taille.html",
    subject: "Quelle taille de LIFT5 est vraiment la vôtre ?",
  },
  "02": {
    file: "02-lancement.html",
    subject: "On lance la newsletter Lift Foils France",
  },
  "03": {
    file: "03-course-frech.html",
    subject: "La course arrive sur la Riviera — 13-15 septembre",
  },
  "04": {
    file: "04-sections-site.html",
    subject: "Le catalogue Lift, section par section",
  },
  "05": {
    file: "05-maintenance.html",
    subject: "Ce que vous faites en septembre décide de votre mois de mai",
  },
};

// ── Lecture des arguments ──────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const only = arg("only");
const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");
// Resend, plan gratuit : 100 emails par jour. On garde une marge de sécurité.
const max = Number(arg("max") || 90);

// ── Constitution de la liste de destinataires ──────────────────────────────
const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[a-z]{2,}/i;

/**
 * Extrait les adresses d'un fichier .txt (une par ligne) ou .csv (colonne
 * `email` si un en-tête la déclare, sinon premier champ qui ressemble à une
 * adresse). Un export WooCommerce ou Mailchimp passe tel quel.
 */
function readList(path) {
  const raw = readFileSync(resolve(process.cwd(), path), "utf-8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Repérage d'une colonne `email` dans un éventuel en-tête CSV.
  const header = lines[0]
    .split(/[,;\t]/)
    .map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
  const col = header.findIndex((c) => c === "email" || c === "e-mail" || c === "adresse email");
  const body = col !== -1 ? lines.slice(1) : lines;

  const out = [];
  for (const line of body) {
    const cells = line.split(/[,;\t]/);
    const cell = col !== -1 && cells[col] !== undefined ? cells[col] : line;
    const found = (cell.match(EMAIL_RE) || line.match(EMAIL_RE) || [])[0];
    if (found) out.push(found.toLowerCase());
  }
  return [...new Set(out)];
}

const listPath = arg("list");
let to = (arg("to") || "").split(",").map((s) => s.trim()).filter(Boolean);

if (listPath) {
  if (!existsSync(resolve(process.cwd(), listPath))) {
    console.error(`Fichier introuvable : ${listPath}`);
    process.exit(1);
  }
  to = [...new Set([...to, ...readList(listPath)])];
}

if (to.length === 0) {
  console.error(
    "Usage : node send.js (--to a@x.fr[,b@y.fr] | --list contacts.csv) [--only 01] [--dry] [--max 90]"
  );
  process.exit(1);
}

const invalides = to.filter((a) => !EMAIL_RE.test(a));
if (invalides.length) {
  console.error(`Adresses invalides, corriger la liste : ${invalides.join(", ")}`);
  process.exit(1);
}

const { RESEND_API_KEY, MAIL_FROM, PREVIEW_BASE } = process.env;

if (!dry && (!RESEND_API_KEY || !MAIL_FROM)) {
  console.error("RESEND_API_KEY et MAIL_FROM doivent être définis (voir .env.example).");
  process.exit(1);
}

// ── Journal des envois ─────────────────────────────────────────────────────
// Format : ISO<TAB>maquette<TAB>adresse. Sert à deux choses : ne jamais envoyer
// deux fois la même maquette à la même personne, et compter ce qui est déjà
// parti aujourd'hui pour rester sous le plafond quotidien de Resend.
function readLog() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [date, key, email] = l.split("\t");
      return { date, key, email };
    });
}

const log = readLog();
const dejaEnvoye = new Set(log.map((e) => `${e.key}\t${e.email}`));
const aujourdhui = new Date().toISOString().slice(0, 10);
const envoyesAujourdhui = log.filter((e) => e.date.startsWith(aujourdhui)).length;

// ── Préparation du HTML ────────────────────────────────────────────────────
function build(entry) {
  const html = readFileSync(resolve(__dirname, entry.file), "utf-8");
  const previewUrl = PREVIEW_BASE
    ? `${PREVIEW_BASE.replace(/\/$/, "")}/${entry.file}`
    : "#";

  return html
    .replaceAll("{{preview_url}}", previewUrl)
    // Sur une maquette de validation, le lien de désabonnement ne doit rien
    // désabonner : il pointe vers la preview tant que la plateforme n'est pas branchée.
    .replaceAll("{{unsubscribe_url}}", previewUrl);
}

// Un en-tête List-Unsubscribe évite que Gmail et Outlook classent en spam un
// envoi groupé. Il pointe vers l'expéditeur tant qu'il n'y a pas de plateforme.
const fromAddress = (MAIL_FROM || "").match(EMAIL_RE)?.[0];
const unsubHeader = fromAddress
  ? { "List-Unsubscribe": `<mailto:${fromAddress}?subject=Desabonnement>` }
  : undefined;

// ── Envoi unitaire ─────────────────────────────────────────────────────────
async function send(key, email) {
  const entry = MAQUETTES[key];
  const html = build(entry);
  const subject = `[Maquette ${key}] ${entry.subject}`;

  if (dry) {
    console.log(`[dry] ${key} → ${email} · ${subject} · ${html.length} octets`);
    return { ok: true };
  }

  for (let tentative = 1; tentative <= 3; tentative++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject,
        html,
        ...(unsubHeader ? { headers: unsubHeader } : {}),
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      appendFileSync(LOG, `${new Date().toISOString()}\t${key}\t${email}\n`);
      console.log(`✓ ${key} → ${email} (id ${body.id})`);
      return { ok: true };
    }

    // 429 = cadence dépassée, 5xx = incident passager : on retente.
    if ((res.status === 429 || res.status >= 500) && tentative < 3) {
      const pause = 2000 * tentative;
      console.warn(`… ${key} → ${email} — ${res.status}, nouvelle tentative dans ${pause / 1000}s`);
      await new Promise((r) => setTimeout(r, pause));
      continue;
    }

    console.error(`✗ ${key} → ${email} — ${res.status} ${JSON.stringify(body)}`);
    return { ok: false };
  }
  return { ok: false };
}

// ── Boucle principale ──────────────────────────────────────────────────────
const keys = only ? [only] : Object.keys(MAQUETTES);

for (const key of keys) {
  if (!MAQUETTES[key]) {
    console.error(`Maquette inconnue : ${key}. Disponibles : ${Object.keys(MAQUETTES).join(", ")}`);
    process.exit(1);
  }
}

// Une tâche = une maquette pour un destinataire.
const taches = [];
for (const email of to) {
  for (const key of keys) {
    if (!force && dejaEnvoye.has(`${key}\t${email}`)) continue;
    taches.push({ key, email });
  }
}

const ignorees = to.length * keys.length - taches.length;
const budget = Math.max(0, max - envoyesAujourdhui);
const aFaire = dry ? taches : taches.slice(0, budget);
const reportees = taches.length - aFaire.length;

console.log(
  `${to.length} destinataire(s) × ${keys.length} maquette(s) = ${to.length * keys.length} envoi(s)` +
    (ignorees ? ` · ${ignorees} déjà envoyé(s), ignoré(s)` : "") +
    (reportees ? ` · ${reportees} reporté(s) : plafond ${max}/jour atteint` : "")
);

if (aFaire.length === 0) {
  console.log("Rien à envoyer.");
  process.exit(0);
}

let ko = 0;
for (const { key, email } of aFaire) {
  const { ok } = await send(key, email);
  if (!ok) ko++;
  // Resend limite la cadence des requêtes ; une pause évite les 429.
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\n${aFaire.length - ko} envoyé(s), ${ko} en échec.`);
if (reportees) {
  console.log(`Relancer la même commande demain pour les ${reportees} restant(s).`);
}
if (ko) process.exitCode = 1;
