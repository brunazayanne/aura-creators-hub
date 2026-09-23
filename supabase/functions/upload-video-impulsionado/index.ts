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

   Segredos necessários (configurados no Supabase — nunca neste código):
   - GOOGLE_SERVICE_ACCOUNT_KEY: JSON da service account do Google Cloud
   - DRIVE_ROOT_FOLDER_ID: ID da pasta raiz no Drive da AURA, compartilhada
     com o e-mail da service account (papel: Editor)
   ============================================ */

import { corsHeaders } from "./cors.ts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_UPLOAD_HOST = "www.googleapis.com";

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

    return jsonResponse({ uploadUrl, folderId });
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

/* ---------- RELAY DE PEDAÇO (chunk) PRO DRIVE ----------
   O navegador manda cada pedaço do vídeo pra cá (mesma origem, sem CORS
   pra Google no meio) via PUT em .../upload-video-impulsionado/chunk,
   com os headers:
   - X-Drive-Upload-Url: a sessão resumível devolvida na etapa de init
   - Content-Range: bytes <inicio>-<fim>/<total>
   A gente repassa o corpo bruto pro Drive com um access token novo
   (evita token expirado em upload longo) e devolve pro navegador se
   ainda falta pedaço (308) ou se terminou (arquivo criado). */
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
  // (pedimos fields=id,webViewLink na etapa de init).
  if (driveResponse.ok) {
    const data = await driveResponse.json().catch(() => ({}));
    return jsonResponse({ status: driveResponse.status, file: data });
  }

  const errorText = await driveResponse.text().catch(() => "");
  console.error("Drive recusou o chunk:", driveResponse.status, errorText);
  return jsonResponse(
    { error: `O Drive recusou esse pedaço do arquivo (status ${driveResponse.status}).` },
    502,
  );
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
