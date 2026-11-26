# Dashboard newsletter — Lift Foils France

Outil d'administration des newsletters : composition bloc par bloc ou édition
d'un gabarit, contacts, envoi via Resend, désabonnement en un clic.

En production : **https://newsletter.liftfoils.fr** (Coolify
`coolify.liftfoils.fr`, application `newsletter-dashboard`, uuid
`jvzmgqgef89u9ye3ybfbylb2`). Chaque push sur `main` redéploie tout seul.

Deux façons de créer une newsletter :

- **Mise en page libre** — on empile des blocs (bannière, titre, texte, image,
  bouton, produit, colonnes, code promo, séparateur, espace), depuis une page
  blanche ou un modèle. C'est la voie normale depuis novembre 2026.
- **Les cinq gabarits** — les maquettes d'origine, dont seuls les textes et
  les images sont modifiables.

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
src/gabarits.js      moteur des gabarits : extraction, rendu (éditeur / aperçu / email)
src/blocs.js         moteur de la mise en page libre : schéma des blocs, validation, rendu
src/envoi.js         file d'envoi, plafond quotidien, envoi différé, boucle Resend
src/routes/          une route par domaine : auth, newsletters, reglages, medias, public, envoi, contacts
src/views/           EJS, sobres ; editeur.ejs (gabarits) et editeur-libre.ejs (blocs)
src/public/          app.css · editeur.js + cadre.js (gabarits) · blocs-editeur.js + cadre-libre.js (blocs)
src/public/icones/   logo Lift blanc et icônes du pied de page, en PNG
gabarits/            les maquettes marquées + catalogue.json
```

## La mise en page libre

`src/blocs.js` décrit chaque type de bloc une seule fois : l'éditeur construit
ses formulaires à partir de cette description, le serveur s'en sert pour
valider ce qu'il reçoit, et le rendu produit le HTML email (tableaux, même
charte et mêmes précautions Outlook que les maquettes).

Le contenu d'une newsletter libre est
`{ meta: { objet, preheader }, blocs: [ { id, type, …champs } ] }`.

À savoir avant d'y toucher :

- **Tout est échappé.** Seules deux marques sont interprétées dans les
  textes : `**gras**` et `[libellé](https://…)`.
- **Pas de `rgba()` dans le HTML des emails.** Outlook l'ignore et le texte
  retombe en noir sur fond noir : utiliser des couleurs hexadécimales opaques.
- **Pas de WebP ni de SVG** dans les images d'un email : Outlook ne les
  affiche pas. JPEG, PNG ou GIF.
- **Les liens `mailto:` sont entourés de `<!--email_off-->`** (`protegerMailto`)
  car Cloudflare, devant le dashboard, les remplacerait sinon par un lien
  `/cdn-cgi/l/email-protection` mort hors navigateur.
- Une adresse email tapée sans `mailto:` est comprise comme un lien mail.
- Les images téléversées vont dans `<dossier de DB_PATH>/medias`, servies
  publiquement sous `/m/` : elles doivent rester accessibles aussi longtemps
  que les emails envoyés existent.

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
| `DAILY_LIMIT` | plafond quotidien **de départ** seulement : la valeur utilisée se règle dans la page d'envoi et vit en base (`reglages.plafond_quotidien`) |
| `RESEND_WEBHOOK_SECRET` | signature du webhook rebonds / plaintes |
| `SANS_CONNEXION` | `1` supprime la page de connexion. **Développement local uniquement** : la base contient des données personnelles |

## L'envoi

- Un email par destinataire : personne ne voit l'adresse des autres.
- **Vagues** : le nombre d'emails par jour se choisit sur la page d'envoi, et
  reste mémorisé pour les campagnes suivantes. Au-delà, le reste part le
  lendemain tout seul — une boucle reprend la file toutes les minutes, y
  compris après un redémarrage. Le plafond est commun à toutes les campagnes.
- **Envoi programmé** : la page d'envoi propose « maintenant » ou une date et
  une heure (heure de Paris, convertie en UTC). La newsletter passe alors au
  statut `programmee`, la file est constituée mais rien ne part avant l'heure.
  « Annuler l'envoi programmé » vide la file et rend la newsletter modifiable,
  tant qu'aucun email n'est parti.
- Compter environ **0,6 s par email** : 1 300 envois prennent un quart d'heure.
- Chaque email porte `List-Unsubscribe` et `List-Unsubscribe-Post`, plus une
  version texte générée depuis le contenu.
- Juste avant d'envoyer, le statut du contact est revérifié : quelqu'un qui
  s'est désabonné pendant la campagne ne reçoit rien.
- Une newsletter envoyée passe en lecture seule.

## Listes d'envoi

Un contact appartient à **au plus une liste** (`contacts.liste`, NULL = aucune).
Elles servent à découper un envoi en plusieurs paquets : Anna a par exemple
réparti sa liste Black Friday 2026 en « envoi 1 » (499), « envoi 2 » (500) et
« envoi 3 » (315), envoyés à trois jours différents.

Pour ranger des adresses dans une liste : page Contacts → Importer, en
remplissant « Ranger dans la liste », ou en donnant un CSV avec une colonne
`liste` (qui prime). **Une adresse déjà connue n'est jamais dupliquée** : elle
change simplement de liste. Un désabonné reste exclu et n'est rangé nulle part.

Sur la page d'envoi, on choisit le paquet avant d'envoyer ; le compteur de
destinataires et le garde-fou de confirmation suivent la liste choisie.

## Statistiques

Activé le 26 novembre 2026, côté Resend **et** côté dashboard :

- **Ouvertures et clics suivis** (`open_tracking` et `click_tracking` sur le
  domaine `news.liftfoils.fr`). Ils imposent un sous-domaine de suivi :
  `track.news.liftfoils.fr` → `links2.resend-dns.com`, CNAME posé sur
  Cloudflare, sans proxy. Un sous-domaine de suivi **ne peut jamais être
  supprimé** chez Resend : ne pas retirer cet enregistrement DNS.
- Le suivi des clics **réécrit les liens** de l'email vers ce sous-domaine.
  C'est le prix à payer pour savoir qui clique.
- Le webhook écoute `sent`, `delivered`, `bounced`, `complained`, `opened` et
  `clicked`. On ne garde que le **premier** instant d'ouverture et de clic
  (`envois.ouvert_le`, `envois.clique_le`) : c'est le taux qui compte.
- Le journal d'une campagne affiche le taux d'ouverture, le taux de clic, et
  pour chaque destinataire s'il a ouvert et cliqué.
- Seuls les emails partis **après** l'activation sont mesurés, et une ouverture
  ne compte que si le lecteur affiche les images : le chiffre réel est toujours
  un peu plus élevé.

## Le désabonnement

`GET /desabonnement/:jeton` affiche une page avec un bouton,
`POST /desabonnement/:jeton` désabonne sans confirmation — c'est ce que Gmail
appelle. Le jeton fait 256 bits, il est propre à chaque contact et stocké en
base : **il doit rester valable pour toujours**, un email envoyé aujourd'hui
doit encore pouvoir désabonner dans deux ans. D'où l'importance des sauvegardes.

Un contact désabonné, en rebond ou en plainte n'est **jamais** réactivé par un
import ultérieur. C'est la règle la plus importante du dashboard.

## Avant un envoi de masse

Vérifications qui ont déjà servi, dans l'ordre :

1. **Plan Resend.** Le plan gratuit plafonne à 100 emails par jour (remis à
   zéro à minuit UTC) et 3 000 par mois ; au-delà les envois échouent et ne
   sont pas repris. Le plan Pro (20 $/mois) lève la limite quotidienne.
2. **Réputation du domaine.** `news.liftfoils.fr` n'a presque rien envoyé :
   monter d'un coup à plus de mille emails est le profil qui alerte les
   filtres. D'où les vagues.
3. **Adresse postale** renseignée dans Réglages : elle est obligatoire dans le
   pied de page et s'affiche telle quelle.
4. **Aucun texte entre crochets** oublié dans le contenu (`[prix promo]`…).
5. **Images** : toutes en JPEG, PNG ou GIF, toutes en HTTP 200, toutes avec
   une description.
6. **Test réel** reçu sur une vraie boîte, lu sur téléphone et sur ordinateur,
   liens cliqués depuis la boîte — l'aperçu de l'éditeur ne déclenche pas les
   liens.

## Sauvegarde et restauration

- **Sauvegarde** : Réglages → « Télécharger une sauvegarde » (copie cohérente
  via `VACUUM INTO`). Le fichier contient les jetons de désabonnement de tous
  les emails envoyés : le perdre casse ces liens.
- **Restauration** : arrêter l'application, remplacer `newsletter.sqlite` sur
  le volume (`/data`), redémarrer. Supprimer aussi les éventuels
  `newsletter.sqlite-wal` / `-shm` à côté.

## Déploiement sur Coolify

**Déjà en place** : instance `coolify.liftfoils.fr`, application
`newsletter-dashboard` (uuid `jvzmgqgef89u9ye3ybfbylb2`) sur
`https://newsletter.liftfoils.fr`. Chaque push sur `main` redéploie ; sinon le
bouton **Redeploy**. La base sur `/data` est conservée.

Pour refaire l'installation depuis zéro : dépôt GitHub
`GHOSTGIT-cyber/newsletter`, répertoire de base `/dashboard`, build pack
**Dockerfile**, port `3000`.

1. **+ New Resource → Public Repository** → `https://github.com/GHOSTGIT-cyber/newsletter`,
   branche `main`, base directory `/dashboard`, build pack `Dockerfile`, port `3000`.
2. **Domaine** : `https://newsletter.liftfoils.fr`, et `PUBLIC_URL` à la même
   valeur. Cette URL se retrouve dans les liens de désabonnement des emails
   déjà envoyés : en changer casse ces liens.
3. **Storage → Add volume** : nom `newsletter-data`, destination `/data`.
   Sans ce volume, la base disparaît à chaque redéploiement — avec elle les
   contacts et les jetons de désabonnement.
4. **Environment variables** :
   ```
   PUBLIC_URL=https://newsletter.liftfoils.fr
   COMPTES_INITIAUX=toi@…:motdepasse,anna@…:motdepasse
   ```
   `COMPTES_INITIAUX` n'est lu qu'au tout premier démarrage (table vide) ; le
   retirer ensuite. Les mots de passe se changent dans Réglages.
   Ne **jamais** poser `SANS_CONNEXION` en production.
5. **Deploy**. Première connexion sur `/connexion`.

En local sans Coolify :

```
docker build -t newsletter-dashboard .
docker run -p 3000:3000 -v newsletter-data:/data --env-file .env newsletter-dashboard
```

## Points ouverts

- **`SANS_CONNEXION=1` est encore posé en production** alors que la base
  contient 1 300 contacts réels : le dashboard s'ouvre sans mot de passe pour
  qui a l'URL. Retirer la variable dans Coolify pour activer la connexion ;
  les comptes de `COMPTES_INITIAUX` sont déjà créés.
- **Un déploiement Coolify peut être incomplet** : le 26 novembre, une
  modification de `src/contacts.js` n'était pas prise alors que les vues
  l'étaient, et l'import rangeait les contacts dans aucune liste sans erreur.
  Un redéploiement forcé a réglé le problème. En cas de comportement
  inexplicable après un push, forcer un redéploiement avant de chercher plus
  loin.
- **Réactivation d'un contact** désabonné, en rebond ou en plainte :
  impossible autrement qu'en le supprimant puis en le réajoutant, ce qui
  change son jeton. C'est volontaire, mais la question reviendra.
