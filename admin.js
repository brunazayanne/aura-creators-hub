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
let BRIEFINGS = [];
let editingBriefingId = null;
let ALL_SUBMISSOES = [];
let SUBMISSOES_PAGE = 1;
const SUBMISSOES_POR_PAGINA = 10;

const PLATAFORMA_LABELS = {
  instagram: "Instagram (Reels)",
  instagram_story: "Instagram (Story)",
  tiktok: "TikTok",
  youtube_shorts: "YouTube (Shorts)",
  youtube_longo: "YouTube (Conteúdo longo)",
};

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await client.auth.getSession();
  if (session) showApp();
  else showLogin();

  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.getElementById("b-add").addEventListener("click", saveBriefing);
  document.getElementById("b-cancel-edit").addEventListener("click", cancelEditBriefing);
  document.getElementById("c-add").addEventListener("click", addCategoria);

  document.getElementById("s-filter-briefing").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-plataforma").addEventListener("change", () => {
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });
  document.getElementById("s-filter-clear").addEventListener("click", () => {
    document.getElementById("s-filter-briefing").value = "";
    document.getElementById("s-filter-plataforma").value = "";
    SUBMISSOES_PAGE = 1;
    renderSubmissoes();
  });

  wireVendasUpload();
});

function populateSubmissaoBriefingFilter() {
  const select = document.getElementById("s-filter-briefing");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Todos os briefings</option>';
  BRIEFINGS.forEach((b) => {
    const el = document.createElement("option");
    el.value = b.id;
    el.textContent = b.titulo;
    select.appendChild(el);
  });
  select.value = current;
}

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

async function showApp() {
  document.getElementById("login-box").hidden = true;
  document.getElementById("admin-app").hidden = false;
  loadBriefings();
  loadCategorias();
  await loadSubmissoes();
  loadRelatorio();
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

function isPast(prazo) {
  if (!prazo) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(`${prazo}T00:00:00`) < hoje;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
}

/* ---------- BRIEFINGS ---------- */

function briefingRowHtml(b) {
  return `
      <div class="admin-row${b.ativo ? "" : " admin-row--inativo"}">
        <span>${escapeHtml(b.titulo)}${b.prazo ? ` — até ${escapeHtml(b.prazo)}` : ""}</span>
        <div class="admin-row__actions">
          <button data-action="edit" data-id="${b.id}">Editar</button>
          <button data-action="toggle" data-id="${b.id}" data-ativo="${b.ativo}">${b.ativo ? "Desativar" : "Ativar"}</button>
          <button class="danger" data-action="delete" data-id="${b.id}">Excluir</button>
        </div>
      </div>
    `;
}

function wireBriefingRowActions(container) {
  container.querySelectorAll('[data-action="edit"]').forEach((btn) =>
    btn.addEventListener("click", () => startEditBriefing(btn.dataset.id))
  );
  container.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener("click", () => toggleBriefing(btn.dataset.id, btn.dataset.ativo === "true"))
  );
  container.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => deleteBriefing(btn.dataset.id))
  );
}

async function loadBriefings() {
  const list = document.getElementById("b-list");
  const listArquivo = document.getElementById("b-list-arquivo");
  const arquivoCount = document.getElementById("b-arquivo-count");

  const { data, error } = await client
    .from("aura_hub_briefings")
    .select("*")
    .order("ordem", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="admin-empty">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    return;
  }
  BRIEFINGS = data || [];
  populateSubmissaoBriefingFilter();

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhum briefing cadastrado ainda.</p>';
    if (listArquivo) listArquivo.innerHTML = '<p class="admin-empty">Nenhum briefing anterior.</p>';
    if (arquivoCount) arquivoCount.textContent = "(0)";
    return;
  }

  const vigentes = data.filter((b) => !isPast(b.prazo));
  const encerrados = data.filter((b) => isPast(b.prazo));

  list.innerHTML = vigentes.length
    ? vigentes.map(briefingRowHtml).join("")
    : '<p class="admin-empty">Nenhum briefing vigente no momento.</p>';
  wireBriefingRowActions(list);

  if (listArquivo) {
    listArquivo.innerHTML = encerrados.length
      ? encerrados.map(briefingRowHtml).join("")
      : '<p class="admin-empty">Nenhum briefing anterior.</p>';
    wireBriefingRowActions(listArquivo);
  }
  if (arquivoCount) arquivoCount.textContent = `(${encerrados.length})`;
}

