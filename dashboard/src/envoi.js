/**
 * L'envoi : rendu de l'email pour un destinataire, file d'attente en base,
 * boucle d'envoi via l'API Resend.
 *
 * Même logique que `send.js` à la racine du dépôt : un email par destinataire
 * (personne ne voit l'adresse des autres), plafond quotidien respecté, reprise
 * automatique le lendemain. La différence : la file vit en base, donc un
 * redémarrage du conteneur reprend là où l'envoi s'était arrêté.
 */

import { db, reglage } from "./db.js";
import { gabarit, rendre, versionTexte } from "./gabarits.js";

const API = "https://api.resend.com/emails";

export const plafondQuotidien = () => Number(process.env.DAILY_LIMIT || 90);
export const expediteur = () => process.env.MAIL_FROM || "Lift Foils France <news@news.liftfoils.fr>";
export const configure = () => Boolean(process.env.RESEND_API_KEY);

const adresseDe = (from) => (String(from).match(/<([^>]+)>/) || [, String(from)])[1];

/** Prépare l'email destiné à un contact (ou à une adresse de test). */
export function preparerEmail(n, { contact = null, test = false, publicUrl }) {
  const g = gabarit(n.gabarit);
  const contenu = typeof n.contenu === "string" ? JSON.parse(n.contenu) : n.contenu;
  const previewUrl = `${publicUrl}/n/${n.id_public}`;
  // Un test n'a pas de jeton : le lien de désabonnement pointe vers la page
  // d'explication, il ne désabonne personne.
  const unsubscribeUrl = contact ? `${publicUrl}/desabonnement/${contact.jeton}` : `${publicUrl}/desabonnement`;
  const options = { mode: "email", previewUrl, unsubscribeUrl, adressePostale: reglage("adresse_postale") };

  const objet = contenu.meta?.objet || g.objet || n.nom;
  return {
    subject: test ? `[TEST] ${objet}` : objet,
    html: rendre(g, contenu, options),
    // Un email HTML seul est un signal négatif pour les filtres (README §4.6).
    text: versionTexte(g, contenu, { previewUrl, unsubscribeUrl }),
    headers: {
      // Gmail et Yahoo exigent le désabonnement en un clic pour tout envoi groupé.
      "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${adresseDe(expediteur())}?subject=Desabonnement>`,
      ...(contact ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
    },
  };
}

/** Un appel à l'API Resend, avec reprise sur 429 et 5xx. */
async function appelerResend(message) {
  for (let tentative = 1; tentative <= 3; tentative++) {
    let res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: expediteur(), ...message }),
      });
    } catch (e) {
      if (tentative === 3) return { ok: false, erreur: `réseau : ${e.message}` };
      await new Promise((r) => setTimeout(r, 2000 * tentative));
      continue;
    }
    const corps = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, id: corps.id };
    // 429 = cadence dépassée, 5xx = incident passager : on retente.
    if ((res.status === 429 || res.status >= 500) && tentative < 3) {
      await new Promise((r) => setTimeout(r, 2000 * tentative));
      continue;
    }
    return { ok: false, erreur: `${res.status} ${corps.message || JSON.stringify(corps)}` };
  }
  return { ok: false, erreur: "échec après 3 tentatives" };
}

/**
 * Envoi immédiat à une adresse, sans passer par la file (bouton « test »).
 * Si `contact` est fourni, l'email est identique à celui que recevra la liste,
 * lien de désabonnement personnel compris — l'objet reste préfixé [TEST].
 */
export async function envoyerTest(n, destinataire, publicUrl, contact = null) {
  if (!configure()) return { ok: false, erreur: "RESEND_API_KEY n'est pas définie sur le serveur." };
  const message = preparerEmail(n, { test: true, contact, publicUrl });
  return appelerResend({ to: [destinataire], ...message });
}

// ── La file ────────────────────────────────────────────────────────────────

/** Nombre d'emails déjà partis aujourd'hui, toutes newsletters confondues. */
export function envoyesAujourdhui() {
  return db
    .prepare("SELECT COUNT(*) AS n FROM envois WHERE statut IN ('envoye','livre') AND date(envoye_le) = date('now')")
    .get().n;
}

export const budgetDuJour = () => Math.max(0, plafondQuotidien() - envoyesAujourdhui());

