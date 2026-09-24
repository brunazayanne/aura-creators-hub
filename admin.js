/* ============================================
   AURA Creators Hub — Painel de gestão de conteúdo
   Login real via Supabase Auth (crie o usuário admin
   pelo Dashboard do Supabase: Authentication > Users).
   Depois de logada, as escritas em aura_hub_briefings,
   aura_hub_categorias, aura_hub_produtos e aura_hub_submissions
   são permitidas pela RLS porque a sessão é "authenticated" —
   a chave anon sozinha (usada no site público) só tem leitura
   e o insert de novas submissões.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
// E-mail de resposta do chamado de seeding: chamamos a Edge Function
// send-chamado-email direto daqui (mesmo motivo documentado em seeding.js —
// Database Webhook não pôde ser configurado por bug de infra da Supabase).
const CHAMADO_EMAIL_ENDPOINT = `${SUPABASE_URL}/functions/v1/send-chamado-email`;

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATEGORIAS = [];
let BRIEFINGS = [];
let ALL_SUBMISSOES = [];
let ALL_CHAMADOS = [];
let SUBMISSOES_PAGE = 1;
let VI_SUBMISSOES_PAGE = 1;
const SUBMISSOES_POR_PAGINA = 10;
const VIDEO_IMPULSIONADO_PLATFORM = "video_impulsionado_drive";

const PLATAFORMA_LABELS = {
  instagram: "Instagram (Reels)",
  instagram_story: "Instagram (Story)",
  instagram_carrossel: "Instagram (Carrossel)",
  tiktok: "TikTok",
  youtube_shorts: "YouTube (Shorts)",
  youtube_longo: "YouTube (Conteúdo longo)",
  outros: "Outros",
  video_impulsionado_drive: "Vídeo Impulsionado (Drive)",
};

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await client.auth.getSession();
  if (session) showApp();
  else showLogin();

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll(".admin-group").forEach((group) => {
    group.addEventListener("click", () => switchGroup(group.dataset.group));
  });

  document.getElementById("c-add").addEventListener("click", addCategoria);

  document.getElementById("s-filter-briefing").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-plataforma").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-produto").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-date-from").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-date-to").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-clear").addEventListener("click", () => {
    document.getElementById("s-filter-briefing").value = "";
    document.getElementById("s-filter-plataforma").value = "";
    document.getElementById("s-filter-produto").value = "";
    document.getElementById("s-filter-date-from").value = "";
    document.getElementById("s-filter-date-to").value = "";
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });

  document.getElementById("ch-filter-status")?.addEventListener("change", renderChamados);

  document.getElementById("vi-filter-produto")?.addEventListener("change", () => {
    VI_SUBMISSOES_PAGE = 1;
    renderVIList();
  });
  document.getElementById("vi-filter-status")?.addEventListener("change", () => {
    VI_SUBMISSOES_PAGE = 1;
    renderVIList();
  });
  document.getElementById("vi-filter-date-from")?.addEventListener("change", () => {
    VI_SUBMISSOES_PAGE = 1;
    renderVIList();
  });
  document.getElementById("vi-filter-date-to")?.addEventListener("change", () => {
    VI_SUBMISSOES_PAGE = 1;
    renderVIList();
  });
  document.getElementById("vi-filter-clear")?.addEventListener("click", () => {
    document.getElementById("vi-filter-produto").value = "";
    document.getElementById("vi-filter-status").value = "";
    document.getElementById("vi-filter-date-from").value = "";
    document.getElementById("vi-filter-date-to").value = "";
    VI_SUBMISSOES_PAGE = 1;
    renderVIList();
  });

  wireVendasUpload();
});

function populateSubmissaoBriefingFilter() {
  const select = document.getElementById("s-filter-briefing");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Todos os briefings</option><option value="__sem_briefing__">Sem briefing</option>';
  BRIEFINGS.forEach((b) => {
    const el = document.createElement("option");
    el.value = b.id;
    el.textContent = b.titulo;
    select.appendChild(el);
  });
  select.value = current;
}

function populateSubmissaoProdutoFilter() {
  const select = document.getElementById("s-filter-produto");
  if (!select) return;
  const current = select.value;
  const produtos = new Set();
  let temSemProduto = false;
  hubSubmissoes().forEach((s) => {
    const nome = s.produto_nome || s.categoria_produto || "";
    if (nome) produtos.add(nome);
    else temSemProduto = true;
  });
  const opcoes = ['<option value="">Todos os produtos</option>'];
  if (temSemProduto) opcoes.push('<option value="__sem_produto__">Sem produto informado</option>');
  Array.from(produtos)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach((nome) => {
      opcoes.push(`<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`);
    });
  select.innerHTML = opcoes.join("");
  select.value = current;
}

function populateVIProdutoFilter() {
  const select = document.getElementById("vi-filter-produto");
  if (!select) return;
  const current = select.value;
  const produtos = new Set();
  let temSemProduto = false;
  viSubmissoes().forEach((s) => {
    const nome = s.produto_nome || s.categoria_produto || "";
    if (nome) produtos.add(nome);
    else temSemProduto = true;
  });
  const opcoes = ['<option value="">Todos os produtos</option>'];
  if (temSemProduto) opcoes.push('<option value="__sem_produto__">Sem produto informado</option>');
  Array.from(produtos)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach((nome) => {
      opcoes.push(`<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`);
    });
  select.innerHTML = opcoes.join("");
  select.value = current;
}

function switchTab(name) {
  document.querySelectorAll(".admin-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll(".admin-panel").forEach((p) => p.dataset.active = String(p.dataset.panel === name));
}

function switchGroup(name) {
  document.querySelectorAll(".admin-group").forEach((g) => g.setAttribute("aria-selected", String(g.dataset.group === name)));
  document.querySelectorAll(".admin-group-content").forEach((c) => {
    c.hidden = c.dataset.groupContent !== name;
  });
}

/* Vídeo Impulsionado usa a mesma tabela aura_hub_submissions do hub
   principal, distinguido pelo content_platform. Essas duas funções
   separam o dataset já carregado em memória — sem select novo no banco. */
