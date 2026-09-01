/* ============================================
   AURA Creators Content Hub
   Lógica: carrega briefings/produtos/categorias do
   Supabase (geridos pela página /admin), renderiza
   os cards de "briefings da semana" + modal, o mural
   (vitrine), o arquivo de briefings anteriores e as
   campanhas (briefings.json), valida e envia o
   formulário progressivo, e fecha o loop mostrando
   quando a creator já enviou conteúdo pro briefing
   atual (localStorage, sem login).

   Backend: Supabase (projeto AURA Creators Club).
   - aura_hub_submissions: recebe os envios do form.
   - aura_hub_mural: view pública (approved + consent).
   - aura_hub_briefings / aura_hub_produtos / aura_hub_categorias:
     conteúdo gerido pela creator via /admin.html (login
     Supabase Auth) — sem precisar editar JSON.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const WEBHOOK_URL = `${SUPABASE_URL}/rest/v1/aura_hub_submissions`;
const MURAL_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_mural?select=nome,instagram_handle,plataforma,thumb_url,boosted,content_url&order=created_at.desc`;
const BRIEFINGS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_briefings?select=*&ativo=eq.true&order=ordem.asc`;
const CATEGORIAS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_categorias?select=*&ativo=eq.true&order=ordem.asc`;
const PRODUTOS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_produtos?select=*&ativo=eq.true&order=ordem.asc`;
const CAMPANHAS_CONFIG_URL = "briefings.json";
const SUBMISSION_STORAGE_KEY = "aura_hub_last_submission"; // { briefing_id, submitted_at } — solução simples de P0 pra fechar o loop sem exigir login

let BRIEFINGS = [];
let CATEGORIAS = [];
let PRODUTOS = [];

document.addEventListener("DOMContentLoaded", async () => {
  const [briefings, categorias, produtos, campanhasConfig] = await Promise.all([
    fetchSupabaseList(BRIEFINGS_ENDPOINT),
    fetchSupabaseList(CATEGORIAS_ENDPOINT),
    fetchSupabaseList(PRODUTOS_ENDPOINT),
    loadCampanhasConfig(),
  ]);

  BRIEFINGS = briefings;
  CATEGORIAS = categorias;
  PRODUTOS = produtos;

  renderBriefingsSemana(BRIEFINGS);
  renderBriefingsArquivo(BRIEFINGS);
  renderCampanhas(campanhasConfig);
  populateBriefingSelect(BRIEFINGS);
  populateCategoriaSelect(CATEGORIAS);
  setupModal();
  setupForm();
  loadMural();
  applyAlreadySubmittedState(BRIEFINGS);
});

/* ---------- FETCH GENÉRICO (Supabase REST, somente leitura) ---------- */

async function fetchSupabaseList(endpoint) {
  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) throw new Error(`Endpoint respondeu com status ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error(`Falha ao carregar ${endpoint}`, err);
    return [];
  }
}

async function loadCampanhasConfig() {
  try {
    const response = await fetch(CAMPANHAS_CONFIG_URL);
    if (!response.ok) throw new Error(`Config respondeu com status ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Falha ao carregar briefings.json", err);
    return { active_campaigns: [] };
  }
}

function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function isPast(prazo) {
  if (!prazo) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(`${prazo}T00:00:00`) < hoje;
}

/* ---------- BRIEFINGS DA SEMANA (cards + modal) ----------
   Um briefing é "vigente" se estiver ativo e o prazo não tiver
   passado (ou não tiver prazo definido). Os que já passaram do
   prazo aparecem automaticamente em "briefings anteriores" —
   quem gerencia pela página /admin não precisa mover nada
   manualmente entre listas. */

function briefingsVigentes(list) {
  return list.filter((b) => !isPast(b.prazo));
}

function briefingsEncerrados(list) {
  return list.filter((b) => isPast(b.prazo));
}

