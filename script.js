/* ============================================
   AURA Creators Content Hub
   Lógica: carrega o config semanal (briefings.json),
   renderiza destaque + inspire-se + mural (vitrine)
   + arquivo + campanhas, valida e envia o formulário,
   e fecha o loop mostrando quando a creator já enviou
   conteúdo pro briefing atual (localStorage, sem login).

   Backend: Supabase (projeto Marketing System_AURA).
   Tabela aura_hub_submissions recebe os envios do form.
   View aura_hub_mural expõe só quem tem approved = true
   e consent_public_display = true (curadoria manual feita
   direto no Table Editor do Supabase — sem código).
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const WEBHOOK_URL = `${SUPABASE_URL}/rest/v1/aura_hub_submissions`;
const MURAL_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_mural?select=nome,instagram_handle,plataforma,thumb_url,boosted&order=created_at.desc`;
const CONFIG_URL = "briefings.json";
const SUBMISSION_STORAGE_KEY = "aura_hub_last_submission"; // { briefing_id, submitted_at } — solução simples de P0 pra fechar o loop sem exigir login

let CONFIG = null;

document.addEventListener("DOMContentLoaded", async () => {
  CONFIG = await loadConfig();
  renderBriefingDestaque(CONFIG);
  renderInspira(CONFIG);
  renderBriefingsArquivo(CONFIG);
  renderCampanhas(CONFIG);
  populateBriefingSelect(CONFIG);
  setupForm();
  loadMural();
  applyAlreadySubmittedState(CONFIG);
});

/* ---------- CONFIG SEMANAL (briefings.json) ---------- */

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL);
    if (!response.ok) throw new Error(`Config respondeu com status ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Falha ao carregar briefings.json", err);
    return { active_briefing: null, past_briefings: [], active_campaigns: [], inspiracao: [] };
  }
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function renderBriefingDestaque(config) {
  const container = document.getElementById("briefing-destaque");
  const briefing = config.active_briefing;

  if (!briefing) {
    container.innerHTML = '<p class="briefing__empty">Nenhum briefing em destaque no momento — volte em breve pra conferir a novidade da semana.</p>';
    return;
  }

  container.innerHTML = `
    <p class="briefing__product">${escapeHtml(briefing.product)}</p>
    <h2 class="briefing__title">${escapeHtml(briefing.title)}</h2>
    <p class="briefing__deadline">Envie até ${formatDate(briefing.ends_at)}</p>
    <ul class="highlight-list">
      ${briefing.key_rules.slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
    </ul>
    <a class="btn btn--outline-light" href="${encodeURI(briefing.pdf_url)}" target="_blank" rel="noopener">Baixar briefing completo (PDF)</a>
  `;
}

/* ---------- INSPIRE-SE ----------
   Fonte: config.inspiracao (array opcional em briefings.json).
   Cada item: { thumb_url, nome, plataforma }. Enquanto não houver
   curadoria de conteúdo aprovado, a seção assume estado vazio —
   não é bloqueante pro P0 (ver UX-STUDY-content-hub.md, seção 3). */

function renderInspira(config) {
  const container = document.getElementById("inspira");
  const itens = config.inspiracao || [];

  if (itens.length === 0) {
    container.innerHTML = '<p class="inspira__empty">Em breve, referências de conteúdo aprovado aparecem por aqui.</p>';
    return;
  }

  container.innerHTML = itens
    .map(
      (item) => `
      <div class="inspira__card">
        <img class="inspira__thumb" src="${encodeURI(item.thumb_url)}" alt="Referência de conteúdo de ${escapeHtml(item.nome || "creator AURA")}" loading="lazy">
        <div class="inspira__meta">
          <p>${escapeHtml(item.nome || "")}</p>
          <span>${plataformaLabel(item.plataforma)}</span>
        </div>
      </div>
    `
    )
    .join("");
}

function renderBriefingsArquivo(config) {
  const container = document.getElementById("briefings-arquivo");
  const past = config.past_briefings || [];

  if (past.length === 0) {
    container.innerHTML = '<p class="arquivo__empty">Ainda não há briefings anteriores por aqui.</p>';
    return;
  }

  container.innerHTML = past
    .map((b) => {
      const statusClass = b.accepts_submissions ? "badge-status--ativo" : "badge-status--encerrado";
      const statusText = b.accepts_submissions ? "Ainda aceita envios" : "Encerrado";
      return `
        <div class="arquivo__item">
          <div class="arquivo__info">
            <p>${escapeHtml(b.product)} — ${escapeHtml(b.title)}</p>
            <p>Encerrou em ${formatDate(b.ends_at)}</p>
          </div>
          <div class="arquivo__actions">
            <span class="badge-status ${statusClass}">${statusText}</span>
            <a class="arquivo__link" href="${encodeURI(b.pdf_url)}" target="_blank" rel="noopener">Ver PDF</a>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCampanhas(config) {
  const section = document.getElementById("campanhas-section");
  const container = document.getElementById("campanhas-ativas");
  const campanhas = config.active_campaigns || [];

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

function populateBriefingSelect(config) {
  const select = document.getElementById("briefing_ref");
  const options = [];

  if (config.active_briefing) {
    options.push({ id: config.active_briefing.id, label: `${config.active_briefing.product} — ${config.active_briefing.title} (semana atual)` });
  }
  (config.past_briefings || [])
    .filter((b) => b.accepts_submissions)
    .forEach((b) => options.push({ id: b.id, label: `${b.product} — ${b.title}` }));

  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.id;
    el.textContent = opt.label;
    select.appendChild(el);
  });
}

/* ---------- ESTADO "JÁ ENVIEI PRO BRIEFING ATUAL" ----------
   Solução simples de P0 (seção 2.3 do UX-STUDY): sem login, guarda
   no localStorage o último briefing_id enviado por este dispositivo/
   navegador e troca o CTA por uma confirmação, fechando o loop.
   Não substitui identificação real da creator — é um resolvedor
   provisório até o dev validar uma alternativa com dado de sessão. */

function getLastSubmission() {
  try {
    return JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function setLastSubmission(briefingId) {
  try {
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify({ briefing_id: briefingId, submitted_at: new Date().toISOString() }));
  } catch {
    /* localStorage indisponível — segue sem persistir o estado */
  }
}

function applyAlreadySubmittedState(config) {
  const activeBriefing = config.active_briefing;
  if (!activeBriefing) return;

  const last = getLastSubmission();
  if (!last || last.briefing_id !== activeBriefing.id) return;

  showAlreadySubmitted(activeBriefing);
}

function showAlreadySubmitted(briefing) {
  const intro = document.getElementById("formulario-intro");
  const wrap = document.getElementById("formulario-wrap");
  if (intro) intro.textContent = "Já recebemos seu conteúdo pra esse briefing.";
  if (wrap) {
    wrap.innerHTML = `
      <div class="form-card form-card--done">
        <p>Seu envio para <strong>${escapeHtml(briefing.product)}</strong> está com a gente — assim que aparecer no mural, ele passa a valer como prova. Se precisar de algum ajuste, nosso time chama você no WhatsApp informado.</p>
      </div>
    `;
  }
}

/* ---------- FORMULÁRIO ---------- */

function setupForm() {
  const form = document.getElementById("creator-form");
  const feedback = document.getElementById("form-feedback");
  const submitBtn = document.getElementById("submit-btn");
  const adcodeField = document.getElementById("adcode-field");
  const adcodeInput = document.getElementById("adcode");

  // Lógica condicional: adcode só aparece/obrigatório se boost = sim
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
      setLastSubmission(data.briefing_ref);
      form.reset();
      adcodeField.hidden = true;
      feedback.textContent = "Recebemos seu conteúdo. Nosso time confere tudo e, se precisar de algum ajuste, chama você no WhatsApp informado.";
      feedback.dataset.state = "success";
      if (CONFIG?.active_briefing && data.briefing_ref === CONFIG.active_briefing.id) {
        showAlreadySubmitted(CONFIG.active_briefing);
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
  return {
    nome: form.nome.value.trim(),
    email: form.email.value.trim(),
    whatsapp: form.whatsapp.value.trim(),
    codigo: form.codigo.value.trim(),
    instagram: form.instagram.value.trim().replace(/^@+/, ""),
    briefing_ref: form.briefing_ref.value,
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
  if (!data.briefing_ref) errors.briefing_ref = "Selecione a qual briefing esse conteúdo se refere.";
  if (!data.plataforma) errors.plataforma = REQUIRED_MSG;

  if (!data.link) {
    errors.link = REQUIRED_MSG;
  } else if (!isValidContentLink(data.link, data.plataforma)) {
    errors.link = "Não conseguimos reconhecer esse link. Confira se copiou o endereço completo do post.";
  }

  if (!data.consentimento) errors.consentimento = REQUIRED_MSG;
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
  if (plataforma === "instagram") return host.includes("instagram.com");
  if (plataforma === "tiktok") return host.includes("tiktok.com");
  return /instagram\.com|tiktok\.com/.test(host);
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
  return {
    briefing_id: data.briefing_ref,
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
      const thumb = hasThumb
        ? `<img class="mural__thumb" src="${encodeURI(c.thumb_url)}" alt="Conteúdo de ${escapeHtml(c.nome)}" loading="lazy">`
        : `<div class="mural__thumb">${plataformaLabel(c.plataforma)}</div>`;

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
  return plataforma === "tiktok" ? "TikTok" : "Instagram";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
