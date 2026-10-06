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
const FORM_FIELDS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_form_fields?select=*&formulario=eq.video_impulsionado&ativo=eq.true&order=ordem.asc`;
const DRIVE_UPLOAD_INIT_ENDPOINT = `${SUPABASE_URL}/functions/v1/upload-video-impulsionado`;
const DRIVE_UPLOAD_CHUNK_ENDPOINT = `${DRIVE_UPLOAD_INIT_ENDPOINT}/chunk`;
const SHEET_LOG_ENDPOINT = `${SUPABASE_URL}/functions/v1/append-video-impulsionado-sheet`;
// Essa função foi criada depois que o projeto passou a exigir o novo formato
// de chave (publishable/secret) no gateway de Edge Functions — a SUPABASE_ANON_KEY
// legada acima continua valendo pro resto do site (REST, Auth), mas é recusada
// aqui. Usamos a chave publishable nova só nessa chamada específica.
const SHEET_LOG_API_KEY = "sb_publishable_ITub6GFEc4apnU7x8xq4CQ_nOtr2Eos";
// Múltiplo de 256KiB, como o protocolo de upload resumível do Drive exige
// pra todo pedaço que não seja o último.
const DRIVE_CHUNK_SIZE = 8 * 1024 * 1024;

const CONTENT_PLATFORM_TAG = "video_impulsionado_drive";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — limite confortável pra vídeo bruto de creator

let CATEGORIAS = [];
let EXTRA_FIELDS = [];
// Preenchido depois que a creator confirma o popup de identificação —
// um item por arquivo selecionado, na mesma ordem, com { nome, categoriaId }.
let VIDEO_META = null;
// Guarda os próprios arquivos pra detectar se a seleção mudou depois de
// confirmar o popup (ex: a pessoa trocou o arquivo sem reabrir o popup).
let VIDEO_META_FILES = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [categorias, extraFields] = await Promise.all([
    fetchSupabaseList(CATEGORIAS_ENDPOINT),
    fetchSupabaseList(FORM_FIELDS_ENDPOINT),
  ]);
  CATEGORIAS = categorias;
  EXTRA_FIELDS = extraFields;
  renderExtraFields(document.getElementById("extra-fields-container"), EXTRA_FIELDS);
  setupForm();
  wireVideoMetaModal();
});

/* ---------- POPUP DE IDENTIFICAÇÃO DOS VÍDEOS ----------
   Ao escolher o(s) arquivo(s), abre um popup pra creator dar um nome e
   escolher o produto de cada vídeo — substitui o campo único de "produto"
   que existia no formulário principal, já que agora cada vídeo do mesmo
   envio pode ser de um produto diferente. */

function wireVideoMetaModal() {
  const input = document.getElementById("arquivo");
  const overlay = document.getElementById("video-meta-overlay");
  const closeBtn = document.getElementById("video-meta-close");
  const confirmBtn = document.getElementById("video-meta-confirm");

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    VIDEO_META = null;
    VIDEO_META_FILES = null;
    if (files.length === 0) return;
    openVideoMetaModal(files);
  });

  closeBtn.addEventListener("click", () => {
    // Fecha sem confirmar = não dá pra saber o produto de cada vídeo,
    // então limpa a seleção pra evitar enviar sem essa informação.
    input.value = "";
    VIDEO_META = null;
    VIDEO_META_FILES = null;
    overlay.hidden = true;
  });

  confirmBtn.addEventListener("click", () => {
    const files = Array.from(input.files || []);
    const rows = document.querySelectorAll("#video-meta-list [data-video-index]");
    const meta = [];
    let erro = "";

    rows.forEach((row) => {
      const nome = row.querySelector(".vm-nome").value.trim();
      const categoriaId = row.querySelector(".vm-categoria").value;
      if (!nome || !categoriaId) erro = "Preencha o nome e o produto de todos os vídeos.";
      meta.push({ nome, categoriaId });
    });

    const errorEl = document.getElementById("video-meta-error");
    if (erro) {
      errorEl.textContent = erro;
      return;
    }

    errorEl.textContent = "";
    VIDEO_META = meta;
    VIDEO_META_FILES = files;
    overlay.hidden = true;
  });
}

function openVideoMetaModal(files) {
  const overlay = document.getElementById("video-meta-overlay");
  const list = document.getElementById("video-meta-list");
  const errorEl = document.getElementById("video-meta-error");
  errorEl.textContent = "";

  const opcoesHtml = CATEGORIAS.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)}</option>`).join("");

  list.innerHTML = files
    .map((file, idx) => {
      const nomeSemExtensao = file.name.replace(/\.[^/.]+$/, "");
      return `
        <div class="field" data-video-index="${idx}" style="border-top:1px solid var(--placeholder-gray);padding-top:14px;margin-top:14px;">
          <label style="font-size:12px;opacity:.7;">Vídeo ${idx + 1} de ${files.length} — ${escapeHtml(file.name)}</label>
          <input type="text" class="vm-nome" placeholder="Nome do vídeo" value="${escapeHtml(nomeSemExtensao)}">
          <select class="vm-categoria">
            <option value="" disabled selected>Qual produto?</option>
            ${opcoesHtml}
          </select>
        </div>
      `;
    })
    .join("");

  overlay.hidden = false;
}

