/* ============================================
   AURA Creators Club — Home

   Identificação leve por cupom: na primeira visita a creator digita
   o cupom dela, a gente guarda no localStorage desse navegador e
   passa a mostrar saudação + estatísticas pessoais sempre que ela
   voltar. Não é login de verdade (sem Supabase Auth, sem sessão no
   servidor) — só um identificador lembrado no cliente, igual ao
   padrão que o vídeo impulsionado já usa pra consultar "total de
   posts enviados".

   As estatísticas vêm da função get_creator_stats(p_cupom) no banco
   (RPC) em vez de um SELECT direto na tabela — o RLS de
   aura_hub_submissions não libera SELECT pra anon (só INSERT), então
   um SELECT direto sempre voltaria vazio. A RPC é SECURITY DEFINER e
   devolve só a contagem do mês + nome, nunca e-mail/telefone/etc.

   Entrada animada com GSAP (carregado via CDN no index.html, antes
   deste script): o hero "chega com quique" (back.out), as linhas de
   ação entram em sequência, e o número de posts conta até o valor
   real em vez de só aparecer. Nada disso esconde conteúdo por CSS —
   se o GSAP falhar em carregar, a página continua legível normal,
   só sem a animação.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const STATS_RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/get_creator_stats`;
const CUPOM_STORAGE_KEY = "aura_hub_cupom";

document.addEventListener("DOMContentLoaded", () => {
  animarEntrada();

  const cupomSalvo = localStorage.getItem(CUPOM_STORAGE_KEY);
  if (cupomSalvo) {
    mostrarIdentificado(cupomSalvo);
  } else {
    mostrarFormularioIdentificacao();
  }
});

function animarEntrada() {
  if (typeof gsap === "undefined") return; // GSAP não carregou — página continua normal, só sem animação

  gsap.from("#status-card", { opacity: 0, scale: 0.96, duration: 0.6, ease: "back.out(1.6)" });
  gsap.from(".reveal-row", {
    opacity: 0,
    x: -18,
    duration: 0.5,
    stagger: 0.07,
    delay: 0.3,
    ease: "power3.out",
  });
}

function mostrarFormularioIdentificacao() {
  const card = document.getElementById("status-card");
  if (!card) return;

  card.innerHTML = `
    <p class="status-card__kicker">Primeira vez por aqui?</p>
    <p class="status-card__texto">Digite o seu cupom pra gente personalizar sua página.</p>
    <form id="identificacao-form" class="status-card__form">
      <input type="text" id="identificacao-cupom" placeholder="Seu cupom" autocomplete="off" required>
      <button type="submit" class="btn btn--primary">Entrar</button>
    </form>
    <p class="status-card__erro" id="identificacao-erro" hidden>Não encontramos esse cupom. Confere e tenta de novo.</p>
  `;

  document.getElementById("identificacao-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("identificacao-cupom");
    const erro = document.getElementById("identificacao-erro");
    const cupom = input.value.trim().toUpperCase();
    if (!cupom) return;

    erro.hidden = true;
    const stats = await buscarStats(cupom);

    if (!stats || !stats.creator_name) {
      erro.hidden = false;
      return;
    }

    localStorage.setItem(CUPOM_STORAGE_KEY, cupom);
    renderizarStatus(cupom, stats);
  });
}

async function mostrarIdentificado(cupom) {
  const stats = await buscarStats(cupom);
  if (!stats || !stats.creator_name) {
    // cupom salvo não bate mais com nenhuma submissão — volta pro formulário
    localStorage.removeItem(CUPOM_STORAGE_KEY);
    mostrarFormularioIdentificacao();
    return;
  }
  renderizarStatus(cupom, stats);
}

function renderizarStatus(cupom, stats) {
  const card = document.getElementById("status-card");
  if (!card) return;

  const primeiroNome = (stats.creator_name || "").trim().split(" ")[0] || "";

  const totalMes = stats.total_mes || 0;

  card.innerHTML = `
    <div class="status-card__topo">
      <div>
        <p class="status-card__ola">Olá,</p>
        <p class="status-card__nome">${escapeHtml(primeiroNome)}</p>
      </div>
      <a href="#" id="trocar-cupom" class="status-card__trocar">trocar cupom</a>
    </div>
    <div class="status-card__numero">
      <p class="status-card__numero-label">Posts enviados esse mês</p>
      <p class="status-card__numero-valor" id="status-numero">0</p>
      <p class="status-card__numero-cupom">cupom ${escapeHtml(cupom.toUpperCase())}</p>
    </div>
  `;

  document.getElementById("trocar-cupom").addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem(CUPOM_STORAGE_KEY);
    mostrarFormularioIdentificacao();
  });

  animarNumero(totalMes);
}

function animarNumero(valorFinal) {
  const el = document.getElementById("status-numero");
  if (!el) return;

  if (typeof gsap === "undefined") {
    el.textContent = valorFinal;
    return;
  }

  const contador = { valor: 0 };
  gsap.to(contador, {
    valor: valorFinal,
    duration: 1.1,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = Math.round(contador.valor);
    },
  });
}

async function buscarStats(cupom) {
  try {
    const res = await fetch(STATS_RPC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_cupom: cupom }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data[0] : null;
  } catch {
    return null;
  }
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}
