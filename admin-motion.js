/* ============================================
   AURA Creators Hub — Admin: entrada animada

   Arquivo separado de propósito: não toca em nenhuma linha do
   admin.js (1500+ linhas de lógica real — login, aprovação,
   filtros, CRUD de categorias/campos). Só observa quando o
   admin.js injeta conteúdo novo dentro de .admin-kpis / .admin-list
   (troca de aba, filtro aplicado, aprovação feita, carregamento
   inicial) e anima a entrada com GSAP.

   Se o GSAP não carregar por algum motivo, essa função simplesmente
   não faz nada — o painel continua funcionando normal, só sem a
   animação.
   ============================================ */

(function () {
  if (typeof gsap === "undefined") return;

  const pendentes = new Set();
  let agendado = false;

  function animarPendentes() {
    agendado = false;
    pendentes.forEach((el) => {
      const filhos = Array.prototype.slice.call(el.children);
      if (!filhos.length) return;
      gsap.from(filhos, { opacity: 0, y: 8, duration: 0.35, stagger: 0.04, ease: "power2.out" });
    });
    pendentes.clear();
  }

  document.querySelectorAll(".admin-kpis, .admin-list").forEach((el) => {
    const observer = new MutationObserver(() => {
      pendentes.add(el);
      if (!agendado) {
        agendado = true;
        requestAnimationFrame(animarPendentes);
      }
    });
    observer.observe(el, { childList: true });
  });
})();
