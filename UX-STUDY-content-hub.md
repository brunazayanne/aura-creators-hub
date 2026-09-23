# Estudo de UX — AURA Creators Content Hub

**Módulo:** M2 (Experiência e design) — item de apoio, não bloqueia a entrega P0 de 11/09.
**Status:** diagnóstico + proposta. Nenhum arquivo do hub foi alterado ainda.

---

## 1. Diagnóstico

### 1.1 Identidade visual — desalinhada da marca

O hub hoje usa uma paleta preto/branco + laranja (`--preto #000000`, `--branco #ffffff`, `--laranja-aura #bf4611`) com Playfair Display + Inter. Essa é a linguagem da campanha AURA × Sephora (Jade Picon) — voltada a conversão comercial agressiva, editorial, fria.

A identidade real da AURA, extraída de `aura-lp/styles.css` (LP oficial de aquisição de creators), é outra:

| Token | Campanha (hub hoje) | AURA oficial (aura-lp) |
|---|---|---|
| Cor principal | Preto `#000000` | Gold `#ac8a53` |
| Texto | Preto/cinza `#5f5e5a` | Brown `#655742` |
| Fundo | Branco puro | Cream `#eee5da`, Offwhite `#f4f0eb`, Tan `#e6dac7` |
| Tipografia | Playfair Display + Inter | Sora (única família, mais leve e contemporânea) |
| Cantos | `radius: 8px` | `radius: 20px` (mais orgânico, sensorial) |
| Decoração | Nenhuma | Mandala e brilhos (SVG), presentes no hero e em transições de seção |
| Tom de componente | Cards retos, bordas duras | Cards com sombra suave `rgba(101,87,66,0.06)`, sem borda dura |

Resultado: hoje o hub parece uma ferramenta operacional de terceiros, não um espaço da AURA. Isso contraria o princípio 20 do projeto ("identidade sem infantilização, mas reconhecível como AURA") e o próprio objetivo do módulo M2 ("dar cara de AURA ao produto").

### 1.2 UX — a página resolve "enviar formulário", não "ser um hub"

Pedido do usuário: o hub precisa ser um ponto de contato onde a creator **acessa, se inspira e tem seu conteúdo visto** — não um protocolo de envio. Comparando a arquitetura atual contra esse objetivo:

- **Hierarquia invertida.** O hero manda direto para `#formulario` ("Enviar meu conteúdo") antes mesmo da creator entender o que existe pra ver. A primeira ação oferecida é a mais fria (preencher campo), não a mais convidativa (ver o briefing, ver quem já apareceu).
- **Mural de creators é tratado como rodapé social, não como vitrine.** É a peça que mais entrega "ser vista" — está posicionada depois do arquivo de briefings e antes do formulário, sem destaque, sem contagem, sem variedade de mídia (hoje é só nome + @, sem prints/thumbnails do conteúdo enviado).
- **Nenhum reconhecimento de estado individual.** A home não sabe se é a primeira visita da creator, se ela já enviou algo essa semana, se o conteúdo dela foi aprovado/impulsionado. Toda visita vê a mesma página estática — o mesmo problema que o M2 já resolveu para a home do app (seção 6/7 das instruções do projeto) não foi replicado aqui.
- **"Se inspirar" não existe como função.** Não há galeria de conteúdos publicados, referências visuais do briefing, nem exemplos do que "bom conteúdo AURA" parece. O `key_rules` do briefing é só texto em lista — sem imagem de referência, sem exemplo do formato esperado.
- **Feedback de loop fechado ausente.** Depois de enviar, a creator não sabe quando terá retorno, nem visualiza se o conteúdo dela foi "visto" (nem que seja um estado simples: recebido → em análise → publicado no mural). O FAQ hoje resolve isso com texto ("nosso time entra em contato"), mas isso é fricção, não reconhecimento.
- **Sem conexão com o restante do clube.** O hub vive isolado — não referencia cupom, comissão, ranking ou benefícios que já existem no app principal (seção 1 das instruções do projeto). Uma creator que envia conteúdo aqui não vê nenhuma ponte de volta pro app.

### 1.3 Responsividade — funcional, mas rasa

O CSS atual é mobile-first com um único breakpoint (768px). Isso cobre "não quebra", mas não cobre "faz sentido em cada tela":

- Desktop hoje é basicamente o mobile alargado — sem uso do espaço horizontal extra para, por exemplo, mostrar briefing + galeria de inspiração lado a lado, ou o mural em grid maior.
- O `aura-lp` usa um segundo breakpoint (900px) com layout estrutural diferente por seção (hero vira row horizontal, cards viram grid, fotos ficam full-bleed) — não é só "mesma coisa, mais larga". O hub deveria seguir esse padrão.

