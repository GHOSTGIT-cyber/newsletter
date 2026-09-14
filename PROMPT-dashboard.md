# Prompt — Dashboard newsletter Lift Foils France

> À coller tel quel dans une nouvelle session Claude Code, ouverte dans un
> nouveau dossier (par exemple `D:\newsletter-dashboard`). Tout ce qui suit est
> le contexte dont la session a besoin ; rien n'est à retrouver ailleurs.

---

Je veux construire un dashboard web pour ma cliente Anna, gérante de
**Lift Foils France** (liftfoils.fr, revendeur français des eFoils Lift).
Elle n'est pas technique. Elle a deux besoins, dans cet ordre de priorité :

1. **Modifier elle-même le texte des newsletters** — en cliquant directement
   sur le texte dans un aperçu, pas dans un formulaire à côté. Elle a beaucoup
   de corrections à faire sur les textes existants, et elle veut pouvoir créer
   de nouvelles newsletters à partir des formats existants.
2. **Gérer l'envoi** — importer une liste de contacts, envoyer un test à
   elle-même, envoyer à la liste, voir ce qui est parti.

Lis tout ce qui suit avant de commencer, puis propose-moi un plan avant de
coder. Les décisions marquées « tranchée » ne sont pas à rediscuter.

## 1. Ce qui existe déjà

Le dossier `D:\newsletter` contient le travail préparatoire. **Copie-le, ne le
modifie pas** — c'est la référence. Dedans :

- **Cinq maquettes email** en HTML codé à la main, tables imbriquées, styles
  inline, compatibles Gmail / Outlook / Apple Mail, 600 px de large :
  - `01-guide-taille.html` — guide de choix de taille LIFT5
  - `02-lancement.html` — annonce de la newsletter
  - `03-course-frech.html` — événement, championnat eFoil (périmé après le 13/09)
  - `04-sections-site.html` — visite guidée des 7 sections du site
  - `05-maintenance.html` — entretien, hivernage, atelier
- `index.html` — page de présentation des cinq côte à côte
- `send.js` — envoi via l'API Resend : un email par destinataire, journal
  `.sent.log`, plafond quotidien, lecture de liste CSV/TXT, en-tête
  `List-Unsubscribe` en `mailto:`. **Ses fonctions de lecture de liste et
  d'envoi unitaire sont réutilisables telles quelles.**
- `publish.js` — publie les maquettes statiques sur Coolify (voir §4)
- `verifier-dns.js` — vérifie SPF / DKIM / MX / DMARC avant validation Resend
- `README.md` — section 4 : guide anti-spam complet, à lire
- `refs/*.eml` — trois vraies newsletters de Lift Foils corporate, pour le ton
- `.env.example`, `coolify.json`, `package.json` (scripts `dry`, `send`,
  `publish:preview`, `dns`)

Les maquettes contiennent deux placeholders remplis à l'envoi :
`{{preview_url}}` (lien « voir dans le navigateur ») et `{{unsubscribe_url}}`.

### Charte graphique, vérifiée sur liftfoils.fr

- Polices : **Oswald** (titres, capitales, condensé) + **Assistant** (texte),
  chargées depuis Google Fonts, fallback Arial Narrow / Arial
- Accent : **`#1cc4bf`** (token `--lf-accent` du site), noir `#000000`,
  encre `#111111`, gris `#6a6a6a`, fond `#e8e8e8`
- Logo : `https://liftfoils.fr/wp-content/uploads/2022/01/LIFT_retailer_white.png`
- Coordonnées réelles : `info@liftfoils.fr`, 06 35 30 50 67, SAV et stock à
  Cannes. Adresse postale complète : **inconnue, à demander à Anna**
- Réseaux : facebook.com/eFoilCotedAzur, instagram.com/efoil_cotedazur,
  youtube.com/channel/UC-YtLQ9BhQ1UZF3sAk-1OGg
- L'API REST WordPress de liftfoils.fr est **publique** :
  `/wp-json/wp/v2/media` (945 images, avec toutes les variantes
  redimensionnées), `/wp-json/wp/v2/product_cat`, `/wp-json/wp/v2/pages`.
  Utile pour un sélecteur d'images dans l'éditeur.

Le dashboard lui-même n'a pas à reprendre la charte des emails — c'est un
outil d'administration, pas une page de marque. Sobre et lisible suffit.

## 2. Infrastructure — tranchée