function hubSubmissoes() {
  return ALL_SUBMISSOES.filter((s) => s.content_platform !== VIDEO_IMPULSIONADO_PLATFORM);
}

function viSubmissoes() {
  return ALL_SUBMISSOES.filter((s) => s.content_platform === VIDEO_IMPULSIONADO_PLATFORM);
}

/* ---------- AUTENTICAÇÃO ---------- */

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const feedback = document.getElementById("login-feedback");
  feedback.textContent = "";
  feedback.removeAttribute("data-state");

  if (!email || !password) {
    feedback.textContent = "Preencha e-mail e senha.";
    feedback.dataset.state = "error";
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    feedback.textContent = "Não conseguimos entrar. Confira o e-mail e a senha.";
    feedback.dataset.state = "error";
    return;
  }
  showApp();
}

async function handleLogout() {
  await client.auth.signOut();
  showLogin();
}

function showLogin() {
  document.getElementById("login-box").hidden = false;
  document.getElementById("admin-app").hidden = true;
}

async function showApp() {
  document.getElementById("login-box").hidden = true;
  document.getElementById("admin-app").hidden = false;
  loadCategorias();
  await loadSubmissoes();
  loadChamados();
  loadRelatorio();
}

/* ---------- HELPERS ---------- */

function feedbackEl(id, message, state) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.dataset.state = state;
  setTimeout(() => { el.textContent = ""; el.removeAttribute("data-state"); }, 4000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function isPast(prazo) {
  if (!prazo) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(`${prazo}T00:00:00`) < hoje;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

// Filtro de calendário (De/Até) usado nas duas abas de Submissões.
// `de`/`ate` vêm de <input type="date"> no formato "YYYY-MM-DD".
// Compara por dia local, incluindo o dia inteiro selecionado em "até".
function matchesDateRange(createdAt, de, ate) {
  if (!de && !ate) return true;
  if (!createdAt) return false;
  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return false;

  if (de) {
    const inicio = new Date(`${de}T00:00:00`);
    if (data < inicio) return false;
  }
  if (ate) {
    const fim = new Date(`${ate}T23:59:59.999`);
    if (data > fim) return false;
  }
  return true;
}

/* ---------- CATEGORIAS (lista única, sem produtos aninhados) ----------
   Antes existia uma segunda etapa (produto específico por SKU/fragrância)
   dentro de cada categoria. Simplificado em 23/09/2026 pra um único campo
   genérico — a creator escolhe o tipo de produto (Body Splash, Perfume,
   Body Lotion, etc.), sem precisar identificar a fragrância exata.
   A tabela aura_hub_produtos continua existindo (histórico), mas não é
   mais gerida por aqui nem usada pelo formulário público. */

async function loadCategorias() {
  const list = document.getElementById("c-list");
  const { data: categorias, error: catError } = await client
    .from("aura_hub_categorias")
    .select("*")
    .order("ordem", { ascending: true });

  if (catError) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(catError.message)}</p>`;
    return;
  }

  CATEGORIAS = categorias || [];

  if (CATEGORIAS.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma categoria cadastrada ainda.</p>';
    return;
  }

  list.innerHTML = CATEGORIAS
    .map(
      (c) => `
        <div class="admin-row${c.ativo ? "" : " admin-row--inativo"}">
          <span>${escapeHtml(c.nome)}${c.ativo ? "" : " (inativa)"}</span>
          <div class="admin-row__actions">
            <button type="button" data-action="toggle-categoria" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? "Desativar" : "Ativar"}</button>
            <button type="button" class="danger" data-action="delete-categoria" data-id="${c.id}">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");

  list.querySelectorAll('[data-action="toggle-categoria"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleCategoria(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  list.querySelectorAll('[data-action="delete-categoria"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteCategoria(btn.dataset.id))
  );
}

