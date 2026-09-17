#!/usr/bin/env node
/**
 * Liste ce qu'un gabarit affiche et qu'Anna ne peut PAS modifier : tout texte
 * visible hors zone data-edit. À lancer après chaque marquage pour vérifier
 * qu'aucune phrase n'a été oubliée.
 *
 *   node --no-warnings=ExperimentalWarning scripts/verifier-gabarit.js 01
 */

import { gabarit, CATALOGUE } from "../src/gabarits.js";

const RE_TEXTE = /<(p|h1|h2|h3|a|span|td|strong)\b[^>]*?\sdata-edit="[^"]+"[^>]*>[\s\S]*?<\/\1>/g;

// Textes structurels, verrouillés volontairement sur les cinq gabarits.
const VERROUILLES = [
  "Cet email s'affiche mal ?", "Voir dans le navigateur", "eFOILS", "PLANCHES", "AILES", "ACCESSOIRES",
  "MONTAGE", "ENTRETIEN", "DÉPANNAGE", "ATELIER", "Facebook", "Instagram", "YouTube", "·", "info@liftfoils.fr",
  "Une question technique ? Répondez simplement à cet email, on lit tout.",
  "Vous recevez cet email parce que vous vous êtes inscrit sur liftfoils.fr.",
  "Lift Foils France · SAV et stock à Cannes · 06 35 30 50 67", "{{adresse_postale}}",
  "Gérer mes préférences", "Se désabonner", "liftfoils.fr",
];

const cles = process.argv[2] ? [process.argv[2]] : Object.keys(CATALOGUE);
let total = 0;

for (const cle of cles) {
  const g = gabarit(cle);
  const restes = g.html
    .replace(/<head>[\s\S]*?<\/head>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div style="display:none;[\s\S]*?<\/div>/i, "")
    .replace(RE_TEXTE, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !VERROUILLES.includes(l) && !/^\d{2}$/.test(l)); // numéros de liste : structure

  console.log(`\n${cle} · ${g.fichier} — ${g.zones.length} zones`);
  if (restes.length === 0) console.log("  ✓ tout texte visible est modifiable (hors éléments verrouillés)");
  for (const r of restes) console.log(`  ✗ ${r}`);
  total += restes.length;
}

process.exitCode = total ? 1 : 0;
