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
const MURAL_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_mural?select=nome,instagram_handle,plataforma,thumb_url,boosted,content_url&order=mural_ordem.asc.nullslast,created_at.desc`;
const CATEGORIAS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_categorias?select=*&ativo=eq.true&order=ordem.asc`;
const CAMPANHAS_CONFIG_URL = "briefings.json";

let CATEGORIAS = [];

document.addEventListener("DOMContentLoaded", async () => {
  const [categorias, campanhasConfig] = await Promise.all([
    fetchSupabaseList(CATEGORIAS_ENDPOINT),
    loadCampanhasConfig(),
  ]);

  CATEGORIAS = categorias;

  renderCampanhas(campanhasConfig);
  populateCategoriaSelect(CATEGORIAS);
  setupForm();
  loadMural();
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
   de reconhecimento na hora. */

async function countSubmissionsByCupom(cupom) {
  if (!cupom) return null;
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/aura_hub_submissions?coupon_code=eq.${encodeURIComponent(cupom)}&select=id`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "count=exact",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data.length : null;
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
    codigo: form.codigo.value.trim(),
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
  if (plataforma === "outros") return "Outros";
  return "Instagram";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
