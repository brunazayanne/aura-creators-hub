/* ============================================
   AURA Creators Hub — Painel de gestão de conteúdo
   Login real via Supabase Auth (crie o usuário admin
   pelo Dashboard do Supabase: Authentication > Users).
   Depois de logada, as escritas em aura_hub_briefings,
   aura_hub_categorias e aura_hub_produtos são permitidas
   pela RLS porque a sessão é "authenticated" — a chave
   anon sozinha (usada no site público) só tem leitura.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATEGORIAS = [];

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await client.auth.getSession();
  if (session) showApp();
  else showLogin();

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.getElementById("b-add").addEventListener("click", addBriefing);
  document.getElementById("c-add").addEventListener("click", addCategoria);
  document.getElementById("p-add").addEventListener("click", addProduto);
});

function switchTab(name) {
  document.querySelectorAll(".admin-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll(".admin-panel").forEach((p) => p.dataset.active = String(p.dataset.panel === name));
}

/* ---------- AUTENTICAÇÃO ---------- */

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const feedback = document.getElementById("login-feedback");
  feedback.textContent = "";
  feedback.removeAttribute("data-state");

  if (!email || !password) {
    feedback.textContent = "Preencha e-mail e senha.";
    feedback.dataset.state = "error";
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    feedback.textContent = "Não conseguimos entrar. Confira o e-mail e a senha.";
    feedback.dataset.state = "error";
    return;
  }
  showApp();
}

async function handleLogout() {
  await client.auth.signOut();
  showLogin();
}

function showLogin() {
  document.getElementById("login-box").hidden = false;
  document.getElementById("admin-app").hidden = true;
}

function showApp() {
  document.getElementById("login-box").hidden = true;
  document.getElementById("admin-app").hidden = false;
  loadBriefings();
  loadCategorias();
  loadProdutos();
}

/* ---------- HELPERS ---------- */

