# 📓 Diário de mudanças — Orkestria

> **Convenção:** toda mudança no sistema gera uma nova entrada **no topo** deste
> arquivo (a entrada mais recente é sempre a primeira). Cada entrada tem data,
> título, o que mudou e os arquivos principais tocados. Quem for trabalhar no
> projeto (pessoa ou IA) deve ler a primeira entrada para saber o estado atual.

---

## 2026-06-12 — PDF de apresentação para a diretoria

**O que mudou:** gerado `Orkestria-Contexto.pdf` (na raiz) — versão formatada
do contexto do sistema para o diretor, com a identidade visual (capa com o
símbolo vetorial, cores vinho/evergreen sobre marfim, tabelas e caixas).
Conteúdo fiel ao `CONTEXTO-IA.md`, em linguagem de gestão. Gerador
reproduzível em `scripts/gerar-pdf-contexto.py` (reportlab) — basta rodar
`python scripts/gerar-pdf-contexto.py` para regenerar quando o sistema evoluir.
Cuidado registrado: fonte Helvetica não tem `→`/`−` (usar `›`/`-`) e o texto
de cabeçalho de tabela precisa de cor clara (senão some no fundo verde).

**Arquivos:** `scripts/gerar-pdf-contexto.py`, `Orkestria-Contexto.pdf`.

---

## 2026-06-12 — Restrição de gênero por tarefa (ex.: banheiro feminino)

**O que mudou (pedido do usuário):** tarefas podem exigir gênero específico do
executante. Campo `restricao_genero` na Tarefa (`""`/`feminino`/`masculino`,
opcional p/ compatibilidade). A agenda **bloqueia** (erro `RESTRICAO_GENERO`,
não autorizável) alocar tarefa restrita para funcionário de gênero
incompatível — no cliente e no servidor (`validarAlocacao`).
- Tela de Tarefas: select "Restrição de gênero" + coluna/selo (♀/♂).
- Paleta: marcador ♀/♂ no card da tarefa restrita.
- Cobertura de ausência: só sugere colegas de gênero compatível.
- Seed demo: banheiro feminino → mulheres, masculino → homens.
- Verificado no Firebase real: José (masc.) bloqueado (422), Maria (fem.)
  permitida (201), campo persistido.
- **Nota**: tarefas migradas antes deste campo não têm restrição — definir
  editando a tarefa (ex.: "Higienização de banheiro").

**Arquivos:** `types/comum.ts`, `types/Tarefa.ts`, `lib/schema.ts`,
`lib/memoryStore.ts`, `lib/validations.ts`, `app/(app)/tarefas/page.tsx`,
`components/agenda/TaskPalette.tsx`, `components/agenda/CoberturaPanel.tsx`.

---

## 2026-06-12 — Correção: filtros da paleta estouravam a caixa

**O que mudou:** os `<select>` de Andar/Tipo/Prioridade na paleta de tarefas
vazavam para fora do painel. Causa: colunas `1fr 1fr` têm `min-width:auto`,
então o select (que não encolhe abaixo da maior opção) empurrava a coluna.
Corrigido com `minmax(0,1fr)` nas colunas e `width:100%/minWidth:0/
box-sizing:border-box` nos selects e no input. Verificado: nenhum elemento
ultrapassa a borda da paleta (260px).

**Arquivos:** `components/agenda/TaskPalette.tsx`.

---

## 2026-06-12 — Deploy na Vercel + correção da logo (middleware 307)

**O que mudou:** sistema publicado em https://orkestria-christus.vercel.app
(repositório renomeado para `napa14-design/Orkestria`; remote atualizado).
- **Bug corrigido**: o `matcher` do middleware não excluía arquivos da pasta
  `public/`, então requisições de imagens por usuário deslogado (a logo na
  própria tela de login) eram redirecionadas para `/login` com HTTP 307 em
  vez de servir o PNG. Adicionadas extensões estáticas (png/jpg/svg/…/woff)
  à exceção do matcher. Verificado no ar: todos os assets agora HTTP 200.
