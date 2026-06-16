# 📓 Diário de mudanças — Orkestria

> **Convenção:** toda mudança no sistema gera uma nova entrada **no topo** deste
> arquivo (a entrada mais recente é sempre a primeira). Cada entrada tem data,
> título, o que mudou e os arquivos principais tocados. Quem for trabalhar no
> projeto (pessoa ou IA) deve ler a primeira entrada para saber o estado atual.

---

## 2026-06-16 — Fase F (parcial): score de produtividade por funcionário

**O que mudou:**
- **Tela `/produtividade`**: indicador OPERACIONAL derivado do previsto ×
  realizado. Por funcionário (período + sede): nº de serviços realizados, tempo
  realizado e **aderência** (% das execuções comparáveis dentro de ±X% do
  previsto). Ranking (🥇🥈🥉) e export CSV (apoia o processo de premiação).
- **Salvaguardas do diretor**: banner explícito — não usa idade/sexo, não é
  punitivo, não substitui avaliação de gestão; tarefas de referência/presença
  ficam de fora (a variação é esperada). "Sem base" para quem não tem execuções
  comparáveis.
- Verificado em memória: Maria (real ≈ previsto) 🥇 100%; José (real bem acima)
  🥈 0%; demais "sem base". Build e console limpos.

**Fase F — em aberto (decisões da direção / produção):** os outros 3 itens não
foram feitos por exigirem decisão sua e/ou configuração de produção:
- **Login individual (Firebase Auth)**: troca a autenticação de produção (hoje
  senha única + cookie HMAC) — precisa do Firebase Auth habilitado no console.
- **Confirmação pelo funcionário (app/QR)** + **EPI confirmado**: fluxo voltado
  ao ASG; depende do login individual.
- **Remanejo entre sedes**: visão de gerência multi-sede + como o deslocamento
  entre sedes entra na conta.

**Arquivos:** `app/(app)/produtividade/page.tsx` (novo), `components/AppShell.tsx`,
`docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase E: conformidade (aptidão, treinamento, EPI) — Fase E concluída

**O que mudou (bloco jurídico de conformidade):**
- **Catálogo `requisitos`** (incremento 1): aptidão | treinamento | epi
  (global, admin). `Tarefa.requisitos` (CSV) define o que a tarefa exige —
  campo **multiselect** novo no CrudManager; selos por tipo (🩺/🎓/🧤) na tela de
  Tarefas. Tela `/requisitos`.
- **Qualificações do funcionário** (incremento 2): tabela
  `qualificacoes_funcionario` (funcionário possui aptidão/treinamento, com
  **validade**). Tela `/qualificacoes` (selo verde válido / vermelho vencido).
- **Validação na alocação** (`validarAlocacao`): bloqueia (erro) quem não tem um
  requisito de aptidão/treinamento exigido pela tarefa, ou cujo requisito está
  **vencido** na data. EPI **não bloqueia** (exibido como lembrete; a confirmação
  de uso é a Fase F). Cliente e servidor; não é contornável por "forçar".
- Seed: rq1 química (treinamento), rq2 NR-35 (aptidão), rq3 luvas (EPI);
  Higienização exige rq1+rq3, Limpeza de vidros exige rq2; Maria tem NR-35 (ok) e
  química vencida; José tem química válida.
- Verificado em memória: Maria+vidros (tem NR-35) **201**; José+vidros (sem
  NR-35) **bloqueado** (REQUISITO_FALTANDO); Maria+higienização (química vencida)
  **bloqueado** (REQUISITO_VENCIDO). Selos e telas OK. Build e console limpos.

**Fase E concluída** — matriz de aptidão e treinamento com validade completas;
EPI exigido pela tarefa entregue, faltando só a *confirmação de uso* (Fase F,
depende do app/QR). Próximo: Fase F (Auth individual, app/QR, remanejo entre
sedes, score).

**Decisão de modelagem:** um catálogo único `requisitos` com `tipo` cobre os três
itens; aptidão/treinamento são possuídos pelo funcionário e bloqueiam; EPI é
exigência da tarefa exibida como lembrete. Requisitos exigidos guardados como CSV
em `Tarefa.requisitos` (espelha colunas escalares; multiselect na UI).

**Arquivos:** `types/{comum,Requisito,QualificacaoFuncionario,Tarefa,index}.ts`,
`lib/schema.ts`, `lib/validations.ts`, `services/{requisitos,qualificacoes,rotinas}Service.ts`,
`app/api/{requisitos,qualificacoes}/...`, `app/(app)/{requisitos,qualificacoes,tarefas,rotinas}/page.tsx`,
`components/CrudManager.tsx` (multiselect), `components/AppShell.tsx`,
`app/globals.css` (selo-roxo), `lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase D (3/3): deslocamento — Fase D concluída

