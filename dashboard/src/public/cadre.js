/**
 * Script injecté dans l'iframe de l'éditeur. Rend les zones marquées
 * éditables en texte seul, et remonte chaque modification à la page parente
 * par postMessage. Aucune mise en forme n'est possible : le rendu côté serveur
 * échappe tout ce qui n'est pas du texte.
 */
(function () {
  const parent = window.parent;
  const envoyer = (message) => parent.postMessage(message, location.origin);

  // ── Styles de l'éditeur (jamais envoyés dans l'email) ────────────────────
  const style = document.createElement("style");
  style.textContent = `
    [data-edit] { cursor: text; outline: 1px dashed transparent; outline-offset: 2px; transition: outline-color .12s; border-radius: 2px; }
    [data-edit]:hover { outline-color: rgba(28,196,191,.7); }
    [data-edit]:focus { outline: 2px solid #1cc4bf; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(28,196,191,.18); }
    [data-edit-multiline] { white-space: pre-line; }
    a[data-edit], a[data-edit-href] { cursor: text; }
    img[data-edit-src] { cursor: pointer; outline: 1px dashed transparent; outline-offset: -3px; transition: outline-color .12s; }
    img[data-edit-src]:hover { outline-color: rgba(28,196,191,.9); }
    #lf-outil { position: absolute; z-index: 9999; display: none; background: #111; color: #fff; font: 12px/1 -apple-system, "Segoe UI", Arial, sans-serif; border-radius: 6px; padding: 6px 8px; box-shadow: 0 4px 16px rgba(0,0,0,.25); white-space: nowrap; }
    #lf-outil button { background: none; border: 0; color: #fff; font: inherit; cursor: pointer; padding: 2px 4px; }
    #lf-outil button:hover { color: #1cc4bf; }
    #lf-panneau { position: absolute; z-index: 10000; display: none; width: 360px; max-width: calc(100vw - 24px); background: #fff; color: #111; font: 13px/1.4 -apple-system, "Segoe UI", Arial, sans-serif; border-radius: 8px; padding: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.3); }
    #lf-panneau label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #666; margin: 8px 0 3px; }
    #lf-panneau input { width: 100%; box-sizing: border-box; font: 13px -apple-system, "Segoe UI", Arial, sans-serif; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; }
    #lf-panneau input:focus { outline: 2px solid #1cc4bf; border-color: #1cc4bf; }
    #lf-panneau .lf-boutons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    #lf-panneau button { font: 13px -apple-system, "Segoe UI", Arial, sans-serif; padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; background: #f5f5f5; cursor: pointer; }
    #lf-panneau button.lf-ok { background: #1cc4bf; border-color: #1cc4bf; color: #000; font-weight: 600; }
    #lf-grille { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; max-height: 240px; overflow-y: auto; margin-top: 6px; }
    #lf-grille img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; display: block; }
    #lf-grille img:hover, #lf-grille img.lf-choisie { border-color: #1cc4bf; }
    #lf-grille .lf-msg { grid-column: 1 / -1; color: #666; text-align: center; padding: 12px 0; }
    #lf-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; color: #666; font-size: 12px; }
    #lf-pagination button { padding: 3px 8px; }
  `;
  document.head.appendChild(style);

  // ── Hauteur du document → la page parente ajuste l'iframe ────────────────
  const signalerHauteur = () => envoyer({ type: "hauteur", valeur: document.documentElement.scrollHeight });
  new ResizeObserver(signalerHauteur).observe(document.body);
  window.addEventListener("load", signalerHauteur);

  // ── Zones texte ──────────────────────────────────────────────────────────
  const plainTextOK = (() => {
    const d = document.createElement("div");
    d.contentEditable = "plaintext-only";
    return d.contentEditable === "plaintext-only";
  })();

  /** Contenu d'une zone → texte brut. <br> et "\n" valent une fin de ligne. */
  function valeurDe(el) {
    let s = "";
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue;
      else if (n.nodeName === "BR") s += "\n";
      else s += n.textContent;
    }
    const multiline = el.hasAttribute("data-edit-multiline");
    s = s.replace(/\u00a0(?=[\s])|(?<=[\s])\u00a0|^\u00a0+|\u00a0+$/g, " ");
    s = multiline ? s.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n") : s.replace(/\s+/g, " ");
    return s.trim();
  }

  // execCommand est déprécié mais reste le seul moyen d'insérer du texte en
  // respectant la position du curseur et l'historique Annuler / Rétablir.
  let insertionEnCours = false;
  function inserer(commande, texte) {
    insertionEnCours = true;
    try {
      document.execCommand(commande, false, texte);
    } finally {
      insertionEnCours = false;
    }
  }

  // Ce qu'une zone accepte : de la frappe, de l'effacement, annuler / rétablir.
  const ENTREES_OK = ["insertText", "deleteContentBackward", "deleteContentForward", "deleteByCut", "deleteWordBackward", "deleteWordForward", "deleteSoftLineBackward", "deleteSoftLineForward", "deleteHardLineBackward", "deleteHardLineForward", "deleteContent", "insertCompositionText", "deleteCompositionText", "historyUndo", "historyRedo"];

  document.querySelectorAll("[data-edit]").forEach((el) => {
    const chemin = el.getAttribute("data-edit");
    const multiline = el.hasAttribute("data-edit-multiline");
    el.setAttribute("contenteditable", plainTextOK ? "plaintext-only" : "true");
    el.setAttribute("spellcheck", "true");

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (multiline) inserer("insertLineBreak");
      }
    });
    el.addEventListener("beforeinput", (e) => {
      if (insertionEnCours) return;
      const t = e.inputType;
      // Retour à la ligne venu d'ailleurs que du clavier (clavier virtuel, dictée).
      if (t === "insertParagraph" || t === "insertLineBreak") {
        e.preventDefault();
        if (multiline) inserer("insertLineBreak");
        return;
      }
      // Tout le reste — gras, listes, HTML collé, glisser-déposer — est refusé.
      // Le collage est traité à part, en texte seul.
      if (!ENTREES_OK.includes(t)) e.preventDefault();
    });
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      let texte = e.clipboardData.getData("text/plain") || "";
      texte = multiline ? texte.replace(/\r\n?/g, "\n") : texte.replace(/\s+/g, " ");
      inserer("insertText", texte);
    });
    el.addEventListener("drop", (e) => e.preventDefault());
    el.addEventListener("input", () => envoyer({ type: "modif", chemin, valeur: valeurDe(el) }));
  });

  // Les liens ne naviguent jamais dans l'éditeur.
  document.addEventListener("click", (e) => {
    if (e.target.closest("a")) e.preventDefault();
  });

  // ── Bulle d'outils (lien / image) ────────────────────────────────────────
  const outil = document.createElement("div");
  outil.id = "lf-outil";
  document.body.appendChild(outil);

  const panneau = document.createElement("div");
  panneau.id = "lf-panneau";
  document.body.appendChild(panneau);

  let cible = null;

  function positionner(boite, el, dessus) {
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left + window.scrollX, document.documentElement.clientWidth - boite.offsetWidth - 8));
    boite.style.left = x + "px";
    boite.style.top = (dessus ? r.top + window.scrollY - boite.offsetHeight - 6 : r.bottom + window.scrollY + 6) + "px";
  }

  function montrerOutil(el, libelle, action) {
    cible = el;
    outil.innerHTML = "";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = libelle;
    b.addEventListener("mousedown", (e) => e.preventDefault()); // ne pas voler le focus
    b.addEventListener("click", action);
    outil.appendChild(b);
    outil.style.display = "block";
    positionner(outil, el, true);
  }

  function cacherOutil() {
    outil.style.display = "none";
  }

  function fermerPanneau(enregistre) {
    if (!enregistre && panneau._annuler) panneau._annuler();
    panneau._annuler = null;
    panneau.style.display = "none";
    panneau.innerHTML = "";
  }

  function ouvrirPanneau(el, contenu) {
    panneau.innerHTML = "";
    panneau.appendChild(contenu);
    panneau.style.display = "block";
    positionner(panneau, el, false);
    // La page parente défile pour que le panneau soit visible en entier.
    panneau.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const premier = panneau.querySelector("input");
    if (premier) premier.focus({ preventScroll: true });
  }

  function champ(libelle, valeur, placeholder) {
    const l = document.createElement("label");
    l.textContent = libelle;
    const i = document.createElement("input");
    i.type = "text";
    i.value = valeur || "";
    if (placeholder) i.placeholder = placeholder;
    l.appendChild(i);
    return { label: l, input: i };
  }

  function boutons(onOk) {
    const d = document.createElement("div");
    d.className = "lf-boutons";
    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.textContent = "Annuler";
    annuler.addEventListener("click", () => fermerPanneau(false));
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "lf-ok";
    ok.textContent = "Enregistrer";
    ok.addEventListener("click", onOk);
    d.append(annuler, ok);
    return d;
  }

  // Liens : la bulle apparaît quand on est dans un élément à URL modifiable.
  document.querySelectorAll("[data-edit-href]").forEach((a) => {
    const chemin = a.getAttribute("data-edit-href");
    const ouvrir = () => {
      const frag = document.createDocumentFragment();
      const url = champ("Adresse du lien", a.getAttribute("href"), "https://liftfoils.fr/…");
      frag.append(url.label, boutons(() => {
        const v = url.input.value.trim();
        a.setAttribute("href", v);
        envoyer({ type: "modif", chemin, valeur: v });
        fermerPanneau(true);
      }));
      url.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); panneau.querySelector(".lf-ok").click(); }
      });
      ouvrirPanneau(a, frag);
    };
    a.addEventListener("focus", () => montrerOutil(a, "🔗 Modifier le lien", ouvrir));
    a.addEventListener("mouseenter", () => { if (document.activeElement !== a) montrerOutil(a, "🔗 Modifier le lien", ouvrir); });
    a.addEventListener("mouseleave", () => { if (document.activeElement !== a) cacherOutil(); });
    a.addEventListener("blur", () => setTimeout(() => { if (cible === a) cacherOutil(); }, 150));
  });

  // Images : clic → médiathèque liftfoils.fr ou URL directe.
  document.querySelectorAll("img[data-edit-src]").forEach((img) => {
    const chemin = img.getAttribute("data-edit-src");
    const largeurCible = Number(img.getAttribute("width")) || img.clientWidth || 600;

    img.addEventListener("click", (e) => {
      e.preventDefault();
      const frag = document.createDocumentFragment();

      const recherche = champ("Médiathèque liftfoils.fr", "", "Rechercher… (vide = les plus récentes)");
      const grille = document.createElement("div");
      grille.id = "lf-grille";
      const pagination = document.createElement("div");
      pagination.id = "lf-pagination";
      const url = champ("ou adresse directe de l'image", img.getAttribute("src"));
      const alt = champ("Description (texte alternatif)", img.getAttribute("alt"));

      let page = 1;
      let derniereRequete = 0;
      async function charger() {
        const q = recherche.input.value.trim();
        const num = ++derniereRequete;
        grille.innerHTML = '<div class="lf-msg">Chargement…</div>';
        try {
          const rep = await fetch(`/api/medias?q=${encodeURIComponent(q)}&page=${page}`);
          const d = await rep.json();
          if (num !== derniereRequete) return;
          if (!rep.ok) throw new Error(d.erreur || rep.status);
          grille.innerHTML = "";
          if (d.items.length === 0) grille.innerHTML = '<div class="lf-msg">Aucune image.</div>';
          for (const m of d.items) {
            const v = document.createElement("img");
            v.src = m.vignette;
            v.title = m.titre;
            v.loading = "lazy";
            v.addEventListener("click", () => {
              // La plus petite variante au moins deux fois plus large que la cible (écrans Retina), sinon l'original.
              const assez = m.variantes.find((x) => x.largeur >= largeurCible * 2) || m.variantes.find((x) => x.largeur >= largeurCible);
              const choix = assez ? assez.url : m.original.url;
              url.input.value = choix;
              if (!alt.input.value && (m.alt || m.titre)) alt.input.value = m.alt || m.titre;
              img.setAttribute("src", choix);
              grille.querySelectorAll(".lf-choisie").forEach((x) => x.classList.remove("lf-choisie"));
              v.classList.add("lf-choisie");
            });
            grille.appendChild(v);
          }
          pagination.innerHTML = "";
          const prec = document.createElement("button");
          prec.type = "button"; prec.textContent = "‹ Précédentes"; prec.disabled = page <= 1;
          prec.addEventListener("click", () => { page--; charger(); });
          const info = document.createElement("span");
          info.textContent = `page ${d.page} / ${d.totalPages}`;
          const suiv = document.createElement("button");
          suiv.type = "button"; suiv.textContent = "Suivantes ›"; suiv.disabled = page >= d.totalPages;
          suiv.addEventListener("click", () => { page++; charger(); });
          pagination.append(prec, info, suiv);
        } catch (err) {
          grille.innerHTML = `<div class="lf-msg">Médiathèque indisponible (${err.message})</div>`;
        }
      }
      let minuterie;
      recherche.input.addEventListener("input", () => { clearTimeout(minuterie); page = 1; minuterie = setTimeout(charger, 350); });
      recherche.input.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });

      const srcInitial = img.getAttribute("src");
      url.input.addEventListener("input", () => { if (url.input.value.trim()) img.setAttribute("src", url.input.value.trim()); });

      frag.append(recherche.label, grille, pagination, url.label, alt.label, boutons(() => {
        const src = url.input.value.trim() || srcInitial;
        img.setAttribute("src", src);
        img.setAttribute("alt", alt.input.value.trim());
        envoyer({ type: "modif", chemin: chemin + ".src", valeur: src });
        envoyer({ type: "modif", chemin: chemin + ".alt", valeur: alt.input.value.trim() });
        fermerPanneau(true);
      }));

      ouvrirPanneau(img, frag);
      // Annuler, Échap ou un clic ailleurs remettent l'image d'origine.
      panneau._annuler = () => img.setAttribute("src", srcInitial);
      charger();
    });
  });

  // Fermer le panneau en cliquant ailleurs ou avec Échap.
  document.addEventListener("mousedown", (e) => {
    if (panneau.style.display === "block" && !panneau.contains(e.target) && !outil.contains(e.target)) {
      const img = e.target.closest("img[data-edit-src]");
      if (!img) fermerPanneau(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fermerPanneau(false);
  });
})();
