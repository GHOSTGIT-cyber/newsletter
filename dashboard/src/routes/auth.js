import { Router } from "express";
import { authentifier, ouvrirSession, fermerSession, limiterConnexion, noterEchec, oublierEchecs } from "../auth.js";

const r = Router();

r.get("/connexion", (req, res) => {
  if (req.utilisateur) return res.redirect("/");
  res.render("connexion", { erreur: null });
});

r.post("/connexion", limiterConnexion, (req, res) => {
  const u = authentifier(req.body.email || "", req.body.mdp || "");
  if (!u) {
    noterEchec(req.ip);
    return res.status(401).render("connexion", { erreur: "Email ou mot de passe incorrect." });
  }
  oublierEchecs(req.ip);
  ouvrirSession(res, u.id);
  const suite = typeof req.query.suite === "string" && req.query.suite.startsWith("/") ? req.query.suite : "/";
  res.redirect(suite);
});

r.post("/deconnexion", (req, res) => {
  fermerSession(req, res);
  res.redirect("/connexion");
});

export default r;