**O que mudou (último item do enriquecimento do cálculo):**
- **Tempo de deslocamento** (`deslocamento_min_por_tarefa`, parâmetro por sede,
  **default 0**): minutos de transição atribuídos por tarefa alocada. Entra na
  ocupação como tempo real (`resumoFuncionario`: ocupado = planejado + nº tarefas
  × param; ociosidade e ocupação recalculadas), SEM poluir o desvio de cada
  tarefa. Linha "Deslocamento estimado" no resumo quando > 0. Default 0 = neutro
  até a sede calibrar.
- Seed: p11 (Aldeota 5min/tarefa).
- Verificado em memória (servidor fixado no boot, sem tocar Firestore): Maria com
  2 tarefas → "Deslocamento estimado 10min", ociosidade 6h10 (480 − 100 − 10).
  Build e console limpos.

**Fase D concluída** (3/3): criticidade (incremento 1), tempo por pessoa
(incremento 2) e deslocamento (este). Próximo: Fase E (conformidade: aptidão,
treinamento, EPI).

**Arquivos:** `types/Parametro.ts`, `lib/calculations.ts` (`resumoFuncionario`),
`components/agenda/OccupancySummary.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

> Nota: a folga/ociosidade do **dashboard** (agregado) ainda soma só tempo de
> tarefa; o deslocamento é um overlay por funcionário/dia exibido no resumo da
> agenda. Unificar no dashboard fica para quando o parâmetro for calibrado.

---

## 2026-06-16 — Fase D (2/3): tempo padrão por funcionário × atividade (só planejamento)

**O que mudou:** tabela `tempos_personalizados` (funcionário × tarefa → minutos).
Na alocação (cliente e servidor), o tempo pessoal **substitui** o padrão
calculado — reconhece o ritmo de cada pessoa. Tela `/tempos`, service e rotas
com permissão por sede e unicidade por (funcionário, tarefa). **Só planejamento**
— nunca avaliação/score (planejar ≠ avaliar). Verificado: Maria 70 / José 95 /
Ana (sem override) 80; duplicata bloqueada.

**Arquivos:** `types/TempoPersonalizado.ts` (novo), `types/index.ts`,
`lib/schema.ts`, `services/temposPersonalizadosService.ts` (novo),
`app/api/tempos-personalizados/{route,[id]/route}.ts` (novos),
`app/(app)/tempos/page.tsx` (novo), `services/rotinasService.ts`,
`app/(app)/rotinas/page.tsx`, `components/AppShell.tsx`, `lib/memoryStore.ts`.

---

## 2026-06-16 — Fase D (1/3): criticidade / circuito essencial

**O que mudou:** `Tarefa.critica` — tarefas que não podem deixar de ser feitas.
Quando uma crítica fica sem cobertura no dia, o `PendenciasPanel` mostra uma
seção "Circuito essencial descoberto" em vermelho, separada e acima das demais
pendências. Campo + selo "⛔ crítica" na tela de Tarefas. Seed: t2 e t8 críticas.
Verificado: Coleta (crítica, não alocada) aparece no circuito; Higienização
(crítica, alocada hoje) não aparece.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/tarefas/page.tsx`,
`lib/memoryStore.ts`.

---

## 2026-06-16 — Fase C (2/2): presença/plantão + buffer calibrado — Fase C concluída

**O que mudou (fecha o segundo eixo):**
- **Presença/plantão** (`Tarefa.presenca`): classificação de tarefa para tempo de
  permanência (ex.: acompanhar pátio). NÃO cobra desvio — criamos o helper
  `cobraDesvio(tarefa) = !(tempo_referencia || presenca)` e o aplicamos em TODOS
  os pontos de desvio (execucoesService, SugestoesAjuste, dashboard, acompanhamento).
  Campo no form de Tarefas + selo "presença".
- **Buffer calibrado por sede** (`components/CalibracaoFolga.tsx`, no dashboard):
  painel que sugere a folga de cada sede = tempo médio de imprevistos por dia ÷
  capacidade diária (soma das jornadas líquidas). Sugestão transparente, NÃO
  aplica sozinha — fecha o ciclo do Tema 6 da pré-análise.
- Seed: t13 "Acompanhamento de pátio" (presença).
- Verificado em memória: presença com real 120 / previsto 60 sem justificativa →
  201 (não cobra); tarefa normal igual → 422 (exige justificativa). Calibração:
  Aldeota 45min de imprevisto / cap. 24h, DT 30min / 16h — cálculo correto. Selo
  "presença" na tela. Build e console limpos.

