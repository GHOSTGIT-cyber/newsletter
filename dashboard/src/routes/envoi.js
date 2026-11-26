/**
 * Envoi d'une newsletter : test à soi-même, envoi à la liste, progression,
 * journal de ce qui est parti.
 */
import { Router } from "express";
import { db, reglage, definirReglage } from "../db.js";
import { nomGabarit } from "../gabarits.js";
import { STATUTS, compteParStatut, parEmail, listes } from "../contacts.js";
import { envoyerTest, preparerCampagne, progression, tick, budgetDuJour, plafondQuotidien, configure, annulerProgrammation } from "../envoi.js";

const r = Router();

const PARIS = "Europe/Paris";

/** Décalage de Paris (en ms) à un instant donné : gère l'heure d'été. */
function decalageParis(date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
    .formatToParts(date)
    .filter((p) => p.type !== "literal");
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * L'heure saisie est celle d'Anna (Europe/Paris) ; la base travaille en UTC.
 * Le navigateur envoie déjà l'instant exact dans `quandUTC` ; `quandLocal` sert
 * de repli quand ce champ manque (JavaScript coupé).
 */
export function instantUTC({ quandUTC, quandLocal }) {
  if (quandUTC && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(quandUTC)) {
    const d = new Date(quandUTC);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (!quandLocal || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(quandLocal)) return null;

  const naif = Date.parse(quandLocal.slice(0, 16) + ":00Z");
  if (Number.isNaN(naif)) return null;
  let t = naif - decalageParis(new Date(naif));
  const verif = decalageParis(new Date(t));
  if (naif - verif !== t) t = naif - verif; // changement d'heure cette nuit-là
  return new Date(t);
}

/** « 2026-11-26 07:30:00 » pour SQLite (UTC). */
const pourBase = (d) => d.toISOString().slice(0, 19).replace("T", " ");

/** « 2026-11-26T08:30 » à l'heure de Paris, pour un champ datetime-local. */
function pourChamp(date) {
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  })
    .formatToParts(date)
    .filter((x) => x.type !== "literal");
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}

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
  const lesListes = listes();
  const choisie = String(req.query.liste || "");
  const destinataires = choisie ? (lesListes.find((l) => l.liste === choisie)?.actifs ?? 0) : comptes.actif;
  res.render("envoyer", {
    n,
    listes: lesListes,
    listeChoisie: choisie,
    destinataires,
    objet: JSON.parse(n.contenu).meta?.objet || "",
    comptes,
    budget,
    plafond: plafondQuotidien(),
    emailTest: reglage("email_test"),
    adressePostale: reglage("adresse_postale"),
    configure: configure(),
    erreur: req.query.e || null,
    // Proposition par défaut : demain matin 8h30, heure française.
    suggestionJour: pourChamp(new Date(Date.now() + 86400_000)).slice(0, 10),
    suggestionHeure: "08:30",
    minimumJour: pourChamp(new Date()).slice(0, 10),
  });
});

r.post("/newsletters/:id/envoyer", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  if (n.statut !== "brouillon") {
    return res.redirect(`/newsletters/${n.id}/journal`);
  }
  const comptes = compteParStatut();
  const nomListe = String(req.body.liste || "").trim() || null;
  const attendus = nomListe
    ? (listes().find((l) => l.liste === nomListe)?.actifs ?? 0)
    : comptes.actif;
  // Garde-fou : la confirmation doit porter le nombre de destinataires affiché.
  if (Number(req.body.confirmation) !== attendus || attendus === 0) {
    return res.redirect(
      `/newsletters/${n.id}/envoyer?e=` +
        encodeURIComponent("Le nombre de destinataires a changé depuis l'affichage. Vérifiez et recommencez.")
    );
  }
  // Taille des vagues : choisie au moment de l'envoi, conservée pour la suite.
  const vague = Number(req.body.vague);
  if (Number.isFinite(vague) && vague > 0) definirReglage("plafond_quotidien", String(Math.min(Math.round(vague), 100000)));

  // Envoi différé : on vérifie que l'instant est bien à venir.
  let prevu = null;
  if (String(req.body.mode || "") === "programme") {
    const { jour, heure } = req.body;
    const quandLocal = jour && heure ? `${jour}T${heure}` : req.body.quand_local;
    const d = instantUTC({ quandUTC: req.body.quand_utc, quandLocal });
    if (!d) {
      return res.redirect(`/newsletters/${n.id}/envoyer?e=` + encodeURIComponent("Date d'envoi illisible."));
    }
    if (d.getTime() < Date.now() + 60_000) {
      return res.redirect(`/newsletters/${n.id}/envoyer?e=` + encodeURIComponent("L'heure choisie est déjà passée."));
    }
    if (d.getTime() > Date.now() + 60 * 86400_000) {
      return res.redirect(`/newsletters/${n.id}/envoyer?e=` + encodeURIComponent("Choisissez une date dans les deux mois."));
    }
    prevu = pourBase(d);
  }

  preparerCampagne(n.id, prevu, nomListe);
  if (!prevu) tick().catch((e) => console.error("envoi :", e));
  res.redirect(`/newsletters/${n.id}/journal`);
});

r.post("/newsletters/:id/annuler-programmation", (req, res) => {
  const n = charger(req.params.id);
  if (!n) return res.status(404).render("erreur", { code: 404, message: "Newsletter introuvable." });
  const r2 = annulerProgrammation(n.id);
  if (!r2.ok) return res.status(409).render("erreur", { code: 409, message: r2.erreur });
  res.redirect(`/newsletters/${n.id}`);
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
    quandPrevu: n.envoi_prevu
      ? new Date(n.envoi_prevu.replace(" ", "T") + "Z").toLocaleString("fr-FR", {
          timeZone: PARIS, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
        })
      : null,
    objet: JSON.parse(n.contenu).meta?.objet || "",
    gabaritNom: nomGabarit(n.gabarit),
    envois,
    p: progression(n.id),
    STATUTS,
  });
});

export default r;
