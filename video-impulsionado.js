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
const DRIVE_UPLOAD_INIT_ENDPOINT = `${SUPABASE_URL}/functions/v1/upload-video-impulsionado`;
const DRIVE_UPLOAD_CHUNK_ENDPOINT = `${DRIVE_UPLOAD_INIT_ENDPOINT}/chunk`;
// Múltiplo de 256KiB, como o protocolo de upload resumível do Drive exige
// pra todo pedaço que não seja o último.
const DRIVE_CHUNK_SIZE = 8 * 1024 * 1024;

const CONTENT_PLATFORM_TAG = "video_impulsionado_drive";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — limite confortável pra vídeo bruto de creator

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
  const progressWrap = document.getElementById("upload-progress");
  const progressFill = document.getElementById("upload-progress-fill");
  const progressLabel = document.getElementById("upload-progress-label");

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
    progressWrap.hidden = false;
    updateProgress(progressFill, progressLabel, 0);

    try {
      const categoriaNome = CATEGORIAS.find((c) => c.id === data.categoria_produto)?.nome || "Outros";
      const driveFile = await uploadVideoToDrive(data.arquivo, categoriaNome, (percent) => {
        updateProgress(progressFill, progressLabel, percent);
      });

      await submitToBackend({ ...data, contentUrl: driveFile.url });
      form.reset();
      progressWrap.hidden = true;

      const total = await countSubmissionsByCupom(data.codigo);
      feedback.textContent = total
        ? `Recebemos seu vídeo — esse já é o seu ${total}º envio! Nosso time confere o material e avisa você se ele for selecionado pra impulsionar.`
        : "Recebemos seu vídeo. Nosso time confere o material e avisa você se ele for selecionado pra impulsionar.";
      feedback.dataset.state = "success";
    } catch (err) {
      console.error(err);
      feedback.textContent = "Algo não saiu como esperado no envio do vídeo. Tenta de novo em alguns instantes.";
      feedback.dataset.state = "error";
      progressWrap.hidden = true;
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
    arquivo: form.arquivo.files[0] || null,
  };
}

function validate(data) {
  const errors = {};
  const REQUIRED_MSG = "Esse campo é obrigatório.";

  if (!data.nome) errors.nome = REQUIRED_MSG;
  if (!data.codigo) errors.codigo = REQUIRED_MSG;
  if (!data.categoria_produto) errors.categoria_produto = "Selecione o produto.";

  if (!data.arquivo) {
    errors.arquivo = REQUIRED_MSG;
  } else if (!data.arquivo.type.startsWith("video/")) {
    errors.arquivo = "Esse arquivo não parece ser um vídeo. Confira o formato e tenta de novo.";
  } else if (data.arquivo.size > MAX_FILE_SIZE_BYTES) {
    errors.arquivo = "Esse arquivo passou do limite de 2GB. Fala com a gente pelo WhatsApp pra enviar de outro jeito.";
  }

  return errors;
}

function updateProgress(fillEl, labelEl, percent) {
  const rounded = Math.round(percent);
  fillEl.style.width = `${rounded}%`;
  labelEl.textContent = `Enviando... ${rounded}%`;
}

/* ---------- UPLOAD PRO DRIVE (via Edge Function + sessão resumível) ----------
   O navegador NUNCA manda bytes direto pro Google: a etapa de PUT do
   upload resumível do Drive não devolve cabeçalho CORS nenhum (só a etapa
   de abrir a sessão devolve), então o navegador bloqueia essa chamada.
   Em vez disso, mandamos o vídeo em pedaços pra nossa própria Edge
   Function (mesma origem seguindo o padrão de CORS que a gente controla),
   que repassa cada pedaço pro Drive por trás. */

async function uploadVideoToDrive(file, categoriaNome, onProgress) {
  const initResponse = await fetch(DRIVE_UPLOAD_INIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      categoria: categoriaNome,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "video/mp4",
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`Não foi possível preparar o upload (status ${initResponse.status}).`);
  }

  const { uploadUrl, error } = await initResponse.json();
  if (error || !uploadUrl) {
    throw new Error(error || "O servidor não retornou uma URL de upload.");
  }

  return await uploadFileInChunks(uploadUrl, file, onProgress);
}

function uploadFileInChunks(uploadUrl, file, onProgress) {
  const total = file.size;

  return new Promise((resolve, reject) => {
    let offset = 0;

    function sendNextChunk() {
      const end = Math.min(offset + DRIVE_CHUNK_SIZE, total);
      const chunk = file.slice(offset, end);

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", DRIVE_UPLOAD_CHUNK_ENDPOINT, true);
      xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
      xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
      xhr.setRequestHeader("X-Drive-Upload-Url", uploadUrl);
      xhr.setRequestHeader("Content-Range", `bytes ${offset}-${end - 1}/${total}`);

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(((offset + event.loaded) / total) * 100);
        }
      });

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Falha ao enviar o vídeo pro Drive (status ${xhr.status}).`));
          return;
        }

        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("Resposta inesperada do servidor durante o upload."));
          return;
        }

        if (data.error) {
          reject(new Error(data.error));
          return;
        }

        if (data.file) {
          onProgress && onProgress(100);
          const driveFile = data.file || {};
          const url = driveFile.webViewLink || (driveFile.id ? `https://drive.google.com/file/d/${driveFile.id}/view` : null);
          resolve({ id: driveFile.id, url });
          return;
        }

        // status 308 = Drive recebeu esse pedaço, ainda faltam mais.
        offset = end;
        sendNextChunk();
      };

      xhr.onerror = () => reject(new Error("Falha de rede durante o envio do vídeo."));
      xhr.send(chunk);
    }

    sendNextChunk();
  });
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
    content_url: data.contentUrl,
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
