/* ============================================
   AURA Creators Club — Navegação compartilhada

   Injeta nav.html dentro de #nav-placeholder em toda página de
   creator (Home, Enviar conteúdo, Vídeo impulsionado, Seeding,
   Chamados). Mantém um único lugar pra editar o menu em vez de
   duplicar a marcação em cada HTML — não tem build/template no
   projeto, então isso é feito com um fetch simples em runtime.

   Admin.html não carrega esse script (público diferente, login
   próprio).
   ============================================ */

(function () {
  const placeholder = document.getElementById("nav-placeholder");
  if (!placeholder) return;

  fetch("nav.html")
    .then((res) => res.text())
    .then((html) => {
      placeholder.outerHTML = html;
      marcarPaginaAtual();
    })
    .catch((err) => {
      console.error("Não consegui carregar a navegação:", err);
    });

  function marcarPaginaAtual() {
    const PAGINA_PARA_NAV = {
      "": "home",
      "index.html": "home",
      "enviar-conteudo.html": "enviar",
      "video-impulsionado.html": "video",
      "seeding.html": "seeding",
      "chamados.html": "chamados",
    };

    const paginaAtual = window.location.pathname.split("/").pop();
    const navAtual = PAGINA_PARA_NAV[paginaAtual];
    if (!navAtual) return;

    document.querySelectorAll('[data-nav="' + navAtual + '"]').forEach((el) => {
      el.setAttribute("aria-current", "page");
    });
  }
})();