- **Lembrete de produção**: na Vercel as variáveis do `.env` são cadastradas
  uma a uma (Environment Variables); `FIREBASE_PRIVATE_KEY` com `\n` literais
  e sem aspas; `COOKIE_SECURE=true` (HTTPS).

**Arquivos:** `middleware.ts`.

---

## 2026-06-12 — Correção: modal colado no menu superior

**O que mudou (bug reportado pelo usuário):** os modais abriam "colados" no
menu e sem escurecer o cabeçalho. Causa raiz: o transform residual das
classes de animação `.entra` (containing block para `position:fixed` — o
modal se posicionava em relação ao conteúdo, não à janela). Correções:
- **Modal agora renderiza em portal no `<body>`** (`createPortal`) — imune a
  qualquer ancestral com transform/animação. Vale para todos os modais
  (cadastros, acompanhamento, planejamento).
- Animações `.entra*` trocadas de `both` para `backwards` (não deixam
  transform residual após terminar).
- **Título do modal agora é sticky**: ao rolar formulários longos em telas
  de 700px, "Novo — X" e o botão fechar continuam visíveis.

Verificado em 1300×700: overlay cobre a janela inteira (cabeçalho escurece),
modal centralizado com folga acima/abaixo, título fixo na rolagem.

**Arquivos:** `components/Modal.tsx`, `app/globals.css`.

---

## 2026-06-12 — Sedes grandes (50+ ASGs) e logos horizontais

**O que mudou:**
- **Paginação de colunas na agenda**: a tela de rotina agora mostra **8
  funcionários por vez** (ordenados alfabeticamente), com barra
  "‹ Funcionários 1–8 de N ›" que só aparece quando a sede tem mais que 8.
  Equipe/cobertura continuam considerando todos; clicar num nome na lista da
  equipe **pula automaticamente para a página** daquela coluna.
- **Busca por funcionário** nos filtros do topo (filtra colunas, equipe e
  cobertura; reseta a página).
- Testado de ponta a ponta com 7 funcionários temporários criados no
  Firestore real (10 no total → 2 páginas, busca, salto de página) e
  removidos ao final.
- **Logos horizontais** (novas artes do usuário) copiadas para
  `public/logo-horizontal-fundo-{claro,escuro}.png` (nomeadas pelo fundo de
  uso): a versão para fundo escuro substituiu símbolo+texto no **cabeçalho**
  (52px) e a clara entrou no cabeçalho das **fichas impressas**.

**Arquivos:** `app/(app)/rotinas/page.tsx`, `components/agenda/FiltersBar.tsx`,
`components/AppShell.tsx`, `app/(app)/rotinas/imprimir/page.tsx`,
`public/logo-horizontal-*.png`.

---

## 2026-06-12 — Responsividade (alvo: notebook 1366×768)

**O que mudou:** breakpoints adicionados ao design system
(`app/globals.css`). Alvo principal confirmado pelo usuário: notebooks
~1300×700 — verificado: paleta 260 + agenda 682 (3 colunas de funcionários)
+ resumo 280, sem estouro.
- **< 1000px**: a tela de rotina empilha (`.linha-rotina` vira coluna) —
  paleta e resumo em largura total, agenda inteira visível (antes ficava com
  4px). Classes novas: `.paleta-tarefas`, `.resumo-lateral`.
- **< 720px**: utilitários `.so-desktop`/`.so-mobile` — o **Acompanhamento
  vira cards empilhados** (funcionário, tarefa, horários, desvio, botão
  registrar em largura total), pensado para o supervisor andando pelo prédio
  com o celular; a tabela some. Nome do usuário some do cabeçalho.
- **< 560px**: formulários de modal (`.form-grade`) viram 1 coluna.
- **Limitação conhecida**: montar rotina por toque (drag-and-drop não existe
  em touch) ficou de fora por decisão — caso de uso real é desktop.

**Arquivos:** `app/globals.css`, `components/agenda/TaskPalette.tsx`,
`components/agenda/OccupancySummary.tsx`, `components/CrudManager.tsx`,
`components/AppShell.tsx`, `app/(app)/rotinas/page.tsx`,
`app/(app)/acompanhamento/page.tsx`.

---