function validateVideoMeta(arquivos) {
  if (arquivos.length === 0) return null;
  if (!VIDEO_META || !VIDEO_META_FILES || VIDEO_META_FILES.length !== arquivos.length) {
    return "Identifique o nome e o produto de cada vídeo antes de enviar.";
  }
  const mudou = arquivos.some((f, idx) => VIDEO_META_FILES[idx] !== f);
  if (mudou) return "Identifique o nome e o produto de cada vídeo antes de enviar.";
  return null;
}

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
    const videoMetaErro = validateVideoMeta(data.arquivos);
    const errors = { ...validate(data), ...validateExtraFields(EXTRA_FIELDS) };
    if (videoMetaErro) errors.arquivo = videoMetaErro;

    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      const firstErrorField = form.querySelector('[aria-invalid="true"]');
      if (firstErrorField) firstErrorField.focus();
      if (videoMetaErro && data.arquivos.length > 0) openVideoMetaModal(data.arquivos);
      return;
    }

    setLoading(submitBtn, true);
    progressWrap.hidden = false;
    updateProgress(progressFill, progressLabel, 0, 1, data.arquivos.length);

    const campos_extra = getExtraFieldsData(EXTRA_FIELDS);
    const total = data.arquivos.length;
    let sucesso = 0;
    const falhas = [];

    for (let i = 0; i < total; i++) {
      const arquivo = data.arquivos[i];
      const meta = VIDEO_META[i];
      const categoriaNome = CATEGORIAS.find((c) => c.id === meta.categoriaId)?.nome || "Outros";

      try {
        const driveFile = await uploadVideoToDrive(arquivo, categoriaNome, (percent) => {
          updateProgress(progressFill, progressLabel, percent, i + 1, total);
        });

        await submitToBackend({
          ...data,
          contentUrl: driveFile.url,
          categoriaNome,
          campos_extra: { ...campos_extra, nome_video: meta.nome },
        });

        // Registro na planilha de controle é só um espelho pra visão rápida
        // da Bruna — falha aqui não deve travar a confirmação pra creator,
        // já que o envio em si (Drive + Supabase) já está garantido.
        notifySheetLog({
          nome: data.nome,
          cupom: data.codigo,
          categoria: categoriaNome,
          link: driveFile.url,
        });

        sucesso += 1;
      } catch (err) {
        console.error(`Falha ao enviar "${arquivo.name}":`, err);
        falhas.push(arquivo.name);
      }
    }

    progressWrap.hidden = true;
    setLoading(submitBtn, false);

    if (sucesso > 0) {
      form.reset();
      VIDEO_META = null;
      VIDEO_META_FILES = null;
    }

    if (falhas.length === 0) {
      const totalEnviados = await countSubmissionsByCupom(data.codigo);
      const plural = sucesso > 1 ? `${sucesso} vídeos` : "seu vídeo";
      feedback.textContent = totalEnviados
        ? `Recebemos ${plural} — esse já é o seu ${totalEnviados}º envio no total! Nosso time confere o material e avisa você se algum for selecionado pra impulsionar.`
        : `Recebemos ${plural}. Nosso time confere o material e avisa você se algum for selecionado pra impulsionar.`;
      feedback.dataset.state = "success";
    } else if (sucesso > 0) {
      feedback.textContent = `${sucesso} de ${total} vídeos enviados. Não conseguimos enviar: ${falhas.join(", ")}. Tenta reenviar só esse(s) de novo.`;
      feedback.dataset.state = "error";
    } else {
      feedback.textContent = "Algo não saiu como esperado no envio do(s) vídeo(s). Tenta de novo em alguns instantes.";
      feedback.dataset.state = "error";
    }
  });
}

function getFormData(form) {
  return {
    nome: form.nome.value.trim(),
    codigo: form.codigo.value.trim(),
    arquivos: Array.from(form.arquivo.files || []),
  };
}

function validate(data) {
  const errors = {};
  const REQUIRED_MSG = "Esse campo é obrigatório.";

  if (!data.nome) errors.nome = REQUIRED_MSG;
  if (!data.codigo) errors.codigo = REQUIRED_MSG;

  if (!data.arquivos || data.arquivos.length === 0) {
    errors.arquivo = "Selecione pelo menos um arquivo.";
  } else {
    const invalido = data.arquivos.find((f) => !f.type.startsWith("video/"));
    const grandeDemais = data.arquivos.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (invalido) {
      errors.arquivo = `"${invalido.name}" não parece ser um vídeo. Confira o formato e tenta de novo.`;
    } else if (grandeDemais) {
      errors.arquivo = `"${grandeDemais.name}" passou do limite de 2GB. Fala com a gente pelo WhatsApp pra enviar de outro jeito.`;
    }
  }

  return errors;
}

function updateProgress(fillEl, labelEl, percent, indiceAtual, total) {
  const rounded = Math.round(percent);
  fillEl.style.width = `${rounded}%`;
  labelEl.textContent =
    total > 1 ? `Enviando vídeo ${indiceAtual} de ${total}... ${rounded}%` : `Enviando... ${rounded}%`;
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
  return {
    briefing_id: null,
    seguiu_briefing: false,
    categoria_produto: data.categoriaNome || null,
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
    campos_extra: data.campos_extra || getExtraFieldsData(EXTRA_FIELDS),
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

/* ---------- REGISTRO NA PLANILHA DE CONTROLE (espelho, não crítico) ---------- */

async function notifySheetLog(body) {
  try {
    const res = await fetch(SHEET_LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SHEET_LOG_API_KEY,
        Authorization: `Bearer ${SHEET_LOG_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("append-video-impulsionado-sheet respondeu com erro:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Falha ao chamar append-video-impulsionado-sheet:", err);
  }
}