**Fase C concluída** (4/4). Próximo: Fase D (deslocamento, tempo por pessoa,
criticidade) — toca o cálculo de tempo e tem decisões de modelagem em aberto.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/calculations.ts`
(`cobraDesvio`), `services/execucoesService.ts`, `components/SugestoesAjuste.tsx`,
`components/CalibracaoFolga.tsx` (novo), `app/(app)/{tarefas,dashboard,acompanhamento}/page.tsx`,
`lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase C (1/2): serviços eventuais e imprevistos (2º eixo)

**O que mudou (a porta de entrada do trabalho não-rotineiro):**
- **Nova entidade `servicos_eventuais`** (separada de `execucoes_realizadas`,
  que sempre parte de uma rotina): registro a posteriori de trabalho fora da
  rotina, com `tipo` distinguindo **eventual** (trabalho avulso produtivo) de
  **imprevisto** (ocorrência que consumiu tempo). Campos: sede, funcionário
  (opcional), local/categoria (opcionais), data, descrição, início/fim, tempo
  em minutos, observação, supervisor.
- **Tela /eventuais** (supervisor+admin): CRUD via CrudManager, selos
  Eventual/Imprevisto, tempo formatado. Link no menu após Acompanhamento.
- **Service + rotas** (`/api/servicos-eventuais`): GET por intervalo de data
  (campo único) + filtro de sede em memória; POST/PUT/DELETE com permissão de
  sede (supervisor só na própria sede). Escritas logadas no histórico.
- Seed demo: 3 registros (1 eventual + 2 imprevistos em Aldeota/DT).
- Verificado em memória: seed 3 → cria → 4; filtro por sede DT retorna só o da
  DT; supervisor Aldeota recebe 403 ao registrar em outra sede e 201 na própria;
  tela lista os 5 com selos; form completo. Build e console limpos.

**Decisão de modelagem:** eventuais e imprevistos compartilham uma tabela
(distintos por `tipo`), separados das execuções de rotina — o "2º modo" do
produto. Isso prepara o **buffer calibrado por sede** (próximo incremento), que
deriva a folga a partir do volume de imprevistos por sede.

**Falta na Fase C (2/2):** presença/plantão como classificação de tarefa (não
cobra desvio, não é ociosidade) + buffer calibrado por sede a partir dos
imprevistos registrados.

**Arquivos:** `types/comum.ts`, `types/ServicoEventual.ts` (novo), `types/index.ts`,
`lib/schema.ts`, `services/servicosEventuaisService.ts` (novo),
`app/api/servicos-eventuais/{route,[id]/route}.ts` (novos),
`app/(app)/eventuais/page.tsx` (novo), `components/AppShell.tsx`, `lib/memoryStore.ts`.

---

## 2026-06-16 — Fase B (2/2): intensidade de limpeza no cálculo — Fase B (quase) concluída

**O que mudou (incremento que toca a fórmula de tempo):**
- **Fator de intensidade na categoria** (`Categoria.fator_intensidade`, padrão
  1,0): multiplica o tempo previsto de TODAS as tarefas da categoria. Presets
  leve 0,8 · normal 1,0 · densa 1,5 (calibráveis). `tempoPrevistoMin` ganhou um
  3º parâmetro opcional `categoria` e aplica o fator no fim; helper
  `fatorIntensidade` blinda contra valor ausente/≤0 (→ 1).
- Aplicado em TODOS os pontos que calculam tempo previsto: servidor
  (`rotinasService` busca a categoria ao alocar), paleta, tela de Tarefas,
  alocação na agenda. `SugestoesAjuste` usa o fator no previsto E **divide por
  ele** ao sugerir o novo tempo base (senão a sugestão super-corrigiria).
- Tela Categorias: campo "Fator de intensidade" + selo "×1,5 densa / ×0,8 leve"
  na lista. Seed: Higienização e Limpeza terminal densas (1,5); Organização e
  Reposição leves (0,8).
- Verificado em memória: alocar Higienização (base 20 ×1,5) → previsto **30**;
  Organização (30 ×0,8) → **24**; Reposição (15 ×0,8) → **12** — na tela e no
  servidor. SugestoesAjuste com 3 execuções de 45min (previsto 30) sugeriu base
  **30** (= 45 ÷ 1,5), confirmando a divisão do fator. Build e console limpos.

