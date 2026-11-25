/**
 * Script injecté dans l'aperçu de la mise en page libre. Rien n'y est
 * modifiable directement : un clic sur un bloc l'ouvre dans le panneau de
 * gauche. Le script remonte aussi la hauteur du document pour que l'iframe
 * s'ajuste.
 */
(function () {
  const parent = window.parent;
  // Le document est chargé en srcdoc : location.origin y vaut « null »,
  // self.origin donne la vraie origine (héritée de la page parente).
  const ORIGINE = self.origin;
  const envoyer = (m) => parent.postMessage(m, ORIGINE);
  const lectureSeule = (() => {
    try {
      return window.frameElement?.closest(".lecture-seule") != null;
    } catch {
      return true;
    }
  })();

  const signalerHauteur = () => envoyer({ type: "hauteur", valeur: document.documentElement.scrollHeight });
  new ResizeObserver(signalerHauteur).observe(document.body);
  window.addEventListener("load", signalerHauteur);
  document.querySelectorAll("img").forEach((img) => img.addEventListener("load", signalerHauteur));

  // Les liens ne doivent pas faire naviguer l'aperçu.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) e.preventDefault();
    if (lectureSeule) {
      if (a && a.href && !a.href.startsWith("about:")) window.open(a.href, "_blank", "noopener");
      return;
    }
    const bloc = e.target.closest("[data-bloc]");
    if (bloc) envoyer({ type: "choisir", id: bloc.getAttribute("data-bloc") });
  });

  if (lectureSeule) return;

  const style = document.createElement("style");
  style.textContent = `
    [data-bloc] { cursor: pointer; }
    [data-bloc] > td { transition: box-shadow .12s; }
    [data-bloc]:hover > td { box-shadow: inset 0 0 0 2px rgba(28,196,191,.55); }
    [data-bloc].lf-choisi > td { box-shadow: inset 0 0 0 3px #1cc4bf; }
  `;
  document.head.appendChild(style);

  window.addEventListener("message", (e) => {
    if (e.origin !== ORIGINE || !e.data || e.data.type !== "selection") return;
    document.querySelectorAll(".lf-choisi").forEach((x) => x.classList.remove("lf-choisi"));
    const el = e.data.id ? document.querySelector(`[data-bloc="${CSS.escape(e.data.id)}"]`) : null;
    if (!el) return;
    el.classList.add("lf-choisi");
    if (e.data.defiler) envoyer({ type: "position", haut: el.getBoundingClientRect().top + window.scrollY });
  });

  envoyer({ type: "pret" });
})();
