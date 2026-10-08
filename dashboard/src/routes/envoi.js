/**
 * Envoi d'une newsletter : test à soi-même, envoi à la liste, progression,
 * journal de ce qui est parti.
 */
import { Router } from "express";
import { db, reglage } from "../db.js";
import { CATALOGUE } from "../gabarits.js";
import { STATUTS, compteParStatut, parEmail } from "../contacts.js";
import { envoyerTest, preparerCampagne, progression, tick, budgetDuJour, plafondQuotidien, configure } from "../envoi.js";

const r = Router();

const charger = (id) => db.prepare("SELECT * FROM newsletters WHERE id = ?").get(Number(id));

// ── Test ───────────────────────────────────────────────────────────────────
r.post("/newsletters/:id/test", async (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).json({ erreur: "Newsletter introuvable" });

  const destinataire = String(req.body?.destinataire || reglage("email_test") || "").trim();
  if (!destinataire) {
    return res.status(400).json({ erreur: "Renseignez l'adresse de test dans Réglages." });
  }
  // Si l'adresse de test est dans les contacts, le test porte son vrai lien de
  // désabonnement : c'est exactement l'email que recevra la liste.
  const contact = parEmail(destinataire);
  const resultat = await envoyerTest(n, destinataire, req.app.locals.PUBLIC_URL, contact);
  if (!resultat.ok) return res.status(502).json({ erreur: resultat.erreur });
  res.json({ ok: true, destinataire });
});

// ── Envoi à la liste ───────────────────────────────────────────────────────

// Page de confirmation : on montre le nombre exact de destinataires et le
// calendrier avant de lancer quoi que ce soit.
r.get("/newsletters/:id/envoyer", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  const comptes = compteParStatut();
  const budget = budgetDuJour();
  res.render("envoyer", {
    n,
    objet: JSON.parse(n.contenu).meta?.objet || "",
    comptes,
    budget,
    plafond: plafondQuotidien(),
    emailTest: reglage("email_test"),
    adressePostale: reglage("adresse_postale"),
    configure: configure(),
    erreur: req.query.e || null,
  });
});

r.post("/newsletters/:id/envoyer", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  if (n.statut !== "brouillon") {
    return res.redirect(`/newsletters/${n.id}/journal`);
  }
  const comptes = compteParStatut();
  // Garde-fou : la confirmation doit porter le nombre de destinataires affiché.
  if (Number(req.body.confirmation) !== comptes.actif || comptes.actif === 0) {
    return res.redirect(
      `/newsletters/${n.id}/envoyer?e=` +
        encodeURIComponent("Le nombre de destinataires a changé depuis l'affichage. Vérifiez et recommencez.")
    );
  }
  preparerCampagne(n.id);
  tick().catch((e) => console.error("envoi :", e));
  res.redirect(`/newsletters/${n.id}/journal`);
});

r.get("/api/newsletters/:id/progression", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).json({ erreur: "Introuvable" });
  res.json({ statut: n.statut, ...progression(n.id) });
});

// ── Journal ────────────────────────────────────────────────────────────────
r.get("/newsletters/:id/journal", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  const envois = db
    .prepare(
      `SELECT e.*, c.statut AS statut_contact, c.nom
       FROM envois e LEFT JOIN contacts c ON c.id = e.contact_id
       WHERE e.newsletter_id = ? ORDER BY e.id`
    )
    .all(n.id);
  res.render("journal", {
    n,
    objet: JSON.parse(n.contenu).meta?.objet || "",
    gabaritNom: CATALOGUE[n.gabarit]?.nom || n.gabarit,
    envois,
    p: progression(n.id),
    STATUTS,
  });
});

export default r;
