#!/usr/bin/env node
/**
 * Pose les attributs data-edit sur une maquette d'origine, d'après la
 * description des zones dans scripts/marquage/<cle>.js.
 *
 *   node scripts/marquer.js 01        → gabarits/01-guide-taille.html
 *   node scripts/marquer.js           → tous
 *
 * La maquette d'origine (racine du dépôt) n'est jamais modifiée. Relancer le
 * script régénère le gabarit ; le modifier à la main est possible aussi, les
 * deux approches donnent le même fichier.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(__dirname, "..");
const CATALOGUE = JSON.parse(readFileSync(resolve(RACINE, "gabarits/catalogue.json"), "utf-8"));

const TAGS = ["<p", "<h1", "<h2", "<h3", "<a", "<span", "<td", "<strong"];

/** Petit atelier de marquage : chaque méthode modifie `this.html`. */
class Marqueur {
  constructor(html) {
    this.html = html;
  }

  nieme(texte, n) {
    let pos = -1;
    for (let i = 0; i <= n; i++) {
      pos = this.html.indexOf(texte, pos + 1);
      if (pos === -1) throw new Error(`Introuvable (occurrence ${n}) : ${texte}`);
    }
    return pos;
  }

  /** Pose `attrs` sur l'élément (p, h1, h2, h3, a, span, td) qui contient `texte`. */
  poser(texte, attrs, n = 0) {
    const pos = this.nieme(texte, n);
    let debut = -1;
    for (const t of TAGS) {
      const i = this.html.lastIndexOf(t, pos);
      if (i > debut && /[\s>]/.test(this.html[i + t.length])) debut = i;
    }
    if (debut === -1) throw new Error(`Pas d'élément avant : ${texte}`);
    const finTag = this.html.indexOf(">", debut);
    if (/<\//.test(this.html.slice(finTag + 1, pos))) throw new Error(`Élément trouvé trop loin de : ${texte}`);
    const nomTag = this.html.slice(debut, finTag).match(/^<(\w+)/)[1];
    this.html = this.html.slice(0, debut) + `<${nomTag} ${attrs}` + this.html.slice(debut + nomTag.length + 1);
    return this;
  }

  /** Zone texte. */
  texte(snippet, chemin, { multiline = false, n = 0 } = {}) {
    return this.poser(snippet, `data-edit="${chemin}"${multiline ? " data-edit-multiline" : ""}`, n);
  }

  /** Lien dont le libellé et l'URL sont modifiables. */
  lien(snippet, chemin, { n = 0 } = {}) {
    return this.poser(snippet, `data-edit="${chemin}.label" data-edit-href="${chemin}.href"`, n);
  }

  /** Image dont le src contient `fragment`. */
  image(fragment, chemin) {
    const pos = this.nieme(fragment, 0);
    const debut = this.html.lastIndexOf("<img", pos);
    this.html = this.html.slice(0, debut) + `<img data-edit-src="${chemin}"` + this.html.slice(debut + 4);
    return this;
  }

  /** Enveloppe un fragment de texte brut dans un span éditable. */
  envelopper(snippet, chemin) {
    const pos = this.nieme(snippet, 0);
    this.html = this.html.slice(0, pos) + `<span data-edit="${chemin}">${snippet}</span>` + this.html.slice(pos + snippet.length);
    return this;
  }

  /** Enveloppe dans un span le texte qui va de `debut` (n-ième occurrence) jusqu'à `fin` (exclu). */
  envelopperJusqua(debut, fin, chemin, { n = 0 } = {}) {
    const pos = this.nieme(debut, n);
    let stop = this.html.indexOf(fin, pos);
    if (stop === -1) throw new Error(`Fin introuvable après : ${debut}`);
    while (/\s/.test(this.html[stop - 1])) stop--;
    this.html = this.html.slice(0, pos) + `<span data-edit="${chemin}">` + this.html.slice(pos, stop) + "</span>" + this.html.slice(stop);
    return this;
  }

  /**
   * Retire les <strong> en milieu de phrase : une zone texte n'a pas de mise en
   * forme, et découper une phrase en plusieurs zones la rendrait pénible à
   * corriger. Les <strong> en tête de paragraphe (05) sont traités à part.
   */
  sansGras() {
    this.html = this.html.replace(/<strong(?![^>]*data-edit)[^>]*>([\s\S]*?)<\/strong>/g, "$1");
    return this;
  }

  /**
   * Un <strong> en tête de cellule suivi d'une explication : le gras devient
   * `chemin.titre`, le texte qui suit (après un espace ou un <br />) `chemin.texte`.
   */
  grasPuisTexte(strongSnippet, chemin) {
    this.texte(strongSnippet, `${chemin}.titre`);
    const pos = this.html.indexOf("</strong>", this.nieme(strongSnippet, 0)) + "</strong>".length;
    const reste = this.html.slice(pos).match(/^(\s*(?:<br \/>)?\s*)/)[1].length;
    const debut = pos + reste;
    let fin = this.html.indexOf("</td>", debut);
    while (/\s/.test(this.html[fin - 1])) fin--;
    this.html = this.html.slice(0, debut) + `<span data-edit="${chemin}.texte">` + this.html.slice(debut, fin) + "</span>" + this.html.slice(fin);
    return this;
  }

  /** Remplacement littéral, une seule occurrence attendue. */
  remplacer(avant, apres) {
    const pos = this.nieme(avant, 0);
    if (this.html.indexOf(avant, pos + 1) !== -1) throw new Error(`Plusieurs occurrences : ${avant}`);
    this.html = this.html.slice(0, pos) + apres + this.html.slice(pos + avant.length);
    return this;
  }

  /** Commun aux cinq maquettes : préheader, signature, adresse postale. */
  standard() {
    this.html = this.html.replace(
      /(<div style="display:none;[^>]*>\s*)([^<&]+?)(\s*&#847;)/,
      '$1<span data-edit="meta.preheader">$2</span>$3'
    );
    this.envelopper("Une question ? Écrivez à", "signature.texte");
    this.remplacer(
      '<span style="color:rgba(255,255,255,0.32);">[rue et code postal à compléter]</span>',
      "{{adresse_postale}}"
    );
    return this;
  }
}

const cles = process.argv[2] ? [process.argv[2]] : Object.keys(CATALOGUE);
for (const cle of cles) {
  const { fichier } = CATALOGUE[cle];
  const source = readFileSync(resolve(RACINE, "..", fichier), "utf-8"); // la maquette de référence, à la racine du dépôt
  const { default: decrire } = await import(`./marquage/${cle}.js`);
  const m = new Marqueur(source);
  decrire(m);
  writeFileSync(resolve(RACINE, "gabarits", fichier), m.html);
  console.log(`✓ ${fichier} — ${(m.html.match(/data-edit/g) || []).length} attributs`);
}