- **Hébergement : Coolify**, instance `https://coolify.bakabi.fr`, serveur
  unique. Toutes les applications existantes se déploient **depuis un dépôt
  GitHub sous `GHOSTGIT-cyber`**, build pack `dockerfile`. Faire pareil :
  un dépôt `GHOSTGIT-cyber/newsletter-dashboard`, un `Dockerfile` à la racine.
  Le token API Coolify est dans `D:\newsletter\.env` (`COOLIFY_TOKEN`) ; les
  uuid du projet et de l'environnement sont dans `coolify.json`.
  **`gh` n'est pas installé** sur cette machine et aucun identifiant GitHub
  n'est accessible en ligne de commande : demande-moi de créer le dépôt et de
  faire le premier push, ou de te donner un accès, plutôt que de chercher un
  contournement.
- **Le DNS de `*.bakabi.fr` est un wildcard Cloudflare** : n'importe quel
  sous-domaine résout déjà, aucun enregistrement à créer.
- **Cloudflare obfusque les adresses email** dans les pages servies
  (`/cdn-cgi/l/email-protection`). Entourer tout `mailto:` de
  `<!--email_off-->…<!--email_on-->`, ou l'affichage montre `[email protected]`.
- **Stack : Node 22, sans framework front lourd.** Un serveur Node (Express ou
  Fastify), des templates côté serveur, du JavaScript vanilla pour l'éditeur.
  Pas de React, pas de build front — le projet doit rester lisible par une
  personne seule dans deux ans.
- **Base : SQLite**, un seul fichier, monté sur un volume persistant Coolify.
  Pas de Postgres, pas de service supplémentaire.
- **Envoi : API Resend**, déjà en place, région EU. Plan gratuit : **100
  emails par jour**, 3 000 par mois, un domaine vérifié. Le dashboard doit
  respecter ce plafond et reporter le reste au lendemain, comme `send.js`.
- **Domaine d'envoi : `news.liftfoils.fr`** (sous-domaine dédié — le SPF de
  `liftfoils.fr` n'autorise qu'OVH et sert aux emails de commande WooCommerce,
  on n'y touche pas). Expéditeur : `Lift Foils France <news@news.liftfoils.fr>`.

## 3. Ce qu'il faut construire

### 3.1 L'éditeur — le cœur

Le besoin exact d'Anna : *cliquer sur une phrase dans l'aperçu et la changer*.

Approche demandée : **marquer les zones éditables dans le HTML des maquettes**
avec un attribut (`data-edit="hero.titre"`, `data-edit="bloc2.texte"`…). Le
contenu réel de chaque newsletter vit dans un **JSON structuré** stocké en
base ; le HTML est un gabarit qui se remplit à partir de ce JSON. L'éditeur
affiche le rendu dans une iframe et rend les zones marquées éditables en
**texte seul** — pas de gras, pas de couleur, pas de mise en forme, sinon
Anna casse la mise en page sans le vouloir. À chaque modification, le JSON
est mis à jour et sauvegardé.

Ce qui doit être éditable : titres, paragraphes, libellés de boutons, URL des
boutons, objet et préheader de l'email, images (choix parmi la médiathèque
liftfoils.fr via l'API WordPress, ou URL directe). Ce qui ne doit **pas**
l'être : la structure, les couleurs, le pied de page légal.

Les cinq maquettes existantes deviennent des **gabarits**. Une newsletter est
une instance d'un gabarit avec son propre JSON. Anna peut dupliquer une
newsletter existante, la renommer, modifier, enregistrer en brouillon.

Convertir les cinq maquettes en gabarits est le premier chantier et le plus
gros. Le faire proprement : chaque phrase visible doit être atteignable.

### 3.2 Les contacts

- Import CSV / TXT (réutiliser `readList()` de `send.js`, qui gère les
  en-têtes, les doublons, la casse et les formats `"Nom" <adresse>`)
- Ajout et suppression à la main
- Statut par contact : **actif / désabonné / rebond / plainte**, avec date et
  origine du statut. Un contact désabonné ne reçoit plus jamais rien, même
  s'il réapparaît dans un import ultérieur — c'est le point le plus important
  de tout le dashboard, et la raison principale de le construire.
- Champ « consentement » avec date, à renseigner à l'import

### 3.3 Le désabonnement — obligatoire

Gmail et Yahoo exigent un désabonnement en un clic. Le dashboard doit exposer :

