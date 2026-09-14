# Maquettes newsletter — Lift Foils France

Trois maquettes d'email prêtes à faire valider, plus de quoi les publier et les
envoyer en test.

```
index.html               page de présentation (les 3 côte à côte)
01-guide-taille.html     guide de choix LIFT5
02-lancement.html        lancement de la newsletter
03-course-frech.html     FRECH Villefranche, 13-15 septembre
send.js                  envoi via l'API Resend
publish.js               mise en ligne de la preview sur Coolify
coolify.json             coordonnées du projet Coolify (pas de secret)
.env.example             modèle de configuration, à copier en .env
contacts.example.csv     format attendu pour une liste de destinataires
.sent.log                journal des envois (créé au premier envoi)
```

Les emails contiennent deux placeholders : `{{preview_url}}` et
`{{unsubscribe_url}}`. `send.js` les remplit à l'envoi, `publish.js` à la mise
en ligne — ils ne sont jamais visibles par le destinataire.

---

## 1. Publier la preview

La preview est en ligne sur **https://newsletter.bakabi.fr** — c'est le lien à
envoyer au client. `index.html` est servi par défaut, les trois maquettes sont
présentées côte à côte.

Republier après avoir modifié une maquette :

```bash
npm run publish:dry        # génère le Dockerfile en local, n'envoie rien
npm run publish:preview    # met en ligne, ~1 min de build
```

### Comment ça marche

Toutes les autres applications Coolify du serveur se déploient depuis un dépôt
GitHub. Pour quatre pages statiques c'est disproportionné : `publish.js` gzippe
les fichiers, les embarque dans un Dockerfile `nginx:alpine` généré à la volée,
et pilote l'API Coolify. Pas de dépôt, pas de commit, une commande.

L'API Coolify refuse de modifier le Dockerfile d'une application existante — le
`PATCH` rejette le champ. Republier signifie donc supprimer puis recréer
l'application. Sans conséquence ici : le domaine est réattaché aussitôt et
l'interruption dure le temps du build. Le nouvel uuid est réécrit dans
`coolify.json`.

### Ce qui est déjà réglé

- **DNS** — un wildcard `*.bakabi.fr` existe déjà sur Cloudflare, rien à créer
  pour un nouveau sous-domaine.
- **TLS** — géré à la périphérie Cloudflare, comme les autres sous-domaines.
- **Indexation** — `robots.txt` en `Disallow: /` et en-tête
  `X-Robots-Tag: noindex, nofollow`. Une preview client n'a rien à faire dans
  Google.
- **Placeholders** — `{{preview_url}}` et `{{unsubscribe_url}}` sont remplis à
  la publication comme à l'envoi, la version en ligne n'affiche pas d'accolades.

> **Ne pas héberger la preview sur `newsletter.liftfoils.fr`.** Cela suppose un
> accès DNS chez le client avant qu'il ait validé quoi que ce soit, et ce
> sous-domaine doit rester disponible pour l'envoi réel.

---

## 2. Envoyer les maquettes en test

### Vérifier un domaine dans Resend

Créer un compte, ajouter **ton** domaine, poser les enregistrements DNS
fournis (SPF, DKIM, et le `MX` du sous-domaine de retour). Vérification en
quelques minutes.

Le domaine du client n'est pas nécessaire à ce stade — et c'est voulu : tu
envoies la maquette en tant que prestataire, ce qui est normal, et tu ne touches
pas à la réputation email de `liftfoils.fr` avant validation.

### Configurer

```bash
cp .env.example .env      # puis remplir les trois valeurs
```

`PREVIEW_BASE` est l'URL de la preview publiée à l'étape 1. C'est elle qui
remplit le lien « voir dans le navigateur » de chaque email.

### Envoyer à une ou deux adresses

```bash
npm run dry  -- --to toi@tondomaine.fr       # simulation, aucun envoi
npm run send -- --to toi@tondomaine.fr       # test sur soi d'abord
npm run send -- --to client@exemple.fr       # puis le client
```

**Toujours s'envoyer les emails à soi-même en premier**, idéalement sur une
adresse Gmail et une adresse Outlook. C'est là qu'on voit ce qui casse.