**Decisão de modelagem (sua):** intensidade fica na **categoria** (multiplicador
único), não por tarefa/local. Consequência: o item "tipo de uso do local →
exigência de nível" da Fase B fica **em aberto** (pressupõe nível por
local/tarefa) — documentado em `docs/08`. Fase B entrega 3 de 4 itens; o 4º é
decisão de modelagem futura, não pendência de esforço.

**Arquivos:** `types/Categoria.ts`, `lib/schema.ts`, `lib/calculations.ts`,
`services/rotinasService.ts`, `components/SugestoesAjuste.tsx`,
`components/agenda/TaskPalette.tsx`, `app/(app)/{tarefas,rotinas,dashboard,categorias}/page.tsx`,
`lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase B (1/2): categoria de atividade + recalibração em cascata

**O que mudou (fundação estrutural da Fase B, sem mexer na fórmula de tempo):**
- **Entidade `categorias`** (catálogo global, compartilhado entre sedes):
  id, nome, descricao, cor, ativo. Formaliza o antigo campo livre
  `tipo_tarefa`. `Tarefa` ganhou `categoria_id` (opcional p/ compat).
- **Tela Categorias** (`/categorias`, só admin): CRUD padrão + ação
  **Recalibrar** — aplica um fator ao `tempo_base_min` de TODAS as tarefas da
  categoria de uma vez (presets ±10/±20% ou fator manual). Cada ajuste é logado
  no histórico pelo decorator. Bloqueia exclusão de categoria com tarefas.
- **Tela Tarefas**: novo select **Categoria** (catálogo) + coluna com selo
  colorido; `tipo_tarefa` rebaixado a "Tipo (texto livre)" legado.
- **Paleta da agenda**: filtro "Tipo" (texto livre) virou **Categoria** (só as
  usadas na sede); cada card mostra a pílula colorida da categoria.
- **Permissões**: catálogo global → só administrador cria/edita/exclui/recalibra
  (`podeGerenciarCatalogo`); supervisor/visualizador apenas leem (para escolher
  ao cadastrar tarefa). Verificado: supervisor recebe 403.
- Schema dirige tudo (setup/migração Firestore incluem `categorias`
  automaticamente). Seed: 7 categorias (c1–c7) e todas as tarefas vinculadas.
- Verificado em memória: GET 7 categorias; recalibrar c2 ×1.2 → 3 tarefas
  20→24min, 3 registros no histórico; modal mostra "N tarefa(s) ajustada(s)";
  filtro da paleta e selos coloridos OK. Build e console limpos.

**Decisão de modelagem:** categoria é **catálogo global** (não por sede) — a
questão "catálogo mestre por sede" do plano fica em aberto. Recalibração é uma
**ação** (multiplica tempo_base_min), não um campo herdado, evitando acoplar a
fórmula a esta etapa.

**Arquivos:** `types/Categoria.ts` (novo), `types/index.ts`, `types/Tarefa.ts`,
`lib/schema.ts`, `lib/permissions.ts`, `services/categoriasService.ts` (novo),
`app/api/categorias/{route,[id]/route,recalibrar/route}.ts` (novos),
`components/CrudManager.tsx` (prop `acoesExtra`), `app/(app)/categorias/page.tsx`
(novo), `app/(app)/tarefas/page.tsx`, `components/agenda/TaskPalette.tsx`,
`app/(app)/rotinas/page.tsx`, `components/AppShell.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

**Falta na Fase B (2/2):** nível/intensidade de limpeza entrando no cálculo de
tempo + tipo de uso do local → exigência de nível (mexem na fórmula
`tempoPrevistoMin` — próximo incremento).

---

## 2026-06-16 — Fase A: periodicidade fina (dias fixos da semana) — Fase A concluída

**O que mudou (último item da Fase A):**
- **Periodicidade fina** (`Tarefa.dias_semana`, CSV "0".."6", 0=dom): uma tarefa
  **semanal** pode fixar os dias da semana em que é devida (ex.: "2,4" = terça e
  quinta; marcar 2 dias = "2× por semana"). Vazio mantém o comportamento antigo
  (janela deslizante de 7 dias). Advisory — não bloqueia a agenda.
- **Painel "Ficou de fora hoje"** ganhou um terceiro grupo: **"do dia (dia
  fixo)"** — tarefas semanais cujo dia da semana de hoje está marcado e que não
  foram alocadas. Aparece com selo do dia (ex.: "terça"). As semanais sem dias
  fixos continuam na regra de vencimento por janela.
- **Tela de Tarefas**: novo seletor de dias (linha de toggles D-S-T-Q-Q-S-S),
  que só aparece quando a frequência é "Semanal" (campo condicional via
  `mostrarSe` no `CrudManager`). Selo "ter, qui" na coluna "Regras".
