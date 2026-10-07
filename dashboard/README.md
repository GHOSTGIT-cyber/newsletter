# Dashboard newsletter — Lift Foils France

Outil d'administration des newsletters : édition du texte directement dans
l'aperçu, contacts, envoi via Resend, désabonnement en un clic.

État : **étape 4 — l'envoi fonctionne**. Éditeur, contacts, désabonnement en
un clic, envoi à la liste et journal sont en place. Reste à activer le webhook
Resend une fois l'URL publique stable (voir `PLAN.md`).

## Lancer en local

```
cp .env.example .env      # puis remplir COMPTES_INITIAUX (ou SANS_CONNEXION=1 en local)
npm install
npm run dev               # http://localhost:3000, redémarre à chaque modification
```

Node ≥ 22.13 (SQLite intégré, aucun module natif). La base est créée au
premier démarrage dans `data/newsletter.sqlite`, les comptes de
`COMPTES_INITIAUX` avec elle — uniquement si la table est vide.

## Organisation

```
src/server.js        point d'entrée Express
src/db.js            SQLite : ouverture, schéma, migrations, réglages
src/auth.js          comptes (scrypt), sessions par cookie, CSRF, anti-force brute
src/gabarits.js      le moteur : extraction du contenu, rendu (éditeur / aperçu / email)
src/routes/          une route par domaine : auth, newsletters, reglages, medias, public
src/views/           EJS, sobres
src/public/          app.css · editeur.js (page parente) · cadre.js (dans l'iframe)
gabarits/            les maquettes marquées + catalogue.json
```

## Les gabarits

Un gabarit est la maquette HTML de `D:\newsletter`, à l'octet près, plus
quatre attributs :

| Attribut | Sur | Ce que ça rend modifiable |
|---|---|---|
| `data-edit="chemin"` | `p`, `h1`, `h2`, `h3`, `a`, `span` | le texte intérieur |
| `data-edit-multiline` | avec `data-edit` | autorise Entrée (→ `<br />`) |
| `data-edit-href="chemin"` | `a` | l'URL du lien |
| `data-edit-src="chemin"` | `img` | l'image (`chemin.src` et `chemin.alt`) |

Le contenu par défaut est extrait du gabarit lui-même au chargement — rien à
saisir deux fois. Le rendu ne remplace que l'intérieur des zones marquées ;
tout le reste du HTML est recopié tel quel. Le texte saisi est échappé : Anna
ne peut pas insérer de HTML, donc pas casser la mise en page.

Placeholders remplis au rendu : `{{preview_url}}`, `{{unsubscribe_url}}`,
`{{adresse_postale}}` (réglages).

Pour voir ce qu'un gabarit expose :

```
node --no-warnings=ExperimentalWarning -e "import('./src/gabarits.js').then(m => console.log(JSON.stringify(m.gabarit('02').defaut, null, 2)))"
```

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PUBLIC_URL` | URL publique sans slash final — liens d'aperçu et de désabonnement |
| `PORT` | 3000 par défaut |
| `DB_PATH` | fichier SQLite ; en production `/data/newsletter.sqlite` |
| `COMPTES_INITIAUX` | `email:motdepasse,email:motdepasse`, lu si aucun compte n'existe |
| `RESEND_API_KEY` | clé API Resend — sans elle, les envois restent en attente |
| `MAIL_FROM` | expéditeur, ex. `Lift Foils France <news@news.liftfoils.fr>` |
| `DAILY_LIMIT` | plafond quotidien, 90 par défaut (plan gratuit Resend : 100) |
| `RESEND_WEBHOOK_SECRET` | signature du webhook rebonds / plaintes |
| `SANS_CONNEXION` | `1` supprime la page de connexion. **Développement local uniquement** : la base contient des données personnelles |

## L'envoi

- Un email par destinataire : personne ne voit l'adresse des autres.
- Plafond quotidien (`DAILY_LIMIT`, 90 par défaut) commun à toutes les
  newsletters. Au-delà, le reste part le lendemain tout seul — une boucle
  reprend la file toutes les minutes, y compris après un redémarrage.
- Chaque email porte `List-Unsubscribe` et `List-Unsubscribe-Post`, plus une
  version texte générée depuis le contenu.
- Juste avant d'envoyer, le statut du contact est revérifié : quelqu'un qui
  s'est désabonné pendant la campagne ne reçoit rien.
- Une newsletter envoyée passe en lecture seule.

## Le désabonnement

`GET /desabonnement/:jeton` affiche une page avec un bouton,
`POST /desabonnement/:jeton` désabonne sans confirmation — c'est ce que Gmail
appelle. Le jeton fait 256 bits, il est propre à chaque contact et stocké en
base : **il doit rester valable pour toujours**, un email envoyé aujourd'hui
doit encore pouvoir désabonner dans deux ans. D'où l'importance des sauvegardes.

Un contact désabonné, en rebond ou en plainte n'est **jamais** réactivé par un
import ultérieur. C'est la règle la plus importante du dashboard.

## Sauvegarde et restauration

- **Sauvegarde** : Réglages → « Télécharger une sauvegarde » (copie cohérente
  via `VACUUM INTO`). Le fichier contient les jetons de désabonnement de tous
  les emails envoyés : le perdre casse ces liens.
- **Restauration** : arrêter l'application, remplacer `newsletter.sqlite` sur
  le volume (`/data`), redémarrer. Supprimer aussi les éventuels
  `newsletter.sqlite-wal` / `-shm` à côté.

## Déploiement sur Coolify

L'application se déploie depuis le dépôt GitHub `GHOSTGIT-cyber/newsletter`,
répertoire de base `/dashboard`, build pack **Dockerfile**, comme les autres
applications de l'instance.

1. **Supprimer l'application `newsletter-preview`** (Dockerfile inline) qui
   occupe encore `newsletter.bakabi.fr` — le dashboard sert lui-même les aperçus.
2. **+ New Resource → Public Repository** → `https://github.com/GHOSTGIT-cyber/newsletter`,
   branche `main`, base directory `/dashboard`, build pack `Dockerfile`, port `3000`.
3. **Domaine** : `https://newsletter.bakabi.fr` (wildcard Cloudflare, rien à
   créer). Plus tard `newsletter.liftfoils.fr` : un CNAME chez la cliente, et
   changer `PUBLIC_URL`.
4. **Storage → Add volume** : nom `newsletter-data`, destination `/data`.
   Sans ce volume, la base disparaît à chaque redéploiement.
5. **Environment variables** :
   ```
   PUBLIC_URL=https://newsletter.bakabi.fr
   COMPTES_INITIAUX=toi@…:motdepasse,anna@…:motdepasse
   ```
   `COMPTES_INITIAUX` n'est lu qu'au tout premier démarrage (table vide) ; le
   retirer ensuite. Les mots de passe se changent dans Réglages.
   Ne **jamais** poser `SANS_CONNEXION` en production.
6. **Deploy**. Première connexion sur `/connexion`.

Redéploiement : chaque push sur `main` (webhook GitHub → Coolify) ou le bouton
Redeploy. La base sur `/data` est conservée.

En local sans Coolify :

```
docker build -t newsletter-dashboard .
docker run -p 3000:3000 -v newsletter-data:/data --env-file .env newsletter-dashboard
```