## 2026-06-12 — Arte oficial da logo (PNG) no login

**O que mudou:** o usuário colocou os PNGs da logo na raiz do projeto.
Copiados para `public/` com nomes pelo fundo de uso (atenção — os nomes
originais eram pelo tom do texto, o inverso):
- `public/logo-fundo-claro.png` ← `Logo-escuro.png` (wordmark evergreen,
  para fundos claros/marfim)
- `public/logo-fundo-escuro.png` ← `Logo-claro.png` (wordmark marfim,
  para fundos escuros)

Ambos 1254×1254 com fundo transparente (alpha verificado). O **login agora
usa a arte oficial completa** (símbolo + wordmark + tagline) no lugar do
conjunto recriado em vetor; h1 ficou visualmente oculto para acessibilidade.
O cabeçalho e as fichas seguem com o símbolo vetorial (sem tagline).
Os PNGs originais continuam na raiz (podem ser apagados).

**Arquivos:** `public/logo-fundo-{claro,escuro}.png`, `app/login/page.tsx`.

---

## 2026-06-12 — Conjunto da logo fiel à arte + fantasma de drop na agenda

**O que mudou (feedback do usuário):**
- **Logo como conjunto fiel à arte**: o login agora mostra o lockup completo
  centralizado — símbolo 112px, wordmark "Orkestria" em cor única (sem o "ia"
  destacado) e a tagline "Planeje · Distribua · Otimize · Evolua" com filetes
  vinho laterais, como na arte original. O cabeçalho usa símbolo + wordmark
  sem a tagline. (A arte PNG veio pelo chat — sem o arquivo, o conjunto foi
  recriado em vetor; se o usuário salvar em `public/logo.png` dá para usar a
  arte exata.)
- **Fantasma de drop**: ao arrastar uma tarefa, em vez do tracejado na coluna
  inteira, agora aparece um fantasma tracejado **do tamanho exato da tarefa
  (blocos × altura)** no slot onde ela cairá, com o horário de início no
  canto. Segue o mouse, some ao soltar ou cancelar o arrasto. Implementação:
  estado `blocosArrasto` na página (setado no dragstart da paleta e dos
  cards), prévia `{funcionarioId, slot}` no AgendaGrid; o fantasma só
  renderiza enquanto há item em arrasto.

**Arquivos:** `components/agenda/AgendaGrid.tsx`,
`components/agenda/TaskPalette.tsx`, `app/(app)/rotinas/page.tsx`,
`app/login/page.tsx`, `components/AppShell.tsx`, `app/globals.css`
(removido `.coluna-drop-ativa`).

---

## 2026-06-12 — Logo oficial integrada (símbolo vetorial + favicon)

**O que mudou:** o usuário criou a logo da Orkestria (o "O" em vinho
atravessado pela batuta de maestro, com barras de crescimento dentro;
tagline "Planeje. Distribua. Otimize. Evolua."). Integração feita:
- **Símbolo recriado em SVG vetorial** como componente React
  (`components/LogoOrkestria.tsx`) com variantes `claro` (barras evergreen)
  e `escuro` (barras marfim) + arquivos standalone em
  `public/logo-simbolo-{claro,escuro}.svg` para uso externo.
- **Favicon** (`app/icon.svg`): versão simplificada do símbolo (O + batuta,
  sem barras — que somem em 16px), servida automaticamente pelo Next.
- **Aplicada em**: cabeçalho do app (símbolo 30px + wordmark), tela de login
  (símbolo 88px + tagline em vinho) e fichas de rotina impressas (símbolo 40px
  no cabeçalho de cada ordem de serviço).