### Envoyer à une liste transmise

Déposer le fichier reçu dans le dossier, puis :

```bash
npm run dry  -- --list contacts.csv --only 03    # toujours simuler d'abord
npm run send -- --list contacts.csv --only 03
```

`--list` accepte un `.csv` (colonne `email`, ou première colonne qui ressemble
à une adresse) comme un `.txt` à une adresse par ligne. Un export WooCommerce,
Mailchimp ou Excel passe tel quel. Les doublons, la casse et les formats
`"Nom" <adresse@x.fr>` sont traités.

Trois garde-fous, utiles dès que la liste dépasse quelques adresses :

- **Un email par personne.** Chaque destinataire reçoit son propre message ;
  personne ne voit l'adresse des autres.
- **Aucun doublon.** Chaque envoi réussi est écrit dans `.sent.log`. Relancer
  la même commande n'envoie qu'aux adresses restantes — utile si la connexion
  coupe en cours de route. `--force` passe outre.
- **Plafond quotidien.** Au-delà de 90 envois dans la journée, le reste est
  reporté et la commande le dit. Relancer le lendemain reprend la suite.
  `--max 250` relève le plafond si tu es passé au plan Pro.

Options complètes : `--only 01|02|03` pour une seule maquette, `--dry` pour
simuler, `--max N` pour le plafond du jour, `--force` pour réenvoyer.

> `.env`, `.sent.log` et tout fichier `contacts*.csv` sont exclus du dépôt par
> `.gitignore` : une liste de contacts ne doit jamais partir sur GitHub.

---

## 3. Limites à connaître

**Resend, plan gratuit (2026)** : 3 000 emails par mois, **100 par jour**,
1 domaine vérifié, 30 jours de rétention des logs. Largement suffisant pour la
validation.

Pour l'envoi réel à environ 500 contacts, le plafond de 100/jour impose soit
d'étaler sur cinq jours — ce qui est de toute façon la bonne pratique de montée
en réputation — soit de passer au plan Pro à 20 $/mois.

**Point RGPD** : Resend peut router l'envoi depuis l'Irlande, mais les données
de compte et les logs restent aux États-Unis. Pour un fichier client français,
Brevo (société française, hébergement UE) est plus confortable et dispose d'une
API équivalente. À trancher avant la mise en production, pas avant le test.

---

## 4. Déployer une newsletter qui n'atterrit pas en spam

Le classement en spam ne se joue pas d'abord sur le contenu de l'email — c'est
ce qu'on croit, et c'est faux. Il se joue sur trois choses, dans cet ordre :
**prouver que tu es bien toi** (authentification), **prouver que les gens
veulent te lire** (engagement), **prouver que tu es régulier** (réputation). Le
contenu n'arrive qu'en quatrième position.

### 4.1 L'authentification — la condition d'entrée

Depuis février 2024, Gmail et Yahoo rejettent les envois groupés non
authentifiés. Ce n'est plus une optimisation, c'est un prérequis. Trois
enregistrements DNS :

| Enregistrement | Ce qu'il prouve |
|---|---|
| **SPF** | quels serveurs ont le droit d'envoyer pour ton domaine |
| **DKIM** | que le message n'a pas été modifié en route (signature) |
| **DMARC** | ce que le destinataire doit faire si SPF ou DKIM échoue |

> **État actuel de `liftfoils.fr`**, le domaine d'envoi retenu :
>
> - **SPF : présent mais fermé** — `v=spf1 include:mx.ovh.com ~all`. Il
>   n'autorise qu'OVH. Une plateforme d'envoi ajoutée aujourd'hui échouerait
>   le contrôle SPF.
> - **DMARC : absent.** `_dmarc.liftfoils.fr` ne renvoie rien.
> - **MX : OVH** — c'est par là que passent les emails de la boutique.
>
> **Ne pas modifier le SPF de `liftfoils.fr`.** Il sert aux emails
> transactionnels WooCommerce ; une erreur dessus coupe les confirmations de
> commande. Le sous-domaine dédié `news.liftfoils.fr` porte son propre SPF et
> laisse celui de la boutique intact — c'est ce qui rend la séparation du
> point 4.2 non pas recommandée mais nécessaire ici.
>
> Pour mémoire, `bakabi.fr` n'a ni SPF ni DMARC ni MX : si un envoi part depuis
> ce domaine en attendant, le même chantier s'y applique.