function renderBriefingsSemana(list) {
  const container = document.getElementById("briefings-semana");
  const vigentes = briefingsVigentes(list);

  if (vigentes.length === 0) {
    container.innerHTML = '<p class="briefing__empty">Nenhum briefing em destaque no momento — volte em breve pra conferir a novidade da semana.</p>';
    return;
  }

  container.innerHTML = vigentes
    .map(
      (b) => `
      <button type="button" class="briefing-card" data-briefing-id="${escapeHtml(b.id)}">
        ${b.plataforma ? `<span class="briefing-card__plataforma">${escapeHtml(b.plataforma)}</span>` : ""}
        <p class="briefing-card__titulo">${escapeHtml(b.titulo)}</p>
        ${b.prazo ? `<p class="briefing-card__prazo">Envie até ${formatDate(b.prazo)}</p>` : ""}
        <span class="briefing-card__cta">Ver detalhes</span>
      </button>
    `
    )
    .join("");

  container.querySelectorAll(".briefing-card").forEach((card) => {
    card.addEventListener("click", () => {
      const briefing = BRIEFINGS.find((b) => b.id === card.dataset.briefingId);
      if (briefing) openBriefingModal(briefing);
    });
  });
}

function renderBriefingsArquivo(list) {
  const container = document.getElementById("briefings-arquivo");
  const encerrados = briefingsEncerrados(list);

  if (encerrados.length === 0) {
    container.innerHTML = '<p class="arquivo__empty">Ainda não há briefings anteriores por aqui.</p>';
    return;
  }

  container.innerHTML = encerrados
    .map(
      (b) => `
        <div class="arquivo__item">
          <div class="arquivo__info">
            <p>${escapeHtml(b.titulo)}</p>
            <p>Encerrou em ${formatDate(b.prazo)}</p>
          </div>
          <div class="arquivo__actions">
            <span class="badge-status badge-status--encerrado">Envio ainda ativo</span>
            <button type="button" class="arquivo__link" data-briefing-id="${escapeHtml(b.id)}">Ver detalhes</button>
          </div>
        </div>
      `
    )
    .join("");

  container.querySelectorAll(".arquivo__link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const briefing = BRIEFINGS.find((b) => b.id === btn.dataset.briefingId);
      if (briefing) openBriefingModal(briefing);
    });
  });
}

function renderCampanhas(config) {
  const section = document.getElementById("campanhas-section");
  const container = document.getElementById("campanhas-ativas");
  const campanhas = (config && config.active_campaigns) || [];

  if (campanhas.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  container.innerHTML = campanhas
    .map(
      (c) => `
      <div class="campanha__card">
        <p class="campanha__nome">${escapeHtml(c.nome)}</p>
        <p class="campanha__periodo">${escapeHtml(c.periodo || "")}</p>
        <p class="campanha__beneficio">${escapeHtml(c.beneficio || "")}</p>
      </div>
    `
    )
    .join("");
}

/* ---------- MODAL DE BRIEFING ---------- */

function setupModal() {
  const overlay = document.getElementById("briefing-modal");
  const closeBtn = document.getElementById("modal-close");

  closeBtn.addEventListener("click", closeBriefingModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeBriefingModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeBriefingModal();
  });
}

