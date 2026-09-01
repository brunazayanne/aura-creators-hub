/* ============================================
   AURA Creators Hub — Painel de gestão de conteúdo
   Login real via Supabase Auth (crie o usuário admin
   pelo Dashboard do Supabase: Authentication > Users).
   Depois de logada, as escritas em aura_hub_briefings,
   aura_hub_categorias, aura_hub_produtos e aura_hub_submissions
   são permitidas pela RLS porque a sessão é "authenticated" —
   a chave anon sozinha (usada no site público) só tem leitura
   e o insert de novas submissões.
   ============================================ */

const SUPABASE_URL = "https://vjpspclcruvcesuifuva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcHNwY2xjcnV2Y2VzdWlmdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjU1OTAsImV4cCI6MjEwMzgwMTU5MH0.7XDAaW-XL5E-C_0XXoS9CGM9KA692bI24RoPcQau1-s";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATEGORIAS = [];
let PRODUTOS = [];

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
  loadSubmissoes();
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
  const plataforma = Array.from(document.querySelectorAll('input[name="b-plataforma"]:checked'))
    .map((el) => el.value)
    .join(", ");
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
  document.querySelectorAll('input[name="b-plataforma"]').forEach((el) => (el.checked = false));
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

/* ---------- CATEGORIAS + PRODUTOS (aninhados) ---------- */

