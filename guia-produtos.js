/* ============================================
   AURA Creators Club: Guia de produtos

   Filtro client-side simples (mostrar/esconder por categoria).
   Sem chamada a backend, sem reload de página: só um estado local
   de "categoria selecionada" controlando a visibilidade de cada
   bloco de seção.
   ============================================ */

(function () {
  const pills = document.querySelectorAll(".produtos-pill");
  const secoes = document.querySelectorAll(".produtos-secao");

  if (!pills.length || !secoes.length) return;

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const filtro = pill.getAttribute("data-filtro");
      aplicarFiltro(filtro);

      pills.forEach((p) => {
        p.setAttribute("aria-pressed", p === pill ? "true" : "false");
      });
    });
  });

  function aplicarFiltro(filtro) {
    secoes.forEach((secao) => {
      const categoria = secao.getAttribute("data-categoria");
      const mostra = filtro === "todas" || categoria === filtro;
      secao.hidden = !mostra;
    });
  }
})();