**Arquivos:** `components/LogoOrkestria.tsx`, `app/icon.svg`,
`public/logo-simbolo-*.svg`, `components/AppShell.tsx`,
`app/login/page.tsx`, `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-12 — 🎼 Novo nome (Orkestria) e identidade visual "Partitura"

**O que mudou:**
- **Rename completo**: o sistema agora se chama **Orkestria** ("porque ele
  orquestra as rotinas") — substituído em código, UI (logo "Orkestr·ia"),
  docs, package.json e launch.json.
- **Nova identidade "Partitura"** (escolhida pelo usuário entre 3 direções
  propostas a partir das paletas que ele enviou): marfim de papel de partitura
  (#F5F1E6), tinta evergreen (#223127), **vinho amaranto (#9C0D38)** como
  acento/marca; status retonalizados (azul #2F5D9E, verde #2E7D52, vermelho
  #C73A2B, laranja #D97C26). Fontes: **Fraunces** (display serif), **Albert
  Sans** (corpo), **Spline Sans Mono** (números). Direções descartadas:
  "Maestro" (dark + latão) e "Pauta serena" (slate + celadon).
- **Bug corrigido**: as classes de fonte do next/font estavam no `<body>`,
  mas os tokens `--fonte-*` do globals.css vivem no `:root` — as fontes nunca
  renderizaram desde o início do projeto (caíam no fallback do navegador).
  Movidas para o `<html>`; agora Fraunces/Albert Sans/Spline Sans Mono
  carregam de verdade.

**Arquivos:** `app/layout.tsx` (fontes + fix), `app/globals.css` (paleta),
`components/AppShell.tsx` e `app/login/page.tsx` (marca), rename em ~16
arquivos, `CLAUDE.md`/`CONTEXTO-IA.md`/`docs/05` (identidade e nome).

---

## 2026-06-12 — 🚀 Firebase Firestore EM PRODUÇÃO

**O que mudou:** o usuário ativou o Firestore no console e a configuração foi
concluída de ponta a ponta. **`DATA_SOURCE=firebase` é agora a fonte oficial
de dados** — os dados persistem de verdade (reiniciar o servidor não zera mais
nada).

- Banco "(default)" confirmado no projeto `ociosidade-88ce4`.
- Migração executada (`POST /api/migrar-firebase`): 3 usuários, 3 sedes,
  5 funcionários, 9 locais, 11 tarefas, 9 parâmetros, 3 rotinas, 1 ausência.
- Verificado contra o Firestore real: login (usuarios na nuvem), leituras,
  criação de rotina com validação (conflito → 422), exclusão e histórico de
  auditoria gravado.
- **Os dados atuais são os de demonstração** — basta editar/cadastrar por cima
  pelas telas do sistema.
- Pendência seguinte da Fase 3: Firebase Authentication (senha individual).

**Arquivos:** `.env` (DATA_SOURCE=firebase — não versionado).

---

## 2026-06-12 — Configuração do Firebase real (em andamento)

**O que mudou:** o usuário forneceu o service account do projeto Firebase
`ociosidade-88ce4`. Criado o `.env` com as credenciais (DATA_SOURCE ainda em
`memory`) e o script `scripts/firestore-setup.mjs`, que verifica/cria o banco
Firestore "(default)" em southamerica-east1 e tenta ativar a API.

**Bloqueio encontrado:** a **Cloud Firestore API está desativada** no projeto
e o service account não tem permissão para ativá-la (exige Editor/Owner).
Aguardando o usuário ativar a API (1 clique) ou criar o banco pelo console do
Firebase. **Próximo passo após o desbloqueio:** rodar
`node scripts/firestore-setup.mjs`, depois `POST /api/migrar-firebase` logado
como admin, e por fim trocar `DATA_SOURCE=firebase` no `.env`.

**Arquivos:** `.env` (não versionado), `scripts/firestore-setup.mjs`.

---

## 2026-06-12 — Diário de mudanças e documentação para IA

**O que mudou:** criados o próprio `DIARIO.md` (este arquivo), o `CLAUDE.md`
(instruções automáticas para sessões do Claude Code neste projeto) e o
`CONTEXTO-IA.md` (documento autocontido para uma IA entender o sistema inteiro,
voltado à gerência).

**Arquivos:** `DIARIO.md`, `CLAUDE.md`, `CONTEXTO-IA.md`, `README.md`.

---

## 2026-06-12 — Fase 2 concluída: histórico, redimensionar, override e pendências

**O que mudou:**
- **Histórico de alterações** (tela `/historico` + 11ª aba/coleção `historico`):
  toda escrita em qualquer tabela é registrada automaticamente com autor, ação,
  campos alterados e horário. Implementado como decorator do `DataSource`
  (`lib/historico.ts`) + AsyncLocalStorage com o e-mail da sessão
  (`lib/contextoUsuario.ts`) — nenhum serviço precisa logar manualmente.
- **Redimensionar card na agenda**: alça inferior (⠿⠿) arrastável em incrementos
  de bloco; servidor recalcula blocos/fim e revalida conflitos.
- **Autorização manual** (regras 6 e 7): conflito de intervalo/sobreposição
  agora pode ser autorizado com confirmação; a rotina recebe a marca
  "[Autorizado manualmente]" na observação. Demais bloqueios continuam rígidos.
- **Alerta de dias sem registro**: banner no Acompanhamento lista os dias da
  última semana com tarefas planejadas sem status; clique abre o dia.

**Arquivos:** `lib/historico.ts`, `lib/contextoUsuario.ts`, `lib/api.ts`,
`app/api/historico/`, `app/(app)/historico/`, `components/agenda/AgendaGrid.tsx`,
`services/rotinasService.ts` (forcar + tempo_previsto_min),
`app/(app)/rotinas/page.tsx`, `app/(app)/acompanhamento/page.tsx`.

---

## 2026-06-12 — Ajuste de tempos padrão, visão semanal e proteção contra exclusão

**O que mudou:**
- **Sugestão de ajuste de tempo padrão** (dashboard): com ≥3 execuções reais e
  mediana desviando ≥15% do previsto atual (parâmetros `min_execucoes_ajuste` e
  `desvio_ajuste_percentual`), o sistema sugere o novo tempo base respeitando a
  regra de cálculo (min/m², min/unidade, fixo) — aplicável com 1 clique.
- **Visão semanal**: alternância Dia/Semana na tela de rotina; grade
  funcionário × dia com resumo (tarefas, tempo, ocupação colorida, ausência);
  clique na célula abre o dia.
- **Inativar em vez de excluir**: exclusão de sede/funcionário/local/tarefa é
  bloqueada (HTTP 422) quando há histórico vinculado, com orientação a inativar.

**Arquivos:** `components/SugestoesAjuste.tsx`, `components/agenda/SemanaGrid.tsx`,
`components/agenda/FiltersBar.tsx`, `app/(app)/dashboard/page.tsx`,
`services/{funcionarios,tarefas,locais,sedes}Service.ts`, `types/Parametro.ts`,
`lib/calculations.ts` (mediana).

---

## 2026-06-12 — Ausências/cobertura, fichas imprimíveis e cobertura de frequência

**O que mudou:**
- **Ausências** (tela `/ausencias` + 10ª aba `ausencias`): falta, atestado,
  férias, folga por período. Coluna do ausente fica hachurada/bloqueada na
  agenda; alocação rejeitada no cliente e no servidor; duplicação/modelos pulam
  ausentes no destino.
- **Painel de cobertura**: tarefas planejadas de ausentes viram "órfãs", com
  sugestão de colegas ordenados por ociosidade e botão "Mover →".
- **Fichas de rotina imprimíveis** (`/rotinas/imprimir`, botão "🖨 Fichas"):
  ordem de serviço em papel por funcionário, com assinaturas, uma página por
  ficha (os ASGs não usam o sistema).
- **Painel "Ficou de fora hoje"**: tarefas diárias sem alocação + periódicas
  vencidas (semanal 7d, quinzenal 14d, mensal 30d, janela de 31 dias).

**Arquivos:** `types/Ausencia.ts`, `services/ausenciasService.ts`,
`app/api/ausencias/`, `app/(app)/ausencias/`, `components/agenda/CoberturaPanel.tsx`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/rotinas/imprimir/`,
`app/globals.css` (@media print).

