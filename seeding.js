/* ============================================
   AURA Creators Club — Ajuda com seeding
   Formulário simples de chamado: nome, CPF, cupom,
   e-mail e mensagem. Grava em aura_hub_seeding_chamados
   (Supabase). Resposta é dada pelo time no admin.

   E-mail de confirmação: chamamos a Edge Function
   send-chamado-email diretamente daqui, logo após o insert
   dar certo. O ideal seria isso disparar por um Database
   Webhook (INSERT na tabela), mas o projeto Supabase está
   sem o schema "supabase_functions" provisionado (bug de
   infra da própria Supabase) — enquanto isso não é resolvido
   por eles, chamamos a função direto do cliente com o mesmo
   formato de payload que um webhook enviaria.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const CHAMADOS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_seeding_chamados`;
const CHAMADO_EMAIL_ENDPOINT = `${SUPABASE_URL}/functions/v1/send-chamado-email`;
const FORM_FIELDS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_form_fields?select=*&formulario=eq.seeding&ativo=eq.true&order=ordem.asc`;

let EXTRA_FIELDS = [];

document.addEventListener("DOMContentLoaded", async () => {
  EXTRA_FIELDS = await fetchSupabaseList(FORM_FIELDS_ENDPOINT);
  renderExtraFields(document.getElementById("extra-fields-container"), EXTRA_FIELDS);
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

/* ---------- CAMPOS EXTRAS (configuráveis pela Bruna no admin) ----------
   Além dos campos fixos deste formulário, a aba "Campos do formulário"
   do admin deixa adicionar perguntas extras sem precisar mexer em código.
   Essas respostas vão pra coluna `campos_extra` (JSON) do chamado. */

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

function setupForm() {
  const form = document.getElementById("chamado-form");
  const feedback = document.getElementById("form-feedback");
  const submitBtn = document.getElementById("submit-btn");

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
      await submitChamado(data);
      form.reset();
      feedback.textContent = "Chamado recebido! Você vai receber uma cópia do que escreveu por e-mail, e a nossa resposta chega no mesmo endereço assim que o time conferir.";
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
  const redesSelecionadas = Array.from(form.querySelectorAll('input[name="redes"]:checked')).map(
    (input) => input.value
  );

  return {
    nome: form.nome.value.trim(),
    cpf: form.cpf.value.trim(),
    cupom: form.cupom.value.trim(),
    instagram: form.instagram.value.trim(),
    redes: redesSelecionadas,
    email: form.email.value.trim(),
    mensagem: form.mensagem.value.trim(),
  };
}

function validate(data) {
  const errors = {};
  const REQUIRED_MSG = "Esse campo é obrigatório.";

  if (!data.nome) errors.nome = REQUIRED_MSG;

  if (!data.cpf) {
    errors.cpf = REQUIRED_MSG;
  } else if (!isValidCpf(data.cpf)) {
    errors.cpf = "Confira se o CPF foi digitado corretamente.";
  }

  if (!data.cupom) errors.cupom = REQUIRED_MSG;

  if (!data.instagram) errors.instagram = REQUIRED_MSG;

  if (!data.redes || data.redes.length === 0) {
    errors.redes = "Marca pelo menos uma rede.";
  }

  if (!data.email) {
    errors.email = REQUIRED_MSG;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Confira se o e-mail foi digitado corretamente.";
  }

  if (!data.mensagem) errors.mensagem = "Conta pra gente o que aconteceu.";

  return errors;
}

/* validação simples de CPF: 11 dígitos, dígitos verificadores corretos */
function isValidCpf(raw) {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (base.length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(cpf.slice(0, 9));
  const d2 = calcDigit(cpf.slice(0, 10));
  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
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

function buildPayload(data) {
  return {
    nome: data.nome,
    cpf: data.cpf.replace(/\D/g, ""),
    cupom: data.cupom,
    instagram_handle: data.instagram.replace(/^@+/, ""),
    redes_ativas: data.redes,
    email: data.email,
    mensagem: data.mensagem,
    campos_extra: getExtraFieldsData(EXTRA_FIELDS),
  };
}

async function submitChamado(data) {
  const payload = buildPayload(data);

  const response = await fetch(CHAMADOS_ENDPOINT, {
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
    throw new Error(`Endpoint respondeu com status ${response.status}`);
  }

  // Chamado gravado com sucesso — dispara o e-mail de confirmação.
  // Falha aqui não deve impedir o "chamado recebido" pra creator,
  // já que o registro em si já foi salvo.
  notifyChamadoEmail({
    type: "INSERT",
    table: "aura_hub_seeding_chamados",
    record: payload,
    old_record: null,
  });

  return response;
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
