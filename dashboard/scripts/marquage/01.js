// 01 — Guide de taille LIFT5
export default (m) => {
  m.standard();
  m.texte("Emplacement offre", "bandeau.texte");
  m.image("0094_Lift5Launch_Family", "hero.image");

  m.texte("La question qu'on nous pose le plus", "titre.surtitre");
  m.texte("Quelle taille est<br />", "titre.h1", { multiline: true });
  m.texte("Trois LIFT5, trois volumes, un seul prix.", "titre.texte");

  m.texte("LIFT5</p>", "gamme.label");
  m.texte("55, 67 ou 83 litres.</p>", "gamme.titre");
  m.image("2025_LIFT5_4_4_SUNKISSED", "gamme.images.0");
  m.image("2025_LIFT5_4_9_STEELBLUE", "gamme.images.1");
  m.image("2025_LIFT5_5_4_CARBONBLACK", "gamme.images.2");

  // En-tête du tableau
  [["4'4 Pro", "55 L</p>"], ["4'9 Sport", "67 L</p>"], ["5'4 Cruiser", "83 L</p>"]].forEach(([nom, vol], i) => {
    m.texte(nom + "</p>", `specs.colonnes.${i}.nom`);
    m.texte(vol, `specs.colonnes.${i}.volume`);
  });
  // Lignes du tableau : libellé + trois valeurs
  const lignes = [
    ["Volume</td>", ["55 L</td>", "67 L</td>", "83 L</td>"]],
    ["Dimensions</td>", ["4'4 × 22,5&Prime;", "4'9 × 25&Prime;", "5'4 × 27,5&Prime;"]],
    ["Poids rider</td>", ["jusqu'à 86 kg", "jusqu'à 100 kg", "jusqu'à 113 kg"]],
    ["Avec Blowfish</td>", ["109 kg", "118 kg", "129 kg"]],
    ["Aile avant</td>", ["210 Camber Pro</td>", "210 Camber Pro</td>", "270 Camber Pro</td>"]],
    ["Aile arrière</td>", ["36 Glide</td>", "36 Glide</td>", "46 Glide</td>"]],
    ["Caractère</td>", ["La plus vive de la gamme", "Le juste milieu.", "Le décollage le plus stable"]],
  ];
  lignes.forEach(([label, valeurs], i) => {
    m.texte(label, `specs.lignes.${i}.label`);
    valeurs.forEach((v, j) => {
      // Deux cellules identiques sur la même ligne (210 Camber Pro, 36 Glide) : on prend la j-ième.
      const n = valeurs.slice(0, j).filter((x) => x === v).length;
      m.texte(v, `specs.lignes.${i}.valeurs.${j}`, { n });
    });
  });
  m.lien("Voir les LIFT5", "specs.cta");

  m.texte("À lire avant de choisir", "explication.surtitre");
  m.texte("Le poids rider parle<br />", "explication.h2", { multiline: true });
  m.texte("Ce chiffre décrit la façon dont la planche", "explication.p1");
  m.texte("Une fois en vol, la planche est hors de l'eau", "explication.p2");
  m.image("0097_Lift5Launch_Sunkiss", "illustration.image");

  m.texte("Arrêtez de choisir<br />", "blowfish.h2", { multiline: true });
  m.texte("La plupart des gens prennent la plus grosse planche", "blowfish.texte");
  m.image("blowfish-BlowfishHero", "blowfish.image");
  m.texte("Le Blowfish</p>", "blowfish.nom");
  m.texte("Module de flottaison gonflable", "blowfish.desc");
  m.lien("Voir le Blowfish", "blowfish.cta");

  m.texte("Plus rapide qu'un tableau", "contact.surtitre");
  m.texte("Parlez à quelqu'un<br />", "contact.h2", { multiline: true });
  m.texte("Notre équipe ride ces planches", "contact.texte");
  m.lien("Nous contacter", "contact.cta");
  m.lien("Ou décrivez-nous votre programme", "contact.lien");

  m.texte("On se voit sur l'eau.", "signature.titre");
};
