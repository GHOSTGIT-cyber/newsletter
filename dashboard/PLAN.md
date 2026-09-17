# Plan — Dashboard newsletter Lift Foils France

Version 1 · 2026-09-14 · à valider avant tout code.
Référence : `D:\newsletter` (copiée, jamais modifiée). Ce dossier accueille le
dépôt `GHOSTGIT-cyber/newsletter-dashboard`.

---

## A. Les trois points à trancher (§5 du brief)

### A1. Domaine du dashboard → `newsletter.liftfoils.fr`, avec `newsletter.bakabi.fr` pendant le développement

1. L'URL de désabonnement est figée dans chaque email envoyé, pour toujours.
   Sur `bakabi.fr`, Anna dépend de toi (et de ton domaine) tant que le dernier
   email envoyé existe dans une boîte. Le jour où `bakabi.fr` tombe, les liens
   meurent et les gens cliquent « spam » — exactement ce que le dashboard est
   censé empêcher.
2. **La cliente doit de toute façon toucher son DNS** pour `news.liftfoils.fr`
   (SPF, DKIM, MX — README §4.1). Un `CNAME newsletter.liftfoils.fr → <serveur
   Coolify>` posé dans la même session ne coûte rien de plus. Coolify pose le
   certificat Let's Encrypt seul.
3. On ne peut pas réutiliser `news.liftfoils.fr` pour le dashboard : ce nom
   porte déjà des TXT/MX, et un CNAME ne cohabite avec rien d'autre au même
   nom. D'où un nom distinct.

Mise en œuvre : l'URL publique est une variable `PUBLIC_URL`. On développe et on
valide sur `newsletter.bakabi.fr` (wildcard, immédiat) ; les tests envoyés à
Anna peuvent porter des liens bakabi.fr. **Le premier envoi réel à la liste ne
part qu'une fois `newsletter.liftfoils.fr` en ligne** — les liens sont générés
au moment de l'envoi, changer de domaine avant ne coûte rien. Si la cliente
traîne sur le DNS, on part sur bakabi.fr en connaissance de cause : c'est alors
un engagement à garder ce sous-domaine vivant des années.

### A2. Format du JSON et découpage — sur `02-lancement` (détail en §D)

Principe : le gabarit est **le HTML de la maquette, à l'octet près, plus des
attributs `data-edit`**. Le contenu par défaut est *extrait* du gabarit ; le
rendu remplace uniquement l'intérieur des zones marquées. Aucun parseur HTML
ne réécrit le document : hors zones marquées, le HTML reste identique, donc
compatible Outlook/Gmail comme aujourd'hui.

### A3. Webhook Resend → après déploiement

Phase 5, une fois l'URL publique stable. La signature est vérifiée (format
Svix : `svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256 sur le corps
brut) avec `node:crypto`, sans dépendance.

---

## B. Une petite déviation à valider

**Jeton de désabonnement : aléatoire et stocké, plutôt que signé.** Le brief dit
« signé ». Un jeton signé dépend d'un secret : si le secret est perdu ou tourné
dans deux ans, tous les liens envoyés meurent. Un jeton aléatoire de 256 bits
(`crypto.randomBytes(32)`, base64url), unique par contact, stocké en base :
impossible à deviner (même garantie), et il survit avec la sauvegarde SQLite,
sans secret à protéger. Si tu tiens au signé, c'est dix lignes de plus.

---

## C. Architecture

| Couche | Choix | Pourquoi |
|---|---|---|
| Serveur | **Node 22 + Express 5** | le plus lu, le plus documenté ; lisible seul dans deux ans |
| Templates admin | **EJS** | HTML + `<%= %>`, rien à apprendre |
| Base | **`node:sqlite`** (intégré à Node ≥ 22.13) | zéro module natif à compiler dans Docker, un seul fichier `/data/newsletter.sqlite` |
| Éditeur | JS vanilla, iframe + `contenteditable="plaintext-only"` | texte seul par construction ; le rendu échappe tout HTML, Anna ne peut rien casser |
| Mots de passe | `crypto.scrypt` | intégré |
| Sessions | cookie `HttpOnly SameSite=Strict` → table `sessions` | révocable, rien en mémoire |
| CSRF | SameSite=Strict + contrôle de l'en-tête `Origin` sur les POST | suffisant pour deux comptes |
| Envoi | file `envois` en base + boucle en process (600 ms entre envois, 3 tentatives sur 429/5xx, plafond `DAILY_LIMIT`=90) | reprise automatique au redémarrage et le lendemain ; même logique que `send.js` |
| Progression | polling JSON toutes les 2 s | simple, fiable derrière Traefik/Cloudflare |
| Docker | `node:22-alpine`, `WORKDIR /app`, volume `/data` | build pack `dockerfile` comme les autres apps |

Dépendances npm : `express`, `ejs`, `cookie-parser`. C'est tout.

### Modèle de données

```
utilisateurs  id, email, mdp_hash, cree_le
sessions      id, utilisateur_id, expire_le
contacts      id, email UNIQUE, nom, statut (actif|desabonne|rebond|plainte),
              statut_date, statut_origine (import|manuel|lien|one-click|webhook),
              consentement_date, consentement_source, jeton UNIQUE, cree_le
