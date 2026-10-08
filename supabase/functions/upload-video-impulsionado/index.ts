/* ============================================
   AURA Creators Club — Upload de Vídeo Impulsionado
   Edge Function (Deno / Supabase Functions)

   O que essa função faz:
   1. Autentica no Google com uma service account (sem OAuth por creator).
   2. Busca (ou cria) uma subpasta no Drive com o nome da categoria de
      produto escolhida pela creator, dentro da pasta raiz da AURA.
   3. Abre uma sessão de upload resumível no Google Drive.
   4. Repassa (relay) os pedaços do vídeo pro Drive em /upload-video-impulsionado/chunk —
      o navegador NÃO manda bytes direto pro Google porque a etapa de PUT
      do upload resumível do Drive não devolve cabeçalho CORS nenhum (só a
      etapa de abrir a sessão devolve). Então o vídeo passa por aqui, mas em
      pedaços pequenos (streaming, não em memória inteira), então não bate
      no limite de payload/tempo da function mesmo pra arquivo grande.
   5. Assim que o Drive confirma o upload de um arquivo, o PRÓPRIO SERVIDOR
      grava a submissão em aura_hub_submissions e registra a linha na
      planilha de controle — o navegador nunca recebe de volta o link real
      do arquivo nem o ID da pasta no Drive.

   Por que o passo 5 mudou (segurança):
   A pasta raiz da categoria no Drive está compartilhada como "qualquer
   pessoa com o link pode ver". Antes, essa função devolvia o webViewLink
   (e o folderId) direto pro navegador da creator — qualquer pessoa com um
   mínimo de curiosidade técnica (DevTools → aba Network, durante o próprio
   envio legítimo) conseguia copiar esse link e, como a pasta é por
   categoria (não por creator), enxergar o vídeo de todas as outras
   creators daquela categoria. Agora o link nunca sai do servidor.

   Segredos necessários (configurados no Supabase — nunca neste código):
   - GOOGLE_SERVICE_ACCOUNT_KEY: JSON da service account do Google Cloud
   - DRIVE_ROOT_FOLDER_ID: ID da pasta raiz no Drive da AURA, compartilhada
     com o e-mail da service account (papel: Editor)
   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: injetadas automaticamente
     pelo Supabase em toda Edge Function, não precisam ser cadastradas.
   ============================================ */

