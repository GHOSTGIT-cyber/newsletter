/**
 * Sélecteur d'images : proxy vers la médiathèque publique de liftfoils.fr
 * (API REST WordPress), avec un cache d'une heure par requête.
 */
import { Router } from "express";

const r = Router();
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