---

## 2026-06-12 — Banco definitivo trocado para Firebase Firestore

**O que mudou:** a pedido do usuário, a Fase 3 deixou de ser Supabase e passou
a ser **Firebase Firestore**. Implementado `FirebaseDataSource`
(`lib/firebaseClient.ts`, firebase-admin, transação no atualizar),
`DATA_SOURCE=firebase` no factory, endpoint `POST /api/migrar-firebase`
(admin; copia todas as tabelas da fonte atual para o Firestore, idempotente) e
documentação `docs/07-migracao-firebase.md` (substituiu a de Supabase).
**Atenção:** ainda não testado contra um projeto Firestore real (sem
credenciais na máquina) — o primeiro `migrar-firebase` real é o teste final.

**Arquivos:** `lib/firebaseClient.ts`, `lib/datasource.ts`,
`app/api/migrar-firebase/`, `.env.example`, `docs/07-migracao-firebase.md`.

---

## 2026-06-12 — Modelos de rotina, exportação CSV e gestão de usuários

**O que mudou:**
- **Modelos de rotina** (9ª aba `modelos_rotina`): salvar o dia montado com um
  nome e aplicá-lo em qualquer período (datas + dias da semana); conflitos no
  destino são pulados e contados. Modal "⧉ Duplicar / Modelos" na tela de rotina.
