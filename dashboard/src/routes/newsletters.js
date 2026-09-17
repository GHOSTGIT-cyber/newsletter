/**
 * Newsletters : liste, création depuis un gabarit, duplication, éditeur,
 * sauvegarde du contenu zone par zone.
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db, reglage } from "../db.js";
import { CATALOGUE, gabarit, rendre, lire, ecrire, cheminsAutorises } from "../gabarits.js";

const r = Router();

const idPublic = () => randomBytes(9).toString("base64url");

function charger(id) {
  const n = db.prepare("SELECT * FROM newsletters WHERE id = ?").get(Number(id));
  if (!n) return null;
  n.contenu = JSON.parse(n.contenu);
  return n;
}

function sauver(n) {
  db.prepare("UPDATE newsletters SET contenu = ?, modifie_le = datetime('now') WHERE id = ?").run(
    JSON.stringify(n.contenu),
    n.id
  );
}

// ── Liste ──────────────────────────────────────────────────────────────────
r.get("/", (req, res) => {
  const newsletters = db
    .prepare("SELECT id, id_public, gabarit, nom, statut, modifie_le, envoyee_le, contenu FROM newsletters ORDER BY modifie_le DESC")
    .all()
    .map((n) => ({ ...n, objet: JSON.parse(n.contenu).meta?.objet || "", gabaritNom: CATALOGUE[n.gabarit]?.nom || n.gabarit }));
  res.render("newsletters", { newsletters, catalogue: CATALOGUE });
});

r.post("/newsletters", (req, res) => {
  const cle = String(req.body.gabarit || "");
  if (!CATALOGUE[cle]) return res.status(400).render("erreur", { code: 400, message: "Gabarit inconnu." });
  const g = gabarit(cle);
  const nom = String(req.body.nom || "").trim() || g.nom;
  const info = db
    .prepare("INSERT INTO newsletters (id_public, gabarit, nom, contenu) VALUES (?, ?, ?, ?)")
    .run(idPublic(), cle, nom, JSON.stringify(g.defaut));
  res.redirect(`/newsletters/${info.lastInsertRowid}`);
});

r.post("/newsletters/:id/dupliquer", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  const info = db
    .prepare("INSERT INTO newsletters (id_public, gabarit, nom, contenu) VALUES (?, ?, ?, ?)")
    .run(idPublic(), n.gabarit, `${n.nom} (copie)`, JSON.stringify(n.contenu));
  res.redirect(`/newsletters/${info.lastInsertRowid}`);
});

r.post("/newsletters/:id/renommer", (req, res) => {
  const nom = String(req.body.nom || "").trim();
  if (nom) db.prepare("UPDATE newsletters SET nom = ? WHERE id = ?").run(nom, Number(req.params.id));
  res.redirect(req.get("referer") || "/");
});

r.post("/newsletters/:id/supprimer", (req, res) => {
  db.prepare("DELETE FROM newsletters WHERE id = ? AND statut = 'brouillon'").run(Number(req.params.id));
  res.redirect("/");
});

// ── Éditeur ────────────────────────────────────────────────────────────────
r.get("/newsletters/:id", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  res.render("editeur", { n, g: gabarit(n.gabarit), lectureSeule: n.statut !== "brouillon" });
});

// Le document affiché dans l'iframe de l'éditeur.
r.get("/newsletters/:id/cadre", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).send("Introuvable");
  const g = gabarit(n.gabarit);
  const html = rendre(g, n.contenu, {
    mode: n.statut === "brouillon" ? "cadre" : "apercu",
    previewUrl: `${req.app.locals.PUBLIC_URL}/n/${n.id_public}`,
    unsubscribeUrl: `${req.app.locals.PUBLIC_URL}/desabonnement`,
    adressePostale: reglage("adresse_postale"),
  });
  res.type("html").send(html);
});

// Sauvegarde d'une zone : { chemin, valeur }
r.patch("/api/newsletters/:id/contenu", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).json({ erreur: "Introuvable" });
  if (n.statut !== "brouillon") return res.status(409).json({ erreur: "Newsletter envoyée : lecture seule" });

  const { chemin, valeur } = req.body || {};
  const g = gabarit(n.gabarit);
  if (typeof chemin !== "string" || !cheminsAutorises(g).has(chemin)) {
    return res.status(400).json({ erreur: `Zone inconnue : ${chemin}` });
  }
  if (typeof valeur !== "string" || valeur.length > 5000) {
    return res.status(400).json({ erreur: "Valeur invalide" });
  }
  ecrire(n.contenu, chemin, valeur);
  sauver(n);
  res.json({ ok: true, chemin, valeur: lire(n.contenu, chemin), modifie_le: new Date().toISOString() });
});

export default r;