import { corsHeaders } from "./cors.ts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_UPLOAD_HOST = "www.googleapis.com";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — mesmo limite do front
const SHEET_LOG_URL = "https://vjpspclcruvcesuifuva.supabase.co/functions/v1/append-video-impulsionado-sheet";
// Chave "publishable" — feita pra ser pública, exigida pelo gateway dessa
// outra função. Mesma chave que já era usada (antes, pelo navegador).
const SHEET_LOG_API_KEY = "sb_publishable_ITub6GFEc4apnU7x8xq4CQ_nOtr2Eos";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (url.pathname.endsWith("/chunk")) {
    return handleChunkRelay(req);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const { categoria, fileName, fileSize, mimeType } = await req.json();

    if (!categoria || !fileName || !fileSize || !mimeType) {
      return jsonResponse(
        { error: "Faltam dados: categoria, fileName, fileSize e mimeType são obrigatórios." },
        400,
      );
    }

    if (typeof mimeType !== "string" || !mimeType.startsWith("video/")) {
      return jsonResponse({ error: "Tipo de arquivo não permitido — só vídeo." }, 400);
    }

    if (typeof fileSize !== "number" || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({ error: "Tamanho de arquivo inválido ou acima do limite de 2GB." }, 400);
    }

    const categoriaOk = await isCategoriaValida(categoria);
    if (!categoriaOk) {
      return jsonResponse({ error: "Categoria inválida." }, 400);
    }

    const clientIp = getClientIp(req);
    const dentroDoLimite = await checkEdgeRateLimit(clientIp, "upload-video-impulsionado-init", 5, 60);
    if (!dentroDoLimite) {
      return jsonResponse(
        { error: "Muitos envios em pouco tempo. Aguarde um pouco e tente novamente." },
        429,
      );
    }

    const rootFolderId = Deno.env.get("DRIVE_ROOT_FOLDER_ID");
    const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (!rootFolderId || !serviceAccountRaw) {
      return jsonResponse(
        { error: "Integração com o Drive ainda não está configurada (faltam segredos no servidor)." },
        500,
      );
    }

    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const folderId = await findOrCreateCategoriaFolder(accessToken, rootFolderId, categoria);

    const uploadUrl = await initiateResumableUpload(accessToken, {
      fileName,
      fileSize,
      mimeType,
      parentFolderId: folderId,
    });

    // Não devolve folderId pro cliente — ele não usa isso, e esse ID dá
    // acesso de leitura a todos os vídeos da pasta da categoria inteira
    // (que hoje está compartilhada como "qualquer um com o link").
    return jsonResponse({ uploadUrl });
  } catch (err) {
    console.error("upload-video-impulsionado error:", err);
    return jsonResponse({ error: "Não conseguimos preparar o upload. Tenta de novo em instantes." }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ---------- RATE LIMIT (por IP, só na etapa de início do upload) ----------
   Reaproveita a mesma tabela private.rate_limits usada pelo rate limit da
   Data API (submissões/chamados), via uma function RPC separada que só o
   service_role pode chamar. Limita só o POST inicial (que é quem dispara
   chamadas ao Drive) — os PUTs de /chunk de um upload já em andamento não
   são limitados, senão um arquivo grande (muitos pedaços) se auto-travaria. */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

async function checkEdgeRateLimit(
  ip: string,
  endpoint: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return true; // falta de config não deve travar o fluxo

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_edge_rate_limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_ip: ip,
        p_endpoint: endpoint,
        p_limit: limit,
        p_window_minutes: windowMinutes,
      }),
    });

    if (!res.ok) return true; // falha na checagem não deve bloquear envio legítimo
    return (await res.json()) === true;
  } catch {
    return true;
  }
}

/* ---------- VALIDA A CATEGORIA CONTRA A LISTA OFICIAL (Supabase) ---------- */

