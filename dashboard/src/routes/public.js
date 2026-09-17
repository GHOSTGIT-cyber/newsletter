/**
 * Routes publiques : aperçu en lecture seule (le lien « voir dans le
 * navigateur » des emails) et, plus tard, le désabonnement.
 */
import { Router } from "express";
import { db, reglage } from "../db.js";
import { gabarit, rendre } from "../gabarits.js";

const r = Router();

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

// Page générique tant que le désabonnement par jeton n'est pas en place (phase 3).
r.get("/desabonnement", (req, res) => {
  res.render("erreur", { code: 200, message: "Pour vous désabonner, répondez à l'email reçu avec « désabonnement »." });
});

export default r;