async function addCategoria() {
  const nome = document.getElementById("c-nome").value.trim();
  const ordem = Number(document.getElementById("c-ordem").value) || 0;

  if (!nome) {
    feedbackEl("c-feedback", "Nome é obrigatório.", "error");
    return;
  }

  const { error } = await client.from("aura_hub_categorias").insert({ nome, ordem });
  if (error) {
    feedbackEl("c-feedback", `Erro: ${error.message}`, "error");
    return;
  }

  feedbackEl("c-feedback", "Categoria adicionada.", "success");
  document.getElementById("c-nome").value = "";
  loadCategorias();
}

async function toggleCategoria(id, ativoAtual) {
  await client.from("aura_hub_categorias").update({ ativo: !ativoAtual }).eq("id", id);
  loadCategorias();
}

async function deleteCategoria(id) {
  if (!confirm("Excluir essa categoria?")) return;
  await client.from("aura_hub_categorias").delete().eq("id", id);
  loadCategorias();
}

/* ---------- SUBMISSÕES (aprovação pro mural + upload de imagem) ---------- */

async function loadSubmissoes() {
  const list = document.getElementById("s-list");
  const { data, error } = await client
    .from("aura_hub_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }

  ALL_SUBMISSOES = data || [];
  populateSubmissaoBriefingFilter();
  populateSubmissaoProdutoFilter();
  renderSubmissoes();
  renderVISection();
}

function renderSubmissoes() {
  const list = document.getElementById("s-list");
  const filtroBriefing = document.getElementById("s-filter-briefing")?.value || "";
  const filtroPlataforma = document.getElementById("s-filter-plataforma")?.value || "";
  const filtroProduto = document.getElementById("s-filter-produto")?.value || "";
  const filtroDataDe = document.getElementById("s-filter-date-from")?.value || "";
  const filtroDataAte = document.getElementById("s-filter-date-to")?.value || "";

  const base = hubSubmissoes();
  const data = base.filter((s) => {
    if (filtroBriefing === "__sem_briefing__" && s.briefing_id) return false;
    if (filtroBriefing && filtroBriefing !== "__sem_briefing__" && s.briefing_id !== filtroBriefing) return false;
    if (filtroPlataforma && s.content_platform !== filtroPlataforma) return false;
    const produtoNome = s.produto_nome || s.categoria_produto || "";
    if (filtroProduto === "__sem_produto__" && produtoNome) return false;
    if (filtroProduto && filtroProduto !== "__sem_produto__" && produtoNome !== filtroProduto) return false;
    if (!matchesDateRange(s.created_at, filtroDataDe, filtroDataAte)) return false;
    return true;
  });

  if (base.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma submissão recebida ainda.</p>';
    return;
  }
  if (data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma submissão encontrada com esse filtro.</p>';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(data.length / SUBMISSOES_POR_PAGINA));
  if (SUBMISSOES_PAGE > totalPaginas) SUBMISSOES_PAGE = totalPaginas;
  if (SUBMISSOES_PAGE < 1) SUBMISSOES_PAGE = 1;

  const inicio = (SUBMISSOES_PAGE - 1) * SUBMISSOES_POR_PAGINA;
  const pageData = data.slice(inicio, inicio + SUBMISSOES_POR_PAGINA);

  const rowsHtml = pageData
    .map((s) => {
      const handle = (s.instagram_handle || "").replace(/^@+/, "");
      const statusTag = s.approved
        ? '<span class="admin-tag admin-tag--ok">No mural</span>'
        : '<span class="admin-tag admin-tag--pending">Pendente</span>';
      const consentTag = s.consent_public_display
        ? "autorizou exibir no mural"
        : "não autorizou exibir no mural";
      const adcodeTag = s.boost_authorized
        ? `Autorizou impulsionamento · adcode: <strong>${escapeHtml(s.boost_adcode || "não informado")}</strong>`
        : "Não autorizou impulsionamento";
      const postedAt = formatDateTime(s.created_at);
      const briefingTitulo = s.briefing_id
        ? (BRIEFINGS.find((b) => b.id === s.briefing_id)?.titulo || "Briefing removido")
        : "Sem briefing";
      const briefingTag = `<span class="admin-tag admin-tag--briefing">${escapeHtml(briefingTitulo)}</span>`;

      return `
        <div class="admin-row admin-row--submissao" data-id="${s.id}">
          <div class="admin-submissao__info">
            <p><strong>${escapeHtml(s.creator_name || "Sem nome")}</strong> ${handle ? `— @${escapeHtml(handle)}` : ""} ${statusTag} ${briefingTag}</p>
            <p style="font-size:12px;opacity:.75;">
              ${escapeHtml(s.content_platform || "")} · ${escapeHtml(consentTag)}
              ${s.content_url ? ` · <a href="${encodeURI(s.content_url)}" target="_blank" rel="noopener">Ver conteúdo</a>` : ""}
            </p>
            ${postedAt ? `<p style="font-size:12px;opacity:.75;">Postado em ${escapeHtml(postedAt)}</p>` : ""}
            <p style="font-size:12px;opacity:.75;">${adcodeTag}</p>
          </div>
          <div class="admin-submissao__actions">
            <button type="button" data-action="toggle-approve" data-approved="${s.approved}">${s.approved ? "Tirar do mural" : "Aprovar pro mural"}</button>
            ${
              s.approved
                ? `<span style="display:flex;align-items:center;gap:6px;">
                    <input type="number" data-role="ordem-input" value="${s.mural_ordem ?? ""}" placeholder="ordem" style="width:70px;">
                    <button type="button" data-action="save-ordem">Salvar ordem</button>
                  </span>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  const pagerHtml = `
    <div class="admin-pager" style="display:flex;align-items:center;gap:14px;justify-content:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--placeholder-gray);">
      <button type="button" class="btn btn--small btn--outline" id="s-pager-prev" ${SUBMISSOES_PAGE <= 1 ? "disabled" : ""}>&larr; Página anterior</button>
      <span style="font-size:13px;opacity:.75;">Página ${SUBMISSOES_PAGE} de ${totalPaginas}</span>
      <button type="button" class="btn btn--small btn--outline" id="s-pager-next" ${SUBMISSOES_PAGE >= totalPaginas ? "disabled" : ""}>Próxima página &rarr;</button>
    </div>
  `;

  list.innerHTML = rowsHtml + (totalPaginas > 1 ? pagerHtml : "");

  list.querySelectorAll('[data-action="toggle-approve"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      toggleApproveSubmission(id, btn.dataset.approved === "true");
    })
  );
  list.querySelectorAll('[data-action="save-ordem"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      saveMuralOrdem(id, btn);
    })
  );

  const prevBtn = document.getElementById("s-pager-prev");
  const nextBtn = document.getElementById("s-pager-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      SUBMISSOES_PAGE -= 1;
      renderSubmissoes();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      SUBMISSOES_PAGE += 1;
      renderSubmissoes();
    });
  }
}