function openBriefingModal(briefing) {
  const overlay = document.getElementById("briefing-modal");
  const body = document.getElementById("modal-body");

  const destaques = (briefing.destaques || [])
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("");

  body.innerHTML = `
    ${briefing.plataforma ? `<p class="briefing__product">${escapeHtml(briefing.plataforma)}</p>` : ""}
    <h2 id="modal-title" class="briefing__title briefing__title--dark">${escapeHtml(briefing.titulo)}</h2>
    ${briefing.prazo ? `<p class="briefing__deadline">Envie até ${formatDate(briefing.prazo)}</p>` : ""}
    ${briefing.descricao ? `<p class="modal__descricao">${escapeHtml(briefing.descricao)}</p>` : ""}
    ${destaques ? `<ul class="highlight-list highlight-list--dark">${destaques}</ul>` : ""}
    ${briefing.pdf_url ? `<a class="btn btn--outline btn--full" href="${encodeURI(briefing.pdf_url)}" target="_blank" rel="noopener" style="margin-bottom:12px;">Baixar briefing completo (PDF)</a>` : ""}
    <a class="btn btn--dark btn--full" href="#formulario" id="modal-cta">Enviar conteúdo pra esse briefing</a>
  `;

  document.getElementById("modal-cta").addEventListener("click", () => {
    closeBriefingModal();
    const briefingSelect = document.getElementById("briefing_ref");
    const seguiuSim = document.getElementById("seguiu-sim");
    if (seguiuSim) {
      seguiuSim.checked = true;
      seguiuSim.dispatchEvent(new Event("change"));
    }
    if (briefingSelect) briefingSelect.value = briefing.id;
  });

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeBriefingModal() {
  const overlay = document.getElementById("briefing-modal");
  overlay.hidden = true;
  document.body.style.overflow = "";
}

/* ---------- SELECTS DO FORMULÁRIO ---------- */

function populateBriefingSelect(list) {
  const select = document.getElementById("briefing_ref");
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  list.forEach((b) => {
    const el = document.createElement("option");
    el.value = b.id;
    el.textContent = isPast(b.prazo) ? b.titulo : `${b.titulo} (semana atual)`;
    select.appendChild(el);
  });
}

function populateCategoriaSelect(categorias) {
  const select = document.getElementById("categoria_produto");
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  categorias.forEach((cat) => {
    const el = document.createElement("option");
    el.value = cat.id;
    el.textContent = cat.nome;
    select.appendChild(el);
  });

  select.addEventListener("change", () => {
    populateProdutoSelect(select.value);
    revealField("bloco-produto", true);
  });
}

function populateProdutoSelect(categoriaId) {
  const select = document.getElementById("produto_nome");
  select.innerHTML = '<option value="" disabled selected>Identifique o produto</option>';
  PRODUTOS.filter((p) => p.categoria_id === categoriaId).forEach((p) => {
    const el = document.createElement("option");
    el.value = p.nome;
    el.textContent = p.nome;
    select.appendChild(el);
  });
}

/* ---------- ESTADO "JÁ ENVIEI PRO BRIEFING ATUAL" ---------- */

function getLastSubmission() {
  try {
    return JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function setLastSubmission(briefingId) {
  if (!briefingId) return;
  try {
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify({ briefing_id: briefingId, submitted_at: new Date().toISOString() }));
  } catch {
    /* localStorage indisponível — segue sem persistir o estado */
  }
}

function applyAlreadySubmittedState(list) {
  const vigentes = briefingsVigentes(list);
  if (vigentes.length === 0) return;

  const last = getLastSubmission();
  if (!last) return;

  const match = vigentes.find((b) => b.id === last.briefing_id);
  if (match) showAlreadySubmitted(match);
}

function showAlreadySubmitted(briefing) {
  const intro = document.getElementById("formulario-intro");
  const wrap = document.getElementById("formulario-wrap");
  if (intro) intro.textContent = "Já recebemos seu conteúdo pra esse briefing.";
  if (wrap) {
    wrap.innerHTML = `
      <div class="form-card form-card--done">
        <p>Seu envio para <strong>${escapeHtml(briefing.titulo)}</strong> está com a gente — assim que aparecer no mural, ele passa a valer como prova. Se precisar de algum ajuste, nosso time chama você no WhatsApp informado.</p>
      </div>
    `;
  }
}

/* ---------- FORMULÁRIO PROGRESSIVO ----------
   Campos são revelados conforme a creator responde:
   1) identificação (sempre visível)
   2) seguiu briefing? sim -> seleciona briefing
                        não -> seleciona categoria -> produto
   3) plataforma, link, consentimento, boost (+ adcode condicional) */

function revealField(id, show) {
  const el = document.getElementById(id);
  if (el) el.hidden = !show;
}

function setupForm() {
  const form = document.getElementById("creator-form");
  const feedback = document.getElementById("form-feedback");
  const submitBtn = document.getElementById("submit-btn");
  const adcodeField = document.getElementById("adcode-field");
  const adcodeInput = document.getElementById("adcode");

  form.querySelectorAll('input[name="seguiu_briefing"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const seguiu = form.querySelector('input[name="seguiu_briefing"]:checked')?.value;
      const sim = seguiu === "sim";
      const nao = seguiu === "nao";

      revealField("bloco-briefing", sim);
      revealField("bloco-categoria", nao);
      revealField("bloco-produto", false); // só aparece depois de escolher categoria
      if (nao) document.getElementById("categoria_produto").value = "";

      revealField("bloco-plataforma", sim || nao);
      revealField("bloco-link", sim || nao);
      revealField("bloco-consentimento", sim || nao);
      revealField("bloco-boost", sim || nao);
    });
  });

  form.querySelectorAll('input[name="boost"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const boostSim = form.querySelector('input[name="boost"]:checked')?.value === "sim";
      adcodeField.hidden = !boostSim;
      if (!boostSim) adcodeInput.value = "";
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form);
    feedback.textContent = "";
    feedback.removeAttribute("data-state");

    const data = getFormData(form);
    const errors = validate(data);

    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      const firstErrorField = form.querySelector('[aria-invalid="true"]');
      if (firstErrorField) firstErrorField.focus();
      return;
    }

    setLoading(submitBtn, true);

    try {
      await submitToBackend(data);
      if (data.seguiu_briefing === "sim") setLastSubmission(data.briefing_ref);
      form.reset();
      ["bloco-briefing", "bloco-categoria", "bloco-produto", "bloco-plataforma", "bloco-link", "bloco-consentimento", "bloco-boost"].forEach((id) => revealField(id, false));
      adcodeField.hidden = true;
      feedback.textContent = "Recebemos seu conteúdo. Nosso time confere tudo e, se precisar de algum ajuste, chama você no WhatsApp informado.";
      feedback.dataset.state = "success";
      if (data.seguiu_briefing === "sim") {
        const match = BRIEFINGS.find((b) => b.id === data.briefing_ref);
        if (match) showAlreadySubmitted(match);
      }
    } catch (err) {
      feedback.textContent = "Algo não saiu como esperado. Tenta enviar de novo em alguns instantes.";
      feedback.dataset.state = "error";
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

function getFormData(form) {
  const boostChecked = form.querySelector('input[name="boost"]:checked');
  const seguiuChecked = form.querySelector('input[name="seguiu_briefing"]:checked');
  return {
    nome: form.nome.value.trim(),
    email: form.email.value.trim(),
    whatsapp: form.whatsapp.value.trim(),
    codigo: form.codigo.value.trim(),
    instagram: form.instagram.value.trim().replace(/^@+/, ""),
    seguiu_briefing: seguiuChecked ? seguiuChecked.value : "",
    briefing_ref: form.briefing_ref.value,
    categoria_produto: form.categoria_produto.value,
    produto_nome: form.produto_nome.value,
    plataforma: form.plataforma.value,
    link: form.link.value.trim(),
    consentimento: form.consentimento.checked,
    boost: boostChecked ? boostChecked.value : "",
    adcode: form.adcode.value.trim(),
  };
}

function validate(data) {
  const errors = {};
  const REQUIRED_MSG = "Esse campo é obrigatório.";

  if (!data.nome) errors.nome = REQUIRED_MSG;
  if (!data.email) {
    errors.email = REQUIRED_MSG;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Confira se o e-mail foi digitado corretamente.";
  }
  if (!data.whatsapp) errors.whatsapp = REQUIRED_MSG;
  if (!data.codigo) errors.codigo = REQUIRED_MSG;
  if (!data.instagram) errors.instagram = "Informe seu @ do Instagram.";

  if (!data.seguiu_briefing) {
    errors.seguiu_briefing = "Escolha sim ou não.";
    return errors; // sem essa resposta, não valida os campos condicionais ainda
  }

  if (data.seguiu_briefing === "sim" && !data.briefing_ref) {
    errors.briefing_ref = "Selecione a qual briefing esse conteúdo se refere.";
  }

  if (data.seguiu_briefing === "nao") {
    if (!data.categoria_produto) errors.categoria_produto = "Selecione a categoria do produto.";
    if (!data.produto_nome) errors.produto_nome = "Selecione o produto.";
  }

  if (!data.plataforma) errors.plataforma = REQUIRED_MSG;

  if (!data.link) {
    errors.link = REQUIRED_MSG;
  } else if (!isValidContentLink(data.link, data.plataforma)) {
    errors.link = "Não conseguimos reconhecer esse link. Confira se copiou o endereço completo do post.";
  }

  if (!data.boost) errors.boost = "Escolha sim ou não pra autorização de impulsionamento.";
  if (data.boost === "sim" && !data.adcode) errors.adcode = "Informe o adcode desse conteúdo.";

  return errors;
}

function isValidContentLink(url, plataforma) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace("www.", "");
  if (plataforma === "instagram" || plataforma === "instagram_story") return host.includes("instagram.com");
  if (plataforma === "tiktok") return host.includes("tiktok.com");
  if (plataforma === "youtube_shorts" || plataforma === "youtube_longo") return host.includes("youtube.com") || host.includes("youtu.be");
  return /instagram\.com|tiktok\.com|youtube\.com|youtu\.be/.test(host);
}

function showErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const input = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
    const errorEl = document.querySelector(`[data-error-for="${field}"]`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (errorEl) errorEl.textContent = message;
  });
}

function clearErrors(form) {
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field__error").forEach((el) => (el.textContent = ""));
}

function setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle("btn--loading", isLoading);
}

/* payload no formato da tabela aura_hub_submissions (Supabase) */
function buildPayload(data) {
  const produtoLabel = data.categoria_produto
    ? CATEGORIAS.find((c) => c.id === data.categoria_produto)?.nome || null
    : null;

  return {
    briefing_id: data.seguiu_briefing === "sim" ? data.briefing_ref : null,
    seguiu_briefing: data.seguiu_briefing === "sim",
    categoria_produto: produtoLabel,
    produto_nome: data.seguiu_briefing === "nao" ? data.produto_nome : null,
    submitted_at: new Date().toISOString(),
    creator_name: data.nome,
    creator_email: data.email,
    creator_phone: data.whatsapp,
    coupon_code: data.codigo,
    instagram_handle: data.instagram,
    content_platform: data.plataforma,
    content_url: data.link,
    consent_public_display: data.consentimento,
    boost_authorized: data.boost === "sim",
    boost_adcode: data.boost === "sim" ? data.adcode : null,
  };
}

async function submitToBackend(data) {
  const payload = buildPayload(data);

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status ${response.status}`);
  }

  return response;
}

/* ---------- MURAL DE CREATORS (vitrine) ---------- */

async function loadMural() {
  const container = document.getElementById("mural");

  try {
    const creators = await fetchMuralData();
    renderMural(container, creators);
  } catch (err) {
    // fallback silencioso: mural não é crítico pra conversão
    container.innerHTML = '<p class="mural__empty">Em breve, as creators aparecem aqui.</p>';
  }
}

async function fetchMuralData() {
  const response = await fetch(MURAL_ENDPOINT, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Mural respondeu com status ${response.status}`);
  }
  return response.json();
}

