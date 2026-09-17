// 04 — Visite guidée du site, section par section
export default (m) => {
  m.standard();
  m.sansGras();
  m.texte("SAV et stock en France à Cannes", "bandeau.texte");
  m.image("hero_hub.jpg", "hero.image");

  m.texte("Le site", "titre.surtitre");
  m.texte("Sept sections,<br />", "titre.h1", { multiline: true });
  m.texte("La boutique est organisée par pièce", "titre.p1");
  m.texte("Si vous partez de zéro", "titre.p2");
  m.texte("Et une section ne vend rien", "titre.p3");

  // Les sept sections : image, compteur, titre (n-ième h2), texte
  const sections = [
    ["hero_efoils", "01 &nbsp;·&nbsp; 6 références", "Les packs complets"],
    ["hero_boards", "02 &nbsp;·&nbsp; 19 références", "Le volume se choisit sur le poids"],
    ["hero_wings", "03 &nbsp;·&nbsp; 33 références", "C'est la pièce qui change le plus"],
    ["hero_masts", "04 &nbsp;·&nbsp; 9 références", "La pièce à laquelle on pense en dernier"],
    ["liftfoils-batterie-gen5", "05 &nbsp;·&nbsp; 34 références", "Batteries, hélices, chargeurs"],
    ["DSC1001_RodrigoSnaps", "06 &nbsp;·&nbsp; 31 pages", "Batterie haute tension, moteur immergé"],
    [null, "07 &nbsp;·&nbsp; sur demande", "Deux sections discrètes du catalogue"],
  ];
  sections.forEach(([img, compte, texte], i) => {
    if (img) m.image(img, `sections.${i}.image`);
    m.texte(compte, `sections.${i}.compte`);
    m.texte('class="h2 ttl"', `sections.${i}.titre`, { n: i });
    m.texte(texte, `sections.${i}.texte`);
  });

  // 01 eFoil : trois liens
  m.lien(">LIFT5</a>", "sections.0.liens.0");
  m.lien(">LIFTX</a>", "sections.0.liens.1");
  m.lien("Toute la section", "sections.0.tout", { n: 0 });
  // 02 Planches
  m.lien("Voir les planches", "sections.1.tout");
  // 03 Ailes : quatre sous-catégories (lien, compteur, description)
  [
    ["High Aspect</a>", "— 12 réf.", "Autonomie et vol long"],
    ["Camber Pro</a>", "— 5 réf.", "Vitesse de pointe et virages serrés"],
    [">Surf</a>", "— 5 réf.", "Portance basse vitesse"],
    ["Ailes arrière</a>", "— 11 réf.", "Le stabilisateur."],
  ].forEach(([lien, compte, desc], j) => {
    m.lien(lien, `sections.2.sous.${j}`);
    m.texte(compte, `sections.2.sous.${j}.compte`, { n: compte === "— 5 réf." && j === 2 ? 1 : 0 });
    m.envelopperJusqua(desc, "</td>", `sections.2.sous.${j}.desc`);
  });
  m.lien("Toute la section", "sections.2.tout", { n: 1 });
  // 04 Mâts, 05 Accessoires
  m.lien("Voir les mâts", "sections.3.tout");
  m.lien("Voir les accessoires", "sections.4.tout");
  // 06 Maintenance : quatre guides, une note, le lien
  [
    ["Guide de montage</a>", "— 7 étapes", "Du déballage à l'appairage"],
    ["Entretien</a>", "— 5 fiches", "Après chaque session, contrôle mensuel"],
    ["Dépannage</a>", "— 14 symptômes", "Rangé par panne, pas par pièce"],
    ["L'atelier</a>", "— forfait dès 480 € TTC", "Quand il faut passer la main"],
  ].forEach(([lien, compte, desc], j) => {
    m.lien(lien, `sections.5.sous.${j}`);
    m.texte(compte, `sections.5.sous.${j}.compte`);
    m.envelopperJusqua(desc, "</td>", `sections.5.sous.${j}.desc`);
  });
  m.texte("Les guides sont la traduction française", "sections.5.note");
  m.lien("Toute la section", "sections.5.tout", { n: 2 });

  m.texte("Le raccourci", "contact.surtitre");
  m.texte("Ne lisez pas<br />", "contact.h2", { multiline: true });
  m.texte("Dites-nous votre poids, votre spot et ce que vous voulez faire", "contact.texte");
  m.lien("Nous contacter", "contact.cta");

  m.texte("On se voit sur l'eau.", "signature.titre");
};