/** Crée une ligne d'envoi par contact actif. Ne double jamais un envoi déjà fait. */
export function preparerCampagne(newsletterId) {
  const existants = db
    .prepare("SELECT COUNT(*) AS n FROM envois WHERE newsletter_id = ?")
    .get(newsletterId).n;
  if (existants > 0) return { deja: existants, crees: 0 };

  const inserer = db.prepare(
    "INSERT INTO envois (newsletter_id, contact_id, email, statut) VALUES (?, ?, ?, 'attente')"
  );
  const liste = db.prepare("SELECT id, email FROM contacts WHERE statut = 'actif' ORDER BY id").all();
  db.exec("BEGIN");
  try {
    for (const c of liste) inserer.run(newsletterId, c.id, c.email);
    db.prepare("UPDATE newsletters SET statut = 'envoi' WHERE id = ?").run(newsletterId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { deja: 0, crees: liste.length };
}

export function progression(newsletterId) {
  const lignes = db
    .prepare("SELECT statut, COUNT(*) AS n FROM envois WHERE newsletter_id = ? GROUP BY statut")
    .all(newsletterId);
  const p = { attente: 0, envoye: 0, livre: 0, echec: 0, total: 0 };
  for (const l of lignes) {
    p[l.statut] = l.n;
    p.total += l.n;
  }
  p.faits = p.envoye + p.livre + p.echec;
  p.reste = p.attente;
  p.budget = budgetDuJour();
  return p;
}

// ── La boucle ──────────────────────────────────────────────────────────────
// Un seul envoi à la fois dans le processus. Le tick est relancé toutes les
// minutes : il reprend après un redémarrage, et repart tout seul le lendemain
// quand le plafond quotidien se remet à zéro.

let enCours = false;

export async function tick() {
  if (enCours || !configure()) return;
  enCours = true;
  try {
    while (budgetDuJour() > 0) {
      const envoi = db
        .prepare(
          `SELECT e.*, n.id AS nid, n.gabarit, n.contenu, n.id_public, n.nom
           FROM envois e JOIN newsletters n ON n.id = e.newsletter_id
           WHERE e.statut = 'attente' ORDER BY e.id LIMIT 1`
        )
        .get();
      if (!envoi) break;

      const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(envoi.contact_id);
      // Dernière vérification juste avant de partir : quelqu'un a pu se
      // désabonner pendant que la campagne tournait.
      if (!contact || contact.statut !== "actif") {
        db.prepare("UPDATE envois SET statut = 'echec', erreur = ?, envoye_le = datetime('now') WHERE id = ?")
          .run(contact ? `annulé — contact ${contact.statut}` : "contact supprimé", envoi.id);
        continue;
      }

      const publicUrl = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
      const message = preparerEmail(envoi, { contact, publicUrl });
      const r = await appelerResend({ to: [contact.email], ...message });

      if (r.ok) {
        db.prepare("UPDATE envois SET statut = 'envoye', resend_id = ?, envoye_le = datetime('now') WHERE id = ?")
          .run(r.id, envoi.id);
      } else {
        db.prepare("UPDATE envois SET statut = 'echec', erreur = ?, envoye_le = datetime('now') WHERE id = ?")
          .run(r.erreur, envoi.id);
      }

      // Resend limite la cadence des requêtes ; une pause évite les 429.
      await new Promise((r) => setTimeout(r, 600));
    }
    cloturerTerminees();
  } finally {
    enCours = false;
  }
}

/** Une campagne dont plus rien n'est en attente passe en « envoyée ». */
function cloturerTerminees() {
  db.exec(`
    UPDATE newsletters SET statut = 'envoyee', envoyee_le = COALESCE(envoyee_le, datetime('now'))
    WHERE statut = 'envoi'
      AND NOT EXISTS (SELECT 1 FROM envois WHERE newsletter_id = newsletters.id AND statut = 'attente')
      AND EXISTS (SELECT 1 FROM envois WHERE newsletter_id = newsletters.id)
  `);
}

/** Démarre la boucle : au lancement, puis toutes les minutes. */
export function demarrerBoucle() {
  if (!configure()) {
    console.warn("RESEND_API_KEY absente : les envois resteront en attente.");
    return;
  }
  const lancer = () => tick().catch((e) => console.error("tick envoi :", e));
  setTimeout(lancer, 3000);
  setInterval(lancer, 60_000).unref?.();
}