async function toggleApproveSubmission(id, approvedAtual) {
  const { error } = await client.from("aura_hub_submissions").update({ approved: !approvedAtual }).eq("id", id);
  if (error) {
    alert(`Erro ao atualizar: ${error.message}`);
    return;
  }
  loadSubmissoes();
}

async function saveMuralOrdem(id, btn) {
  const row = btn.closest("[data-id]");
  const input = row.querySelector('[data-role="ordem-input"]');
  const raw = input.value.trim();
  const mural_ordem = raw === "" ? null : Number(raw);

  if (raw !== "" && Number.isNaN(mural_ordem)) {
    alert("Digite um número válido pra ordem.");
    return;
  }

  const { error } = await client.from("aura_hub_submissions").update({ mural_ordem }).eq("id", id);
  if (error) {
    alert(`Erro ao salvar ordem: ${error.message}`);
    return;
  }
  loadSubmissoes();
}

/* ---------- CHAMADOS DE SEEDING ---------- */

async function loadChamados() {
  const list = document.getElementById("ch-list");
  const { data, error } = await client
    .from("aura_hub_seeding_chamados")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }

  ALL_CHAMADOS = data || [];
  renderChamados();
}

function renderChamados() {
  const list = document.getElementById("ch-list");
  const kpisEl = document.getElementById("ch-kpis");
  const filtroStatus = document.getElementById("ch-filter-status")?.value || "";

  if (kpisEl) renderChamadosKpis(kpisEl, ALL_CHAMADOS);

  if (ALL_CHAMADOS.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum chamado recebido ainda.</p>';
    return;
  }

  const data = ALL_CHAMADOS.filter((c) => !filtroStatus || c.status === filtroStatus);
  if (data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum chamado encontrado com esse filtro.</p>';
    return;
  }

  list.innerHTML = data.map(chamadoRowHtml).join("");
  wireChamadoRowActions(list);
}

