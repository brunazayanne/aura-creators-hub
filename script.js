/* ============================================
   AURA Creators Content Hub
   Lógica: carrega o config semanal (briefings.json),
   renderiza destaque + arquivo + campanhas, valida
   e envia o formulário, carrega o mural de creators.

   ATENÇÃO — placeholders que precisam ser validados
   com o dev antes do go-live (ver README.md):
   WEBHOOK_URL e MURAL_ENDPOINT.
   ============================================ */

const WEBHOOK_URL = "https://SUBSTITUIR-PELO-WEBHOOK-REAL.example.com/aura-hub-submit";
const MURAL_ENDPOINT = "https://SUBSTITUIR-PELO-MURAL-REAL.example.com/aura-hub-mural"; // retorna array de { nome, instagram_handle, plataforma }
const CONFIG_URL = "briefings.json";

let CONFIG = null;

document.addEventListener("DOMContentLoaded", async () => {
  CONFIG = await loadConfig();
  renderBriefingDestaque(CONFIG);
  renderBriefingsArquivo(CONFIG);
  renderCampanhas(CONFIG);
  populateBriefingSelect(CONFIG);
  setupForm();
  loadMural();
});

/* ---------- CONFIG SEMANAL (briefings.json) ---------- */

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL);
    if (!response.ok) throw new Error(`Config respondeu com status ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Falha ao carregar briefings.json", err);
    return { active_briefing: null, past_briefings: [], active_campaigns: [] };
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
      form.reset();
      adcodeField.hidden = true;
      feedback.textContent = "Recebemos seu conteúdo. Nosso time confere tudo e, se precisar de algum ajuste, chama você no WhatsApp informado.";
      feedback.dataset.state = "success";
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

/* payload conforme handoff (lp-aura-creators-content-hub.docx) */
function buildPayload(data) {
  return {
    briefing_id: data.briefing_ref,
    submitted_at: new Date().toISOString(),
    creator: {
      name: data.nome,
      email: data.email,
      phone: data.whatsapp,
      coupon_code: data.codigo,
      instagram_handle: data.instagram,
    },
    content: {
      platform: data.plataforma,
      url: data.link,
    },
    consent_public_display: data.consentimento,
    boost: {
      authorized: data.boost === "sim",
      adcode: data.boost === "sim" ? data.adcode : null,
    },
  };
}

async function submitToBackend(data) {
  const payload = buildPayload(data);

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status ${response.status}`);
  }

  return response;
}

/* ---------- MURAL DE CREATORS ---------- */

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
  const response = await fetch(MURAL_ENDPOINT);
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
      return `
        <div class="mural__card">
          <p>${escapeHtml(c.nome)}</p>
          ${
            profileUrl
              ? `<a href="${profileUrl}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`
              : `<span>${plataformaLabel(c.plataforma)}</span>`
          }
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
