# Guia de deploy — AURA Creators Content Hub

Passo a passo pra publicar o hub. O código já está pronto e commitado localmente (`git log` já tem o commit inicial). Falta: subir pro GitHub, conectar na Vercel, apontar o domínio e plugar os endpoints reais.

---

## 1. Criar o repositório no GitHub

1. Acesse [github.com/new](https://github.com/new).
2. Nome sugerido: `aura-creators-hub` (mesmo padrão do `aura-creators-sephora`).
3. Visibilidade: **Private** (o repo tem lógica de negócio e, futuramente, pode ter chaves de config — mantenha privado por padrão).
4. **Não** marque "Add a README" nem `.gitignore` — o projeto já tem os dois.
5. Clique em "Create repository".

Você verá uma tela com comandos. Use os de **"push an existing repository from the command line"**, algo como:

```bash
cd caminho/para/aura-creators-hub
git remote add origin https://github.com/SEU-USUARIO/aura-creators-hub.git
git branch -M main
git push -u origin main
```

Rode isso no terminal do seu computador (Terminal no Mac), dentro da pasta `aura-creators-hub` que está no seu projeto AURA Creators Club | UX & Design. O commit inicial já existe — esse push só vai enviar o que já foi commitado.

Se pedir autenticação, o GitHub vai pedir login via navegador ou token — siga o fluxo que ele mostrar.

---

## 2. Conectar na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) (crie conta com o mesmo GitHub, se ainda não tiver).
2. Import Git Repository → selecione `aura-creators-hub`.
3. Framework Preset: deixe como **Other** (é HTML/CSS/JS puro, sem build step).
4. Build Command: deixe em branco.
5. Output Directory: deixe em branco (raiz do projeto).
6. Clique em **Deploy**.

Em ~30 segundos você tem uma URL tipo `aura-creators-hub.vercel.app` já no ar. É um bom momento pra abrir essa URL e conferir visualmente antes de seguir.

---

## 3. Apontar o domínio

Se você quiser um domínio próprio (ex: `creators.aurabeautyclub.com.br` ou similar):

1. No projeto na Vercel → **Settings → Domains**.
2. Adicione o domínio desejado.
3. A Vercel vai te dar um registro DNS (CNAME ou A) pra criar no seu provedor de domínio (Registro.br, GoDaddy, Cloudflare, etc.).
4. Propagação costuma levar de minutos a poucas horas.

Se ainda não tiver decidido o domínio final, pule essa etapa — o link `.vercel.app` já funciona pra testar e até pra uso interno enquanto isso se resolve.

---

## 4. Plugar os endpoints reais (bloqueio principal pra ir ao ar de verdade)

O hub está publicável, mas **os dois endpoints abaixo ainda são placeholders** em `script.js` (linhas 12–13):

```js
const WEBHOOK_URL = "https://SUBSTITUIR-PELO-WEBHOOK-REAL.example.com/aura-hub-submit";
const MURAL_ENDPOINT = "https://SUBSTITUIR-PELO-MURAL-REAL.example.com/aura-hub-mural";
```

Enquanto estiverem assim: o formulário mostra erro genérico ("Algo não saiu como esperado...") pra qualquer envio, e o mural sempre cai no estado vazio ("Em breve, as creators aparecem aqui."). O resto do site funciona normalmente.

**O que fazer:**

1. Alinhar com o Dani (dev) a criação de dois fluxos n8n, nos moldes do que já existe pro `aura-creators-sephora` — mas com os payloads novos (ver README.md do hub, seção "Payload do webhook").
2. `WEBHOOK_URL`: endpoint que recebe o POST do formulário e grava numa planilha/base (log de envios).
3. `MURAL_ENDPOINT`: endpoint que devolve um array `{ nome, instagram_handle, plataforma }` das creators aprovadas — precisa que exista um processo de aprovação antes (quem aprova, onde — isso ainda está em aberto, ver README.md).
4. Depois de ter as URLs reais, edite `script.js` (linhas 12–13), commit e push:

```bash
git add script.js
git commit -m "chore: plugar endpoints reais de webhook e mural"
git push
```

A Vercel redesploya sozinha a cada push na branch `main` — não precisa reconfigurar nada.

---

## 5. Atualização semanal (rotina, não é deploy)

Depois que o site estiver no ar, atualizar o briefing da semana **não passa por esse guia** — é só editar `briefings.json` (ver instruções no README.md do projeto), subir os PDFs novos em `assets/`, e dar `git push`. A Vercel redesploya sozinha.

---

## 6. Checklist antes de anunciar o link pras creators

- [ ] Repositório no ar na Vercel, URL testada no celular (o hub é mobile-first).
- [ ] `WEBHOOK_URL` real plugado e testado (enviar um formulário de teste e conferir se caiu na planilha).
- [ ] `MURAL_ENDPOINT` real plugado (ou, na pior hipótese, decisão consciente de lançar com mural vazio por enquanto — o site não quebra, só mostra o estado vazio).
- [ ] `briefings.json` preenchido com o briefing real da semana (o que está lá agora é um exemplo/placeholder).
- [ ] PDFs reais dos briefings subidos em `assets/`, substituindo os `briefing-exemplo.pdf`.
- [ ] Domínio final decidido (ou aceite consciente de usar o `.vercel.app` por enquanto).
- [ ] Processo de aprovação do mural combinado com operação (quem aprova uma creator antes dela aparecer publicamente).

---

## Dependências técnicas — responsabilidade do dev

Resumo do que já está documentado no README.md e no handoff (`lp-aura-creators-content-hub.docx`), reforçado aqui porque são os itens que bloqueiam o go-live real:

1. Fluxo n8n do webhook do formulário (novo payload, não é o mesmo da campanha Sephora).
2. Fluxo n8n do mural (endpoint novo).
3. Processo/tela de aprovação de creator pro mural.
4. Decisão de prazo padrão de `accepts_submissions` nos briefings arquivados.
5. Confirmar se há validação de formato/tamanho específico pro adcode.

Nenhum desses bloqueia o deploy em si (passos 1–3 deste guia) — só bloqueiam o hub funcionar de ponta a ponta com dados reais.