function renderChamadosKpis(el, chamados) {
  const total = chamados.length;
  const abertos = chamados.filter((c) => c.status !== "respondido").length;
  const respondidos = chamados.filter((c) => c.status === "respondido").length;

  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${total}</span><span class="admin-kpi__label">Chamados recebidos</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${abertos}</span><span class="admin-kpi__label">Em aberto</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${respondidos}</span><span class="admin-kpi__label">Respondidos</span></div>
  `;
}

function chamadoRowHtml(c) {
  const statusTag = c.status === "respondido"
    ? '<span class="admin-tag admin-tag--ok">Respondido</span>'
    : '<span class="admin-tag admin-tag--pending">Em aberto</span>';
  const recebidoEm = formatDateTime(c.created_at);
  const respondidoEm = formatDateTime(c.responded_at);

  return `
    <div class="admin-row admin-row--submissao" data-id="${c.id}">
      <div class="admin-submissao__info">
        <p><strong>${escapeHtml(c.nome || "Sem nome")}</strong> — cupom <strong>${escapeHtml(c.cupom || "não informado")}</strong> ${statusTag}</p>
        <p style="font-size:12px;opacity:.75;">
          ${escapeHtml(c.email || "")}${c.cpf ? ` · CPF ${escapeHtml(c.cpf)}` : ""}
          ${recebidoEm ? ` · recebido em ${escapeHtml(recebidoEm)}` : ""}
        </p>
        <p style="margin-top:8px;white-space:pre-wrap;">${escapeHtml(c.mensagem || "")}</p>
        ${
          c.status === "respondido"
            ? `<div style="margin-top:10px;padding:10px 12px;background:var(--offwhite);border-radius:var(--radius-sm);">
                <p style="font-size:12px;opacity:.75;margin-bottom:4px;">Resposta enviada${respondidoEm ? ` em ${escapeHtml(respondidoEm)}` : ""}:</p>
                <p style="white-space:pre-wrap;">${escapeHtml(c.resposta || "")}</p>
              </div>`
            : ""
        }
      </div>
      <div class="admin-submissao__actions" style="flex-direction:column;align-items:stretch;">
        <textarea data-role="ch-resposta" rows="3" placeholder="Escreva a resposta pra creator" style="font-family:var(--font);font-size:14px;padding:10px 12px;border:1px solid var(--placeholder-gray);border-radius:var(--radius-sm);resize:vertical;">${escapeHtml(c.resposta || "")}</textarea>
        <button type="button" data-action="save-resposta">${c.status === "respondido" ? "Salvar nova resposta" : "Marcar como respondido"}</button>
      </div>
    </div>
  `;
}

function wireChamadoRowActions(container) {
  container.querySelectorAll('[data-action="save-resposta"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const row = btn.closest("[data-id]");
      const id = row.dataset.id;
      const textarea = row.querySelector('[data-role="ch-resposta"]');
      saveChamadoResposta(id, textarea.value.trim(), btn);
    })
  );
}

async function saveChamadoResposta(id, resposta, btn) {
  if (!resposta) {
    alert("Escreva a resposta antes de salvar.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Salvando…";

  const chamadoAnterior = ALL_CHAMADOS.find((c) => c.id === id);
  const statusAnterior = chamadoAnterior?.status || "aberto";

  const { error } = await client
    .from("aura_hub_seeding_chamados")
    .update({ status: "respondido", resposta, responded_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    alert(`Erro ao salvar resposta: ${error.message}`);
    btn.disabled = false;
    btn.textContent = "Marcar como respondido";
    return;
  }

  // Só dispara e-mail se realmente virou "respondido" agora (evita reenviar
  // toda vez que alguém edita a resposta de um chamado já respondido).
  if (statusAnterior !== "respondido") {
    notifyChamadoEmail({
      type: "UPDATE",
      table: "aura_hub_seeding_chamados",
      record: { ...chamadoAnterior, status: "respondido", resposta },
      old_record: { ...chamadoAnterior, status: statusAnterior },
    });
  }

  loadChamados();
}

async function notifyChamadoEmail(body) {
  try {
    const res = await fetch(CHAMADO_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("send-chamado-email respondeu com erro:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Falha ao chamar send-chamado-email:", err);
  }
}

/* ---------- RELATÓRIO ---------- */

async function loadRelatorio() {
  const kpisEl = document.getElementById("r-kpis");
  const plataformaEl = document.getElementById("r-plataforma");
  const produtoEl = document.getElementById("r-produto");
  const rankingEl = document.getElementById("r-ranking");

  // Reaproveita as submissões já carregadas por loadSubmissoes() em vez de
  // repetir um select * na mesma tabela — reduz carga no banco a cada
  // abertura do painel (projeto está no plano free do Supabase).
  // hubSubmissoes() exclui os envios de Vídeo Impulsionado, que têm
  // relatório próprio na outra aba do menu.
  const submissions = hubSubmissoes();

  if (submissions.length === 0) {
    [kpisEl, plataformaEl, produtoEl, rankingEl].forEach((el) => {
      el.innerHTML = '<p class="admin-empty">Nenhuma submissão recebida ainda.</p>';
    });
    return;
  }

  renderRelatorioKpis(kpisEl, submissions);
  renderRelatorioPlataforma(plataformaEl, submissions);
  renderRelatorioProduto(produtoEl, submissions);
  renderRelatorioRanking(rankingEl, submissions);
}

function renderRelatorioKpis(el, submissions) {
  const total = submissions.length;
  const aprovadas = submissions.filter((s) => s.approved).length;
  const pendentes = total - aprovadas;
  const creatorsUnicas = new Set(submissions.map((s) => (s.coupon_code || s.creator_email || "").toLowerCase()).filter(Boolean)).size;

  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${total}</span><span class="admin-kpi__label">Submissões</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${aprovadas}</span><span class="admin-kpi__label">No mural</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${pendentes}</span><span class="admin-kpi__label">Pendentes</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${creatorsUnicas}</span><span class="admin-kpi__label">Creators únicas</span></div>
  `;
}

