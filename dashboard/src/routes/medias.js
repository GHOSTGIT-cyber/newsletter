/**
 * Sélecteur d'images : proxy vers la médiathèque publique de liftfoils.fr
 * (API REST WordPress), avec un cache d'une heure par requête.
 *
 * Plus le téléversement : une image envoyée depuis l'ordinateur est rangée sur
 * le volume persistant (à côté de la base) et servie publiquement sous /m/,
 * puisque les destinataires de l'email doivent pouvoir la charger.
 */
import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cheminBase } from "../db.js";

const r = Router();

export const DOSSIER_MEDIAS = resolve(dirname(cheminBase), "medias");
mkdirSync(DOSSIER_MEDIAS, { recursive: true });

// Formats lus par tous les clients mail (WebP et SVG ne le sont pas partout ;
// l'éditeur convertit le WebP en JPEG avant l'envoi).
const SIGNATURES = [
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
];
const TAILLE_MAX = 8 * 1024 * 1024;

r.post(
  "/api/medias/televerser",
  express.raw({ type: ["image/jpeg", "image/png", "image/gif"], limit: TAILLE_MAX }),
  (req, res) => {
    const corps = req.body;
    if (!Buffer.isBuffer(corps) || corps.length === 0) {
      return res.status(400).json({ erreur: "Formats acceptés : JPEG, PNG ou GIF." });
    }
    // On se fie au contenu du fichier, pas à son nom ni à l'en-tête annoncé.
    const format = SIGNATURES.find((s) => s.test(corps));
    if (!format) return res.status(400).json({ erreur: "Ce fichier n'est pas une image JPEG, PNG ou GIF." });
    const nom = `${new Date().toISOString().slice(0, 7)}-${randomBytes(12).toString("hex")}.${format.ext}`;
    writeFileSync(resolve(DOSSIER_MEDIAS, nom), corps);
    res.json({ ok: true, url: `${req.app.locals.PUBLIC_URL}/m/${nom}` });
  }
);
const WP = "https://liftfoils.fr/wp-json/wp/v2/media";
const cache = new Map(); // url → { quand, donnees }

r.get("/api/medias", async (req, res) => {
  const q = String(req.query.q || "").slice(0, 100);
  const page = Math.max(1, Number(req.query.page) || 1);
  const url = `${WP}?media_type=image&per_page=24&page=${page}&orderby=date&order=desc${q ? `&search=${encodeURIComponent(q)}` : ""}`;

  const c = cache.get(url);
  if (c && Date.now() - c.quand < 3600e3) return res.json(c.donnees);

  const rep = await fetch(url, { headers: { Accept: "application/json" } });
  if (!rep.ok) return res.status(502).json({ erreur: `liftfoils.fr a répondu ${rep.status}` });
  const brut = await rep.json();
  const totalPages = Number(rep.headers.get("x-wp-totalpages") || 1);

  // On ne garde que ce dont l'éditeur a besoin : une vignette et les variantes.
  const items = brut.map((m) => {
    const tailles = m.media_details?.sizes || {};
    const variantes = Object.entries(tailles)
      .map(([nom, t]) => ({ nom, largeur: t.width, hauteur: t.height, url: t.source_url }))
      .sort((a, b) => a.largeur - b.largeur);
    return {
      id: m.id,
      titre: m.title?.rendered || "",
      alt: m.alt_text || "",
      vignette: tailles.thumbnail?.source_url || tailles.medium?.source_url || m.source_url,
      original: { largeur: m.media_details?.width, hauteur: m.media_details?.height, url: m.source_url },
      variantes,
    };
  });

  const donnees = { page, totalPages, items };
  cache.set(url, { quand: Date.now(), donnees });
  res.json(donnees);
});

export default r;
