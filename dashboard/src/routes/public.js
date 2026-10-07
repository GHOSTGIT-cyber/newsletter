/**
 * Routes publiques : l'aperçu en lecture seule (le lien « voir dans le
 * navigateur » des emails), le désabonnement, le webhook Resend.
 *
 * Ces URL doivent rester valables pour toujours : un email envoyé aujourd'hui
 * doit encore pouvoir désabonner dans deux ans.
 */
import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, reglage } from "../db.js";
import { gabarit, rendre } from "../gabarits.js";
import { parJeton, changerStatut } from "../contacts.js";

const r = Router();

// ── Aperçu ─────────────────────────────────────────────────────────────────
r.get("/n/:idPublic", (req, res) => {
  const n = db.prepare("SELECT * FROM newsletters WHERE id_public = ?").get(req.params.idPublic);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Cette newsletter n'existe pas." });
  const g = gabarit(n.gabarit);
  const html = rendre(g, JSON.parse(n.contenu), {
    mode: "apercu",
    previewUrl: `${req.app.locals.PUBLIC_URL}/n/${n.id_public}`,
    unsubscribeUrl: `${req.app.locals.PUBLIC_URL}/desabonnement`,
    adressePostale: reglage("adresse_postale"),
  });
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.type("html").send(html);
});

// ── Désabonnement ──────────────────────────────────────────────────────────

// Sans jeton : page d'explication. Sert de cible au lien des aperçus et des
// envois de test, où il ne doit rien désabonner.
r.get("/desabonnement", (req, res) =>
  res.render("desabonnement", { etat: "generique", contact: null, jeton: null })
);

r.get("/desabonnement/:jeton", (req, res) => {
  const contact = parJeton(req.params.jeton);
  res.set("X-Robots-Tag", "noindex, nofollow");
  // Jeton inconnu : page neutre, on ne dit pas si l'adresse existe.
  if (!contact) return res.status(404).render("desabonnement", { etat: "inconnu", contact: null, jeton: null });
  if (contact.statut !== "actif") {
    return res.render("desabonnement", { etat: "deja", contact, jeton: req.params.jeton });
  }
  res.render("desabonnement", { etat: "confirmer", contact, jeton: req.params.jeton });
});

/**
 * Désabonne sans confirmation : c'est ce que Gmail appelle via l'en-tête
 * List-Unsubscribe-Post, et c'est aussi le bouton de la page ci-dessus.
 * Toujours 200, même si le jeton est inconnu ou le contact déjà désabonné :
 * un échec ferait réessayer Gmail pour rien.
 */
r.post("/desabonnement/:jeton", (req, res) => {
  const contact = parJeton(req.params.jeton);
  if (contact && contact.statut === "actif") {
    // L'appel de Gmail n'a pas d'en-tête Origin ; celui du bouton en a un.
    const origine = req.get("origin") ? "lien" : "one-click";
    changerStatut(contact.id, "desabonne", origine);
  }
  res.set("X-Robots-Tag", "noindex, nofollow");
  // Gmail attend une réponse courte, le navigateur une page lisible.
  if ((req.get("accept") || "").includes("text/html")) {
    return res.render("desabonnement", { etat: "fait", contact, jeton: req.params.jeton });
  }
  res.type("text/plain").send("OK");
});

// ── Webhook Resend ─────────────────────────────────────────────────────────
// Les rebonds et les plaintes mettent le contact au statut correspondant :
// continuer d'écrire à une adresse morte est lu comme un comportement de robot.

/** Signature Svix : HMAC-SHA256 de `id.timestamp.corps`, clé en base64. */
function signatureValide(req, brut) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = req.get("svix-id");
  const ts = req.get("svix-timestamp");
  const signatures = (req.get("svix-signature") || "").split(" ");
  if (!id || !ts || signatures.length === 0) return false;

  // Au-delà de cinq minutes, on refuse : protège contre le rejeu.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const cle = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const attendue = createHmac("sha256", cle).update(`${id}.${ts}.${brut}`).digest("base64");
  const a = Buffer.from(attendue);
  return signatures.some((s) => {
    const partie = s.split(",")[1] || "";
    const b = Buffer.from(partie);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

r.post("/webhooks/resend", (req, res) => {
  const brut = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
  if (!signatureValide(req, brut)) return res.status(401).send("signature invalide");

  const evt = req.body || {};
  const resendId = evt.data?.email_id || evt.data?.id || null;
  db.prepare("INSERT INTO evenements (resend_id, type, brut) VALUES (?, ?, ?)").run(resendId, evt.type || "?", brut);

  const destinataire = Array.isArray(evt.data?.to) ? evt.data.to[0] : evt.data?.to;
  const contact = destinataire
    ? db.prepare("SELECT * FROM contacts WHERE email = ?").get(String(destinataire).toLowerCase())
    : null;

  if (evt.type === "email.delivered" && resendId) {
    db.prepare("UPDATE envois SET statut = 'livre' WHERE resend_id = ? AND statut = 'envoye'").run(resendId);
  }
  if (evt.type === "email.bounced" && contact) {
    // Un rebond temporaire (boîte pleine) ne doit pas désabonner définitivement.
    const dur = (evt.data?.bounce?.type || "").toLowerCase() !== "transient";
    if (dur) changerStatut(contact.id, "rebond", "webhook");
    if (resendId) db.prepare("UPDATE envois SET statut = 'echec', erreur = 'rebond' WHERE resend_id = ?").run(resendId);
  }
  if (evt.type === "email.complained" && contact) {
    changerStatut(contact.id, "plainte", "webhook");
  }

  res.send("ok");
});

export default r;