function startEditBriefing(id) {
  const briefing = BRIEFINGS.find((b) => b.id === id);
  if (!briefing) return;

  editingBriefingId = id;

  document.getElementById("b-titulo").value = briefing.titulo || "";
  const plataformas = (briefing.plataforma || "").split(",").map((s) => s.trim()).filter(Boolean);
  document.querySelectorAll('input[name="b-plataforma"]').forEach((el) => {
    el.checked = plataformas.includes(el.value);
  });
  document.getElementById("b-prazo").value = briefing.prazo || "";
  document.getElementById("b-ordem").value = briefing.ordem || 0;
  document.getElementById("b-descricao").value = briefing.descricao || "";
  document.getElementById("b-destaques").value = (briefing.destaques || []).join("\n");
  document.getElementById("b-pdf").value = "";

  const pdfAtualEl = document.getElementById("b-pdf-atual");
  if (briefing.pdf_url) {
    pdfAtualEl.style.display = "block";
    pdfAtualEl.innerHTML = `PDF atual: <a href="${encodeURI(briefing.pdf_url)}" target="_blank" rel="noopener">ver arquivo</a>. Envie um novo aqui só se quiser substituir.`;
  } else {
    pdfAtualEl.style.display = "none";
    pdfAtualEl.innerHTML = "";
  }

  document.getElementById("b-form-title").textContent = "Editar briefing";
  document.getElementById("b-add").textContent = "Salvar alterações";
  document.getElementById("b-cancel-edit").style.display = "inline-block";
  document.getElementById("b-titulo").closest(".admin-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEditBriefing() {
  editingBriefingId = null;
  document.getElementById("b-titulo").value = "";
  document.querySelectorAll('input[name="b-plataforma"]').forEach((el) => (el.checked = false));
  document.getElementById("b-prazo").value = "";
  document.getElementById("b-ordem").value = 0;
  document.getElementById("b-descricao").value = "";
  document.getElementById("b-destaques").value = "";
  document.getElementById("b-pdf").value = "";
  document.getElementById("b-pdf-atual").style.display = "none";
  document.getElementById("b-pdf-atual").innerHTML = "";
  document.getElementById("b-form-title").textContent = "Novo briefing";
  document.getElementById("b-add").textContent = "Adicionar briefing";
  document.getElementById("b-cancel-edit").style.display = "none";
}

async function saveBriefing() {
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

  const isEditing = Boolean(editingBriefingId);
  const existing = isEditing ? BRIEFINGS.find((b) => b.id === editingBriefingId) : null;
  let pdf_url = existing ? existing.pdf_url || null : null;

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

  const payload = { titulo, plataforma: plataforma || null, prazo, ordem, descricao: descricao || null, destaques, pdf_url };

  const { error } = isEditing
    ? await client.from("aura_hub_briefings").update(payload).eq("id", editingBriefingId)
    : await client.from("aura_hub_briefings").insert(payload);

  if (error) {
    feedbackEl("b-feedback", `Erro: ${error.message}`, "error");
    return;
  }

  feedbackEl("b-feedback", isEditing ? "Briefing atualizado." : "Briefing adicionado.", "success");
  cancelEditBriefing();
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

  ALL_SUBMISSOES = data || [];
  populateSubmissaoBriefingFilter();
  renderSubmissoes();
}

function renderSubmissoes() {
  const list = document.getElementById("s-list");
  const filtroBriefing = document.getElementById("s-filter-briefing")?.value || "";
  const filtroPlataforma = document.getElementById("s-filter-plataforma")?.value || "";

  const data = ALL_SUBMISSOES.filter((s) => {
    if (filtroBriefing && s.briefing_id !== filtroBriefing) return false;
    if (filtroPlataforma && s.content_platform !== filtroPlataforma) return false;
    return true;
  });

  if (ALL_SUBMISSOES.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma submissão recebida ainda.</p>';
    return;
  }
  if (data.length === 0) {
    list.innerHTML = '<p class="admin-empty">Nenhuma submissão encontrada com esse filtro.</p>';
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(data.length / SUBMISSOES_POR_PAGINA));
  if (SUBMISSOES_PAGE > totalPaginas) SUBMISSOES_PAGE = totalPaginas;
  if (SUBMISSOES_PAGE < 1) SUBMISSOES_PAGE = 1;

  const inicio = (SUBMISSOES_PAGE - 1) * SUBMISSOES_POR_PAGINA;
  const pageData = data.slice(inicio, inicio + SUBMISSOES_POR_PAGINA);

  const rowsHtml = pageData
    .map((s) => {
      const handle = (s.instagram_handle || "").replace(/^@+/, "");
      const statusTag = s.approved
        ? '<span class="admin-tag admin-tag--ok">No mural</span>'
        : '<span class="admin-tag admin-tag--pending">Pendente</span>';
      const consentTag = s.consent_public_display
        ? "autorizou exibir no mural"
        : "não autorizou exibir no mural";
      const adcodeTag = s.boost_authorized
        ? `Autorizou impulsionamento · adcode: <strong>${escapeHtml(s.boost_adcode || "não informado")}</strong>`
        : "Não autorizou impulsionamento";
      const postedAt = formatDateTime(s.created_at);

      return `
        <div class="admin-row admin-row--submissao" data-id="${s.id}">
          <div class="admin-submissao__info">
            <p><strong>${escapeHtml(s.creator_name || "Sem nome")}</strong> ${handle ? `— @${escapeHtml(handle)}` : ""} ${statusTag}</p>
            <p style="font-size:12px;opacity:.75;">
              ${escapeHtml(s.content_platform || "")} · ${escapeHtml(consentTag)}
              ${s.content_url ? ` · <a href="${encodeURI(s.content_url)}" target="_blank" rel="noopener">Ver conteúdo</a>` : ""}
            </p>
            ${postedAt ? `<p style="font-size:12px;opacity:.75;">Postado em ${escapeHtml(postedAt)}</p>` : ""}
            <p style="font-size:12px;opacity:.75;">${adcodeTag}</p>
            ${s.thumb_url ? `<img src="${encodeURI(s.thumb_url)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;margin-top:6px;">` : ""}
          </div>
          <div class="admin-submissao__actions">
            <input type="file" accept="image/*" data-role="thumb-input">
            <button type="button" data-action="upload-thumb">Salvar imagem</button>
            <button type="button" data-action="toggle-approve" data-approved="${s.approved}">${s.approved ? "Tirar do mural" : "Aprovar pro mural"}</button>
            ${
              s.approved
                ? `<span style="display:flex;align-items:center;gap:6px;">
                    <input type="number" data-role="ordem-input" value="${s.mural_ordem ?? ""}" placeholder="ordem" style="width:70px;">
                    <button type="button" data-action="save-ordem">Salvar ordem</button>
                  </span>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  const pagerHtml = `
    <div class="admin-pager" style="display:flex;align-items:center;gap:14px;justify-content:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--placeholder-gray);">
      <button type="button" class="btn btn--small btn--outline" id="s-pager-prev" ${SUBMISSOES_PAGE <= 1 ? "disabled" : ""}>&larr; Página anterior</button>
      <span style="font-size:13px;opacity:.75;">Página ${SUBMISSOES_PAGE} de ${totalPaginas}</span>
      <button type="button" class="btn btn--small btn--outline" id="s-pager-next" ${SUBMISSOES_PAGE >= totalPaginas ? "disabled" : ""}>Próxima página &rarr;</button>
    </div>
  `;

  list.innerHTML = rowsHtml + (totalPaginas > 1 ? pagerHtml : "");

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
  list.querySelectorAll('[data-action="save-ordem"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-id]").dataset.id;
      saveMuralOrdem(id, btn);
    })
  );

  const prevBtn = document.getElementById("s-pager-prev");
  const nextBtn = document.getElementById("s-pager-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      SUBMISSOES_PAGE -= 1;
      renderSubmissoes();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      SUBMISSOES_PAGE += 1;
      renderSubmissoes();
    });
  }
}