- Helpers de data em `lib/dateUtils.ts` (`DIAS_SEMANA`, `parseDiasSemana`,
  `serializarDiasSemana`, `rotularDiasSemana`, `diaDaSemana`).
- Seed demo: t12 "Limpeza de vidros" semanal terça/quinta (Aldeota).
- Verificado em memória: na terça o painel mostra "1 do dia (dia fixo)" com selo
  "terça"; na quarta a tarefa não é cobrada (contraprova); seletor traz terça+
  quinta marcados e some ao trocar para Diária. Build e console OK.

**Decisão de modelagem:** `dias_semana` ficou como **string CSV** (não array)
para espelhar colunas escalares do Sheets/Firestore (regra do schema) e evitar
serialização de array; a UI/lógica usa `parse/serializarDiasSemana`. Escopo
fino e advisory de propósito — não vira bloqueio de alocação.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/dateUtils.ts`,
`components/CrudManager.tsx`, `app/(app)/tarefas/page.tsx`,
`components/agenda/PendenciasPanel.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

**Fase A concluída** (5/5). Próximo: Fase B (categoria de atividade), a primeira
fundação estrutural do plano.

---

## 2026-06-16 — Fase A (2/2): folga mínima por sede + relatório mensal

**O que mudou (conclui os itens viáveis da Fase A):**
- **Folga mínima por sede** (`folga_minima_percentual`): parâmetro que reserva
  uma fatia da jornada como buffer para imprevistos. Define a **ocupação-alvo**
  da sede = 100 − folga. No resumo do funcionário e nas barras da equipe
  aparece um marcador (tick) na barra de ocupação na posição-alvo, mais a
  legenda "Folga reservada X% · ocupação-alvo ≤ Y%". Puramente informativo
  (não bloqueia). Seed demo: 10% geral.
- **Relatório mensal por funcionário** (nova tela `/relatorios`): consolida as
  execuções do mês (a partir do que foi marcado no Acompanhamento) em folhas
  imprimíveis, uma por funcionário, com data/tarefa/local/status/tempo real,
  totais (nº de serviços realizados + tempo) e linhas de assinatura
  (responsável pela sede / cliente). Filtros de mês e sede; botão Imprimir.
  Para o cliente assinar — atende o pedido do diretor de "formalizar a saída".
- Verificado em memória: registradas 2 execuções (conforme + com atraso) →
  relatório lista as 2 linhas, resumo "2 serviço(s) · 1h45", só aparece quem
  teve execução; folga: tick em left:90% e legenda ≤ 90%. Build e console OK.

**Arquivos:** `types/Parametro.ts`, `lib/calculations.ts`, `lib/memoryStore.ts`,
`components/agenda/OccupancySummary.tsx`, `app/(app)/relatorios/page.tsx` (novo),
`components/AppShell.tsx`.

**Falta na Fase A:** periodicidade fina (tarefas em dias fixos da semana) —
adiada por exigir decisão de modelagem à parte. Próximo: Fase B (categoria de
atividade) por `docs/08-plano-evolucao.md`.

---

## 2026-06-12 — Fase A (1/2): janela de horário + "tempo é referência"

**O que mudou (primeiros itens do plano de evolução):**
- **Janela de horário por tarefa** (`janela_inicio`/`janela_fim`): a tarefa só
  pode ser alocada dentro do intervalo (ex.: refeitório só após o almoço). A
  agenda bloqueia fora (`JANELA_HORARIO`), cliente e servidor.
- **Flag "tempo é referência"** (`tempo_referencia`): tarefas cuja execução
  varia muito (ex.: montagem de palco) não cobram justificativa de desvio, não
  entram no "Top 10 desvios" do dashboard nem nas sugestões de ajuste de tempo.
- Tela de Tarefas: campos novos (com dicas), selos na coluna "Regras"
  (♀/♂, janela, referência). Seed demo com exemplos (t5 janela 13–16h, t6
  referência).
