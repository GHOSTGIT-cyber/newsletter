/**
 * Page de l'éditeur (côté parent). Reçoit les modifications de l'iframe et des
 * champs Objet / Aperçu, les enregistre avec un léger délai, affiche l'état.
 */
(function () {
  const cadre = document.getElementById("cadre");
  const etat = document.getElementById("etat");
  const id = cadre.dataset.id;
  const lectureSeule = cadre.dataset.lectureSeule === "1";

  // ── Enregistrement différé, une file par zone ────────────────────────────
  const enAttente = new Map(); // chemin → { valeur, timer }
  let enCours = 0;

  function afficher(texte, classe) {
    etat.textContent = texte;
    etat.className = "etat " + (classe || "");
  }

  function planifier(chemin, valeur) {
    if (lectureSeule) return;
    const p = enAttente.get(chemin);
    if (p) clearTimeout(p.timer);
    enAttente.set(chemin, { valeur, timer: setTimeout(() => envoyer(chemin), 500) });
    afficher("Modifications en attente…", "attente");
  }

  async function envoyer(chemin) {
    const p = enAttente.get(chemin);
    if (!p) return;
    enAttente.delete(chemin);
    enCours++;
    try {
      const rep = await fetch(`/api/newsletters/${id}/contenu`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chemin, valeur: p.valeur }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        throw new Error(j.erreur || `HTTP ${rep.status}`);
      }
      enCours--;
      if (enCours === 0 && enAttente.size === 0) {
        const h = new Date().toTimeString().slice(0, 5);
        afficher(`Enregistré à ${h}`, "ok");
      }
    } catch (e) {
      enCours--;
      // On remet la valeur en file : elle repartira à la prochaine modification.
      enAttente.set(chemin, { valeur: p.valeur, timer: setTimeout(() => envoyer(chemin), 5000) });
      afficher(`Erreur d'enregistrement : ${e.message}`, "erreur");
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (enAttente.size > 0 || enCours > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ── Messages de l'iframe ─────────────────────────────────────────────────
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data) return;
    const m = e.data;
    if (m.type === "hauteur") cadre.style.height = Math.ceil(m.valeur) + "px";
    else if (m.type === "modif") planifier(m.chemin, m.valeur);
  });

  // ── Bouton « M'envoyer un test » ─────────────────────────────────────────
  const btest = document.getElementById("btest");
  if (btest) {
    btest.addEventListener("click", async () => {
      // On laisse d'abord partir ce qui n'est pas encore enregistré.
      for (const chemin of [...enAttente.keys()]) await envoyer(chemin);
      const libelle = btest.textContent;
      btest.disabled = true;
      btest.textContent = "Envoi…";
      try {
        const rep = await fetch(`/newsletters/${id}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
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
  }

  // ── Objet et préheader, hors iframe ──────────────────────────────────────
  document.querySelectorAll(".champ[contenteditable]").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const t = (e.clipboardData.getData("text/plain") || "").replace(/\s+/g, " ");
      document.execCommand("insertText", false, t);
    });
    el.addEventListener("input", () => {
      planifier(el.dataset.chemin, el.textContent.replace(/\s+/g, " ").trim());
    });
  });
})();