function renderRelatorioPlataforma(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = s.content_platform || "não informado";
    counts[key] = (counts[key] || 0) + 1;
  });

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = submissions.length;

  el.innerHTML = rows
    .map(([key, count]) => {
      const label = PLATAFORMA_LABELS[key] || key;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="admin-row admin-row--metric">
          <span>${escapeHtml(label)}</span>
          <span class="admin-row__metric-value">${count} <span class="admin-row__metric-pct">(${pct}%)</span></span>
        </div>
      `;
    })
    .join("");
}

function renderRelatorioProduto(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = s.produto_nome || s.categoria_produto || "__sem_produto__";
    counts[key] = (counts[key] || 0) + 1;
  });

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  el.innerHTML = rows
    .map(([key, count]) => {
      const label = key === "__sem_produto__" ? "Sem produto informado" : key;
      return `
        <div class="admin-row admin-row--metric">
          <span>${escapeHtml(label)}</span>
          <span class="admin-row__metric-value">${count}</span>
        </div>
      `;
    })
    .join("");
}

function renderRelatorioRanking(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = (s.coupon_code || "").trim();
    if (!key) return;
    if (!counts[key]) counts[key] = { count: 0, nome: s.creator_name || "" };
    counts[key].count += 1;
  });

  const rows = Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  if (rows.length === 0) {
    el.innerHTML = '<p class="admin-empty">Nenhum cupom identificado ainda.</p>';
    return;
  }

  el.innerHTML = rows
    .map(
      ([cupom, info], index) => `
      <div class="admin-row admin-row--metric">
        <span>${index + 1}. ${escapeHtml(info.nome || "Sem nome")} — <strong>${escapeHtml(cupom)}</strong></span>
        <span class="admin-row__metric-value">${info.count}</span>
      </div>
    `
    )
    .join("");
}

/* ---------- VÍDEO IMPULSIONADO (mesma tabela do hub, filtrada por content_platform) ---------- */

function renderVISection() {
  const submissions = viSubmissoes();
  const kpisEl = document.getElementById("vi-kpis");
  const rankingEl = document.getElementById("vi-ranking");
  if (!kpisEl || !rankingEl) return;

  if (submissions.length === 0) {
    kpisEl.innerHTML = '<p class="admin-empty">Nenhum vídeo enviado ainda.</p>';
    rankingEl.innerHTML = '<p class="admin-empty">Nenhum vídeo enviado ainda.</p>';
  } else {
    renderVIKpis(kpisEl, submissions);
    renderRelatorioRanking(rankingEl, submissions);
  }

  populateVIProdutoFilter();
  renderVIList();
}

function renderVIKpis(el, submissions) {
  const total = submissions.length;
  const selecionados = submissions.filter((s) => s.approved).length;
  const pendentes = total - selecionados;
  const creatorsUnicas = new Set(submissions.map((s) => (s.coupon_code || "").toLowerCase()).filter(Boolean)).size;

  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${total}</span><span class="admin-kpi__label">Vídeos enviados</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${selecionados}</span><span class="admin-kpi__label">Selecionados pra impulsionar</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${pendentes}</span><span class="admin-kpi__label">Pendentes</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${creatorsUnicas}</span><span class="admin-kpi__label">Creators únicas</span></div>
  `;
}

function renderVIList() {
  const list = document.getElementById("vi-list");
  if (!list) return;
  const filtroProduto = document.getElementById("vi-filter-produto")?.value || "";
  const filtroStatus = document.getElementById("vi-filter-status")?.value || "";
  const filtroDataDe = document.getElementById("vi-filter-date-from")?.value || "";
  const filtroDataAte = document.getElementById("vi-filter-date-to")?.value || "";

  const base = viSubmissoes();
  const data = base.filter((s) => {
    const produtoNome = s.produto_nome || s.categoria_produto || "";
    if (filtroProduto === "__sem_produto__" && produtoNome) return false;
    if (filtroProduto && filtroProduto !== "__sem_produto__" && produtoNome !== filtroProduto) return false;
    if (filtroStatus === "selecionado" && !s.approved) return false;
    if (filtroStatus === "pendente" && s.approved) return false;
    if (!matchesDateRange(s.created_at, filtroDataDe, filtroDataAte)) return false;
    return true;
  });

  if (base.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum vídeo enviado ainda.</p>';
    return;
  }
  if (data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum vídeo encontrado com esse filtro.</p>';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(data.length / SUBMISSOES_POR_PAGINA));
  if (VI_SUBMISSOES_PAGE > totalPaginas) VI_SUBMISSOES_PAGE = totalPaginas;
  if (VI_SUBMISSOES_PAGE < 1) VI_SUBMISSOES_PAGE = 1;

  const inicio = (VI_SUBMISSOES_PAGE - 1) * SUBMISSOES_POR_PAGINA;
  const pageData = data.slice(inicio, inicio + SUBMISSOES_POR_PAGINA);

  const rowsHtml = pageData
    .map((s) => {
      const statusTag = s.approved
        ? '<span class="admin-tag admin-tag--ok">Selecionado pra impulsionar</span>'
        : '<span class="admin-tag admin-tag--pending">Pendente</span>';
      const produtoLabel = s.produto_nome || s.categoria_produto || "Sem produto informado";
      const postedAt = formatDateTime(s.created_at);

      return `
        <div class="admin-row admin-row--submissao" data-id="${s.id}">
          <div class="admin-submissao__info">
            <p><strong>${escapeHtml(s.creator_name || "Sem nome")}</strong>${s.coupon_code ? ` — cupom <strong>${escapeHtml(s.coupon_code)}</strong>` : ""} ${statusTag}</p>
            <p style="font-size:12px;opacity:.75;">
              ${escapeHtml(produtoLabel)}
              ${s.content_url ? ` · <a href="${encodeURI(s.content_url)}" target="_blank" rel="noopener">Ver vídeo no Drive</a>` : ""}
            </p>
            ${postedAt ? `<p style="font-size:12px;opacity:.75;">Enviado em ${escapeHtml(postedAt)}</p>` : ""}
          </div>
          <div class="admin-submissao__actions">
            <button type="button" data-action="toggle-vi-approve" data-approved="${s.approved}">${s.approved ? "Tirar da seleção" : "Selecionar pra impulsionar"}</button>
          </div>
        </div>
      `;
    })
    .join("");

  const pagerHtml = `
    <div class="admin-pager" style="display:flex;align-items:center;gap:14px;justify-content:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--placeholder-gray);">
      <button type="button" class="btn btn--small btn--outline" id="vi-pager-prev" ${VI_SUBMISSOES_PAGE <= 1 ? "disabled" : ""}>&larr; Página anterior</button>
      <span style="font-size:13px;opacity:.75;">Página ${VI_SUBMISSOES_PAGE} de ${totalPaginas}</span>
      <button type="button" class="btn btn--small btn--outline" id="vi-pager-next" ${VI_SUBMISSOES_PAGE >= totalPaginas ? "disabled" : ""}>Próxima página &rarr;</button>
    </div>
  `;

  list.innerHTML = rowsHtml + (totalPaginas > 1 ? pagerHtml : "");

  list.querySelectorAll('[data-action="toggle-vi-approve"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      toggleApproveSubmission(id, btn.dataset.approved === "true");
    })
  );

  const prevBtn = document.getElementById("vi-pager-prev");
  const nextBtn = document.getElementById("vi-pager-next");
  if (prevBtn) prevBtn.addEventListener("click", () => { VI_SUBMISSOES_PAGE -= 1; renderVIList(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { VI_SUBMISSOES_PAGE += 1; renderVIList(); });
}

/* ---------- CRUZAMENTO COM VENDAS (upload de CSV, sem persistência) ---------- */

let vendasChart = null;

function parseCsv(text) {
  const firstLine = (text.split(/\r?\n/)[0] || "");
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.length > 1 || (r[0] || "").trim() !== "")
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
      return obj;
    });
}

