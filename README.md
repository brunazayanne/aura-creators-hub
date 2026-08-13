# AURA Creators Content Hub

Hub fixo de captação de conteúdo: briefing da semana por produto, arquivo de briefings anteriores, mural de creators (Instagram) e formulário de envio com autorização de impulsionamento.

Stack: HTML + CSS + JS puro (sem framework/build step) — deploy direto na Vercel.

Especificação completa: `lp-aura-creators-content-hub.docx` (pasta do projeto).

## Estrutura

```
aura-creators-hub/
├── index.html          # estrutura e copy da página
├── styles.css          # direção visual (preto/branco + acento laranja AURA)
├── script.js           # config semanal, validação, payload, mural
├── briefings.json       # CONFIG SEMANAL — editar toda semana (ver abaixo)
└── assets/
    ├── aura-logo-positive.png
    ├── aura-logo-negative.png
    └── briefing-*.pdf   # PDFs dos briefings referenciados em briefings.json
```

## Atualização semanal (sem mexer em código)

Editar `briefings.json`:

1. Mover o `active_briefing` da semana que terminou para dentro de `past_briefings`, com `"accepts_submissions": true` (ou `false`, se o prazo de aceite já encerrou).
2. Preencher o novo `active_briefing` (id, produto, título, pdf_url, datas, até 3 regras-chave).
3. Subir o PDF novo em `assets/`.
4. Commitar e dar push — a Vercel redesploya sozinha.

O dropdown do formulário e a lista de "briefings anteriores" são gerados automaticamente a partir deste arquivo — não editar o HTML pra isso.

## Rodar localmente

```bash
npx serve .
# ou
python3 -m http.server 8080
```

## Dependências técnicas — validar com o dev antes do go-live

1. **`WEBHOOK_URL`** (em `script.js`) — placeholder. Precisa da URL real do fluxo n8n (planilha + webhook) pro payload deste hub — **não é o mesmo endpoint da campanha Sephora**, porque o payload tem campos novos (`briefing_id`, `instagram_handle`, `boost`).
2. **`MURAL_ENDPOINT`** (em `script.js`) — placeholder. Precisa de endpoint real retornando um array `{ nome, instagram_handle, plataforma }` das creators com status de auditoria aprovado.
3. **Processo de aprovação do mural** — a definir com o dev/operação: quem aprova, onde, antes de uma creator aparecer publicamente.
4. **Prazo padrão de `accepts_submissions`** — decisão de operação (7 dias? 15 dias?) que afeta quando um briefing arquivado deixa de aceitar envio.
5. **Formato/validação do adcode** — a confirmar se há tamanho ou prefixo específico a validar no formulário.

## Payload do webhook

```json
{
  "briefing_id": "produto-x-2026-08",
  "submitted_at": "ISO 8601",
  "creator": {
    "name": "",
    "email": "",
    "phone": "",
    "coupon_code": "",
    "instagram_handle": ""
  },
  "content": { "platform": "instagram | tiktok", "url": "" },
  "consent_public_display": true,
  "boost": { "authorized": true, "adcode": "" }
}
```

## Validações do formulário

Campos obrigatórios: nome, e-mail, WhatsApp, código de creator/cupom, Instagram, briefing de referência, plataforma, link do conteúdo, consentimento de exibição pública, autorização de impulsionamento. O adcode só aparece e é obrigatório se a autorização de impulsionamento for "sim". O link é validado contra o domínio da plataforma selecionada.

## Acessibilidade

Skip link, foco visível (outline laranja AURA), `aria-invalid`/`aria-live` nos erros do formulário, `role="status"` na mensagem de sucesso/erro, FAQ com `<details>/<summary>` nativos.

## Deploy (Vercel)

Site estático — sem passos especiais. Ver guia de deploy completo enviado no chat.
