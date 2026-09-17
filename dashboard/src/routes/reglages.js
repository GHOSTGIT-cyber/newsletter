import { Router } from "express";
import { db, reglage, definirReglage, cheminBase } from "../db.js";
import { hacher, verifier } from "../auth.js";

const r = Router();

r.get("/reglages", (req, res) => {
  res.render("reglages", {
    adresse_postale: reglage("adresse_postale"),
    email_test: reglage("email_test"),
    message: req.query.ok ? "Réglages enregistrés." : null,
    erreur: null,
  });
});

r.post("/reglages", (req, res) => {
  definirReglage("adresse_postale", String(req.body.adresse_postale || "").trim());
  definirReglage("email_test", String(req.body.email_test || "").trim());
  res.redirect("/reglages?ok=1");
});

r.post("/reglages/mot-de-passe", (req, res) => {
  const u = db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(req.utilisateur.id);
  if (!u) return res.redirect("/reglages");
  const { actuel = "", nouveau = "", confirmation = "" } = req.body;
  let erreur = null;
  if (!verifier(actuel, u.mdp_hash)) erreur = "Mot de passe actuel incorrect.";
  else if (nouveau.length < 8) erreur = "Le nouveau mot de passe doit faire au moins 8 caractères.";
  else if (nouveau !== confirmation) erreur = "La confirmation ne correspond pas.";
  if (erreur) {
    return res.status(400).render("reglages", {
      adresse_postale: reglage("adresse_postale"),
      email_test: reglage("email_test"),
      message: null,
      erreur,
    });
  }
  db.prepare("UPDATE utilisateurs SET mdp_hash = ? WHERE id = ?").run(hacher(nouveau), u.id);
  res.redirect("/reglages?ok=1");
});

// Sauvegarde : une copie cohérente du fichier SQLite (VACUUM INTO), téléchargée
// dans le navigateur.
r.get("/reglages/sauvegarde", async (req, res) => {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { unlink } = await import("node:fs/promises");
  const dest = join(tmpdir(), `newsletter-${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${dest.replaceAll("\\", "/").replaceAll("'", "''")}'`);
  const nom = `newsletter-${new Date().toISOString().slice(0, 10)}.sqlite`;
  res.download(dest, nom, () => unlink(dest).catch(() => {}));
});

export default r;