- **Duplicar para período** (substituiu o prompt de data única).
- **Exportação CSV** (Excel pt-BR: separador `;`, BOM UTF-8) no dashboard e no
  acompanhamento, incluindo desvio e justificativa.
- **Tela de usuários** (`/usuarios`, só admin) com perfis e sede.

**Arquivos:** `services/modelosService.ts`, `app/api/modelos/`,
`components/agenda/ModalPlanejamento.tsx`, `lib/csv.ts`,
`app/(app)/usuarios/`, `app/api/usuarios/`.

---

## 2026-06-12 — Fase 2 iniciada: acompanhamento realizado × previsto

**O que mudou:** tela `/acompanhamento` para registrar o que de fato aconteceu:
status realizado (6 opções), horários/tempo real (com "calcular pelo horário"),
desvio em tempo real no modal e **justificativa obrigatória** quando o desvio
passa do parâmetro (30%) ou o status é crítico — validado no cliente e no
servidor. Dashboard ganhou KPI "Tempo realizado" e "Top 10 desvios previsto ×
realizado". Registrar execução sincroniza o status da rotina na agenda.

**Arquivos:** `app/(app)/acompanhamento/`, `services/execucoesService.ts`,
`app/(app)/dashboard/page.tsx`.

---

## 2026-06-12 — MVP completo (criação do projeto)

**O que mudou:** projeto criado do zero — Next.js 15 + React 19 + TypeScript.
- **Arquitetura**: frontend → API interna → serviços → `DataSource`
  (interface única; implementações em memória/demo e Google Sheets). A
  interface nunca sabe de onde vêm os dados.
- **Cadastros**: sedes, funcionários (jornada líquida automática), locais
  (sempre com sede), tarefas (sempre com local, sede herdada, 4 regras de
  cálculo), parâmetros (globais/por sede, com auditoria).
- **Agenda visual** (`/rotinas`): blocos de 30min parametrizáveis,
  drag-and-drop nativo, intervalo hachurado, validação dupla
  (cliente + servidor) de conflito/intervalo/expediente, alerta de sobrecarga,
  salvamento automático por ação, painel de ocupação
  (subutilizado/adequado/alta/sobrecarga).
- **Dashboard** com KPIs e rankings; **login** por e-mail cadastrado + senha
  única (cookie HMAC); permissões por perfil e por sede.
- **Modo demo** (`DATA_SOURCE=memory`) com dados de exemplo; setup automático
  das abas do Sheets (`POST /api/setup`).
- Documentação completa em `docs/01..07`.

**Decisões importantes:** campos em snake_case (espelham Sheets/Firestore);
cálculos puros em `lib/calculations.ts` (rodam no cliente e no servidor);
rotina guarda `tempo_previsto_min` (real, para produtividade) e
`tempo_visual_min` (arredondado em blocos, só para a agenda); cookie sem flag
`Secure` por padrão (uso interno em HTTP/LAN — ativar `COOKIE_SECURE=true`
atrás de HTTPS).

**Credenciais demo:** `admin@empresa.com` / `supervisor.aldeota@empresa.com` /
`gerencia@empresa.com` — senha `mudar123`.