- Verificado em memória: janela bloqueia 09:00 / aceita 13:30; execução de
  tarefa-referência com desvio 3× passa sem justificativa, tarefa normal é
  bloqueada (contraprova). Build e console OK.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/validations.ts`,
`lib/memoryStore.ts`, `services/execucoesService.ts`, `components/SugestoesAjuste.tsx`,
`app/(app)/{tarefas,dashboard,acompanhamento}/page.tsx`.

**Falta na Fase A:** folga mínima por sede, periodicidade fina, relatório
mensal por funcionário.

---

## 2026-06-12 — Plano de evolução (pós pré-análise do diretor)

**O que mudou:** o diretor enviou uma pré-análise classificando ideias de
evolução (JÁ EXISTE / MELHORIA / LACUNA / DIREÇÃO / RISCO) em 9 temas. Conferi
contra o código (classificações batem; e registrei que a "periodicidade por dia
da semana" já avançou via `escala`). Criado `docs/08-plano-evolucao.md`:
sequencia tudo em fases A–F por dependência/risco (ganhos rápidos → categoria de
atividade → serviços eventuais/eventualidades → deslocamento/tempo por pessoa →
conformidade/aptidão → direção: Auth, app/QR, remanejo entre sedes), com as
decisões em aberto que travam cada fase e os guarda-corpos de risco
(tempo individual planejar≠avaliar; idade/sexo fora de produtividade).
Nada implementado ainda — é o mapa de execução.

**Arquivos:** `docs/08-plano-evolucao.md`.

---

## 2026-06-12 — Consultas filtradas (corta leituras do Firestore)

**O que mudou:** novo método `DataSource.consultar(tabela, condicoes)` que no
Firestore vira `where` — sempre por **um único campo** (igualdade ou intervalo
no mesmo campo), usando só índices automáticos (zero índice composto p/ criar).
Filtros secundários (ex.: sede além da data) ficam em memória sobre o conjunto
já reduzido. Aplicado nos caminhos quentes: rotinas por data/período,
ausências por sede e por funcionário (`ausenteEm`), funcionários/tarefas/locais
por sede, usuários por e-mail (login), modelos por sede, execuções por período,
histórico por tabela. Antes cada carga lia coleções **inteiras** (causa do
estouro de cota); agora lê só o recorte. Memory/Sheets filtram em JS (mesmo
resultado).

**Verificado** em modo memória (mesma lógica): login, funcionários/tarefas/
rotinas retornam só o recorte correto da sede/data; agenda renderiza. (Firebase
ao vivo não testado por causa da cota esgotada hoje — caminho `where` é padrão
e usa índices automáticos.)

**Arquivos:** `lib/datasource.ts`, `lib/{memoryStore,firebaseClient,googleSheetsClient,historico}.ts`,
`services/{rotinas,ausencias,funcionarios,tarefas,locais,usuarios,modelos,execucoes}Service.ts`,
`app/api/historico/route.ts`.

---

## 2026-06-12 — Agenda instantânea (otimista) + alerta de cota Firestore

**O que mudou:** soltar/mover/redimensionar/remover tarefa na agenda agora é
**otimista** — o card aparece/muda na hora (SWR `optimisticData`), o servidor
valida em 2º plano, a resposta substitui o provisório (sem rebuscar a lista) e,
se o servidor recusar, `rollbackOnError` reverte. Antes: ~3-4s (esperava o POST
+ uma rebusca da coleção inteira). Agora instantâneo e com **menos leituras**.

**⚠️ Observação importante (cota):** durante os testes de hoje o **limite
gratuito de leituras do Firestore (50k/dia) foi esgotado** (RESOURCE_EXHAUSTED)
— porque cada carregamento lê coleções inteiras (`listar` + filtro em memória).
Reseta à meia-noite (Pacífico). Reforça a pendência de **consultas indexadas
por data/sede** (reduzir leituras por carga) e/ou avaliar o plano Blaze. A
mudança otimista já ajuda (remove a rebusca por ação). Verificação ao vivo do
otimista ficou pendente por causa da cota; build/typecheck OK.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-12 — Agenda: faixa "fora do turno" com mais destaque

**O que mudou:** as células fora do horário do funcionário (ex.: manhã de
quem trabalha à tarde) estavam quase invisíveis (hachura rgba 0,05). Agora têm
fundo acinzentado leve (0,06) + hachura mais marcada (0,13) — claramente
"indisponível", mas ainda mais suave que o intervalo (verde-escuro), mantendo
a hierarquia visual. Verificado na coluna da Ana (13:00–22:00).

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Ajuste: blocos do login sumiam / caíam rápido demais

**O que mudou (bug do efeito anterior):** (1) "Sumindo" — o `forwards` só
preserva propriedades declaradas no quadro 100%, e eu só pus `transform` lá;
a opacidade revertia ao base (0). Corrigido fixando `opacity: 1` de 40% a
100%. (2) "Rápido demais" — duração 0,95s → **1,5s** e cascata mais espaçada
(delays 0,15s → 1,6s); brilho passa a iniciar em 3,4s+ (após assentarem).
Confirmado forçando a animação ao fim no preview: todos terminam em opacity 1
e posição final (o preview headless pausa animações, por isso parecia sumir lá).

**Arquivos:** `app/globals.css`, `app/login/page.tsx`.

---

## 2026-06-12 — Login: blocos caem com gravidade e quicam (Tetris)

**O que mudou (pedido fru-fru do usuário):** os blocos da partitura agora
**caem de cima (-220px) com aceleração de gravidade e quicam 2x** ao bater na
pauta, em cascata — como peças de Tetris assentando perto do texto/logo.
Keyframe `bloco-cai` (0,95s, timing-functions por segmento p/ gravidade +
ricochete), gated em `prefers-reduced-motion: no-preference`; fallback é um
fade simples (`bloco-aparece`). Optei pela queda-com-quique em CSS no lugar de
colisão física literal (seria pesado/arriscado numa tela de login).
Verificado: keyframe ativo, delays 0,1–0,65s. (Screenshot trava por causa do
brilho infinito — limitação do capturador, não do código.)

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Login: logo maior e centralizada no palco

**O que mudou:** a logo do palco estava pequena e encostada no canto. Agora o
palco é centralizado (alignItems/textAlign center), a logo cresceu para
`min(420px, 78%)` e ficou centralizada no topo, com headline, partitura e
rótulo também centralizados — presença "onipotente" pedida pelo usuário.

**Arquivos:** `app/login/page.tsx`.

---

## 2026-06-12 — Jornada por escala (sábado de 4h / 44h) + loaders espalhados

**Jornada variável:** funcionário agora tem `escala` (seg_sex / seg_sab /
todos) e horário próprio de sábado (`entrada_sabado`/`saida_sabado`, ex.: turno
de 4h sem intervalo). `jornadaDoDia(f, data)` resolve o horário efetivo por
data; `funcionarioNoDia` aplica na agenda/validação; `cargaSemanalMin` mostra
a carga (ex.: 44h) na tabela. A agenda usa o horário do dia, marca **Folga**
nos dias fora da escala (coluna bloqueada, como ausência) e o servidor bloqueia
alocação em folga (`FOLGA`) e valida o expediente do sábado. Padrão p/ dados
sem escala = seg_sex. **Verificado no Firebase real:** domingo→folga (422),
sábado 11:30→fora do expediente 07:00–11:00 (422), sábado 08:00→ok.
*Obs.: o dashboard ainda usa jornada padrão na média (aproximação).*

**Loaders Tetris espalhados:** carregamento inicial da Rotina do dia e do
Dashboard, e ação de salvar nos modais (CrudManager) agora mostram o
`<Carregando>` (bloquinhos caindo) em vez de nada/"Salvando…".

**Arquivos:** `types/comum.ts`, `types/Funcionario.ts`, `lib/schema.ts`,
`lib/memoryStore.ts`, `lib/calculations.ts`, `services/rotinasService.ts`,
`app/(app)/rotinas/page.tsx`, `app/(app)/funcionarios/page.tsx`,
`app/(app)/dashboard/page.tsx`, `components/CrudManager.tsx`.

---

## 2026-06-12 — Loading "Tetris" (bloquinhos caindo) no lugar do spinner

**O que mudou:** componente `Carregando` com bloquinhos coloridos
(azul/amarelo/verde/vinho, estilo tijolo do sistema) que caem com gravidade e
empilham num loop — remete à agenda de blocos do Orkestria. Substitui o texto
"Carregando…" no `CrudManager` (vale para todas as listas: funcionários,
sedes, locais, tarefas, ausências, parâmetros, usuários, histórico). Tem texto
opcional e um `role=status` oculto p/ leitores de tela. Verificado: keyframe
`tetris-cai` ativo (1,8s), 4 blocos empilhando (screenshot).

**Reutilizável** em outros loadings (rotinas/dashboard) — basta importar
`<Carregando />`.

**Arquivos:** `components/Carregando.tsx`, `app/globals.css`,
`components/CrudManager.tsx`.

---

## 2026-06-12 — Animações mais suaves na Rotina do dia

**O que mudou (feedback "tá muito seco"):** entrada da página mais macia e
viva, sem atrapalhar o uso. (1) `.entra*` com easing cubic-bezier suave e
0,42s (antes 0,25s ease-out), + `.entra-4`. (2) Colunas de funcionário
surgem em **cascata** na agenda (`.col-agenda`, delay via `--d` por índice,
limitado a 8). (3) Cards da paleta com **leve elevação no hover** (afinidade
de arraste). (4) Cards de rotina **nascem com pop** ao serem criados/soltos
(`.pop-card`; só anima no mount, não a cada re-render). Mantido `backwards`
em tudo (não quebra os modais). Verificado: cascata 0/0,05/0,1s, pop nos 3
cards de 12/06, 0 erros.

**Arquivos:** `app/globals.css`, `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-12 — Brilho animado nos blocos da partitura (login)

