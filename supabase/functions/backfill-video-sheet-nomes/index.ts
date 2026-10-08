/* ============================================
   Backfill pontual — roda uma vez só

   Preenche a coluna G (Nome do vídeo) de 3 linhas já existentes na
   planilha de Vídeo Impulsionado, pros envios da Maria Eduarda Martins
   de 07/10/2026, que têm nome_video salvo no Supabase mas foram
   enviados antes dessa coluna existir na planilha.

   Reaproveita o mesmo GOOGLE_SERVICE_ACCOUNT_KEY das outras functions
   de Sheets/Drive. Pode ser apagada depois de usada.
   ============================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SPREADSHEET_ID = "1GFda0Hrbrc4eAwX4dc-2ZbvS0TCvw9itA8l0HPGlJ-Y";
const BATCH_UPDATE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`;

// Linhas identificadas manualmente cruzando o Supabase (campos_extra.nome_video)
// com a posição de cada link na planilha.
const UPDATES = [
  { range: "G7", value: "copy_4D3D0381-C85C-4C52-A0E0-4846B9FBFCD2" },
  { range: "G8", value: "copy_44889CB6-C837-410A-A0A0-18D3BEFFE0BF" },
  { range: "G9", value: "copy_6B98CB09-6D06-4E26-9D39-5483F8DBFFF0" },
];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceAccountRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountRaw) {
      return jsonResponse({ error: "Falta GOOGLE_SERVICE_ACCOUNT_KEY." }, 500);
    }

    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountRaw);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const body = {
      valueInputOption: "USER_ENTERED",
      data: UPDATES.map((u) => ({ range: u.range, values: [[u.value]] })),
    };

    const response = await fetch(BATCH_UPDATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return jsonResponse({ error: `Sheets recusou (status ${response.status}): ${errorText}` }, 502);
    }

    const data = await response.json();
    return jsonResponse({ ok: true, result: data });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