async function isCategoriaValida(categoria: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return true; // falta de config não deve travar o fluxo

    const res = await fetch(
      `${supabaseUrl}/rest/v1/aura_hub_categorias?select=nome&ativo=eq.true&nome=eq.${encodeURIComponent(categoria)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return true;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return true;
  }
}

/* ---------- RELAY DE PEDAÇO (chunk) PRO DRIVE ----------
   O navegador manda cada pedaço do vídeo pra cá (mesma origem, sem CORS
   pra Google no meio) via PUT em .../upload-video-impulsionado/chunk,
   com os headers:
   - X-Drive-Upload-Url: a sessão resumível devolvida na etapa de init
   - Content-Range: bytes <inicio>-<fim>/<total>
   - X-Creator-Nome / X-Creator-Cupom / X-Categoria / X-Nome-Video /
     X-Campos-Extra: dados da creator e do vídeo (vêm URL-encoded),
     usados só quando o upload termina, pra registrar a submissão.
   A gente repassa o corpo bruto pro Drive com um access token novo
   (evita token expirado em upload longo) e devolve pro navegador se
   ainda falta pedaço (308) ou se terminou (ok). */
async function handleChunkRelay(req: Request): Promise<Response> {
  if (req.method !== "PUT") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const driveUploadUrl = req.headers.get("x-drive-upload-url");
  const contentRange = req.headers.get("content-range");

  if (!driveUploadUrl) {
    return jsonResponse({ error: "Faltou o cabeçalho X-Drive-Upload-Url." }, 400);
  }

  let parsedUploadUrl: URL;
  try {
    parsedUploadUrl = new URL(driveUploadUrl);
  } catch {
    return jsonResponse({ error: "URL de upload inválida." }, 400);
  }
  // Nunca repassa bytes pra um destino que não seja o próprio Google —
  // fecha a porta pra essa rota virar um proxy aberto.
  if (parsedUploadUrl.hostname !== DRIVE_UPLOAD_HOST) {
    return jsonResponse({ error: "URL de upload não permitida." }, 400);
  }

  const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!serviceAccountRaw) {
    return jsonResponse(
      { error: "Integração com o Drive ainda não está configurada (faltam segredos no servidor)." },
      500,
    );
  }

  let accessToken: string;
  try {
    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountRaw);
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    console.error("Falha ao autenticar pro relay de chunk:", err);
    return jsonResponse({ error: "Não conseguimos autenticar com o Drive." }, 500);
  }

  const chunk = new Uint8Array(await req.arrayBuffer());

  const driveHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Length": String(chunk.byteLength),
  };
  if (contentRange) driveHeaders["Content-Range"] = contentRange;

  let driveResponse: Response;
  try {
    driveResponse = await fetch(driveUploadUrl, {
      method: "PUT",
      headers: driveHeaders,
      body: chunk,
    });
  } catch (err) {
    console.error("Falha de rede repassando chunk pro Drive:", err);
    return jsonResponse({ error: "Falha de rede ao enviar esse pedaço do vídeo pro Drive." }, 502);
  }

  // 308 = Drive recebeu esse pedaço, mas ainda faltam mais.
  if (driveResponse.status === 308) {
    const range = driveResponse.headers.get("range");
    return jsonResponse({ status: 308, range });
  }

  // 200/201 = upload concluído, Drive devolve o recurso do arquivo
  // (pedimos fields=id,webViewLink na etapa de init) — mas isso fica só
  // no servidor a partir daqui, nunca volta pro navegador.
  if (driveResponse.ok) {
    const fileData = await driveResponse.json().catch(() => ({}));
    const meta = readCreatorMeta(req);

    try {
      await registrarSubmissao(meta, fileData);
    } catch (err) {
      console.error("Falha ao registrar submissão no Supabase:", err);
      return jsonResponse(
        { error: "O vídeo foi salvo no Drive, mas não conseguimos registrar o envio. Avisa a gente." },
        502,
      );
    }

    // Espelho na planilha de controle — não crítico, falha aqui não deve
    // travar a confirmação pra creator (o registro oficial já está feito).
    registrarNaPlanilha(meta, fileData).catch((err) =>
      console.error("Falha ao registrar na planilha (não bloqueante):", err),
    );

    return jsonResponse({ status: driveResponse.status, ok: true });
  }

  const errorText = await driveResponse.text().catch(() => "");
  console.error("Drive recusou o chunk:", driveResponse.status, errorText);
  return jsonResponse(
    { error: `O Drive recusou esse pedaço do arquivo (status ${driveResponse.status}).` },
    502,
  );
}

interface CreatorMeta {
  nome: string;
  cupom: string;
  categoria: string;
  nomeVideo: string;
  camposExtra: Record<string, unknown>;
}

function readCreatorMeta(req: Request): CreatorMeta {
  const decode = (headerName: string) => {
    const raw = req.headers.get(headerName);
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  let camposExtra: Record<string, unknown> = {};
  try {
    const raw = decode("x-campos-extra");
    camposExtra = raw ? JSON.parse(raw) : {};
  } catch {
    camposExtra = {};
  }

  return {
    nome: decode("x-creator-nome"),
    cupom: decode("x-creator-cupom"),
    categoria: decode("x-categoria"),
    nomeVideo: decode("x-nome-video"),
    camposExtra,
  };
}

/* ---------- REGISTRO DA SUBMISSÃO (Supabase, com a service role) ----------
   Roda do lado do servidor, não do navegador — além de nunca expor o link
   real do Drive pro cliente, também fecha por completo a superfície de
   "mass assignment" nesse formulário: a creator não insere mais direto na
   tabela, então não tem como ela mandar um payload forjado. */
async function registrarSubmissao(
  meta: CreatorMeta,
  fileData: { id?: string; webViewLink?: string },
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados nesta function.");
  }

  const contentUrl =
    fileData.webViewLink || (fileData.id ? `https://drive.google.com/file/d/${fileData.id}/view` : null);

  const payload = {
    briefing_id: null,
    seguiu_briefing: false,
    categoria_produto: meta.categoria || null,
    produto_nome: null,
    submitted_at: new Date().toISOString(),
    creator_name: meta.nome,
    // creator_email / creator_phone / instagram_handle são colunas NOT NULL
    // na aura_hub_submissions, mas esse formulário não pede mais esses
    // dados — manda string vazia pra não quebrar o insert.
    creator_email: "",
    creator_phone: "",
    coupon_code: meta.cupom,
    instagram_handle: "",
    content_platform: "video_impulsionado_drive",
    content_url: contentUrl,
    consent_public_display: false,
    // boost_authorized sempre volta false aqui — o trigger
    // aura_hub_submissions_lock_admin_cols (BEFORE INSERT) reseta essa
    // coluna em todo INSERT, inclusive via service_role. Quem autoriza o
    // impulsionamento é o admin depois, via UPDATE no painel.
    boost_authorized: false,
    boost_adcode: null,
    campos_extra: { ...meta.camposExtra, nome_video: meta.nomeVideo },
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/aura_hub_submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase respondeu ${res.status}: ${text}`);
  }
}

async function registrarNaPlanilha(
  meta: CreatorMeta,
  fileData: { id?: string; webViewLink?: string },
): Promise<void> {
  const contentUrl =
    fileData.webViewLink || (fileData.id ? `https://drive.google.com/file/d/${fileData.id}/view` : null);

  const res = await fetch(SHEET_LOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SHEET_LOG_API_KEY,
      Authorization: `Bearer ${SHEET_LOG_API_KEY}`,
    },
    body: JSON.stringify({
      nome: meta.nome,
      cupom: meta.cupom,
      categoria: meta.categoria,
      link: contentUrl,
      nomeVideo: meta.nomeVideo,
    }),
  });

  if (!res.ok) {
    console.error(
      "append-video-impulsionado-sheet respondeu com erro:",
      res.status,
      await res.text().catch(() => ""),
    );
  }
}

