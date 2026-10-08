/* ============================================
   AURA Creators Club — Vídeo Impulsionado
   Edge Function (Deno / Supabase Functions)

   A cada vídeo enviado com sucesso pelo formulário, anexa uma linha
   na planilha de controle "AURA Creators Club — Vídeo Impulsionado
   (respostas)" no Google Sheets — espelho rápido pra visão geral,
   sem precisar abrir o painel admin.

   Reaproveita a mesma service account e o mesmo segredo
   GOOGLE_SERVICE_ACCOUNT_KEY já configurados pra função
   upload-video-impulsionado (Drive) — só muda o escopo OAuth pedido
   (Sheets em vez de Drive) e o destino da chamada. A planilha já foi
   compartilhada com o e-mail da service account como Editor.

   Coluna G ("Nome do Briefing"): adicionada pra creator conseguir
   identificar cada arquivo quando manda mais de um vídeo na mesma
   categoria — antes esse nome (digitado no modal de metadados) só
   ia pro campos_extra do Supabase, nunca pra planilha.

   Segredo necessário (já existe no projeto — nenhum novo aqui):
   - GOOGLE_SERVICE_ACCOUNT_KEY: JSON da service account do Google Cloud
   ============================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SPREADSHEET_ID = "1GFda0Hrbrc4eAwX4dc-2ZbvS0TCvw9itA8l0HPGlJ-Y";
const APPEND_URL =
  `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/A:G:append` +
  `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const { nome, cupom, categoria, link, nomeVideo } = await req.json();

    if (!nome || !link) {
      return jsonResponse({ error: "Faltam dados: nome e link são obrigatórios." }, 400);
    }

    const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountRaw) {
      return jsonResponse({ error: "Integração com o Sheets ainda não está configurada (falta segredo no servidor)." }, 500);
    }

    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const dataFormatada = formatDataBr(new Date());
    const row = [nome, cupom || "", categoria || "", link, dataFormatada, "Não", nomeVideo || ""];

    const response = await fetch(APPEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("Sheets recusou o append:", response.status, errorText);
      return jsonResponse({ error: `O Sheets recusou o registro (status ${response.status}).` }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("append-video-impulsionado-sheet error:", err);
    return jsonResponse({ error: "Não conseguimos registrar na planilha." }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDataBr(d: Date): string {
  // Horário de Brasília (UTC-3), sem depender de dados de timezone no runtime do Deno edge.
  const brasilia = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const dia = String(brasilia.getUTCDate()).padStart(2, "0");
  const mes = String(brasilia.getUTCMonth() + 1).padStart(2, "0");
  const ano = brasilia.getUTCFullYear();
  const hora = String(brasilia.getUTCHours()).padStart(2, "0");
  const min = String(brasilia.getUTCMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

/* ---------- AUTENTICAÇÃO (JWT assinado -> access_token OAuth2) ----------
   Idêntico ao usado em upload-video-impulsionado, só troca o escopo. */

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
    scope: SHEETS_SCOPE,
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