Resend affiche les valeurs exactes à poser quand tu ajoutes un domaine. La
forme attendue :

```
news.liftfoils.fr        TXT   v=spf1 include:amazonses.com ~all
resend._domainkey…       TXT   p=MIGfMA0GCSq…           (fourni par Resend)
send.news.liftfoils.fr   MX    10 feedback-smtp.eu-west-1.amazonses.com
_dmarc.liftfoils.fr      TXT   v=DMARC1; p=none; rua=mailto:dmarc@liftfoils.fr
```

Sur Cloudflare, ces enregistrements sont **DNS only** — le nuage orange ne
concerne que le trafic HTTP et n'a rien à faire ici.

**DMARC se durcit par étapes**, jamais d'un coup :

1. `p=none` pendant 2 à 4 semaines — tu observes sans rien casser, les rapports
   `rua` te disent qui envoie en ton nom.
2. `p=quarantine` — les échecs partent en spam au lieu d'être livrés.
3. `p=reject` — les échecs sont refusés. C'est la cible, mais seulement une fois
   que les rapports sont propres.

Passer directement à `p=reject` bloque tes propres emails légitimes le jour où
un outil oublié — facturation, CRM, formulaire du site — envoie en ton nom.

### 4.2 Un sous-domaine d'envoi dédié

Envoyer la newsletter depuis `news.liftfoils.fr` plutôt que `liftfoils.fr`. La
raison est concrète : si une campagne marketing se prend des plaintes spam, la
réputation qui tombe est celle du sous-domaine. Les **confirmations de commande
WooCommerce continuent d'arriver**. Sans cette séparation, une mauvaise campagne
peut couper les emails transactionnels de la boutique — et là c'est du chiffre
d'affaires perdu.

Même logique côté prestataire : tant que le client n'a pas validé, tu envoies
depuis `news.bakabi.fr` et c'est ta réputation à toi qui est engagée, pas la
sienne.

### 4.3 Le désabonnement en un clic

Gmail et Yahoo l'exigent pour tout envoyeur groupé. Deux en-têtes :

