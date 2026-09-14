#!/usr/bin/env node
/**
 * Publie les maquettes sur Coolify, à l'adresse déclarée dans coolify.json.
 *
 *   node publish.js            → construit, envoie et déclenche le déploiement
 *   node publish.js --dry      → montre ce qui serait envoyé, sans rien toucher
 *
 * Les fichiers HTML sont compressés et embarqués dans un Dockerfile généré, ce
 * qui évite d'avoir à passer par un dépôt Git pour quatre pages statiques. Au
 * premier lancement l'application est créée dans Coolify et son uuid est écrit
 * dans coolify.json ; ensuite le même appel met simplement à jour le contenu.
 *
 * Variable d'environnement requise (fichier .env) :
 *   COOLIFY_TOKEN   token API Coolify
 */

import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = resolve(__dirname, "coolify.json");
const cfg = JSON.parse(readFileSync(CONFIG, "utf-8"));

const dry = process.argv.includes("--dry");
const token = process.env.COOLIFY_TOKEN;

if (!dry && !token) {
  console.error("COOLIFY_TOKEN doit être défini (voir .env.example).");
  process.exit(1);
}

const base = cfg.domain.replace(/\/$/, "");

// ── Fichiers publiés ───────────────────────────────────────────────────────
const PAGES = [
  "index.html",
  "01-guide-taille.html",
  "02-lancement.html",
  "03-course-frech.html",
  "04-sections-site.html",
  "05-maintenance.html",
];

/**
 * Les maquettes contiennent les mêmes placeholders qu'à l'envoi. On les remplit
 * ici aussi, sinon la version en ligne affiche `{{preview_url}}` en clair.
 */
function page(file) {
  return readFileSync(resolve(__dirname, file), "utf-8")
    .replaceAll("{{preview_url}}", `${base}/${file}`)
    .replaceAll("{{unsubscribe_url}}", `${base}/`);
}

// Une preview client n'a rien à faire dans un index de moteur de recherche.
const ROBOTS = "User-agent: *\nDisallow: /\n";

const NGINX = `server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  add_header X-Robots-Tag "noindex, nofollow" always;
  location / { try_files $uri $uri/ =404; }
}
`;

// ── Génération du Dockerfile ───────────────────────────────────────────────
// Chaque fichier est gzippé puis encodé en base64 : le Dockerfile reste sous
// les 30 ko là où le HTML brut en ferait 90.
const blob = (contenu) => gzipSync(Buffer.from(contenu, "utf-8"), { level: 9 }).toString("base64");

const ecrire = (dest, contenu) =>
  `    printf %s '${blob(contenu)}' | base64 -d | gunzip > ${dest}; \\`;

const dockerfile = [
  "FROM nginx:alpine",
  "RUN rm -f /usr/share/nginx/html/index.html /etc/nginx/conf.d/default.conf",
  "RUN set -eu; \\",
  ...PAGES.map((f) => ecrire(`/usr/share/nginx/html/${f}`, page(f))),
  ecrire("/usr/share/nginx/html/robots.txt", ROBOTS),
  ecrire("/etc/nginx/conf.d/default.conf", NGINX).replace(/; \\$/, ""),
  "EXPOSE 80",
  "",
].join("\n");

console.log(
  `${PAGES.length} page(s) · Dockerfile ${(dockerfile.length / 1024).toFixed(1)} ko · cible ${cfg.domain}`
);

if (dry) {
  const apercu = resolve(__dirname, "Dockerfile.generated");
  writeFileSync(apercu, dockerfile);
  console.log(`[dry] Dockerfile écrit dans ${apercu}, rien envoyé à Coolify.`);
  process.exit(0);
}

// ── Appels API ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${cfg.url}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texte = await res.text();
  let json;
  try {
    json = JSON.parse(texte);
  } catch {
    json = { raw: texte.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} — ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

// Réglages communs à la création et à la mise à jour.
// L'API Coolify attend le Dockerfile encodé en base64, pas en clair.
const reglages = {
  name: cfg.name,
  description: "Maquettes newsletter Lift Foils France — preview client",
  domains: cfg.domain,
  dockerfile: Buffer.from(dockerfile, "utf-8").toString("base64"),
  ports_exposes: "80",
  instant_deploy: false,
};

// L'API Coolify refuse de modifier le Dockerfile d'une application existante
// (`PATCH` rejette le champ). Le contenu des maquettes vivant justement dans ce
// Dockerfile, republier veut dire supprimer puis recréer. Sans conséquence pour
// une preview : le domaine est réattaché aussitôt, l'interruption dure le temps
// du build.
if (cfg.application_uuid) {
  await api("DELETE", `/applications/${cfg.application_uuid}`);

  // Coolify traite la suppression en tâche de fond. Recréer trop tôt échoue en
  // 409 : l'ancienne application détient encore le domaine. On attend qu'elle
  // ait vraiment disparu.
  let partie = false;
  for (let i = 0; i < 20 && !partie; i++) {
    const res = await fetch(`${cfg.url}/api/v1/applications/${cfg.application_uuid}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 404) partie = true;
    else await new Promise((r) => setTimeout(r, 3000));
  }
  if (!partie) {
    throw new Error(
      `L'ancienne application ${cfg.application_uuid} n'a pas disparu après 60 s. ` +
        `Vérifier dans Coolify avant de relancer.`
    );
  }
  console.log(`· ancienne version ${cfg.application_uuid} supprimée`);
}

const cree = await api("POST", "/applications/dockerfile", {
  project_uuid: cfg.project_uuid,
  environment_uuid: cfg.environment_uuid,
  server_uuid: cfg.server_uuid,
  ...reglages,
});

const uuid = cree.uuid;
writeFileSync(CONFIG, JSON.stringify({ ...cfg, application_uuid: uuid }, null, 2) + "\n");
console.log(`✓ application ${cfg.application_uuid ? "recréée" : "créée"} — uuid ${uuid}`);

const deploiement = await api("POST", `/deploy?uuid=${uuid}&force=true`);
console.log(`✓ déploiement lancé — ${JSON.stringify(deploiement.deployments ?? deploiement)}`);
console.log(`\nDans une minute environ : ${cfg.domain}`);