function parseVendaData(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseVendaValor(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function wireVendasUpload() {
  const btn = document.getElementById("v-csv-process");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const input = document.getElementById("v-csv-input");
    const file = input.files && input.files[0];
    if (!file) {
      feedbackEl("v-csv-feedback", "Escolha um arquivo CSV primeiro.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        processVendasCsv(String(e.target.result));
      } catch (err) {
        feedbackEl("v-csv-feedback", `Erro ao processar CSV: ${err.message}`, "error");
      }
    };
    reader.onerror = () => feedbackEl("v-csv-feedback", "Não consegui ler o arquivo.", "error");
    reader.readAsText(file, "utf-8");
  });
}

function processVendasCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    feedbackEl("v-csv-feedback", "CSV vazio ou em formato não reconhecido.", "error");
    return;
  }

  const colunas = Object.keys(rows[0]);
  const couponCol = colunas.find((k) => k.includes("coupon")) || "coupons";
  const dateCol = colunas.find((k) => k.includes("date_sale")) || "date_sale";
  const valueCol = colunas.find((k) => k.includes("order_value")) || "order_value";

  const cuponsCreators = new Set(
    ALL_SUBMISSOES.map((s) => (s.coupon_code || "").trim().toUpperCase()).filter(Boolean)
  );

  if (cuponsCreators.size === 0) {
    feedbackEl("v-csv-feedback", "Nenhuma submissão com cupom cadastrado ainda pra cruzar.", "error");
    return;
  }

  const vendasPorDia = {};
  const cuponsSemMatch = new Set();
  let vendasCruzadas = 0;
  let valorCruzado = 0;

  rows.forEach((r) => {
    const cupom = (r[couponCol] || "").trim().toUpperCase();
    if (!cupom) return;
    const data = parseVendaData(r[dateCol]);
    if (!data) return;
    const valor = parseVendaValor(r[valueCol]);

    if (!cuponsCreators.has(cupom)) {
      cuponsSemMatch.add(cupom);
      return;
    }

    const key = dateKey(data);
    if (!vendasPorDia[key]) vendasPorDia[key] = { total: 0, count: 0 };
    vendasPorDia[key].total += valor;
    vendasPorDia[key].count += 1;
    vendasCruzadas += 1;
    valorCruzado += valor;
  });

  const postagensPorDia = {};
  ALL_SUBMISSOES.forEach((s) => {
    if (!s.created_at) return;
    const d = new Date(s.created_at);
    if (Number.isNaN(d.getTime())) return;
    const key = dateKey(d);
    postagensPorDia[key] = (postagensPorDia[key] || 0) + 1;
  });

  const todasAsChaves = new Set([...Object.keys(vendasPorDia), ...Object.keys(postagensPorDia)]);
  const dias = Array.from(todasAsChaves).sort();

  if (dias.length === 0) {
    feedbackEl("v-csv-feedback", "Não encontrei vendas de cupons de creators nesse CSV.", "error");
    return;
  }

  const hojeKey = dateKey(new Date());

  renderVendasKpis(vendasCruzadas, valorCruzado, cuponsSemMatch.size);
  renderVendasChart(dias, postagensPorDia, vendasPorDia, hojeKey);
  renderCuponsSemMatch(cuponsSemMatch);

  feedbackEl("v-csv-feedback", `CSV processado: ${rows.length} vendas lidas, ${vendasCruzadas} cruzadas com cupons de creators.`, "success");
}

