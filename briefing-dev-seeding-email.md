# Nome da entrega
Envio automático de e-mail no fluxo de "Ajuda com seeding"

# Módulo
M3 — Comunicação e jornada (jornada operacional, seção 13.7)

# Contexto
O novo formulário `/seeding.html` grava o chamado direto na tabela `aura_hub_seeding_chamados` (Supabase, projeto `vjpspclcruvcesuifuva`) via REST + anon key, igual ao padrão já usado em `script.js` para submissões. Não existe hoje nenhuma Edge Function, trigger de banco, ou webhook conectado a esse projeto Supabase (confirmado: `list_edge_functions` retorna zero funções). O formulário e a aba de chamados no admin (`/admin.html`) já estão prontos e no ar no preview. Falta só a parte de e-mail.

# Objetivo
A creator preenche o formulário e recebe uma cópia do que escreveu por e-mail. Quando o time responde o chamado pelo admin, a creator recebe a resposta por e-mail também.

# O que já funciona (sem dependência de dev)
- Grava o chamado (nome, CPF, cupom, e-mail, mensagem) na tabela.
- Aba "Chamados de seeding" no admin lista os chamados, com filtro por status.
- Time escreve a resposta e marca como "respondido" — isso já atualiza `status`, `resposta` e `responded_at` na tabela.

# O que falta (dependência técnica)
Dois disparos de e-mail que hoje não acontecem:
1. Cópia automática pra creator no momento em que ela envia o formulário.
2. E-mail pra creator quando o time salva a resposta no admin.

Isso não dá pra fazer só com REST + anon key (não tem serviço de envio de e-mail plugado no projeto). Precisa de uma das duas rotas:
- **Supabase Edge Function** disparada por `Database Webhook` (INSERT em `aura_hub_seeding_chamados` → dispara envio da cópia; UPDATE quando `status` vira `respondido` → dispara envio da resposta), usando um provedor de envio (Resend, Postmark, etc.).
- Ou reaproveitar o sistema externo que já envia os e-mails transacionais da Aura (ex.: `email-seeding-enviado.html`, citado em templates existentes) — mas não está confirmado que esse sistema está conectado a este projeto Supabase especificamente; pode ser um fluxo totalmente separado.

# Próximo passo
Preciso que a Bruna decida: (a) qual provedor de e-mail usar (se não tiver um já contratado, Resend é o mais simples de plugar numa Edge Function do Supabase) e (b) qual remetente/domínio deve aparecer pra creator. Com isso definido, eu implemento a Edge Function e os dois disparos.

# Fora de escopo por enquanto
Templates de e-mail com identidade visual completa (isso é rápido de fazer depois, mas não bloqueia a decisão técnica acima).
