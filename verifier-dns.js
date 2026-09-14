#!/usr/bin/env node
/**
 * Vérifie que les enregistrements DNS attendus par Resend sont en place et
 * visibles publiquement, avant de cliquer sur « Verify » dans Resend.
 *
 *   node verifier-dns.js                       → domaine lu dans MAIL_FROM
 *   node verifier-dns.js news.liftfoils.fr     → domaine explicite
 *
 * Interroge un résolveur public plutôt que le cache local : c'est ce que voit
 * Resend, pas ce que voit votre machine.
 */

import { Resolver } from "node:dns/promises";

// 1.1.1.1 et 8.8.8.8 : si les deux voient la même chose, c'est propagé.
const RESOLVEURS = [
  ["Cloudflare", "1.1.1.1"],
  ["Google", "8.8.8.8"],
];

const arg = process.argv[2];
const depuisEnv = (process.env.MAIL_FROM || "").match(/@([^\s>"']+)/)?.[1];
const envoi = (arg || depuisEnv || "").toLowerCase().replace(/\.$/, "");

if (!envoi) {
  console.error(
    "Usage : node verifier-dns.js [sous-domaine]\n" +
      "Sans argument, le domaine est lu dans MAIL_FROM du fichier .env."
  );
  process.exit(1);
}

// Le DMARC se pose sur le domaine racine, pas sur le sous-domaine d'envoi.
const parties = envoi.split(".");
const racine = parties.slice(-2).join(".");

async function txt(hote) {
  const vus = new Set();
  for (const [, ip] of RESOLVEURS) {
    const r = new Resolver({ timeout: 5000, tries: 2 });
    r.setServers([ip]);
    try {
      for (const bloc of await r.resolveTxt(hote)) vus.add(bloc.join(""));
    } catch {
      /* absent chez ce résolveur */
    }
  }
  return [...vus];
}

async function mx(hote) {
  const vus = new Set();
  for (const [, ip] of RESOLVEURS) {
    const r = new Resolver({ timeout: 5000, tries: 2 });
    r.setServers([ip]);
    try {
      for (const e of await r.resolveMx(hote)) vus.add(`${e.priority} ${e.exchange}`);
    } catch {
      /* absent chez ce résolveur */
    }
  }
  return [...vus];
}

const resultats = [];

function verdict(nom, hote, valeurs, test, aide) {
  const trouve = valeurs.find(test);
  resultats.push({ nom, ok: Boolean(trouve) });
  const marque = trouve ? "✓" : "✗";
  console.log(`\n${marque} ${nom}`);
  console.log(`  hôte   ${hote}`);
  if (trouve) {
    console.log(`  valeur ${trouve.slice(0, 96)}${trouve.length > 96 ? "…" : ""}`);
  } else if (valeurs.length) {
    console.log(`  trouvé ${valeurs[0].slice(0, 96)}  ← présent mais ne correspond pas`);
    console.log(`  attendu ${aide}`);
  } else {
    console.log(`  absent — ${aide}`);
  }
}

console.log(`Domaine d'envoi : ${envoi}`);
console.log(`Domaine racine  : ${racine}`);
console.log("Résolveurs      : " + RESOLVEURS.map(([n, ip]) => `${n} (${ip})`).join(", "));

// ── SPF sur le sous-domaine d'envoi ────────────────────────────────────────
verdict(
  "SPF",
  envoi,
  await txt(envoi),
  (v) => v.startsWith("v=spf1"),
  "un TXT commençant par v=spf1, avec l'include fourni par Resend"
);

// ── DKIM ───────────────────────────────────────────────────────────────────
verdict(
  "DKIM",
  `resend._domainkey.${envoi}`,
  await txt(`resend._domainkey.${envoi}`),
  (v) => v.includes("p=") && v.length > 100,
  "le TXT de clé publique affiché par Resend (long, commence par p=MIG…)"
);

// ── MX de retour, pour les bounces ─────────────────────────────────────────
verdict(
  "MX de retour",
  `send.${envoi}`,
  await mx(`send.${envoi}`),
  (v) => /amazonses|feedback-smtp/i.test(v),
  "le MX feedback-smtp fourni par Resend — c'est lui qui ramène les bounces"
);

// ── DMARC sur la racine ────────────────────────────────────────────────────
verdict(
  "DMARC",
  `_dmarc.${racine}`,
  await txt(`_dmarc.${racine}`),
  (v) => v.startsWith("v=DMARC1"),
  `v=DMARC1; p=none; rua=mailto:dmarc@${racine}  — à poser vous-même, Resend ne le fournit pas`
);

// ── Synthèse ───────────────────────────────────────────────────────────────
const manquants = resultats.filter((r) => !r.ok);

console.log("\n" + "─".repeat(62));

if (manquants.length === 0) {
  console.log("Les quatre enregistrements sont visibles publiquement.");
  console.log("Vous pouvez cliquer sur « Verify DNS Records » dans Resend.");
} else {
  console.log(`${manquants.length} enregistrement(s) manquant(s) : ${manquants.map((r) => r.nom).join(", ")}`);
  console.log(
    "\nLa propagation prend de quelques minutes à une heure. Si un enregistrement\n" +
      "reste invisible au-delà, vérifier dans Cloudflare que l'entrée est en DNS only\n" +
      "(nuage gris) et que le nom d'hôte n'a pas été saisi en entier — Cloudflare\n" +
      "ajoute le domaine tout seul."
  );
  process.exitCode = 1;
}