```
List-Unsubscribe: <https://news.liftfoils.fr/unsub?t=JETON>, <mailto:…>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Le second est celui qui fait apparaître le bouton « Se désabonner » natif dans
Gmail. Il impose une URL qui accepte une requête **POST** et désabonne sans
demander de confirmation — un `mailto:` seul ne suffit pas.

`send.js` pose aujourd'hui le `List-Unsubscribe` en `mailto:`, ce qui est
correct pour des maquettes de validation. **Pour un envoi réel il manque
l'endpoint POST**, et c'est la pièce à construire — ou à récupérer sans effort
en passant par une plateforme (Brevo, Mailchimp) qui la fournit.

Un lien de désabonnement visible et honnête dans le pied de page fait par
ailleurs baisser les plaintes : quelqu'un qui ne trouve pas le lien clique sur
« Signaler comme spam », et une plainte coûte infiniment plus cher qu'un
désabonnement.

### 4.4 Le consentement et la propreté de la liste

C'est le point qui pèse le plus lourd, et celui qu'on saute le plus souvent.

- **Un client WooCommerce n'est pas un abonné.** Avoir acheté ne vaut pas
  consentement à recevoir du marketing. Un **ré-opt-in** de la base existante
  est nécessaire : un email unique demandant confirmation, et on ne garde que
  ceux qui répondent.
- La liste qui reste est plus courte. **C'est le but** : 200 personnes qui
  ouvrent valent mieux que 500 dont 300 ignorent, parce que les filtres lisent
  le taux d'ouverture comme un signal de qualité.
- **Jamais de liste achetée ou scrapée.** Elle contient des *spam traps* :
  adresses mortes réactivées exprès par les fournisseurs pour attraper ceux qui
  n'ont pas collecté eux-mêmes. Une seule suffit à griller un domaine.
- **Nettoyer après chaque envoi** — retirer les bounces durs immédiatement.
  Continuer d'écrire à une adresse morte est lu comme un comportement de robot.

### 4.5 La montée en charge

Un domaine neuf qui envoie 500 emails d'un coup ressemble exactement à un
domaine compromis. Il faut construire un historique. Le plafond de 100/jour du
plan gratuit Resend impose de toute façon ce rythme — autant s'en servir.

| Jour | Volume | À qui |
|---|---|---|
| 1 | ~20 | tes propres adresses + les contacts les plus récents |
| 3 | ~50 | acheteurs des 3 derniers mois |
| 5 | ~100 | acheteurs de l'année |
| 8 et suivants | +50 % par envoi | le reste, par engagement décroissant |

Commencer par les contacts les plus engagés n'est pas un détail : leurs
ouvertures et leurs clics construisent la réputation qui fera passer les envois
suivants, moins engagés.

**Entre chaque palier, regarder les chiffres.** Si ça se dégrade, on ne monte
pas, on corrige.

### 4.6 Le contenu, en dernier

Une fois le reste en place, quelques règles suffisent :

- **Une version texte** en plus du HTML. Un email HTML seul est un signal
  négatif — `send.js` ne l'envoie pas aujourd'hui.
- **Rapport texte/image équilibré.** Un email réduit à une grande image est le
  format classique du spam. Toujours du texte réel, et un `alt` sur chaque
  image.
- **Les liens pointent vers ton domaine.** Un raccourcisseur type bit.ly dans un
  envoi groupé est un signal fortement négatif.
- **L'objet décrit le contenu.** Pas de majuscules, pas de `!!!`, pas de faux
  `Re:`. Les filtres modernes s'en soucient moins qu'on ne le dit, mais les
  humains signalent en spam ce qui les a trompés — et c'est la plainte qui coûte
  cher.
- **Un expéditeur stable et reconnaissable.** Changer de `From:` à chaque envoi
  réinitialise la reconnaissance.
- **Une fréquence tenue.** Mensuel régulier vaut mieux qu'un envoi tous les
  trois mois puis quatre en une semaine.

### 4.7 Mesurer, sinon on navigue à l'aveugle

Deux outils gratuits, à brancher avant le premier envoi réel :

- **Google Postmaster Tools** — le seul endroit où tu vois ton taux de plainte
  réel chez Gmail, qui représente en général la majorité d'une base grand public
  française.
- **Microsoft SNDS** — l'équivalent pour Outlook et Hotmail.

Seuils à surveiller après chaque envoi :

| Indicateur | Seuil | Ce que ça veut dire |
|---|---|---|
| Plaintes spam | **> 0,1 %** | contenu ou fréquence à revoir, ralentir |
| Plaintes spam | **> 0,3 %** | seuil Gmail, blocage à court terme |
| Bounces durs | **> 2 %** | liste à nettoyer |
| Bounces durs | **> 5 %** | arrêter l'envoi, la liste est mauvaise |
| Ouvertures | **< 15 %** | liste peu engagée, resegmenter |

Le taux de plainte se compte en **millièmes** : sur 500 destinataires, deux
personnes qui cliquent « spam » suffisent à dépasser 0,3 %. D'où le ré-opt-in.

---

## 5. Récapitulatif avant le premier envoi réel

- [ ] SPF, DKIM et DMARC posés sur le sous-domaine d'envoi, DMARC en `p=none`
- [ ] Domaine vérifié dans Resend (ou Brevo, cf. le point RGPD en section 3)
- [ ] Ré-opt-in de la base WooCommerce effectué, seuls les répondants conservés
- [ ] Endpoint de désabonnement en un clic branché sur `{{unsubscribe_url}}`
- [ ] Version texte des emails ajoutée
- [ ] Google Postmaster Tools et Microsoft SNDS configurés
- [ ] Test envoyé sur Gmail, Outlook et Apple Mail, vérifié dans les trois
- [ ] Montée en charge planifiée, premier palier ~20 contacts