function renderMural(container, creators) {
  if (!creators || creators.length === 0) {
    container.innerHTML = '<p class="mural__empty">Em breve, as creators aparecem aqui.</p>';
    return;
  }

  container.innerHTML = creators
    .map((c) => {
      const handle = (c.instagram_handle || "").replace(/^@+/, "");
      const profileUrl = handle ? `https://instagram.com/${encodeURIComponent(handle)}` : null;
      const hasThumb = Boolean(c.thumb_url);
      const thumbImg = hasThumb
        ? `<img class="mural__thumb" src="${encodeURI(c.thumb_url)}" alt="Conteúdo de ${escapeHtml(c.nome)}" loading="lazy">`
        : `<div class="mural__thumb">${plataformaLabel(c.plataforma)}</div>`;
      const thumb = c.content_url
        ? `<a class="mural__thumb-link" href="${encodeURI(c.content_url)}" target="_blank" rel="noopener" aria-label="Ver conteúdo de ${escapeHtml(c.nome)} no ${plataformaLabel(c.plataforma)}">
            ${thumbImg}
            <span class="mural__play" aria-hidden="true">▶</span>
          </a>`
        : thumbImg;

      return `
        <div class="mural__card${hasThumb ? "" : " mural__card--no-thumb"}">
          ${c.boosted ? '<span class="mural__badge">Impulsionado</span>' : ""}
          ${thumb}
          <div class="mural__meta">
            <p>${escapeHtml(c.nome)}</p>
            ${
              profileUrl
                ? `<a href="${profileUrl}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`
                : `<span>${plataformaLabel(c.plataforma)}</span>`
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function plataformaLabel(plataforma) {
  if (plataforma === "tiktok") return "TikTok";
  if (plataforma === "youtube_shorts" || plataforma === "youtube_longo") return "YouTube";
  return "Instagram";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