- `GET /desabonnement/:jeton` — page de confirmation lisible, un bouton
- `POST /desabonnement/:jeton` — désabonne sans confirmation (c'est ce que
  Gmail appelle via l'en-tête `List-Unsubscribe-Post`)
- Le jeton est signé et propre à chaque contact : personne ne peut désabonner
  quelqu'un d'autre en devinant une URL

À l'envoi, chaque email reçoit ses en-têtes
`List-Unsubscribe: <https://…/desabonnement/JETON>, <mailto:…>` et
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, et le placeholder
`{{unsubscribe_url}}` est remplacé par l'URL au jeton du destinataire.

**L'URL de désabonnement doit être stable pour toujours** : un email envoyé
aujourd'hui doit encore pouvoir désabonner dans deux ans. Choisir le domaine
du dashboard en conséquence — voir §5.

### 3.4 L'envoi

- Bouton « m'envoyer un test » → envoie la newsletter à l'adresse d'Anna
- Bouton « envoyer à la liste » → confirmation explicite avec le nombre de
  destinataires actifs, puis envoi **un email par contact**, dans les limites
  du plafond quotidien, avec reprise automatique le lendemain pour le reste
- Barre de progression ou journal en direct pendant l'envoi
- Une newsletter envoyée passe en lecture seule (statut « envoyée », date,
  nombre d'envois, échecs)
- **Webhook Resend** (`POST /webhooks/resend`) : les événements `bounced` et
  `complained` mettent le contact au statut correspondant. Vérifier la
  signature du webhook.

### 3.5 Le journal

Une page par newsletter envoyée : qui a reçu, qui a rebondi, qui s'est
désabonné depuis. Rien de plus — pas de tracking d'ouverture ni de clic pour
l'instant.

### 3.6 L'accès

Deux comptes, Anna et moi, mot de passe hashé, session par cookie. Pas
d'inscription publique, pas d'OAuth. Une page de connexion, c'est tout.

## 4. Ce qui remplace quoi

- Le dashboard **remplace `send.js`** pour l'envoi réel. `send.js` reste
  utile en ligne de commande pour un test rapide.
- Le dashboard **remplace la preview statique** actuellement servie sur
  `https://newsletter.bakabi.fr` par `publish.js` : il sert lui-même les
  aperçus des newsletters (route publique en lecture seule, `noindex`), ce qui
  remplit `{{preview_url}}`. Une fois le dashboard en ligne, l'application
  Coolify `newsletter-preview` (dockerfile inline) peut être supprimée.

## 5. Points à trancher avec moi avant de coder

1. **Le domaine du dashboard.** `newsletter.bakabi.fr` est disponible
   immédiatement (wildcard). Mais l'URL de désabonnement y sera figée à vie,
   sur *mon* domaine et pas celui de la cliente. `newsletter.liftfoils.fr`
   serait plus propre, mais suppose d'ajouter un enregistrement DNS chez la
   cliente. Recommande-moi une option et dis pourquoi.
2. **La conversion des gabarits.** Cinq maquettes à découper en zones
   éditables. Propose le format du JSON et le découpage d'une maquette avant
   de faire les cinq.
3. **Le webhook Resend** demande une URL publique pour être configuré : à
   activer une fois le dashboard déployé, pas avant.

## 6. Ce qui n'est pas dans le périmètre

- Pas d'éditeur de mise en page : Anna change le texte et les images, pas la
  structure. Créer un nouveau *format* reste un travail de développement.
- Pas de tracking d'ouverture ou de clic.
- Pas de segmentation de la liste : une liste, tous les actifs.
- Pas d'automatisation (séquences, envois programmés).
- Pas de multi-clients : un seul expéditeur, Lift Foils France.

## 7. Livrables

1. Un plan écrit, validé par moi avant le code
2. Le dépôt GitHub avec `Dockerfile`, `README` d'exploitation (variables
   d'environnement, sauvegarde du fichier SQLite, procédure de restauration)
3. L'application déployée sur Coolify, accessible, avec les deux comptes créés
4. Les cinq gabarits convertis, chaque phrase éditable, vérifiés dans
   l'éditeur
5. Un envoi de test réel reçu sur Gmail et Outlook, avec l'en-tête
   `List-Unsubscribe-Post` présent et le désabonnement fonctionnel
   (vérifier avec « Afficher l'original » dans Gmail)

Rappel de contexte pour le ton des emails : lis les trois `.eml` de `refs/`.
Phrases courtes, deuxième personne, conseil avant vente. Les gabarits
existants suivent déjà ce ton ; Anna va surtout corriger des tournures.