---

## 2. Proposta

### 2.1 Aplicar os tokens reais da marca (decisão de identidade)

Adotar direto os tokens de `aura-lp/styles.css`, reaproveitando a linguagem decorativa (mandala, brilhos, radius 20px, sombra suave) — conforme validado com você. Nada de paleta nova: o hub passa a ser visualmente indistinguível de "um espaço AURA", só que com layout de ferramenta (mais denso em informação, menos "venda").

### 2.2 Reordenar a hierarquia por "ver → se inspirar → participar → ser visto"

Nova ordem de seções propostas para a home do hub:

1. **Header** — logo + estado simples (se souber quem é a creator: nome; se não, genérico).
2. **Briefing da semana (destaque)** — sobe para o topo, antes de qualquer CTA de envio. É o "o que está rolando agora", igual ao princípio da home do app (seção 6.1/6.2 do projeto).
3. **Inspire-se** *(novo)* — galeria com exemplos de conteúdo já aprovado/publicado para o briefing atual (ou geral, se não houver ainda). Resolve "se inspirar" de forma concreta, não com texto.
4. **Como funciona** — mantém os 3 passos, mas versão com ícones da marca (mesmo estilo de `icon-inscreva-se`, `icon-conteudo`, `icon-venda`).
5. **Mural — quem já apareceu** *(redesenhado)* — vira vitrine real: thumbnail/print do conteúdo (quando houver imagem), nome, @, badge "impulsionado" quando aplicável. Isso é o "ser visto" — a creator quer ver ela mesma ali, e ver outras pra se inspirar por prova social.
6. **Briefings anteriores** — arquivo, mantém function, mas com badge de "ainda aceita envio" mais visível.
7. **Campanhas ativas** — condicional, mantém.
8. **Formulário de envio** — CTA principal, mas chega depois da creator já entender o que está em jogo.
9. **FAQ** — mantém.
10. **CTA final + footer** — mantém.

### 2.3 Estados que faltam

Seguindo o padrão de estados que o projeto já exige para a home do app (seção 7 das instruções), o hub precisa de pelo menos:

- **Creator nunca enviou conteúdo** → CTA reforça "seja a próxima do mural".
- **Creator já enviou pro briefing atual** → esconde/some o CTA principal do formulário, mostra "conteúdo recebido, aguardando aparecer no mural" (fecha o loop citado em 1.2).
- **Sem briefing ativo no momento** → estado vazio dedicado (hoje não existe; presumo que cairia em erro ou tela em branco).
- **Erro ao carregar `briefings.json`/mural** → estado de erro visível, não silencioso.

*(Isso depende de o hub saber "quem é" a creator — hoje ele não guarda nenhuma sessão/identificação. É uma dependência técnica a validar com o dev: dá pra usar o código de creator digitado no formulário anterior via localStorage/cookie simples, sem precisar de login completo, pra P0.)*

### 2.4 Responsividade estrutural (não só fluida)

No breakpoint desktop (sugiro manter 900px, consistente com `aura-lp`):

- Briefing da semana: imagem/preview do PDF ao lado do texto (row), não empilhado.
- Inspire-se + Mural: grid de 3–4 colunas em vez de scroll horizontal único.
- Formulário: dois campos por linha onde fizer sentido (nome/email, whatsapp/instagram), reduzindo o scroll longo que hoje é só mobile alargado.

---

## 3. Classificação de escopo

| Item | Classificação |
|---|---|
| Aplicar paleta/tipografia/componentes reais da AURA | **Indispensável para o P0** — está diretamente ligado ao objetivo do M2 ("dar cara de AURA ao produto") |
| Reordenar hierarquia (briefing antes do form) | **Indispensável** — baixo esforço, alto impacto de coerência |
| Mural redesenhado com thumbnail de conteúdo | **Importante, mas pode entrar depois** — depende de o backend/mural endpoint devolver mídia, não só nome/@ (dependência técnica) |
| Seção "Inspire-se" com galeria de exemplos aprovados | **Importante, mas pode entrar depois** — depende de haver conteúdo aprovado curado; pode nascer vazia/com placeholder no lançamento |
| Estado "já enviou pro briefing atual" (loop fechado) | **Importante, mas pode entrar depois** — depende de identificação simples da creator (dependência técnica a validar com o dev) |
| Grid desktop dedicado (não só fluido) | **Indispensável para o P0** — baixo esforço, resolve o ponto de "versão web só alargada" |

---

## 4. Próximo passo

Com sua validação deste estudo, o próximo passo é a reconstrução do hub (`index.html`, `styles.css`, `script.js`) aplicando a seção 2 inteira, e te mostro antes de qualquer deploy — como já alinhado.
