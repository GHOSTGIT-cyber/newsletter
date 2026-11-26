/**
 * Éditeur de mise en page libre (page parente).
 *
 * Le panneau de gauche liste les blocs ; chaque bloc s'ouvre en formulaire,
 * construit à partir de la description envoyée par le serveur (blocs.js).
 * Chaque modification enregistre toute la liste après un court délai ; le
 * serveur la valide et renvoie l'aperçu, affiché dans l'iframe de droite.
 */
(function () {
  const donnees = JSON.parse(document.getElementById("donnees").textContent);
  const { id, lectureSeule, schema } = donnees;
  const TYPES = schema.types;
  let blocs = donnees.blocs;

  const cadre = document.getElementById("cadre");
  const etat = document.getElementById("etat");
  const liste = document.getElementById("liste-blocs");

  const el = (tag, attrs = {}, ...enfants) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const x of enfants.flat()) if (x != null) e.append(x);
    return e;
  };
  const nouvelId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

  function afficher(texte, classe) {
    etat.textContent = texte;
    etat.className = "etat " + (classe || "");
  }
  const heure = () => new Date().toTimeString().slice(0, 5);

  // ── Aperçu ───────────────────────────────────────────────────────────────
  let selection = null; // id du bloc ouvert

  function afficherApercu(html) {
    cadre.srcdoc = html;
  }
  function signalerSelection(defiler) {
    try {
      cadre.contentWindow.postMessage({ type: "selection", id: selection, defiler }, location.origin);
    } catch {}
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.source !== cadre.contentWindow) return;
    const m = e.data;
    if (m.type === "hauteur") cadre.style.height = Math.ceil(m.valeur) + "px";
    else if (m.type === "pret") signalerSelection(false);
    else if (m.type === "choisir" && !lectureSeule) ouvrir(m.id, { defilerPanneau: true });
    else if (m.type === "position") {
      const haut = cadre.getBoundingClientRect().top + window.scrollY + m.haut - 140;
      window.scrollTo({ top: Math.max(0, haut), behavior: "smooth" });
    }
  });

  fetch(`/newsletters/${id}/cadre`)
    .then((r) => r.text())
    .then(afficherApercu)
    .catch(() => afficher("Aperçu indisponible", "erreur"));

  if (lectureSeule) return;

  // ── Enregistrement ───────────────────────────────────────────────────────
  let version = 0; // incrémentée à chaque modification
  let versionEnregistree = 0;
  let minuterie = null;
  let enCours = null; // promesse de l'enregistrement en cours

  function modifie(delai = 600) {
    version++;
    afficher("Modifications en attente…", "attente");
    clearTimeout(minuterie);
    minuterie = setTimeout(enregistrer, delai);
  }

  async function enregistrer() {
    clearTimeout(minuterie);
    minuterie = null;
    if (enCours) {
      await enCours;
      if (version === versionEnregistree) return;
    }
    const v = version;
    enCours = (async () => {
      try {
        const rep = await fetch(`/api/newsletters/${id}/blocs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocs }),
        });
        const j = await rep.json().catch(() => ({}));
        if (!rep.ok) throw new Error(j.erreur || `HTTP ${rep.status}`);
        versionEnregistree = Math.max(versionEnregistree, v);
        afficherApercu(j.html);
        if (version === versionEnregistree && !metaEnAttente.size) afficher(`Enregistré à ${heure()}`, "ok");
      } catch (e) {
        afficher(`Erreur d'enregistrement : ${e.message}`, "erreur");
        // Nouvel essai dans 5 secondes (ou à la prochaine modification).
        clearTimeout(minuterie);
        minuterie = setTimeout(enregistrer, 5000);
      }
    })();
    await enCours;
    enCours = null;
  }

  window.addEventListener("beforeunload", (e) => {
    if (version !== versionEnregistree || metaEnAttente.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ── Objet et préheader (enregistrés à part, comme dans l'autre éditeur) ──
  const metaEnAttente = new Map();
  async function envoyerMeta(chemin) {
    const valeur = metaEnAttente.get(chemin);
    if (valeur == null) return;
    metaEnAttente.delete(chemin);
    try {
      const rep = await fetch(`/api/newsletters/${id}/contenu`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chemin, valeur }),
      });
      if (!rep.ok) throw new Error((await rep.json().catch(() => ({}))).erreur || `HTTP ${rep.status}`);
      if (version === versionEnregistree && !metaEnAttente.size) afficher(`Enregistré à ${heure()}`, "ok");
    } catch (e) {
      if (!metaEnAttente.has(chemin)) metaEnAttente.set(chemin, valeur);
      afficher(`Erreur d'enregistrement : ${e.message}`, "erreur");
    }
  }
  const minuteriesMeta = new Map();
  document.querySelectorAll(".entete-email .champ[contenteditable]").forEach((c) => {
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); c.blur(); }
    });
    c.addEventListener("paste", (e) => {
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s+/g, " "));
    });
    c.addEventListener("input", () => {
      const chemin = c.dataset.chemin;
      metaEnAttente.set(chemin, c.textContent.replace(/\s+/g, " ").trim());
      afficher("Modifications en attente…", "attente");
      clearTimeout(minuteriesMeta.get(chemin));
      minuteriesMeta.set(chemin, setTimeout(() => envoyerMeta(chemin), 500));
    });
  });

  async function toutEnregistrer() {
    for (const chemin of [...metaEnAttente.keys()]) await envoyerMeta(chemin);
    if (version !== versionEnregistree || minuterie) await enregistrer();
    if (enCours) await enCours;
  }

  // ── Bouton « M'envoyer un test » ─────────────────────────────────────────
  const btest = document.getElementById("btest");
  btest.addEventListener("click", async () => {
    await toutEnregistrer();
    const libelle = btest.textContent;
    btest.disabled = true;
    btest.textContent = "Envoi…";
    try {
      const rep = await fetch(`/newsletters/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.erreur || `HTTP ${rep.status}`);
      afficher(`Test envoyé à ${j.destinataire}`, "ok");
    } catch (e) {
      afficher(`Test non envoyé : ${e.message}`, "erreur");
    } finally {
      btest.disabled = false;
      btest.textContent = libelle;
    }
  });
  // Le lien « Envoyer… » attend que tout soit enregistré.
  const lienEnvoyer = document.querySelector('.barre-editeur a[href$="/envoyer"]');
  lienEnvoyer?.addEventListener("click", async (e) => {
    if (version === versionEnregistree && !metaEnAttente.size) return;
    e.preventDefault();
    await toutEnregistrer();
    location.href = lienEnvoyer.href;
  });

  // ── Valeurs par défaut ───────────────────────────────────────────────────
  const copie = (o) => JSON.parse(JSON.stringify(o));
  function defauts(champs) {
    const o = {};
    for (const c of champs) {
      if (c.type === "liste") o[c.cle] = Array.from({ length: c.min }, () => defauts(c.champs));
      else o[c.cle] = copie(c.defaut);
    }
    return o;
  }
  const blocVide = (type) => ({ id: nouvelId(), type, ...defauts(TYPES[type].champs) });

  // ── Résumé d'un bloc (ligne sous son nom) ────────────────────────────────
  function resume(b) {
    const t = TYPES[b.type];
    for (const c of t.champs) {
      if ((c.type === "texte" || c.type === "zone") && String(b[c.cle] || "").trim()) {
        return String(b[c.cle]).replace(/\*\*|\[|\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
      }
      if (c.type === "image" && b[c.cle]?.alt) return b[c.cle].alt;
      if (c.type === "liste") return b[c.cle].map((x) => x.titre).filter(Boolean).join(" · ") || `${b[c.cle].length} colonnes`;
    }
    return "";
  }

  // ── Panneau ──────────────────────────────────────────────────────────────
  const ICONES = { banniere: "▣", titre: "H", texte: "¶", image: "▨", bouton: "◉", produit: "◧", colonnes: "▥", code: "%", separateur: "—", espace: "↕" };

  function rendrePanneau() {
    const defilement = liste.parentElement.scrollTop;
    liste.innerHTML = "";
    if (blocs.length === 0) {
      liste.append(el("p", { class: "vide-blocs", text: "La newsletter est vide. Ajoutez un premier bloc : une bannière ou une image pour commencer, par exemple." }));
    }
    blocs.forEach((b, i) => {
      liste.append(insertion(i, false), carte(b, i));
    });
    liste.append(insertion(blocs.length, true));
    liste.parentElement.scrollTop = defilement;
  }

  // Le « + » entre deux blocs, et le gros bouton en bas.
  function insertion(index, final) {
    const zone = el("div", { class: final ? "insertion finale" : "insertion" });
    const btn = el("button", {
      type: "button",
      class: final ? "ajouter-bloc" : "ajouter-ici",
      title: final ? null : "Insérer un bloc ici",
      text: final ? "+ Ajouter un bloc" : "+",
      onclick: () => basculerPalette(zone, index),
    });
    zone.append(btn);
    return zone;
  }

  function basculerPalette(zone, index) {
    const existante = liste.querySelector(".palette");
    const memeEndroit = existante && existante.parentElement === zone;
    existante?.remove();
    liste.querySelectorAll(".insertion.ouverte").forEach((z) => z.classList.remove("ouverte"));
    if (memeEndroit) return;
    zone.classList.add("ouverte");
    const palette = el("div", { class: "palette" },
      Object.entries(TYPES).map(([type, t]) =>
        el("button", {
          type: "button", class: "palette-type", title: t.aide,
          onclick: () => {
            const b = blocVide(type);
            blocs.splice(index, 0, b);
            selection = b.id;
            rendrePanneau();
            modifie(0);
            const c = liste.querySelector(`[data-id="${b.id}"]`);
            c?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          },
        }, el("span", { class: "icone", text: ICONES[type] }), el("span", { class: "fort", text: t.nom }), el("span", { class: "discret", text: t.aide }))
      )
    );
    zone.append(palette);
    palette.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function ouvrir(idBloc, { defilerPanneau = false } = {}) {
    selection = selection === idBloc && !defilerPanneau ? null : idBloc;
    rendrePanneau();
    signalerSelection(!defilerPanneau && selection != null);
    if (defilerPanneau && selection) {
      liste.querySelector(`[data-id="${selection}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  // ── Annuler une suppression ──────────────────────────────────────────────
  const annulation = document.getElementById("annulation");
  let derniereSuppression = null;
  let minuterieAnnulation = null;
  document.getElementById("bannuler").addEventListener("click", () => {
    if (!derniereSuppression) return;
    const { bloc, index } = derniereSuppression;
    blocs.splice(Math.min(index, blocs.length), 0, bloc);
    derniereSuppression = null;
    annulation.hidden = true;
    selection = bloc.id;
    rendrePanneau();
    modifie(0);
  });

  function deplacer(i, j) {
    if (j < 0 || j >= blocs.length || i === j) return;
    const [b] = blocs.splice(i, 1);
    blocs.splice(j, 0, b);
    rendrePanneau();
    modifie(0);
  }

  // ── Carte d'un bloc ──────────────────────────────────────────────────────
  let glisse = null; // index du bloc en cours de déplacement

  function carte(b, i) {
    const t = TYPES[b.type];
    const ouverte = selection === b.id;
    const action = (texte, titre, fn, desactive) =>
      el("button", { type: "button", class: "action", title: titre, "aria-label": titre, disabled: desactive, text: texte, onclick: (e) => { e.stopPropagation(); fn(); } });

    const entete = el("div", { class: "bloc-entete", onclick: () => ouvrir(b.id) },
      el("span", { class: "poignee", title: "Glisser pour déplacer", text: "⠿", draggable: "true" }),
      el("span", { class: "icone", text: ICONES[b.type] }),
      el("span", { class: "bloc-titre" }, el("span", { class: "fort", text: t.nom }), el("span", { class: "resume discret", text: resume(b) })),
      el("span", { class: "actions" },
        action("↑", "Monter", () => deplacer(i, i - 1), i === 0),
        action("↓", "Descendre", () => deplacer(i, i + 1), i === blocs.length - 1),
        action("⧉", "Dupliquer", () => {
          const c = { ...copie(b), id: nouvelId() };
          blocs.splice(i + 1, 0, c);
          selection = c.id;
          rendrePanneau();
          modifie(0);
        }),
        action("✕", "Supprimer", () => {
          blocs.splice(i, 1);
          derniereSuppression = { bloc: b, index: i };
          annulation.hidden = false;
          clearTimeout(minuterieAnnulation);
          minuterieAnnulation = setTimeout(() => { annulation.hidden = true; derniereSuppression = null; }, 10000);
          if (selection === b.id) selection = null;
          rendrePanneau();
          modifie(0);
        })
      )
    );

    const c = el("div", { class: "bloc-carte" + (ouverte ? " ouverte" : ""), "data-id": b.id }, entete);

    // Glisser-déposer : seule la poignée lance le déplacement.
    const poignee = entete.querySelector(".poignee");
    poignee.addEventListener("click", (e) => e.stopPropagation());
    poignee.addEventListener("dragstart", (e) => {
      glisse = i;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", b.id);
      e.dataTransfer.setDragImage(c, 20, 20);
      c.classList.add("glisse");
    });
    poignee.addEventListener("dragend", () => {
      glisse = null;
      liste.querySelectorAll(".avant, .apres, .glisse").forEach((x) => x.classList.remove("avant", "apres", "glisse"));
    });
    c.addEventListener("dragover", (e) => {
      if (glisse == null) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const avant = e.clientY < r.top + r.height / 2;
      c.classList.toggle("avant", avant);
      c.classList.toggle("apres", !avant);
    });
    c.addEventListener("dragleave", () => c.classList.remove("avant", "apres"));
    c.addEventListener("drop", (e) => {
      if (glisse == null) return;
      e.preventDefault();
      const avant = c.classList.contains("avant");
      let cible = avant ? i : i + 1;
      if (glisse < cible) cible--;
      const depart = glisse;
      glisse = null;
      deplacer(depart, cible);
    });

    if (ouverte) {
      c.append(el("div", { class: "bloc-corps" }, el("p", { class: "aide-bloc discret", text: t.aide }), formulaire(t.champs, b, () => {
        c.querySelector(".resume").textContent = resume(b);
        modifie();
      })));
    }
    return c;
  }

  // ── Formulaires ──────────────────────────────────────────────────────────
  function formulaire(champs, obj, change, reconstruire) {
    const f = el("div", { class: "champs" });
    const refaire = () => {
      const nouveau = formulaire(champs, obj, change, reconstruire);
      f.replaceWith(nouveau);
    };
    for (const c of champs) f.append(champ(c, obj, change, reconstruire || refaire));
    return f;
  }

  function champ(c, obj, change, refaire) {
    const libelle = (enfant) => el("label", { class: "champ-bloc" }, el("span", { class: "libelle", text: c.libelle }), enfant);

    switch (c.type) {
      case "texte":
        return libelle(el("input", { type: "text", value: obj[c.cle] ?? "", oninput: (e) => { obj[c.cle] = e.target.value; change(); } }));

      case "url":
        return champLien(c, obj, change);

      case "zone": {
        const zone = el("textarea", { rows: c.grand ? 8 : 3, oninput: (e) => { obj[c.cle] = e.target.value; change(); } });
        zone.value = obj[c.cle] ?? "";
        const l = libelle(zone);
        if (c.formatage || c.cle === "titre") {
          l.append(el("span", { class: "astuce discret", text: c.formatage ? "**gras** · [texte du lien](https://…) · ligne vide = nouveau paragraphe" : "Entrée = retour à la ligne" }));
        }
        return l;
      }

      case "choix": {
        const groupe = el("div", { class: "segments", role: "radiogroup" });
        for (const o of c.options) {
          groupe.append(el("button", {
            type: "button", role: "radio", "aria-checked": String(obj[c.cle] === o.valeur), class: obj[c.cle] === o.valeur ? "actif" : null, text: o.nom,
            onclick: () => {
              obj[c.cle] = o.valeur;
              groupe.querySelectorAll("button").forEach((b) => { b.classList.toggle("actif", b.textContent === o.nom); b.setAttribute("aria-checked", String(b.textContent === o.nom)); });
              change();
            },
          }));
        }
        return el("div", { class: "champ-bloc" }, el("span", { class: "libelle", text: c.libelle }), groupe);
      }

      case "couleur": {
        const groupe = el("div", { class: "pastilles" });
        const marquer = () => groupe.querySelectorAll("[data-couleur]").forEach((p) => p.classList.toggle("actif", p.dataset.couleur === obj[c.cle]));
        for (const coul of schema.couleurs) {
          groupe.append(el("button", {
            type: "button", class: "pastille", title: coul.nom, "aria-label": coul.nom, "data-couleur": coul.valeur, style: `background:${coul.valeur}`,
            onclick: () => { obj[c.cle] = coul.valeur; perso.value = coul.valeur; marquer(); change(); },
          }));
        }
        const perso = el("input", { type: "color", value: obj[c.cle], title: "Autre couleur", "aria-label": "Autre couleur" });
        perso.addEventListener("input", () => { obj[c.cle] = perso.value.toLowerCase(); marquer(); change(); });
        groupe.append(el("span", { class: "perso discret" }, perso, "autre"));
        marquer();
        return el("div", { class: "champ-bloc" }, el("span", { class: "libelle", text: c.libelle }), groupe);
      }

      case "image": {
        const img = obj[c.cle] || (obj[c.cle] = { src: "", alt: "" });
        const vignette = el("div", { class: "vignette" });
        const majVignette = () => {
          vignette.innerHTML = "";
          vignette.append(img.src ? el("img", { src: img.src, alt: "" }) : el("span", { class: "discret", text: "Aucune image" }));
        };
        majVignette();
        const alt = el("input", { type: "text", value: img.alt || "", placeholder: "Ce que montre l'image (lu si l'image ne s'affiche pas)", oninput: (e) => { img.alt = e.target.value; change(); } });
        const choisir = el("button", {
          type: "button", class: "principal", text: img.src ? "Changer l'image" : "Choisir une image",
          onclick: async () => {
            const r = await choisirImage(c.largeur || 600);
            if (!r) return;
            img.src = r.src;
            if (r.alt && !img.alt) { img.alt = r.alt; alt.value = r.alt; }
            choisir.textContent = "Changer l'image";
            majVignette();
            change();
          },
        });
        const retirer = el("button", { type: "button", text: "Retirer", onclick: () => { img.src = ""; majVignette(); choisir.textContent = "Choisir une image"; change(); } });
        return el("div", { class: "champ-bloc champ-image" },
          el("span", { class: "libelle", text: c.libelle }),
          el("div", { class: "image-ligne" }, vignette, el("div", { class: "image-boutons" }, choisir, retirer)),
          el("label", { class: "champ-bloc" }, el("span", { class: "libelle", text: "Description de l'image" }), alt)
        );
      }

      case "liste": {
        const conteneur = el("div", { class: "champ-liste" });
        const items = obj[c.cle];
        items.forEach((item, k) => {
          const entete = el("div", { class: "item-entete" }, el("span", { class: "fort", text: `${c.libelle} ${k + 1}` }));
          const bouge = (d) => { const [x] = items.splice(k, 1); items.splice(k + d, 0, x); change(); refaire(); };
          if (k > 0) entete.append(el("button", { type: "button", class: "lien", text: "← avant", onclick: () => bouge(-1) }));
          if (k < items.length - 1) entete.append(el("button", { type: "button", class: "lien", text: "après →", onclick: () => bouge(1) }));
          if (items.length > c.min) entete.append(el("button", { type: "button", class: "lien danger", text: "Retirer", onclick: () => { items.splice(k, 1); change(); refaire(); } }));
          conteneur.append(el("fieldset", { class: "item" }, entete, formulaire(c.champs, item, change, refaire)));
        });
        if (items.length < c.max) {
          conteneur.append(el("button", { type: "button", class: "ajouter-item", text: `+ Ajouter une ${c.libelle.toLowerCase()}`, onclick: () => { items.push(defauts(c.champs)); change(); refaire(); } }));
        }
        return conteneur;
      }
    }
    return el("span");
  }

  // ── Champ lien : page web, ou email pré-rempli (mailto:) ─────────────────
  // Comme sur Mailchimp : « Email » ouvre la messagerie du lecteur avec
  // l'adresse, l'objet et le message déjà remplis (ex. demande de devis).
  function lireMailto(v) {
    const [adresse, requete = ""] = String(v).replace(/^mailto:/i, "").split("?");
    const p = new URLSearchParams(requete.replace(/\+/g, "%2B"));
    let a = adresse;
    try { a = decodeURIComponent(adresse); } catch {}
    return { adresse: a, objet: p.get("subject") || "", message: p.get("body") || "" };
  }

  function composerMailto({ adresse, objet, message }) {
    const a = adresse.trim();
    if (!a) return "";
    const q = [];
    if (objet.trim()) q.push("subject=" + encodeURIComponent(objet.trim()));
    if (message.trim()) q.push("body=" + encodeURIComponent(message));
    return "mailto:" + a + (q.length ? "?" + q.join("&") : "");
  }

  function champLien(c, obj, change) {
    const initial = String(obj[c.cle] ?? "");
    let mode = /^mailto:/i.test(initial) ? "email" : "web";
    let web = mode === "web" ? initial : "";
    const mail = mode === "email" ? lireMailto(initial) : { adresse: "", objet: "", message: "" };

    const conteneur = el("div", { class: "champ-bloc champ-lien" });
    const corps = el("div", { class: "lien-corps" });

    const appliquer = () => {
      obj[c.cle] = mode === "email" ? composerMailto(mail) : web;
      change();
    };

    const sousChamp = (libelle, enfant) => el("label", { class: "champ-bloc" }, el("span", { class: "libelle", text: libelle }), enfant);

    function dessiner() {
      corps.innerHTML = "";
      if (mode === "web") {
        // Une adresse email tapée ici marche, mais le mode Email est plus clair
        // (objet et message) : on le propose au lieu de laisser un doute.
        const alerte = el("p", { class: "astuce bascule", hidden: true },
          "On dirait une adresse email. ",
          el("button", {
            type: "button", class: "lien", text: "Passer en mode Email",
            onclick: () => segments.querySelector("[aria-checked=false]")?.click(),
          })
        );
        const champ = el("input", {
          type: "text", value: web, placeholder: "https://liftfoils.fr/…", inputmode: "url", spellcheck: "false",
          "aria-label": c.libelle,
          oninput: (e) => {
            web = e.target.value;
            alerte.hidden = !/^\s*(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(web);
            appliquer();
          },
        });
        alerte.hidden = !/^\s*(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(web);
        corps.append(champ, alerte);
        return;
      }
      const message = el("textarea", { rows: 3, placeholder: "Bonjour, je souhaite un devis pour…", oninput: (e) => { mail.message = e.target.value; appliquer(); } });
      message.value = mail.message;
      corps.append(
        sousChamp("Adresse email", el("input", { type: "text", value: mail.adresse, placeholder: "info@liftfoils.fr", inputmode: "email", spellcheck: "false", oninput: (e) => { mail.adresse = e.target.value; appliquer(); } })),
        sousChamp("Objet du mail", el("input", { type: "text", value: mail.objet, placeholder: "Demande de devis LIFT5", oninput: (e) => { mail.objet = e.target.value; appliquer(); } })),
        sousChamp("Message pré-rempli (facultatif)", message),
        el("span", { class: "astuce discret", text: "Au clic, la messagerie du lecteur s'ouvre avec ces champs déjà remplis." })
      );
    }

    const segments = el("div", { class: "segments", role: "radiogroup" });
    for (const [valeur, nom] of [["web", "Page web"], ["email", "Email"]]) {
      segments.append(el("button", {
        type: "button", role: "radio", "aria-checked": String(mode === valeur), class: mode === valeur ? "actif" : null, text: nom,
        onclick: () => {
          if (mode === valeur) return;
          mode = valeur;
          if (mode === "email" && !mail.adresse) mail.adresse = "info@liftfoils.fr";
          segments.querySelectorAll("button").forEach((b) => { b.classList.toggle("actif", b.textContent === nom); b.setAttribute("aria-checked", String(b.textContent === nom)); });
          dessiner();
          appliquer();
        },
      }));
    }

    conteneur.append(el("span", { class: "libelle", text: c.libelle }), segments, corps);
    dessiner();
    return conteneur;
  }

  // ── Choix d'une image ────────────────────────────────────────────────────
  const dialogue = document.getElementById("choix-image");
  const grille = document.getElementById("ci-grille");
  const pagination = document.getElementById("ci-pagination");
  const recherche = document.getElementById("ci-recherche");
  const fichier = document.getElementById("ci-fichier");
  const depot = document.getElementById("ci-depot");
  const etatEnvoi = document.getElementById("ci-etat-envoi");
  const champUrl = document.getElementById("ci-url");
  let resoudre = null;
  let largeurCible = 600;
  let page = 1;
  let derniereRequete = 0;

  function choisirImage(largeur) {
    largeurCible = largeur;
    etatEnvoi.textContent = "";
    champUrl.value = "";
    dialogue.showModal();
    if (!grille.childElementCount) chargerMedias();
    return new Promise((r) => (resoudre = r));
  }
  function terminer(resultat) {
    const r = resoudre;
    resoudre = null;
    if (dialogue.open) dialogue.close();
    r?.(resultat);
  }
  dialogue.addEventListener("close", () => { if (resoudre) terminer(null); });

  dialogue.querySelectorAll("[data-onglet]").forEach((o) =>
    o.addEventListener("click", () => {
      dialogue.querySelectorAll("[data-onglet]").forEach((x) => x.classList.toggle("actif", x === o));
      dialogue.querySelectorAll("[data-volet]").forEach((v) => (v.hidden = v.dataset.volet !== o.dataset.onglet));
    })
  );

  async function chargerMedias() {
    const num = ++derniereRequete;
    grille.innerHTML = '<p class="ci-msg discret">Chargement…</p>';
    try {
      const rep = await fetch(`/api/medias?q=${encodeURIComponent(recherche.value.trim())}&page=${page}`);
      const d = await rep.json();
      if (num !== derniereRequete) return;
      if (!rep.ok) throw new Error(d.erreur || rep.status);
      grille.innerHTML = "";
      if (!d.items.length) grille.innerHTML = '<p class="ci-msg discret">Aucune image.</p>';
      for (const m of d.items) {
        grille.append(el("button", {
          type: "button", class: "ci-vignette", title: m.titre,
          onclick: () => {
            // La plus petite variante au moins deux fois plus large que la cible (écrans Retina).
            const assez = m.variantes.find((x) => x.largeur >= largeurCible * 2) || m.variantes.find((x) => x.largeur >= largeurCible);
            terminer({ src: assez ? assez.url : m.original.url, alt: m.alt || m.titre.replace(/<[^>]+>/g, "") });
          },
        }, el("img", { src: m.vignette, alt: "", loading: "lazy" })));
      }
      pagination.innerHTML = "";
      pagination.append(
        el("button", { type: "button", text: "‹ Précédentes", disabled: page <= 1, onclick: () => { page--; chargerMedias(); } }),
        el("span", { class: "discret", text: `page ${d.page} / ${d.totalPages}` }),
        el("button", { type: "button", text: "Suivantes ›", disabled: page >= d.totalPages, onclick: () => { page++; chargerMedias(); } })
      );
    } catch (e) {
      grille.innerHTML = `<p class="ci-msg discret">Médiathèque indisponible (${e.message}). Utilisez l'onglet « Depuis mon ordinateur ».</p>`;
    }
  }
  let minuterieRecherche;
  recherche.addEventListener("input", () => { clearTimeout(minuterieRecherche); page = 1; minuterieRecherche = setTimeout(chargerMedias, 350); });
  recherche.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });

  document.getElementById("ci-utiliser").addEventListener("click", () => {
    const u = champUrl.value.trim();
    if (!/^https?:\/\//i.test(u)) { champUrl.focus(); return; }
    terminer({ src: u, alt: "" });
  });
  champUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("ci-utiliser").click(); } });

  // Téléversement : les photos trop grandes sont réduites dans le navigateur
  // (un email lourd s'affiche lentement et finit plus souvent en spam).
  const LARGEUR_MAX = 1600;
  async function preparer(f) {
    if (f.type === "image/gif") return f; // on ne casse pas les GIF animés
    const bitmap = await createImageBitmap(f);
    const reduire = bitmap.width > LARGEUR_MAX;
    if (!reduire && f.type !== "image/webp" && f.size < 1.5e6) return f;
    const echelle = reduire ? LARGEUR_MAX / bitmap.width : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    const ctx = canvas.getContext("2d");
    const png = f.type === "image/png";
    if (!png) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((r) => canvas.toBlob(r, png ? "image/png" : "image/jpeg", 0.85));
  }

  async function televerser(f) {
    if (!f) return;
    if (!/^image\/(jpeg|png|gif|webp)$/.test(f.type)) { etatEnvoi.textContent = "Formats acceptés : JPEG, PNG, GIF ou WebP."; return; }
    etatEnvoi.textContent = "Préparation…";
    try {
      const corps = await preparer(f);
      if (corps.size > 8 * 1024 * 1024) throw new Error("image trop lourde (8 Mo au plus)");
      etatEnvoi.textContent = "Envoi…";
      const rep = await fetch("/api/medias/televerser", { method: "POST", headers: { "Content-Type": corps.type }, body: corps });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.erreur || `HTTP ${rep.status}`);
      terminer({ src: j.url, alt: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") });
    } catch (e) {
      etatEnvoi.textContent = `Échec : ${e.message}`;
    } finally {
      fichier.value = "";
    }
  }
  fichier.addEventListener("change", () => televerser(fichier.files[0]));
  depot.addEventListener("dragover", (e) => { e.preventDefault(); depot.classList.add("survol"); });
  depot.addEventListener("dragleave", () => depot.classList.remove("survol"));
  depot.addEventListener("drop", (e) => { e.preventDefault(); depot.classList.remove("survol"); televerser(e.dataTransfer.files[0]); });

  rendrePanneau();
})();