/* ---------- AUTENTICAÇÃO (JWT assinado -> access_token OAuth2) ---------- */

async function getGoogleAccessToken(account: ServiceAccountKey): Promise<string> {
  const jwt = await buildSignedJwt(account);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao autenticar com o Google (status ${response.status}).`);
  }

  const data = await response.json();
  return data.access_token as string;
}

async function buildSignedJwt(account: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const key = await importPrivateKey(account.private_key);
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${encodedSignature}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- PASTA POR CATEGORIA (busca ou cria) ---------- */

async function findOrCreateCategoriaFolder(
  accessToken: string,
  rootFolderId: string,
  categoria: string,
): Promise<string> {
  const safeName = categoria.replace(/'/g, "\\'");
  const query =
    `'${rootFolderId}' in parents and name = '${safeName}' and ` +
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const searchUrl =
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchResponse.ok) {
    throw new Error(`Falha ao buscar pasta da categoria (status ${searchResponse.status}).`);
  }

  const searchData = await searchResponse.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createResponse = await fetch(`${DRIVE_FILES_URL}?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: categoria,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Falha ao criar pasta da categoria (status ${createResponse.status}).`);
  }

  const createData = await createResponse.json();
  return createData.id;
}

/* ---------- SESSÃO DE UPLOAD RESUMÍVEL ---------- */

async function initiateResumableUpload(
  accessToken: string,
  params: { fileName: string; fileSize: number; mimeType: string; parentFolderId: string },
): Promise<string> {
  const initUrl = `${DRIVE_UPLOAD_URL}?uploadType=resumable&fields=id,webViewLink&supportsAllDrives=true`;

  const response = await fetch(initUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": params.mimeType,
      "X-Upload-Content-Length": String(params.fileSize),
    },
    body: JSON.stringify({
      name: params.fileName,
      parents: [params.parentFolderId],
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao iniciar upload no Drive (status ${response.status}).`);
  }

  const uploadUrl = response.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("O Drive não retornou a URL de upload.");
  }

  return uploadUrl;
}