async function loadCategorias() {
  const list = document.getElementById("c-list");

  const [{ data: categorias, error: catError }, { data: produtos, error: prodError }] = await Promise.all([
    client.from("aura_hub_categorias").select("*").order("ordem", { ascending: true }),
    client.from("aura_hub_produtos").select("*").order("ordem", { ascending: true }),
  ]);

  if (catError) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(catError.message)}</p>`;
    return;
  }

  CATEGORIAS = categorias || [];
  PRODUTOS = prodError ? [] : produtos || [];

  if (CATEGORIAS.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma categoria cadastrada ainda.</p>';
    return;
  }

  list.innerHTML = CATEGORIAS
    .map((c) => {
      const produtosDaCategoria = PRODUTOS.filter((p) => p.categoria_id === c.id);
      const produtosHtml = produtosDaCategoria.length
        ? produtosDaCategoria
            .map(
              (p) => `
              <div class="admin-row admin-row--nested${p.ativo ? "" : " admin-row--inativo"}">
                <span>${escapeHtml(p.nome)}</span>
                <div class="admin-row__actions">
                  <button data-action="toggle-produto" data-id="${p.id}" data-ativo="${p.ativo}">${p.ativo ? "Desativar" : "Ativar"}</button>
                  <button class="danger" data-action="delete-produto" data-id="${p.id}">Excluir</button>
                </div>
              </div>
            `
            )
            .join("")
        : '<p class="admin-empty">Nenhum produto nessa categoria ainda.</p>';

      return `
        <details class="admin-categoria" data-id="${c.id}">
          <summary>
            <span>${escapeHtml(c.nome)}${c.ativo ? "" : " (inativa)"}</span>
            <span class="admin-row__actions">
              <button type="button" data-action="toggle-categoria" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? "Desativar" : "Ativar"}</button>
              <button type="button" class="danger" data-action="delete-categoria" data-id="${c.id}">Excluir</button>
            </span>
          </summary>
          <div class="admin-categoria__produtos">
            ${produtosHtml}
            <div class="admin-form-row admin-form-row--full admin-form-row--inline">
              <input type="text" placeholder="Nome do novo produto" data-role="novo-produto-nome">
              <input type="url" placeholder="URL da imagem (opcional)" data-role="novo-produto-imagem">
              <button type="button" data-action="add-produto" data-categoria-id="${c.id}">Adicionar produto</button>
            </div>
          </div>
        </details>
      `;
    })
    .join("");

  list.querySelectorAll('[data-action="toggle-categoria"]').forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleCategoria(btn.dataset.id, btn.dataset.ativo === "true");
    })
  );
  list.querySelectorAll('[data-action="delete-categoria"]').forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      deleteCategoria(btn.dataset.id);
    })
  );
  list.querySelectorAll('[data-action="toggle-produto"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleProduto(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  list.querySelectorAll('[data-action="delete-produto"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteProduto(btn.dataset.id))
  );
  list.querySelectorAll('[data-action="add-produto"]').forEach((btn) =>
    btn.addEventListener("click", () => addProdutoInline(btn.dataset.categoriaId, btn))
  );

  // impede que clicar nas ações dentro do <summary> também abra/feche o accordion
  list.querySelectorAll(".admin-categoria > summary .admin-row__actions").forEach((el) => {
    el.addEventListener("click", (event) => event.stopPropagation());
  });
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
}

async function deleteCategoria(id) {
  if (!confirm("Excluir essa categoria? Os produtos ligados a ela também serão excluídos.")) return;
  await client.from("aura_hub_categorias").delete().eq("id", id);
  loadCategorias();
}

async function addProdutoInline(categoriaId, btn) {
  const details = btn.closest(".admin-categoria");
  const nomeInput = details.querySelector('[data-role="novo-produto-nome"]');
  const imagemInput = details.querySelector('[data-role="novo-produto-imagem"]');
  const nome = nomeInput.value.trim();
  const imagem_url = imagemInput.value.trim();

  if (!nome) {
    nomeInput.focus();
    return;
  }

  btn.disabled = true;
  const { error } = await client.from("aura_hub_produtos").insert({
    categoria_id: categoriaId, nome, imagem_url: imagem_url || null, ordem: 0,
  });
  btn.disabled = false;

  if (error) {
    alert(`Erro ao adicionar produto: ${error.message}`);
    return;
  }

  loadCategorias();
}

async function toggleProduto(id, ativoAtual) {
  await client.from("aura_hub_produtos").update({ ativo: !ativoAtual }).eq("id", id);
  loadCategorias();
}

async function deleteProduto(id) {
  if (!confirm("Excluir esse produto?")) return;
  await client.from("aura_hub_produtos").delete().eq("id", id);
  loadCategorias();
}

/* ---------- SUBMISSÕES (aprovação pro mural + upload de imagem) ---------- */

async function loadSubmissoes() {
  const list = document.getElementById("s-list");
  const { data, error } = await client
    .from("aura_hub_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma submissão recebida ainda.</p>';
    return;
  }

  list.innerHTML = data
    .map((s) => {
      const handle = (s.instagram_handle || "").replace(/^@+/, "");
      const statusTag = s.approved
        ? '<span class="admin-tag admin-tag--ok">No mural</span>'
        : '<span class="admin-tag admin-tag--pending">Pendente</span>';
      const consentTag = s.consent_public_display
        ? "autorizou exibir no mural"
        : "não autorizou exibir no mural";

      return `
        <div class="admin-row admin-row--submissao" data-id="${s.id}">
          <div class="admin-submissao__info">
            <p><strong>${escapeHtml(s.creator_name || "Sem nome")}</strong> ${handle ? `— @${escapeHtml(handle)}` : ""} ${statusTag}</p>
            <p style="font-size:12px;opacity:.75;">
              ${escapeHtml(s.content_platform || "")} · ${escapeHtml(consentTag)}
              ${s.content_url ? ` · <a href="${encodeURI(s.content_url)}" target="_blank" rel="noopener">Ver conteúdo</a>` : ""}
            </p>
            ${s.thumb_url ? `<img src="${encodeURI(s.thumb_url)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;margin-top:6px;">` : ""}
          </div>
          <div class="admin-submissao__actions">
            <input type="file" accept="image/*" data-role="thumb-input">
            <button type="button" data-action="upload-thumb">Salvar imagem</button>
            <button type="button" data-action="toggle-approve" data-approved="${s.approved}">${s.approved ? "Tirar do mural" : "Aprovar pro mural"}</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll('[data-action="toggle-approve"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      toggleApproveSubmission(id, btn.dataset.approved === "true");
    })
  );
  list.querySelectorAll('[data-action="upload-thumb"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      uploadSubmissionThumb(id, btn);
    })
  );
}

async function toggleApproveSubmission(id, approvedAtual) {
  const { error } = await client.from("aura_hub_submissions").update({ approved: !approvedAtual }).eq("id", id);
  if (error) {
    alert(`Erro ao atualizar: ${error.message}`);
    return;
  }
  loadSubmissoes();
}

async function uploadSubmissionThumb(id, btn) {
  const row = btn.closest("[data-id]");
  const input = row.querySelector('[data-role="thumb-input"]');
  const file = input.files[0];

  if (!file) {
    alert("Selecione uma imagem primeiro.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enviando…";

  const path = `${id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const { error: uploadError } = await client.storage.from("mural-thumbs").upload(path, file, { upsert: true });

  if (uploadError) {
    alert(`Erro ao enviar a imagem: ${uploadError.message}`);
    btn.disabled = false;
    btn.textContent = "Salvar imagem";
    return;
  }

  const { data: publicUrlData } = client.storage.from("mural-thumbs").getPublicUrl(path);
  const { error } = await client.from("aura_hub_submissions").update({ thumb_url: publicUrlData.publicUrl }).eq("id", id);

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    btn.disabled = false;
    btn.textContent = "Salvar imagem";
    return;
  }

  loadSubmissoes();
}