**O que mudou:** os blocos da partitura, além de entrarem em sequência,
agora têm um brilho suave que os varre em cascata (loop lento de 5,5s,
delays escalonados via `--brilho-delay` inline) — como uma batuta passando
pela partitura. Implementado com `::after` + `overflow:hidden`, dentro de
`@media (prefers-reduced-motion: no-preference)` para respeitar quem prefere
menos animação. Verificado: ::after com `bloco-brilho`, delays 1,2s→3,9s.

**Arquivos:** `app/globals.css`, `app/login/page.tsx`.

---

## 2026-06-12 — Tela de login redesenhada (split + Google)

**O que mudou:** login virou split-screen. Esquerda = "palco" evergreen com a
logo (versão marfim), headline "A rotina da sua equipe, orquestrada." e uma
**partitura animada** (blocos de agenda azul/verde/amarelo/vinho sobre pautas,
revelados em sequência) — amarra o nome à função. Direita = formulário limpo
(e-mail/senha, Entrar) + divisor "ou" + **botão "Entrar com Google"** com o G
oficial. Responsivo: <880px empilha e esconde a partitura. Verificado:
2 colunas no desktop, 1 no mobile, sem estouro, 0 erros de console.

**Importante:** o botão do Google é **só visual por enquanto** — ao clicar
mostra aviso "será habilitado em breve". Tornar funcional = item de Firebase
Authentication (verificar ID token no servidor + casar com a tabela usuarios).