newsletters   id, id_public (aléatoire, pour l'aperçu), gabarit, nom, objet,
              contenu (JSON), statut (brouillon|envoi|envoyee),
              cree_le, modifie_le, envoyee_le
envois        id, newsletter_id, contact_id, email, statut (attente|envoye|livre|echec),
              resend_id, erreur, envoye_le
evenements    id, resend_id, type, recu_le, brut (JSON)      ← journal webhook
reglages      cle, valeur   ← adresse postale, email de test d'Anna, plafond
```

Les gabarits ne sont **pas** en base : `gabarits/*.html` dans le dépôt, versionnés.

### Routes

```
Public
  GET  /connexion · POST /connexion · POST /deconnexion
  GET  /n/:id_public                    aperçu lecture seule, noindex  → {{preview_url}}
  GET  /desabonnement/:jeton            page de confirmation, un bouton
  POST /desabonnement/:jeton            désabonne sans confirmation (One-Click)
  POST /webhooks/resend                 signature vérifiée, corps brut

Connecté
  GET  /                                liste des newsletters
  POST /newsletters (nouvelle depuis gabarit) · /:id/dupliquer · /:id/renommer · /:id/supprimer
  GET  /newsletters/:id                 l'éditeur
  GET  /newsletters/:id/cadre           HTML rendu pour l'iframe (data-edit conservés + script)
  PATCH /api/newsletters/:id/contenu    { "chemin": "titre.h1", "valeur": "…" }  (debounce 500 ms)
  POST /newsletters/:id/test            envoi à l'adresse de test
  POST /newsletters/:id/envoyer         confirmation avec le nombre d'actifs, puis file
  GET  /api/newsletters/:id/progression
  GET  /newsletters/:id/journal         qui a reçu / rebondi / s'est désabonné depuis
  GET  /contacts · POST /contacts/import · POST /contacts · POST /contacts/:id/supprimer
  GET  /reglages · POST /reglages       adresse postale, email test, mot de passe
  GET  /reglages/sauvegarde             télécharge le fichier SQLite
  GET  /api/medias?q=&page=             proxy vers liftfoils.fr/wp-json/wp/v2/media (cache 1 h)
```

---

## D. Le moteur de gabarits — découpage de `02-lancement`

### D1. Marquage dans le HTML

Quatre attributs, rien d'autre :

| Attribut | Sur | Ce que ça édite |
|---|---|---|
| `data-edit="chemin"` | `p`, `h1`, `h2`, `a`, `span` | le texte intérieur (échappé au rendu) |
| `data-edit-multiline` | avec `data-edit` | autorise Entrée → `<br />` (titres sur deux lignes, prix) |
| `data-edit-href="chemin"` | `a` | l'URL du lien |
| `data-edit-src="chemin"` | `img` | l'image ; `chemin.src` + `chemin.alt` |

Le rendu est une substitution ciblée sur l'élément marqué, pas une
re-sérialisation. Trois sorties du même moteur :

- **cadre éditeur** : attributs conservés + script injecté
- **aperçu public** : attributs retirés, `{{preview_url}}` rempli, `{{unsubscribe_url}}` → page générique
- **email** : attributs retirés, placeholders par destinataire, `{{adresse_postale}}` depuis les réglages,
  **+ version texte** générée depuis le JSON dans l'ordre de lecture (README §4.6)

Le JSON par défaut d'un gabarit est extrait automatiquement
(`node scripts/extraire.js 02`) : pas de double saisie, le HTML reste la seule
source du texte initial. Les entités (`&nbsp;`, `&euro;`) sont décodées à
l'extraction et ré-encodées au rendu.

### D2. Le JSON de `02-lancement` (≈ 35 zones)

```json
{
  "meta":      { "objet": "On lance la newsletter Lift Foils France",
                 "preheader": "Une fois par mois. Les nouveautés, les guides techniques, et les dates d'essai en avant-première." },
  "bandeau":   { "texte": "Emplacement offre · à définir avant envoi" },
  "hero":      { "image": { "src": "https://liftfoils.fr/wp-content/uploads/2021/03/0162_…-1280x853.jpg",
                            "alt": "Rider en eFoil Lift, virage appuyé" } },
  "titre":     { "surtitre": "Numéro 01",
                 "h1": "On lance\nla newsletter.",
                 "p1": "Vous avez roulé avec nous, essayé une planche, …",
                 "p2": "Une fois par mois, pas plus. …" },
  "promesses": { "items": [
                   { "titre": "Les nouveautés, en avance",      "texte": "Nouvelles ailes, …" },
                   { "titre": "Du vrai contenu technique",      "texte": "Choisir son aile, …" },
                   { "titre": "Les dates d'essai et de course", "texte": "Les sessions se remplissent vite. …" } ],
                 "cta": { "label": "Découvrir la gamme", "href": "https://liftfoils.fr/efoil-lift5/" } },
  "gamme":     { "surtitre": "Ce qu'on distribue", "h2": "Toute la gamme Lift.",
                 "produits": [
                   { "image": { "src": "…LIFT5…png", "alt": "LIFT5" }, "nom": "LIFT5",
                     "desc": "Carbone, trois volumes\nà partir de 13 333 €",
                     "label": "Voir", "href": "https://liftfoils.fr/efoil-lift5/" },
                   { "…": "LIFTX" }, { "…": "Ailes & mâts" }, { "…": "Accessoires" } ] },
  "contact":   { "surtitre": "Une question, un projet", "h2": "Parlez à quelqu'un\nqui ride.",
                 "texte": "Notre équipe ride ces planches. …",
                 "cta": { "label": "Nous contacter", "href": "https://liftfoils.fr/contact/" } },
  "signature": { "titre": "On se voit sur l'eau.", "texte": "Une question ? Écrivez à" }
}
```

Dans le HTML : `data-edit="promesses.items.0.titre"`, `data-edit-src="gamme.produits.2.image"`, etc.

**Ce qui reste verrouillé sur 02** — et le sera de la même façon sur les cinq :
la ligne « Voir dans le navigateur », le logo, la barre de navigation (eFOILS /
PLANCHES / AILES / ACCESSOIRES), les numéros 01/02/03 des promesses, l'adresse
`info@liftfoils.fr` (avec son `<!--email_off-->`), tout le footer (réseaux,
mention « vous recevez cet email… », coordonnées, désabonnement). L'adresse
postale manquante devient `{{adresse_postale}}`, remplie depuis les réglages :
une saisie d'Anna, cinq gabarits à jour.

### D3. Les quatre autres, en volume

| Gabarit | Sections | Blocs texte | Images | Liens | Particularité |
|---|---|---|---|---|---|
| 01 guide-taille | 13 | 31 | 8 | 13 | tableau de specs → chaque cellule éditable, structure fixe |
| 03 course | 11 | 29 | 6 | 16 | périmé mais converti tel quel : c'est le format « événement », dates et lieu éditables |
| 04 sections-site | 15 | 44 | 9 | 24 | 7 blocs répétés → `sections.items[0..6]` |
| 05 maintenance | 15 | 42 | 6 | 22 | 7 blocs répétés → `etapes.items[0..6]` |

Ordre de grandeur : **~200 zones** au total. Vérification en fin de chantier :
un script compare le texte visible du gabarit avec son JSON par défaut et liste
toute phrase non couverte par un `data-edit`.

### D4. L'éditeur, côté Anna

- L'iframe charge le rendu ; le script met `contenteditable="plaintext-only"`
  sur chaque zone texte, intercepte le collage (texte brut uniquement), bloque
  Entrée sauf sur `data-edit-multiline`. Liseré discret au survol, marqué au focus.
- Chaque `input` → `postMessage` au parent → `PATCH …/contenu` (debounce 500 ms).
  Indicateur « Enregistré · 14:32 » en haut. Pas de bouton « Sauver » à oublier.
- Clic sur un lien ou un bouton : navigation bloquée ; une petite bulle s'ouvre
  **sur l'élément** avec le champ URL. Idem pour une image : bulle avec la
  médiathèque liftfoils.fr (recherche, vignettes, pagination, variante ≥ largeur
  cible) ou un champ URL directe.
- Objet et préheader : bandeau « Objet / Aperçu » au-dessus de l'iframe, dans le
  même style éditable — l'exception justifiée, l'objet n'est pas dans le HTML.
- Une newsletter `envoyee` s'ouvre en lecture seule, avec un bouton « Dupliquer ».

---

## E. Contacts, désabonnement, envoi

- **Import** : `readList()` de `send.js` réutilisée, étendue pour capter le nom
  (`"Nom" <adresse>` ou colonne `nom`/`prenom`). Formulaire : fichier + source
  du consentement + date. Règle absolue : **un contact en `desabonne`, `rebond`
  ou `plainte` n'est jamais réactivé par un import** — compté « ignoré » dans le
  rapport d'import.
- **Désabonnement** : `GET` page sobre, un bouton ; `POST` désabonne
  immédiatement, `statut_origine` = `one-click` ou `lien`. Jeton inconnu → 404
  neutre. Toujours 200 même si déjà désabonné.
- **Envoi** : « M'envoyer un test » (adresse dans les réglages, objet préfixé
  `[TEST]`). « Envoyer à la liste » → modale avec le nombre d'actifs et le
  calcul « N aujourd'hui, le reste demain » → lignes `envois` → la boucle
  démarre. En-têtes par email :
  ```
  List-Unsubscribe: <https://…/desabonnement/JETON>, <mailto:news@news.liftfoils.fr?subject=Desabonnement>
  List-Unsubscribe-Post: List-Unsubscribe=One-Click
  ```
  Plafond quotidien commun à toutes les newsletters, tick toutes les 60 s pour
  la reprise. Redémarrage du conteneur = reprise là où ça s'est arrêté.
- **Webhook** : `email.bounced` (type hard) → `rebond` ; `email.complained` →
  `plainte` ; `email.delivered` → l'envoi passe `livre`. Tout événement est
  gardé brut dans `evenements`.
- **Journal** : par newsletter envoyée, tableau contacts × statut d'envoi ×
  statut actuel du contact, avec filtres.

---

## F. Phases et jalons

| # | Chantier | Tu valides sur | Ce que j'attends de toi |
|---|---|---|---|
| 0 | Squelette : dépôt, Dockerfile, Express, SQLite, connexion, réglages | `localhost:3000`, tu te connectes | **créer `GHOSTGIT-cyber/newsletter-dashboard` et faire le premier push** |
| 1 | Moteur de gabarits + éditeur, **sur 02 seulement** | tu cliques une phrase, tu la changes, tu recharges, elle est là | ton retour sur l'ergonomie avant d'industrialiser |
| 2 | Les quatre autres gabarits + script de couverture | chaque phrase des cinq est atteignable | — |
| 3 | Contacts, import, désabonnement GET/POST | import d'un CSV réel, un désabonné qui résiste à un ré-import | un export de contacts (même partiel) |
| 4 | File d'envoi, test, envoi liste, progression, journal, webhook (code) | test reçu sur Gmail + Outlook, `List-Unsubscribe-Post` visible dans « Afficher l'original » | l'adresse email d'Anna pour le test |
| 5 | Déploiement Coolify, volume, comptes, `newsletter.bakabi.fr`, webhook Resend activé, DNS `news.liftfoils.fr` vérifié avec `verifier-dns.js` | envoi de test réel depuis la prod, désabonnement fonctionnel | mots de passe initiaux (ou je les génère) ; DNS côté cliente |

Chaque phase = un commit poussé, un mot de ma part, ta validation.

---

## G. Exploitation (contenu du README à livrer)

- Variables : `PUBLIC_URL`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM`,
  `DB_PATH` (`/data/newsletter.sqlite`), `SESSION_SECRET`, `DAILY_LIMIT` (90),
  `COMPTES_INITIAUX` (`email:motdepasse,email:motdepasse`, lu seulement si la
  table est vide).
- Sauvegarde : bouton « Télécharger une sauvegarde » (copie cohérente via
  `db.backup()`), ou `docker cp` du volume. Restauration : arrêter, remplacer le
  fichier, redémarrer. Le fichier contient les jetons de désabonnement — **le
  perdre casse les liens de tous les emails déjà envoyés**, d'où la sauvegarde
  en un clic.
- Suppression de l'app `newsletter-preview` une fois `/n/:id` en service.

---

## H. Hors périmètre, confirmé

Pas d'éditeur de mise en page, pas de tracking ouverture/clic, pas de
segmentation, pas de programmation d'envoi, un seul expéditeur.
