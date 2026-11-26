/**
 * Newsletters : liste, création depuis un gabarit, duplication, éditeur,
 * sauvegarde du contenu zone par zone.
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db, reglage } from "../db.js";
import { CATALOGUE, LIBRE, nomGabarit, gabarit, rendre, lire, ecrire, cheminsAutorises } from "../gabarits.js";
import { TYPES, COULEURS, MODELES, MAX_BLOCS, contenuModele, nettoyerBlocs } from "../blocs.js";

const r = Router();

const idPublic = () => randomBytes(9).toString("base64url");

// Dates affichées à l'heure de Paris : la base stocke de l'UTC.
const PARIS = "Europe/Paris";
const quandFr = (s) =>
  new Date(s.replace(" ", "T") + "Z").toLocaleString("fr-FR", {
    timeZone: PARIS, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

/** « Promotion — 26 novembre » : deux newsletters créées le même jour restent distinctes par leur date. */
const nommer = (base) =>
  `${base} — ${new Date().toLocaleDateString("fr-FR", { timeZone: PARIS, day: "numeric", month: "long" })}`;

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
    .map((n) => ({ ...n, objet: JSON.parse(n.contenu).meta?.objet || "", gabaritNom: nomGabarit(n.gabarit), quand: quandFr(n.modifie_le) }));
  const modeles = Object.entries(MODELES).map(([cle, m]) => ({ cle, nom: m.nom, description: m.description }));
  // Le brouillon modifié en dernier, mis en avant : c'est presque toujours
  // celui qu'on vient de quitter.
  const reprendre = newsletters.find((n) => n.statut === "brouillon") || null;
  res.render("newsletters", { newsletters, catalogue: CATALOGUE, modeles, reprendre });
});

r.post("/newsletters", (req, res) => {
  const cle = String(req.body.gabarit || "");
  if (cle === LIBRE) {
    const modele = MODELES[req.body.modele] ? String(req.body.modele) : "vierge";
    const info = db
      .prepare("INSERT INTO newsletters (id_public, gabarit, nom, contenu) VALUES (?, ?, ?, ?)")
      .run(idPublic(), LIBRE, nommer(MODELES[modele].nomCourt), JSON.stringify(contenuModele(modele)));
    return res.redirect(`/newsletters/${info.lastInsertRowid}`);
  }
  if (!CATALOGUE[cle]) return res.status(400).render("erreur", { code: 400, message: "Gabarit inconnu." });
  const g = gabarit(cle);
  const nom = String(req.body.nom || "").trim() || nommer(g.nom);
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
  const g = gabarit(n.gabarit);
  const lectureSeule = n.statut !== "brouillon";
  if (g.libre) {
    return res.render("editeur-libre", { n, g, lectureSeule, schema: { types: TYPES, couleurs: COULEURS, max: MAX_BLOCS } });
  }
  res.render("editeur", { n, g, lectureSeule });
});

// Le document affiché dans l'iframe de l'éditeur.
r.get("/newsletters/:id/cadre", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).send("Introuvable");
  const g = gabarit(n.gabarit);
  const html = rendre(g, n.contenu, {
    // La mise en page libre garde son script en lecture seule : il règle la
    // hauteur de l'aperçu, et ne rend rien modifiable.
    mode: n.statut === "brouillon" || g.libre ? "cadre" : "apercu",
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

// Mise en page libre : la liste complète des blocs, remplacée d'un coup.
// Renvoie le nouvel aperçu, pour éviter un second aller-retour.
r.put("/api/newsletters/:id/blocs", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).json({ erreur: "Introuvable" });
  if (n.gabarit !== LIBRE) return res.status(400).json({ erreur: "Cette newsletter n'est pas en mise en page libre" });
  if (n.statut !== "brouillon") return res.status(409).json({ erreur: "Newsletter envoyée : lecture seule" });
  let blocs;
  try {
    blocs = nettoyerBlocs(req.body?.blocs);
  } catch (e) {
    return res.status(400).json({ erreur: e.message });
  }
  n.contenu.blocs = blocs;
  sauver(n);
  const html = rendre(gabarit(LIBRE), n.contenu, {
    mode: "cadre",
    previewUrl: `${req.app.locals.PUBLIC_URL}/n/${n.id_public}`,
    unsubscribeUrl: `${req.app.locals.PUBLIC_URL}/desabonnement`,
    adressePostale: reglage("adresse_postale"),
  });
  res.json({ ok: true, blocs, html, modifie_le: new Date().toISOString() });
});

export default r;