async function toggleApproveSubmission(id, approvedAtual) {
  const { error } = await client.from("aura_hub_submissions").update({ approved: !approvedAtual }).eq("id", id);
  if (error) {
    alert(`Erro ao atualizar: ${error.message}`);
    return;
  }
  loadSubmissoes();
}

async function saveMuralOrdem(id, btn) {
  const row = btn.closest("[data-id]");
  const input = row.querySelector('[data-role="ordem-input"]');
  const raw = input.value.trim();
  const mural_ordem = raw === "" ? null : Number(raw);

  if (raw !== "" && Number.isNaN(mural_ordem)) {
    alert("Digite um número válido pra ordem.");
    return;
  }

  const { error } = await client.from("aura_hub_submissions").update({ mural_ordem }).eq("id", id);
  if (error) {
    alert(`Erro ao salvar ordem: ${error.message}`);
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

/* ---------- RELATÓRIO ---------- */

async function loadRelatorio() {
  const kpisEl = document.getElementById("r-kpis");
  const plataformaEl = document.getElementById("r-plataforma");
  const briefingEl = document.getElementById("r-briefing");
  const rankingEl = document.getElementById("r-ranking");

  // Reaproveita as submissões já carregadas por loadSubmissoes() em vez de
  // repetir um select * na mesma tabela — reduz carga no banco a cada
  // abertura do painel (projeto está no plano free do Supabase).
  const submissions = ALL_SUBMISSOES || [];

  if (submissions.length === 0) {
    [kpisEl, plataformaEl, briefingEl, rankingEl].forEach((el) => {
      el.innerHTML = '<p class="admin-empty">Nenhuma submissão recebida ainda.</p>';
    });
    return;
  }

  renderRelatorioKpis(kpisEl, submissions);
  renderRelatorioPlataforma(plataformaEl, submissions);
  renderRelatorioBriefing(briefingEl, submissions);
  renderRelatorioRanking(rankingEl, submissions);
}

function renderRelatorioKpis(el, submissions) {
  const total = submissions.length;
  const aprovadas = submissions.filter((s) => s.approved).length;
  const pendentes = total - aprovadas;
  const creatorsUnicas = new Set(submissions.map((s) => (s.coupon_code || s.creator_email || "").toLowerCase()).filter(Boolean)).size;

  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${total}</span><span class="admin-kpi__label">Submissões</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${aprovadas}</span><span class="admin-kpi__label">No mural</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${pendentes}</span><span class="admin-kpi__label">Pendentes</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${creatorsUnicas}</span><span class="admin-kpi__label">Creators únicas</span></div>
  `;
}

function renderRelatorioPlataforma(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = s.content_platform || "não informado";
    counts[key] = (counts[key] || 0) + 1;
  });

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = submissions.length;

  el.innerHTML = rows
    .map(([key, count]) => {
      const label = PLATAFORMA_LABELS[key] || key;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="admin-row admin-row--metric">
          <span>${escapeHtml(label)}</span>
          <span class="admin-row__metric-value">${count} <span class="admin-row__metric-pct">(${pct}%)</span></span>
        </div>
      `;
    })
    .join("");
}