**Arquivos:** `app/login/page.tsx`, `app/globals.css`.

---

## 2026-06-12 — Correção: fichas saíam 2 por página na impressão

**O que mudou (bug reportado):** ao imprimir, duas fichas caíam na mesma
página. O `page-break-after: always` não era respeitado de forma consistente.
Trocado pelo padrão confiável de "um por página": `page-break-before: always`
em cada ficha após a primeira (`.ficha-impressao + .ficha-impressao`) +
`break-inside: avoid` para não partir uma ficha no meio. Também adicionado
`print-color-adjust: exact` para as faixas coloridas do cabeçalho saírem na
impressão. Verificar via Ctrl+P (mudança só em @media print).

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Balão de ajuda no estilo "Partitura"

**O que mudou:** o balão flutuante do (?) ganhou a identidade do sistema —
fundo marfim (--cartao), borda firme em tinta evergreen, barra vinho de 5px à
esquerda (assinatura dos alertas) e sombra dura (offset 4px sem blur), no
lugar do balão escuro genérico. Verificado via estilos computados.

**Arquivos:** `components/CrudManager.tsx`.

---

## 2026-06-12 — Ajuda (?) virou balão flutuante no hover

**O que mudou (preferência do usuário):** a ajuda dos campos deixou de
expandir uma caixa inline (que empurrava o formulário) e passou a ser um
**balão flutuante** que aparece ao passar o mouse (ou focar pelo teclado) no
(?). Renderizado em portal no `<body>` com posição fixed calculada a partir
do ícone (centralizado, com flip para cima quando perto do rodapé), z-index
alto e `pointer-events:none` — nunca é cortado pelo modal. Some ao tirar o
mouse/foco. Conteúdo das dicas inalterado.

**Arquivos:** `components/CrudManager.tsx`.

---

## 2026-06-12 — Ajuda contextual (?) nos campos dos modais

**O que mudou (pedido do usuário, foco em leigos):** todo campo de cadastro
pode ter uma `dica` que aparece como um botão **(?)** ao lado do rótulo;
clicar abre/fecha uma caixa com a explicação em linguagem simples. Mecanismo
único no `CrudManager` (vale para todos os modais). Dicas escritas para os
campos com jargão: Tarefas (regra de cálculo, tempo base, quantidade,
frequência, restrição de gênero, etc.), Funcionários (jornada/intervalo),
Locais (metragem/tipo), Parâmetros (chave/valor/escopo) e Usuários (perfil).
Reseta ao abrir/trocar registro. Verificado: 9 campos com (?) no modal de
tarefa, explicação expande ao clicar.

**Arquivos:** `components/CrudManager.tsx`, `app/(app)/tarefas/page.tsx`,
`app/(app)/funcionarios/page.tsx`, `app/(app)/locais/page.tsx`,
`app/(app)/parametros/page.tsx`, `app/(app)/usuarios/page.tsx`.

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
