/* ============================================
   AURA Creators Content Hub
   Lógica: carrega produtos/categorias do Supabase
   (geridos pela página /admin), renderiza o mural
   (vitrine) e as campanhas (briefings.json), valida
   e envia o formulário de conteúdo.

   Seção de briefings removida do hub e do formulário
   por enquanto (14/09/2026) — o back-end/admin de
   briefings continua ativo, só não é exibido pra creator.

   Backend: Supabase (projeto AURA Creators Club).
   - aura_hub_submissions: recebe os envios do form.
   - aura_hub_mural: view pública (approved + consent).
   - aura_hub_produtos / aura_hub_categorias:
     conteúdo gerido pela creator via /admin.html (login
     Supabase Auth) — sem precisar editar JSON.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const WEBHOOK_URL = `${SUPABASE_URL}/rest/v1/aura_hub_submissions`;
const MURAL_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_mural?select=nome,instagram_handle,plataforma,boosted,content_url,created_at&order=mural_ordem.asc.nullslast,created_at.desc`;
const CATEGORIAS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_categorias?select=*&ativo=eq.true&order=ordem.asc`;
const CAMPANHAS_CONFIG_URL = "briefings.json";
const FORM_FIELDS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_form_fields?select=*&formulario=eq.hub&ativo=eq.true&order=ordem.asc`;

let CATEGORIAS = [];
let EXTRA_FIELDS = [];

document.addEventListener("DOMContentLoaded", async () => {
  const [categorias, campanhasConfig, extraFields] = await Promise.all([
    fetchSupabaseList(CATEGORIAS_ENDPOINT),
    loadCampanhasConfig(),
    fetchSupabaseList(FORM_FIELDS_ENDPOINT),
  ]);

  CATEGORIAS = categorias;
  EXTRA_FIELDS = extraFields;

  renderCampanhas(campanhasConfig);
  populateCategoriaSelect(CATEGORIAS);
  renderExtraFields(document.getElementById("extra-fields-container"), EXTRA_FIELDS);
  setupForm();
  loadMural();
});

/* ---------- CAMPOS EXTRAS (configuráveis pela Bruna no admin) ----------
   Além dos campos fixos deste formulário, a aba "Campos do formulário"
   do admin deixa adicionar perguntas extras sem precisar mexer em código.
   Essas respostas vão pra coluna `campos_extra` (JSON) da submissão. */

function renderExtraFields(container, fields) {
  if (!container) return;
  container.innerHTML = fields.map(extraFieldHtml).join("");
}

function extraFieldHtml(f) {
  const reqMark = f.obrigatorio ? " *" : "";
  const reqAttr = f.obrigatorio ? "required" : "";
  const fieldId = `extra_${f.campo_key}`;

  if (f.tipo === "textarea") {
    return `<div class="field">
      <label for="${fieldId}">${escapeHtml(f.label)}${reqMark}</label>
      <textarea id="${fieldId}" rows="3" ${reqAttr}></textarea>
      <span class="field__error" data-error-for="${fieldId}"></span>
    </div>`;
  }
  if (f.tipo === "select") {
    const opcoesHtml = (f.opcoes || [])
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join("");
    return `<div class="field">
      <label for="${fieldId}">${escapeHtml(f.label)}${reqMark}</label>
      <select id="${fieldId}" ${reqAttr}><option value="" disabled selected>Selecione</option>${opcoesHtml}</select>
      <span class="field__error" data-error-for="${fieldId}"></span>
    </div>`;
  }
  if (f.tipo === "checkbox_group") {
    const opcoesHtml = (f.opcoes || [])
      .map(
        (o) => `<label class="checkbox-option">
          <input type="checkbox" name="${fieldId}" value="${escapeHtml(o.value)}">
          ${escapeHtml(o.label)}
        </label>`
      )
      .join("");
    return `<fieldset class="field field--fieldset">
      <legend>${escapeHtml(f.label)}${reqMark}</legend>
      <div class="checkbox-group">${opcoesHtml}</div>
      <span class="field__error" data-error-for="${fieldId}"></span>
    </fieldset>`;
  }
  return `<div class="field">
    <label for="${fieldId}">${escapeHtml(f.label)}${reqMark}</label>
    <input type="text" id="${fieldId}" ${reqAttr}>
    <span class="field__error" data-error-for="${fieldId}"></span>
  </div>`;
}

function validateExtraFields(fields) {
  const errors = {};
  fields.forEach((f) => {
    if (!f.obrigatorio) return;
    const fieldId = `extra_${f.campo_key}`;
    if (f.tipo === "checkbox_group") {
      const checked = document.querySelectorAll(`input[name="${fieldId}"]:checked`).length;
      if (checked === 0) errors[fieldId] = "Selecione pelo menos uma opção.";
    } else {
      const el = document.getElementById(fieldId);
      if (!el || !el.value.trim()) errors[fieldId] = "Esse campo é obrigatório.";
    }
  });
  return errors;
}

