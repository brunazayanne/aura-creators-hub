/* ============================================
   AURA Creators Club — Ajuda com seeding
   Formulário simples de chamado: nome, CPF, cupom,
   e-mail e mensagem. Grava em aura_hub_seeding_chamados
   (Supabase). Resposta é dada pelo time no admin.

   Envio de e-mail (cópia pra creator + resposta do time)
   ainda NÃO está conectado aqui — ver pendência técnica
   documentada pro dev. Este script só grava o chamado.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";
const CHAMADOS_ENDPOINT = `${SUPABASE_URL}/rest/v1/aura_hub_seeding_chamados`;

document.addEventListener("DOMContentLoaded", () => {
  setupForm();
});

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
    const errors = validate(data);

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
  return {
    nome: form.nome.value.trim(),
    cpf: form.cpf.value.trim(),
    cupom: form.cupom.value.trim(),
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
    email: data.email,
    mensagem: data.mensagem,
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

  return response;
}
