# Briefing pro dev — AURA Creators Hub (monitoramento 08/09/2026)

## Módulo
N/A (infraestrutura do Hub de conteúdos, não é M2 nem M3)

## Contexto
Monitoramento automático do formulário público do AURA Creators Hub (hub-conteudos.auracreatorsclub.com.br), projeto Supabase `vjpspclcruvcesuifuva`, rodado em 08/09/2026 após relatos de creators com erro ao enviar conteúdo.

## Objetivo
Repassar ao dev os achados técnicos da checagem das últimas 24h para investigação.

## Dados observados

- Postgrest (banco): ~50 ocorrências de `Warp server error: Thread killed by timeout manager` no log `postgrest_logs` nas últimas 24h, espalhadas ao longo do dia (não concentradas num horário só) — média de mais de 2 por hora.
- Storage (`briefings-pdf`, `mural-thumbs`): nenhum erro encontrado; só GETs 200/304 normais.
- Edge (submissions/storage): nenhum status >= 400 encontrado nas últimas entradas revisadas; um POST em `/rest/v1/aura_hub_submissions` retornou 201 (sucesso) às 11:53.
- Tabela `aura_hub_submissions`: 90 registros no total, 2 nas últimas 24h vs. 6 nas 24h anteriores. Volume baixo em ambos os períodos — queda não é conclusiva sozinha, mas vale acompanhar.
- Supabase Advisors:
  - SECURITY (ERROR): view `public.aura_hub_mural` está definida com `SECURITY DEFINER` → https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
  - SECURITY (WARN): proteção contra senha vazada (HaveIBeenPwned) desativada no Auth → https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
  - PERFORMANCE (INFO): FK `aura_hub_produtos_categoria_id_fkey` sem índice de cobertura → https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Causa provável
As mensagens repetidas de "Thread killed by timeout manager" indicam que o Postgrest está matando conexões que excedem o tempo limite de query configurado. Isso é o **3º registro do mesmo sintoma em 4 dias** (04/09 e 08/09, duas checagens). Já descartamos trigger, RLS e índice como causa na investigação anterior (tabela `aura_hub_submissions` é pequena, insert simples, sem trigger). O padrão recorrente aponta pra limite de recursos do **plano Supabase gratuito** (compute/connection pool compartilhado) — não uma query específica mal escrita.

## Próximo passo sugerido
- Confirmar com a Bruna se aprova o upgrade pro plano Pro (US$25/mês, ~R$128/mês) — é o próximo passo mais direto pra eliminar essa causa. Custo já foi levantado e está com ela pra decisão.
- Se não for aprovado agora, seguir monitorando via `pg_stat_activity` pra flagrar queries específicas no momento do timeout.
- Validar se a `SECURITY DEFINER` na view `aura_hub_mural` é intencional; se não for, corrigir.
- Avaliar ativar a proteção de senha vazada no Auth (mudança de config, baixo risco, pode ser feita a qualquer momento).

## Dependências técnicas
- Acesso ao Postgrest/Supabase para investigar timeout config e queries lentas.
- Decisão de negócio (custo) pra upgrade de plano.

## Fora de escopo deste briefing
Correção de código, mudança de infraestrutura, ou qualquer alteração — isso é só relatório de incidente para investigação do dev.