function feedbackEl(id, message, state) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.dataset.state = state;
  setTimeout(() => { el.textContent = ""; el.removeAttribute("data-state"); }, 4000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ---------- BRIEFINGS ---------- */

async function loadBriefings() {
  const list = document.getElementById("b-list");
  const { data, error } = await client
    .from("aura_hub_briefings")
    .select("*")
    .order("ordem", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum briefing cadastrado ainda.</p>';
    return;
  }

  list.innerHTML = data
    .map(
      (b) => `
      <div class="admin-row${b.ativo ? "" : " admin-row--inativo"}">
        <span>${escapeHtml(b.titulo)}${b.prazo ? ` — até ${escapeHtml(b.prazo)}` : ""}</span>
        <div class="admin-row__actions">
          <button data-action="toggle" data-id="${b.id}" data-ativo="${b.ativo}">${b.ativo ? "Desativar" : "Ativar"}</button>
          <button class="danger" data-action="delete" data-id="${b.id}">Excluir</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleBriefing(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteBriefing(btn.dataset.id))
  );
}

async function addBriefing() {
  const titulo = document.getElementById("b-titulo").value.trim();
  const plataforma = document.getElementById("b-plataforma").value.trim();
  const prazo = document.getElementById("b-prazo").value || null;
  const ordem = Number(document.getElementById("b-ordem").value) || 0;
  const descricao = document.getElementById("b-descricao").value.trim();
  const destaques = document
    .getElementById("b-destaques")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const pdfInput = document.getElementById("b-pdf");
  const pdfFile = pdfInput.files[0];

  if (!titulo) {
    feedbackEl("b-feedback", "Título é obrigatório.", "error");
    return;
  }

  let pdf_url = null;
  if (pdfFile) {
    feedbackEl("b-feedback", "Enviando PDF…", "success");
    const path = `${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: uploadError } = await client.storage.from("briefings-pdf").upload(path, pdfFile, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      feedbackEl("b-feedback", `Erro ao enviar o PDF: ${uploadError.message}`, "error");
      return;
    }
    const { data: publicUrlData } = client.storage.from("briefings-pdf").getPublicUrl(path);
    pdf_url = publicUrlData.publicUrl;
  }

  const { error } = await client.from("aura_hub_briefings").insert({
    titulo, plataforma: plataforma || null, prazo, ordem, descricao: descricao || null, destaques, pdf_url,
  });

  if (error) {
    feedbackEl("b-feedback", `Erro: ${error.message}`, "error");
    return;
  }

  feedbackEl("b-feedback", "Briefing adicionado.", "success");
  document.getElementById("b-titulo").value = "";
  document.getElementById("b-plataforma").value = "";
  document.getElementById("b-prazo").value = "";
  document.getElementById("b-descricao").value = "";
  document.getElementById("b-destaques").value = "";
  pdfInput.value = "";
  loadBriefings();
}

async function toggleBriefing(id, ativoAtual) {
  await client.from("aura_hub_briefings").update({ ativo: !ativoAtual }).eq("id", id);
  loadBriefings();
}

async function deleteBriefing(id) {
  if (!confirm("Excluir esse briefing?")) return;
  await client.from("aura_hub_briefings").delete().eq("id", id);
  loadBriefings();
}

/* ---------- CATEGORIAS ---------- */

async function loadCategorias() {
  const list = document.getElementById("c-list");
  const { data, error } = await client
    .from("aura_hub_categorias")
    .select("*")
    .order("ordem", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }

  CATEGORIAS = data || [];
  populateCategoriaSelect();

  if (CATEGORIAS.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma categoria cadastrada ainda.</p>';
    return;
  }

  list.innerHTML = CATEGORIAS
    .map(
      (c) => `
      <div class="admin-row${c.ativo ? "" : " admin-row--inativo"}">
        <span>${escapeHtml(c.nome)}</span>
        <div class="admin-row__actions">
          <button data-action="toggle" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? "Desativar" : "Ativar"}</button>
          <button class="danger" data-action="delete" data-id="${c.id}">Excluir</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleCategoria(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteCategoria(btn.dataset.id))
  );
}

function populateCategoriaSelect() {
  const select = document.getElementById("p-categoria");
  const current = select.value;
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  CATEGORIAS.filter((c) => c.ativo).forEach((c) => {
    const el = document.createElement("option");
    el.value = c.id;
    el.textContent = c.nome;
    select.appendChild(el);
  });
  if (current) select.value = current;
}

async function addCategoria() {
  const nome = document.getElementById("c-nome").value.trim();
  const ordem = Number(document.getElementById("c-ordem").value) || 0;

  if (!nome) {
    feedbackEl("c-feedback", "Nome é obrigatório.", "error");
    return;
  }

  const { error } = await client.from("aura_hub_categorias").insert({ nome, ordem });
  if (error) {
    feedbackEl("c-feedback", `Erro: ${error.message}`, "error");
    return;
  }

  feedbackEl("c-feedback", "Categoria adicionada.", "success");
  document.getElementById("c-nome").value = "";
  loadCategorias();
}

async function toggleCategoria(id, ativoAtual) {
  await client.from("aura_hub_categorias").update({ ativo: !ativoAtual }).eq("id", id);
  loadCategorias();
  loadProdutos();
}

async function deleteCategoria(id) {
  if (!confirm("Excluir essa categoria? Os produtos ligados a ela também serão excluídos.")) return;
  await client.from("aura_hub_categorias").delete().eq("id", id);
  loadCategorias();
  loadProdutos();
}

/* ---------- PRODUTOS ---------- */

async function loadProdutos() {
  const list = document.getElementById("p-list");
  const { data, error } = await client
    .from("aura_hub_produtos")
    .select("*, aura_hub_categorias(nome)")
    .order("ordem", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum produto cadastrado ainda.</p>';
    return;
  }

  list.innerHTML = data
    .map(
      (p) => `
      <div class="admin-row${p.ativo ? "" : " admin-row--inativo"}">
        <span>${escapeHtml(p.nome)} <em style="opacity:.7">(${escapeHtml(p.aura_hub_categorias?.nome || "sem categoria")})</em></span>
        <div class="admin-row__actions">
          <button data-action="toggle" data-id="${p.id}" data-ativo="${p.ativo}">${p.ativo ? "Desativar" : "Ativar"}</button>
          <button class="danger" data-action="delete" data-id="${p.id}">Excluir</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleProduto(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteProduto(btn.dataset.id))
  );
}

async function addProduto() {
  const categoria_id = document.getElementById("p-categoria").value;
  const nome = document.getElementById("p-nome").value.trim();
  const imagem_url = document.getElementById("p-imagem").value.trim();
  const ordem = Number(document.getElementById("p-ordem").value) || 0;

  if (!categoria_id || !nome) {
    feedbackEl("p-feedback", "Categoria e nome são obrigatórios.", "error");
    return;
  }

  const { error } = await client.from("aura_hub_produtos").insert({
    categoria_id, nome, imagem_url: imagem_url || null, ordem,
  });

  if (error) {
    feedbackEl("p-feedback", `Erro: ${error.message}`, "error");
    return;
  }

  feedbackEl("p-feedback", "Produto adicionado.", "success");
  document.getElementById("p-nome").value = "";
  document.getElementById("p-imagem").value = "";
  loadProdutos();
}

async function toggleProduto(id, ativoAtual) {
  await client.from("aura_hub_produtos").update({ ativo: !ativoAtual }).eq("id", id);
  loadProdutos();
}

async function deleteProduto(id) {
  if (!confirm("Excluir esse produto?")) return;
  await client.from("aura_hub_produtos").delete().eq("id", id);
  loadProdutos();
}