function renderVendasKpis(vendasCruzadas, valorCruzado, semMatchCount) {
  const el = document.getElementById("v-kpis");
  el.style.display = "grid";
  const valorFormatado = valorCruzado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${vendasCruzadas}</span><span class="admin-kpi__label">Vendas cruzadas c/ cupom de creator</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${valorFormatado}</span><span class="admin-kpi__label">Valor cruzado</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${semMatchCount}</span><span class="admin-kpi__label">Cupons no CSV sem creator identificado</span></div>
  `;
}

function renderVendasChart(dias, postagensPorDia, vendasPorDia, hojeKey) {
  const canvas = document.getElementById("v-chart");
  canvas.style.display = "block";

  const labels = dias.map((k) => {
    const [, m, d] = k.split("-");
    return `${d}/${m}${k === hojeKey ? " (hoje)" : ""}`;
  });
  const postagensData = dias.map((k) => postagensPorDia[k] || 0);
  const vendasData = dias.map((k) => (vendasPorDia[k] ? vendasPorDia[k].count : 0));

  if (vendasChart) vendasChart.destroy();

  vendasChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Postagens",
          data: postagensData,
          backgroundColor: dias.map((k) => (k === hojeKey ? "#ac8a53" : "rgba(172,138,83,0.45)")),
          yAxisID: "y",
        },
        {
          label: "Vendas (cupons de creators)",
          data: vendasData,
          type: "line",
          borderColor: "#655742",
          backgroundColor: "#655742",
          yAxisID: "y1",
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Postagens" } },
        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Vendas" } },
      },
    },
  });
}

function renderCuponsSemMatch(cuponsSemMatch) {
  const el = document.getElementById("v-sem-match");
  if (!el) return;
  if (cuponsSemMatch.size === 0) {
    el.innerHTML = "";
    return;
  }
  const lista = Array.from(cuponsSemMatch).sort().join(", ");
  el.innerHTML = `<p class="section__microcopy">Cupons no CSV sem submissão correspondente (não cruzados): ${escapeHtml(lista)}</p>`;
}
