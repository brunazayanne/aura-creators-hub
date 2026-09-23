/* ============================================
   AURA Creators Club — Vídeo Impulsionado
   Duplicata do Content Hub, dedicada a vídeos brutos
   (arquivo, não post publicado) que a AURA pode usar
   como anúncio impulsionado.

   Diferenças em relação ao script.js do hub principal:
   - Sem mural/vitrine e sem seção "como funciona".
   - Sem seleção de plataforma nem campo de adcode —
     aqui a creator manda direto o link do arquivo (Drive).
   - boost_authorized sempre true e content_platform fixo
     em "video_impulsionado_drive", pra identificar a
     origem do envio dentro da mesma tabela do hub.

   Backend: mesma tabela do hub principal.
   - aura_hub_submissions: recebe os envios do form.
   - aura_hub_categorias: mesmas categorias geridas via /admin.html.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const WEBHOOK_URL = `${SUPABASE_URL}/rest/v1/aura_hub_submissions`;
const CATEGORIAS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_categorias?select=*&ativo=eq.true&order=ordem.asc`;

const CONTENT_PLATFORM_TAG = "video_impulsionado_drive";

let CATEGORIAS = [];

document.addEventListener("DOMContentLoaded", async () => {
  CATEGORIAS = await fetchSupabaseList(CATEGORIAS_ENDPOINT);
  populateCategoriaSelect(CATEGORIAS);
  setupForm();
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

/* ---------- SELECT DE CATEGORIA/PRODUTO ---------- */

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

/* ---------- CONTAGEM DE ENVIOS POR CREATOR (feedback de reconhecimento) ---------- */

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

/* ---------- FORMULÁRIO ---------- */

function setupForm() {
  const form = document.getElementById("creator-form");
  const feedback = document.getElementById("form-feedback");
  const submitBtn = document.getElementById("submit-btn");

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

      const total = await countSubmissionsByCupom(data.codigo);
      feedback.textContent = total
        ? `Recebemos seu vídeo — esse já é o seu ${total}º envio! Nosso time confere o material e avisa você se ele for selecionado pra impulsionar.`
        : "Recebemos seu vídeo. Nosso time confere o material e avisa você se ele for selecionado pra impulsionar.";
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
  return {
    nome: form.nome.value.trim(),
    codigo: form.codigo.value.trim(),
    categoria_produto: form.categoria_produto.value,
    link: form.link.value.trim(),
  };
}

function validate(data) {
  const errors = {};
  const REQUIRED_MSG = "Esse campo é obrigatório.";

  if (!data.nome) errors.nome = REQUIRED_MSG;
  if (!data.codigo) errors.codigo = REQUIRED_MSG;

  if (!data.categoria_produto) errors.categoria_produto = "Selecione o produto.";

  if (!data.link) {
    errors.link = REQUIRED_MSG;
  } else if (!isValidFileLink(data.link)) {
    errors.link = "Não conseguimos reconhecer esse link. Confira se copiou o endereço completo.";
  }

  return errors;
}

function isValidFileLink(url) {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
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

/* payload no formato da tabela aura_hub_submissions (Supabase) —
   mesma tabela do hub principal, identificado pelo content_platform fixo. */
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
    // creator_email / creator_phone / instagram_handle são colunas NOT NULL
    // na aura_hub_submissions, mas esse formulário não pede mais esses dados —
    // manda string vazia pra não quebrar o insert.
    creator_email: "",
    creator_phone: "",
    coupon_code: data.codigo,
    instagram_handle: "",
    content_platform: CONTENT_PLATFORM_TAG,
    content_url: data.link,
    consent_public_display: false,
    boost_authorized: true,
    boost_adcode: null,
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