function getExtraFieldsData(fields) {
  const campos_extra = {};
  fields.forEach((f) => {
    const fieldId = `extra_${f.campo_key}`;
    if (f.tipo === "checkbox_group") {
      campos_extra[f.campo_key] = Array.from(document.querySelectorAll(`input[name="${fieldId}"]:checked`)).map(
        (el) => el.value
      );
    } else {
      const el = document.getElementById(fieldId);
      campos_extra[f.campo_key] = el ? el.value.trim() : "";
    }
  });
  return campos_extra;
}

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

/* ---------- SELECTS DO FORMULÁRIO ---------- */

function populateCategoriaSelect(categorias) {
  const select = document.getElementById("categoria_produto");
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  categorias.forEach((cat) => {
    const el = document.createElement("option");
    el.value = cat.id;
    el.textContent = cat.nome;
    select.appendChild(el);
  });
}

/* ---------- CONTAGEM DE CONTEÚDO POR CREATOR ----------
   Sem limite de envios por briefing — a creator pode mandar
   quantos conteúdos quiser. Depois de cada envio, contamos
   quantos ela já mandou (pelo cupom) só pra dar um feedback
   de reconhecimento na hora.

   Usa a mesma RPC get_creator_stats (SECURITY DEFINER) que a Home
   e o Vídeo Impulsionado usam — uma leitura direta em
   aura_hub_submissions aqui sempre voltava vazia pro anon (não tem
   policy de SELECT pra esse perfil, só INSERT), então o "esse já é
   o seu Xº envio" nunca aparecia de verdade pra nenhuma creator. */

async function countSubmissionsByCupom(cupom) {
  if (!cupom) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_creator_stats`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_cupom: cupom }),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const stats = Array.isArray(rows) ? rows[0] : rows;
    return stats ? stats.total_geral : null;
  } catch {
    return null;
  }
}

/* ---------- FORMULÁRIO ----------
   Identificação sempre visível; categoria/produto, plataforma,
   link, consentimento e boost também ficam visíveis direto —
   só o produto fica escondido até a categoria ser escolhida. */

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
    const errors = { ...validate(data), ...validateExtraFields(EXTRA_FIELDS) };

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

      const total = await countSubmissionsByCupom(data.codigo);
      feedback.textContent = total
        ? `Recebemos seu conteúdo — esse já é o seu ${total}º envio! Nosso time confere tudo e, se precisar de algum ajuste, chama você no WhatsApp informado. Pode mandar mais quando quiser.`
        : "Recebemos seu conteúdo. Nosso time confere tudo e, se precisar de algum ajuste, chama você no WhatsApp informado. Pode mandar mais quando quiser.";
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
    codigo: form.codigo.value.trim().toUpperCase(),
    instagram: form.instagram.value.trim().replace(/^@+/, ""),
    categoria_produto: form.categoria_produto.value,
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

  if (!data.categoria_produto) errors.categoria_produto = "Selecione o produto.";

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

  // Link de Drive (ou outro serviço de arquivo na nuvem) sempre vale,
  // independente da plataforma — útil quando o post ainda não está
  // no ar ou a creator prefere mandar o arquivo direto.
  if (/drive\.google\.com|docs\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com/.test(host)) return true;

  if (plataforma === "instagram" || plataforma === "instagram_story" || plataforma === "instagram_carrossel") return host.includes("instagram.com");
  if (plataforma === "tiktok") return host.includes("tiktok.com");
  if (plataforma === "youtube_shorts" || plataforma === "youtube_longo") return host.includes("youtube.com") || host.includes("youtu.be");
  if (plataforma === "outros") return true;
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
    briefing_id: null,
    seguiu_briefing: false,
    categoria_produto: produtoLabel,
    produto_nome: null,
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
    campos_extra: { ...getExtraFieldsData(EXTRA_FIELDS), _hp: getHoneypotValue() },
  };
}

/* campo-isca anti-bot: invisível pro usuário real, some bots preenchem automaticamente */
function getHoneypotValue() {
  const el = document.getElementById("site-extra");
  return el ? el.value.trim() : "";
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
      const label = `<div class="mural__thumb">${plataformaLabel(c.plataforma)}</div>`;
      const thumb = c.content_url
        ? `<a class="mural__thumb-link" href="${encodeURI(c.content_url)}" target="_blank" rel="noopener" aria-label="Ver conteúdo de ${escapeHtml(c.nome)} no ${plataformaLabel(c.plataforma)}">
            ${label}
            <span class="mural__play" aria-hidden="true">▶</span>
          </a>`
        : label;
      const quando = relativeDate(c.created_at);

      return `
        <div class="mural__card mural__card--no-thumb">
          ${c.boosted ? '<span class="mural__badge">Impulsionado</span>' : ""}
          ${thumb}
          <div class="mural__meta">
            <p>${escapeHtml(c.nome)}</p>
            ${
              profileUrl
                ? `<a href="${profileUrl}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`
                : `<span>${plataformaLabel(c.plataforma)}</span>`
            }
            ${quando ? `<span class="mural__quando">${escapeHtml(quando)}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function relativeDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function plataformaLabel(plataforma) {
  if (plataforma === "tiktok") return "TikTok";
  if (plataforma === "youtube_shorts" || plataforma === "youtube_longo") return "YouTube";
  if (plataforma === "outros") return "Outros";
  return "Instagram";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
