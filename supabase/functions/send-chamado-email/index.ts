// send-chamado-email
// Edge Function acionada pelos Database Webhooks da tabela public.aura_hub_seeding_chamados.
// - INSERT           -> envia cópia da mensagem para a creator (confirmacao.html)
// - UPDATE p/ status = 'respondido' -> envia a resposta do time (respondido.html)
//
// Protegida por verify_jwt=true: o webhook deve enviar Authorization: Bearer <ANON_KEY>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "AURA Creators Club <nao-responda@auracreatorsclub.com.br>";

const confirmacaoTemplate = await Deno.readTextFile(
  new URL("./confirmacao.html", import.meta.url),
);
const respondidoTemplate = await Deno.readTextFile(
  new URL("./respondido.html", import.meta.url),
);

function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(template: string, vars: Record<string, unknown>): string {
  let html = template;
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada nos secrets da função.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend respondeu ${res.status}: ${body}`);
  }
  return body;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { type, table, record, old_record } = payload;

  if (table !== "aura_hub_seeding_chamados" || !record) {
    return new Response(JSON.stringify({ skipped: true, reason: "unexpected payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = String(record.email ?? "");
  const nome = String(record.nome ?? "");
  const cupom = String(record.cupom ?? "");
  const mensagem = String(record.mensagem ?? "");

  if (!email) {
    return new Response(JSON.stringify({ skipped: true, reason: "missing email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (type === "INSERT") {
      const html = render(confirmacaoTemplate, { nome, cupom, mensagem });
      const result = await sendEmail(email, "Recebemos sua mensagem — AURA Creators Club", html);
      return new Response(JSON.stringify({ sent: "confirmacao", result: JSON.parse(result) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (type === "UPDATE") {
      const newStatus = String(record.status ?? "");
      const oldStatus = String(old_record?.status ?? "");
      const justAnswered = newStatus === "respondido" && oldStatus !== "respondido";

      if (!justAnswered) {
        return new Response(JSON.stringify({ skipped: true, reason: "not a new answer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const resposta = String(record.resposta ?? "");
      const html = render(respondidoTemplate, { nome, cupom, mensagem, resposta });
      const result = await sendEmail(email, "Sua dúvida foi respondida — AURA Creators Club", html);
      return new Response(JSON.stringify({ sent: "respondido", result: JSON.parse(result) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ skipped: true, reason: `unhandled type ${type}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
