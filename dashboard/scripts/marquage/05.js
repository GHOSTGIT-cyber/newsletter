// 05 — Entretien, hivernage, atelier (format « conseil technique »)
export default (m) => {
  m.standard();
  m.texte("Atelier &amp; SAV en France", "bandeau.texte");
  m.image("0137_LiftXLaunch_Dawnpatrol", "hero.image");

  // Les gras en tête de cellule (listes) deviennent titre + texte ;
  // les gras en milieu de phrase sont retirés ensuite par sansGras().
  const gestes = ["Rincer à l'eau douce.", "Ouvrir la trappe.", "Rincer les connecteurs.", "Sécher avant de ranger.", "Ranger correctement."];
  gestes.forEach((g, i) => m.grasPuisTexte(`${g}</strong>`, `gestes.items.${i}`));
  const controle = ["Le joint de trappe", "Loquets et charnières", "Les joints de phase", "L'hélice", "La visserie des ailes", "La visserie du mât"];
  controle.forEach((c, i) => m.grasPuisTexte(`${c}</strong>`, `controle.items.${i}`));
  const hivernage = ["1 · Rinçage et séchage complets.", "2 · Charger la batterie à 40-60 %.", "3 · Déposer la propulsion.", "4 · Ranger la board en housse.", "5 · Stocker la batterie à part."];
  hivernage.forEach((h, i) => m.grasPuisTexte(`${h}</strong>`, `hivernage.items.${i}`));
  m.sansGras();

  m.texte("Entretien", "titre.surtitre");
  m.texte('class="h1 ttl"', "titre.h1");
  m.texte("La majorité des pannes de début de saison", "titre.p1");
  m.texte("Pas de l'usure, pas d'un défaut", "titre.p2");
  m.texte("Il reste quelques semaines de navigation", "titre.p3");

  // Sept blocs : surtitre, titre (n-ième h2), texte
  const blocs = [
    ["gestes", "Après chaque sortie", "C'est court, c'est répétitif"],
    ["controle", "Une fois par mois", "Six points à passer en revue"],
    ["hivernage", "Dans quelques semaines", "La procédure complète de remisage"],
    ["batterie", "La pièce la plus chère", "Elle mérite sa propre fiche"],
    ["pieces", "Ce qui se remplace", "Un eFoil n'a pas beaucoup de consommables"],
    ["depannage", "Quand ça ne va pas", "Pas par pièce : par ce que vous constatez"],
    ["atelier", "Quand il faut passer la main", "Révision, hivernage, remise en état"],
  ];
  blocs.forEach(([cle, surtitre, texte], i) => {
    m.texte(surtitre, `${cle}.surtitre`);
    m.texte('class="h2 ttl"', `${cle}.titre`, { n: i, multiline: cle === "depannage" });
    m.texte(texte, `${cle}.texte`);
  });

  m.lien("La fiche détaillée", "gestes.lien");
  m.image("hero_masts", "controle.image");
  m.lien("La procédure point par point", "controle.lien");
  m.lien("La procédure d'hivernage", "hivernage.cta");
  m.image("liftfoils-batterie-gen5", "batterie.image");
  m.lien("Stockage et transport de la batterie", "batterie.lien");
  m.lien("Les cinq pièces d'usure", "pieces.lien");
  ["L'eFoil ne démarre pas", "La batterie ne charge pas", "Eau dans la trappe", "Coupures Bluetooth", "Télécommande</a>", "Le moteur ne tourne pas"]
    .forEach((s, i) => m.lien(s, `depannage.symptomes.${i}`));
  m.lien("Les 14 symptômes", "depannage.lien");
  m.image("DSC1001_RodrigoSnaps", "atelier.image");
  m.texte("Forfait dès 480", "atelier.p2");
  m.lien("Prendre rendez-vous", "atelier.cta");

  m.texte("Les guides sont la traduction française", "note.texte");
  m.texte("On se voit sur l'eau.", "signature.titre");
};
