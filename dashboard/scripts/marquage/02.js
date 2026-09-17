// 02 — Lancement de la newsletter
export default (m) => {
  m.standard();
  m.texte("Emplacement offre", "bandeau.texte");
  m.image("0162_LiftLaunch", "hero.image");

  m.texte("Numéro 01", "titre.surtitre");
  m.texte("On lance<br />", "titre.h1", { multiline: true });
  m.texte("Vous avez roulé avec nous", "titre.p1");
  m.texte("Une fois par mois, pas plus.", "titre.p2");

  m.texte("Les nouveautés, en avance", "promesses.items.0.titre");
  m.texte("Nouvelles ailes, nouvelles batteries", "promesses.items.0.texte");
  m.texte("Du vrai contenu technique", "promesses.items.1.titre");
  m.texte("Choisir son aile, entretenir", "promesses.items.1.texte");
  m.texte("Les dates d'essai et de course", "promesses.items.2.titre");
  m.texte("Les sessions se remplissent vite", "promesses.items.2.texte");
  m.lien("Découvrir la gamme", "promesses.cta");

  m.texte("Ce qu'on distribue", "gamme.surtitre");
  m.texte("Toute la gamme Lift.", "gamme.h2");
  [
    ["2025_LIFT5_", "LIFT5</p>", "Carbone, trois volumes"],
    ["2025_LIFTX_", "LIFTX</p>", "Hybride, trois tailles"],
    ["270CamberProLCS", "Ailes &amp; mâts</p>", "Camber Pro, High Aspect"],
    ["liftfoils-batterie-gen5", "Accessoires</p>", "Batteries, hélices, manettes"],
  ].forEach(([img, nom, desc], i) => {
    m.image(img, `gamme.produits.${i}.image`);
    m.texte(nom, `gamme.produits.${i}.nom`);
    m.texte(desc, `gamme.produits.${i}.desc`, { multiline: true });
    m.lien("Voir</a>", `gamme.produits.${i}`, { n: i });
  });

  m.texte("Une question, un projet", "contact.surtitre");
  m.texte("Parlez à quelqu'un<br />", "contact.h2", { multiline: true });
  m.texte("Notre équipe ride ces planches", "contact.texte");
  m.lien("Nous contacter", "contact.cta");

  m.texte("On se voit sur l'eau.", "signature.titre");
};
