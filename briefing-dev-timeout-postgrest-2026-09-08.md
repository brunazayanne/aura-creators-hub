# Briefing pro dev — timeout recorrente no formulário (Creators Hub)

**Data:** 08/09/2026
**Projeto Supabase:** vjpspclcruvcesuifuva
**Recorrência:** este é o 2º registro do mesmo sintoma em 4 dias (1º registro: 04/09/2026).

## O que confirmamos hoje

- **Timeouts continuam.** 63 ocorrências de `Warp server error: Thread killed by timeout manager` no Postgrest entre 07/09 08:37 e 08/09 02:11 — distribuídas ao longo do período, não é pico isolado.
- **Não é a tabela nem a query.** Investigamos `aura_hub_submissions` a fundo:
  - Nenhum trigger na tabela.
  - RLS simples: insert anônimo com `with_check: true` (sem subquery, sem verificação de duplicidade no banco), select/update só para autenticado.
  - Único índice é a PK. Tabela tem 89 linhas no total — volume insignificante para causar lentidão de query.
  - Nenhum advisor de performance ou segurança relacionado a essa tabela (só um índice de FK faltando em `aura_hub_produtos`, sem relação).
- **Volume de envios caiu de novo:** 1 envio nas últimas 24h vs 6 no período anterior (total histórico: 89, subiu só 1 desde a checagem de 04/09). Consistente com creators tentando enviar e caindo no timeout.
- **A mitigação aplicada em 04/09** (reduzir queries duplicadas no painel admin) não resolveu — o sintoma é o mesmo 4 dias depois, o que indica que a causa não está no volume de queries do admin, e sim em outro lugar.

## Causa mais provável

Com trigger, RLS e índice descartados como causa, o padrão (timeouts constantes e distribuídos, tabela pequena, insert simples) aponta para **limite de recursos do plano Supabase gratuito** (compute/connection pool compartilhado), não para uma query específica mal escrita. Isso é uma decisão de infraestrutura/custo, não um bug de código — meu histórico de checagem indica que o projeto está no plano free desde a análise de 04/09.

## Próximo passo sugerido pro dev

1. Confirmar via Supabase (Settings → Compute/Add-ons) se o projeto segue no plano free e qual o limite de conexões/timeout do Postgrest configurado.
2. Se confirmado, a correção estrutural é upgrade de plano (Pro ou compute add-on) — isso é decisão de custo, precisa ser validada com a Bruna antes de qualquer ação.
3. Se não for plano, próximo lugar a olhar: configuração de `db-pool-size` / `max_rows` do Postgrest, ou algum outro endpoint compartilhando o mesmo pool de conexão sob carga simultânea (mesmo que não relacionado ao Hub).

## Fora de escopo desta checagem

Nenhuma alteração de código, schema ou infraestrutura foi feita nesta investigação — só leitura de logs, RLS, triggers e índices.