function renderRelatorioBriefing(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = s.briefing_id || "__sem_briefing__";
    counts[key] = (counts[key] || 0) + 1;
  });

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  el.innerHTML = rows
    .map(([key, count]) => {
      const titulo = key === "__sem_briefing__"
        ? "Sem briefing (conteúdo por conta própria)"
        : BRIEFINGS.find((b) => b.id === key)?.titulo || "Briefing removido";
      return `
        <div class="admin-row admin-row--metric">
          <span>${escapeHtml(titulo)}</span>
          <span class="admin-row__metric-value">${count}</span>
        </div>
      `;
    })
    .join("");
}

function renderRelatorioRanking(el, submissions) {
  const counts = {};
  submissions.forEach((s) => {
    const key = (s.coupon_code || "").trim();
    if (!key) return;
    if (!counts[key]) counts[key] = { count: 0, nome: s.creator_name || "" };
    counts[key].count += 1;
  });

  const rows = Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  if (rows.length === 0) {
    el.innerHTML = '<p class="admin-empty">Nenhum cupom identificado ainda.</p>';
    return;
  }

  el.innerHTML = rows
    .map(
      ([cupom, info], index) => `
      <div class="admin-row admin-row--metric">
        <span>${index + 1}. ${escapeHtml(info.nome || "Sem nome")} — <strong>${escapeHtml(cupom)}</strong></span>
        <span class="admin-row__metric-value">${info.count}</span>
      </div>
    `
    )
    .join("");
}

/* ---------- CRUZAMENTO COM VENDAS (upload de CSV, sem persistência) ---------- */

let vendasChart = null;

function parseCsv(text) {
  const firstLine = (text.split(/\r?\n/)[0] || "");
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.length > 1 || (r[0] || "").trim() !== "")
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
      return obj;
    });
}

function parseVendaData(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseVendaValor(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function wireVendasUpload() {
  const btn = document.getElementById("v-csv-process");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const input = document.getElementById("v-csv-input");
    const file = input.files && input.files[0];
    if (!file) {
      feedbackEl("v-csv-feedback", "Escolha um arquivo CSV primeiro.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        processVendasCsv(String(e.target.result));
      } catch (err) {
        feedbackEl("v-csv-feedback", `Erro ao processar CSV: ${err.message}`, "error");
      }
    };
    reader.onerror = () => feedbackEl("v-csv-feedback", "Não consegui ler o arquivo.", "error");
    reader.readAsText(file, "utf-8");
  });
}

function processVendasCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    feedbackEl("v-csv-feedback", "CSV vazio ou em formato não reconhecido.", "error");
    return;
  }

  const colunas = Object.keys(rows[0]);
  const couponCol = colunas.find((k) => k.includes("coupon")) || "coupons";
  const dateCol = colunas.find((k) => k.includes("date_sale")) || "date_sale";
  const valueCol = colunas.find((k) => k.includes("order_value")) || "order_value";

  const cuponsCreators = new Set(
    ALL_SUBMISSOES.map((s) => (s.coupon_code || "").trim().toUpperCase()).filter(Boolean)
  );

  if (cuponsCreators.size === 0) {
    feedbackEl("v-csv-feedback", "Nenhuma submissão com cupom cadastrado ainda pra cruzar.", "error");
    return;
  }

  const vendasPorDia = {};
  const cuponsSemMatch = new Set();
  let vendasCruzadas = 0;
  let valorCruzado = 0;

  rows.forEach((r) => {
    const cupom = (r[couponCol] || "").trim().toUpperCase();
    if (!cupom) return;
    const data = parseVendaData(r[dateCol]);
    if (!data) return;
    const valor = parseVendaValor(r[valueCol]);

    if (!cuponsCreators.has(cupom)) {
      cuponsSemMatch.add(cupom);
      return;
    }

    const key = dateKey(data);
    if (!vendasPorDia[key]) vendasPorDia[key] = { total: 0, count: 0 };
    vendasPorDia[key].total += valor;
    vendasPorDia[key].count += 1;
    vendasCruzadas += 1;
    valorCruzado += valor;
  });

  const postagensPorDia = {};
  ALL_SUBMISSOES.forEach((s) => {
    if (!s.created_at) return;
    const d = new Date(s.created_at);
    if (Number.isNaN(d.getTime())) return;
    const key = dateKey(d);
    postagensPorDia[key] = (postagensPorDia[key] || 0) + 1;
  });

  const todasAsChaves = new Set([...Object.keys(vendasPorDia), ...Object.keys(postagensPorDia)]);
  const dias = Array.from(todasAsChaves).sort();

  if (dias.length === 0) {
    feedbackEl("v-csv-feedback", "Não encontrei vendas de cupons de creators nesse CSV.", "error");
    return;
  }

  const hojeKey = dateKey(new Date());

  renderVendasKpis(vendasCruzadas, valorCruzado, cuponsSemMatch.size);
  renderVendasChart(dias, postagensPorDia, vendasPorDia, hojeKey);
  renderCuponsSemMatch(cuponsSemMatch);

  feedbackEl("v-csv-feedback", `CSV processado: ${rows.length} vendas lidas, ${vendasCruzadas} cruzadas com cupons de creators.`, "success");
}

function renderVendasKpis(vendasCruzadas, valorCruzado, semMatchCount) {
  const el = document.getElementById("v-kpis");
  el.style.display = "grid";
  const valorFormatado = valorCruzado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  el.innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi__valor">${vendasCruzadas}</span><span class="admin-kpi__label">Vendas cruzadas c/ cupom de creator</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${valorFormatado}</span><span class="admin-kpi__label">Valor cruzado</span></div>
    <div class="admin-kpi"><span class="admin-kpi__valor">${semMatchCount}</span><span class="admin-kpi__label">Cupons no CSV sem creator identificado</span></div>
  `;
}

function renderVendasChart(dias, postagensPorDia, vendasPorDia, hojeKey) {
  const canvas = document.getElementById("v-chart");
  canvas.style.display = "block";

  const labels = dias.map((k) => {
    const [, m, d] = k.split("-");
    return `${d}/${m}${k === hojeKey ? " (hoje)" : ""}`;
  });
  const postagensData = dias.map((k) => postagensPorDia[k] || 0);
  const vendasData = dias.map((k) => (vendasPorDia[k] ? vendasPorDia[k].count : 0));

  if (vendasChart) vendasChart.destroy();

  vendasChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Postagens",
          data: postagensData,
          backgroundColor: dias.map((k) => (k === hojeKey ? "#ac8a53" : "rgba(172,138,83,0.45)")),
          yAxisID: "y",
        },
        {
          label: "Vendas (cupons de creators)",
          data: vendasData,
          type: "line",
          borderColor: "#655742",
          backgroundColor: "#655742",
          yAxisID: "y1",
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Postagens" } },
        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Vendas" } },
      },
    },
  });
}

function renderCuponsSemMatch(cuponsSemMatch) {
  const el = document.getElementById("v-sem-match");
  if (!el) return;
  if (cuponsSemMatch.size === 0) {
    el.innerHTML = "";
    return;
  }
  const lista = Array.from(cuponsSemMatch).sort().join(", ");
  el.innerHTML = `<p class="section__microcopy">Cupons no CSV sem submissão correspondente (não cruzados): ${escapeHtml(lista)}</p>`;
}
