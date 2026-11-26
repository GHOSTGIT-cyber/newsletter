/**
 * Les contacts : liste, import d'un fichier, ajout et retrait à la main.
 */
import { Router } from "express";
import { db } from "../db.js";
import { STATUTS, lireListe, importer, ajouter, changerStatut, compteParStatut, listes } from "../contacts.js";

const r = Router();

// Import de fichier : le corps arrive en multipart, on le lit nous-mêmes pour
// éviter une dépendance de plus. Un CSV de contacts tient largement en mémoire.
import { text } from "node:stream/consumers";

function extraireFichier(corpsBrut, frontiere) {
  const parties = corpsBrut.split(`--${frontiere}`);
  for (const p of parties) {
    if (!/name="fichier"/.test(p)) continue;
    const i = p.indexOf("\r\n\r\n");
    if (i === -1) continue;
    return p.slice(i + 4).replace(/\r\n$/, "");
  }
  return "";
}

function extraireChamp(corpsBrut, frontiere, nom) {
  const parties = corpsBrut.split(`--${frontiere}`);
  for (const p of parties) {
    if (!new RegExp(`name="${nom}"`).test(p)) continue;
    const i = p.indexOf("\r\n\r\n");
    if (i === -1) continue;
    return p.slice(i + 4).replace(/\r\n$/, "").trim();
  }
  return "";
}

r.get("/contacts", (req, res) => {
  const filtre = String(req.query.statut || "");
  const liste = String(req.query.liste || "");
  const ou = [];
  const args = [];
  if (STATUTS[filtre]) { ou.push("statut = ?"); args.push(filtre); }
  if (liste === "__aucune") ou.push("(liste IS NULL OR liste = '')");
  else if (liste) { ou.push("liste = ?"); args.push(liste); }
  const contacts = db
    .prepare(`SELECT * FROM contacts ${ou.length ? "WHERE " + ou.join(" AND ") : ""} ORDER BY (liste IS NULL OR liste = ''), liste COLLATE NOCASE, email`)
    .all(...args);
  res.render("contacts", {
    contacts,
    comptes: compteParStatut(),
    listes: listes(),
    listeFiltre: liste,
    ongletAjout: req.query.onglet === "ajout",
    sansListe: db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE liste IS NULL OR liste = ''").get().n,
    filtre,
    STATUTS,
    rapport: null,
    message: req.query.m || null,
    erreur: req.query.e || null,
  });
});

r.post("/contacts/import", async (req, res) => {
  const type = req.get("content-type") || "";
  const m = type.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!m) return res.redirect("/contacts?e=" + encodeURIComponent("Fichier illisible."));
  const brut = await text(req);
  const contenu = extraireFichier(brut, m[1] || m[2]);
  const source = extraireChamp(brut, m[1] || m[2], "source") || "import";
  const date = extraireChamp(brut, m[1] || m[2], "date") || null;

  const liste = lireListe(contenu);
  if (liste.length === 0) {
    return res.redirect("/contacts?e=" + encodeURIComponent("Aucune adresse trouvée dans ce fichier."));
  }
  const nomListe = extraireChamp(brut, m[1] || m[2], "liste") || null;
  const rapport = importer(liste, { source, date, nomListe });
  res.render("contacts", {
    contacts: db.prepare("SELECT * FROM contacts ORDER BY (liste IS NULL OR liste = ''), liste COLLATE NOCASE, email").all(),
    comptes: compteParStatut(),
    listes: listes(),
    listeFiltre: "",
    ongletAjout: true,
    sansListe: db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE liste IS NULL OR liste = ''").get().n,
    filtre: "",
    STATUTS,
    rapport,
    message: null,
    erreur: null,
  });
});

// Change un contact de liste (menu déroulant du tableau).
r.post("/contacts/:id/liste", (req, res) => {
  const nom = String(req.body.liste || "").trim().slice(0, 60);
  db.prepare("UPDATE contacts SET liste = ? WHERE id = ?").run(nom || null, Number(req.params.id));
  res.redirect(req.get("referer") || "/contacts");
});

// Retire l'étiquette d'une liste. Les contacts restent, seul le rangement
// disparaît — on ne supprime jamais un contact par ce chemin.
r.post("/contacts/listes/retirer", (req, res) => {
  const nom = String(req.body.liste || "").trim();
  if (!nom) return res.redirect("/contacts");
  const n = db.prepare("UPDATE contacts SET liste = NULL WHERE liste = ?").run(nom).changes;
  res.redirect("/contacts?m=" + encodeURIComponent(`Liste « ${nom} » retirée de ${n} contact${n > 1 ? "s" : ""}. Aucun contact supprimé.`));
});

r.post("/contacts", (req, res) => {
  const { ok, message } = ajouter(req.body.email, req.body.nom, req.body.source);
  res.redirect("/contacts?" + (ok ? "m=" : "e=") + encodeURIComponent(message));
});

// Un contact qu'on retire à la main est marqué désabonné, pas supprimé : son
// jeton et son historique doivent survivre pour que le lien de désabonnement
// des emails déjà partis continue de fonctionner.
r.post("/contacts/:id/desabonner", (req, res) => {
  changerStatut(Number(req.params.id), "desabonne", "manuel");
  res.redirect("/contacts?m=" + encodeURIComponent("Contact désabonné."));
});

// La suppression définitive existe pour le droit à l'effacement (RGPD).
r.post("/contacts/:id/supprimer", (req, res) => {
  db.prepare("DELETE FROM contacts WHERE id = ?").run(Number(req.params.id));
  res.redirect("/contacts?m=" + encodeURIComponent("Contact supprimé définitivement."));
});

r.get("/contacts/export", (req, res) => {
  const lignes = db.prepare("SELECT email, nom, liste, statut, statut_date, consentement_date, consentement_source FROM contacts ORDER BY (liste IS NULL OR liste = ''), liste COLLATE NOCASE, email").all();
  const csv = [
    "email,nom,liste,statut,statut_date,consentement_date,consentement_source",
    ...lignes.map((l) =>
      [l.email, l.nom, l.liste, l.statut, l.statut_date, l.consentement_date, l.consentement_source]
        .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default r;
