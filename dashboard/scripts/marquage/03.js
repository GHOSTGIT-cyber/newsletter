// 03 — Événement (championnat eFoil). Périmé dans son contenu, mais c'est le
// format « événement » : dates, lieu, organisation, produits conseillés.
export default (m) => {
  m.standard();
  m.texte("FRECH Villefranche-sur-Mer", "bandeau.texte");
  m.image("liftx-sft-nador-2026-course", "hero.image");

  m.texte("Dans douze jours", "titre.surtitre");
  m.texte("La course arrive<br />", "titre.h1", { multiline: true });
  m.sansGras();
  m.texte("Le French Riviera Efoil Championship se court", "titre.p1");
  m.texte("Que vous veniez courir ou juste regarder", "titre.p2");

  m.texte("L'essentiel", "infos.titre");
  m.texte("Quand</td>", "infos.lignes.0.label");
  m.texte("13 &ndash; 15 septembre 2026", "infos.lignes.0.valeur");
  m.texte("Où</td>", "infos.lignes.1.label");
  m.remplacer(">Villefranche-sur-Mer<br /><span ", '><span data-edit="infos.lignes.1.valeur">Villefranche-sur-Mer</span><br /><span data-edit="infos.lignes.1.detail" ');
  m.texte("Organisation</td>", "infos.lignes.2.label");
  m.texte("Plume Foil, SFT<br />", "infos.lignes.2.valeur", { multiline: true });
  m.texte("Inscriptions</td>", "infos.lignes.3.label");
  m.texte("Ouvertes via l'EFRL", "infos.lignes.3.valeur");
  m.lien("S'inscrire à la course", "infos.cta");
  m.lien("Ou dites-nous si vous y allez", "infos.lien");

  m.texte("Avant de partir", "prepa.surtitre");
  m.texte("Ce qui se joue<br />", "prepa.h2", { multiline: true });
  m.texte("Sur un parcours de bouées", "prepa.texte");
  [
    ["2025_210CamberProLCS", "Aile 210 Camber Pro</p>", "Moins de surface, plus de vitesse", "1&nbsp;355&nbsp;&euro;"],
    ["h-lice-pliable-lcs", "Hélice LCS Power</p>", "Plus de poussée à l'accélération", "850&nbsp;&euro;"],
  ].forEach(([img, nom, desc, prix], i) => {
    m.image(img, `prepa.produits.${i}.image`);
    m.texte(nom, `prepa.produits.${i}.nom`);
    m.texte(desc, `prepa.produits.${i}.desc`);
    m.texte(prix, `prepa.produits.${i}.prix`);
    m.lien("Voir</a>", `prepa.produits.${i}`, { n: i });
  });

  m.image("liftfoils-batterie-gen5", "batterie.image");
  m.texte("Également</p>", "batterie.surtitre");
  m.texte("Batterie GEN5 Full Range</p>", "batterie.nom");
  m.texte("La version longue autonomie est disponible", "batterie.texte");
  m.lien("Voir</a>", "batterie", { n: 2 });

  m.texte("Avant le 13", "contact.surtitre");
  m.texte("Un doute sur votre<br />", "contact.h2", { multiline: true });
  m.texte("Dites-nous votre poids, votre planche", "contact.texte");
  m.lien("Nous contacter", "contact.cta");

  m.texte("On se voit sur l'eau.", "signature.titre");
};
