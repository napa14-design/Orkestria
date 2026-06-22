# 📓 Diário de mudanças — Orkestria

> **Convenção:** toda mudança no sistema gera uma nova entrada **no topo** deste
> arquivo (a entrada mais recente é sempre a primeira). Cada entrada tem data,
> título, o que mudou e os arquivos principais tocados. Quem for trabalhar no
> projeto (pessoa ou IA) deve ler a primeira entrada para saber o estado atual.

---

## 2026-06-22 — OMR validado em scan real (fecha a Onda 4)

- Teste de ponta a ponta com **scan real**: ficha impressa, preenchida à mão e
  fotografada (celular, imagem torta 1070×1500). O leitor `lib/omr.ts` rodado
  sobre a foto **acertou tudo**: QR decodificado (`ORK1|sede_aldeota|...|f1`),
  **12 tarefas + 10 EPIs** lidos corretamente, alinhamento pelos fiduciais ok.
- **Limiar 0,12 confirmado**: pegou até marcas fracas; os 2 traços mais fininhos
  (1 tarefa + 1 EPI) foram lidos como marcados mas sinalizados **"revisar"** —
  comportamento desejado (não chuta, pede conferência humana).
- Recomendação de uso: orientar a equipe a fazer **X cheio dentro da caixa**
  (ponto/risco fino cai em "revisar").
- `docs/08`: Onda 4 (confirmação por ficha/OMR) passou de 🟡 parcial → ✅ **feito**,
  com o parágrafo atualizado para o que foi entregue de fato (PDF + leitor TS no
  navegador, sem serviço externo). Sem mudança de código — só validação e docs.

---

## 2026-06-22 — Ficha ocupa a folha A4 inteira (+ área de observações)

- O cartão da ficha passou a ocupar **a folha A4 inteira** (antes terminava no
  meio, com vão branco embaixo — ficava feio). `CARD.yBot` desceu de 250 → 42 e
  os fiduciais de baixo acompanharam (`FID.BR/BL` → y56).
- Conteúdo redistribuído ao longo da página: tabela de tarefas no topo (linhas
  um pouco mais espaçadas, `TAREFA.delta` 21→24), **bloco de EPIs mais embaixo**
  (`EPI.linha0` 388→350), nova área **"Observações / ocorrências do dia"** com
  linhas para anotar preenchendo o rodapé, e **assinaturas na base** (`yBot+44`).
- Geometria é fonte única: o leitor OMR (`lib/omr.ts`) acompanhou os fiduciais e
  as caixas automaticamente (homografia agora usa cantos mais distantes — leitura
  até mais robusta).
- Verificado por imagem: ficha curta (2 tarefas) e ficha cheia (12 tarefas + 10
  EPIs) — ambas preenchem a folha sem colisões e sem vão branco no fim.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`.

---

## 2026-06-22 — Ficha: bloco de EPIs em 2 colunas + mais EPIs no exemplo

- O bloco de EPIs da ficha virou **2 colunas** (cabe ~10 EPIs sem bater nas
  assinaturas; antes só ~5 em coluna única). Geometria via novo helper
  `epiPos(i)` em `lib/fichaGeometria.ts` (fonte única) — usado pelo **gerador**
  (`services/fichaPdf.ts`) E pelo **leitor OMR** (`lib/omr.ts`), que continuam
  alinhados por construção.
- Dados de exemplo enriquecidos: de 1 para **8 EPIs** no catálogo (luvas, máscara
  PFF2, botas, avental, óculos, touca, luvas de raspa, protetor auricular),
  ligados às tarefas do funcionário-exemplo — a ficha de exemplo agora lista 8.
- Verificado: ficha-gabarito gerada (`?marcar=todas`) renderizada em imagem
  mostra os 8 EPIs em 2 colunas, todos marcados; ordem da tela Conferir bate com
  a do gerador (rotinas por horário + união em ordem). EPI não bloqueia alocação
  (`validations.ts:121`), então ligar EPIs às tarefas é seguro.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`,
  `lib/memoryStore.ts`.

---

## 2026-06-19 — Removida a cortina de entrada

- A animação de cortina ao logar foi **removida** (decisão do time). O login
  continua indo direto para `/inicio`, sem transição.
- Apagado `components/CortinaEntrada.tsx`; removidos o uso no `AppShell`, o
  bloco CSS `.cortina-*` em `globals.css` e o flag `sessionStorage` no login.
- Arquivos: `components/AppShell.tsx`, `app/login/page.tsx`, `app/globals.css`,
  `components/CortinaEntrada.tsx` (excluído).

---

## 2026-06-19 — Cortina com cara de teatro (bandô drapeado)

- A cortina de entrada ganhou um **bandô (sanca) com swags curvos no topo** —
  a assinatura visual da cortina de teatro — desenhado em SVG (curvas de
  verdade), que **sobe** (`translateY`) ao abrir, enquanto as laterais franzem
  para os lados.
- Laterais ganharam **brilho curvo (sheen)** e **sombra de drapeado** na borda
  interna (radial-gradients) para tirar o aspecto chapado; barra inferior agora
  **reta** (encosta no "chão"), em vez do serrilhado que parecia renda.
- Detalhe técnico: o `<svg>` do bandô vai dentro de um `<div>` wrapper porque,
  com `viewBox`, o SVG tende a se dimensionar pela proporção e não preenchia a
  largura toda; o div dimensiona certo e o svg preenche 100%×100%.
- Arquivos: `app/globals.css` (`.cortina-*`), `components/CortinaEntrada.tsx`.

---

## 2026-06-19 — Cortina mais suave (veludo que franze)

- Refino da cortina de entrada para um gesto mais macio e menos rígido:
  removido o fio dourado reto do centro (agora um vinco suave por gradiente),
  **barra inferior ondulada** em vez de reta (máscara radial), pregas de veludo
  mais sutis, e ao abrir a cortina **franze para os lados** (`scaleX`) enquanto
  desliza — com easing mais lento e macio (1,8s, `cubic-bezier(0.3,0.02,0.12,1)`).
- Arquivos: `app/globals.css` (`.cortina-*`), `components/CortinaEntrada.tsx` (tempo).

---

## 2026-06-19 — Cortina de teatro abre ao entrar (pós-login)

- Toque lúdico no tema "Partitura": ao logar, uma **cortina de veludo amaranto**
  cobre a tela e **abre deslizando para os lados**, revelando a tela inicial.
- Como funciona: o login marca `sessionStorage["ork:cortina"]` e manda para
  `/inicio`; o componente `CortinaEntrada` (montado no `AppShell`) lê o flag no
  mount, desenha as duas metades fechadas, dá um beat e as desliza para fora
  (transição de 1,35s), depois se desmonta. Roda **uma vez por login** e
  **respeita `prefers-reduced-motion`** (não anima).
- Login agora vai para `/inicio` (era `/rotinas`) — coerente com a tela inicial
  orientadora.
- Arquivos: `components/CortinaEntrada.tsx` (novo), `components/AppShell.tsx`,
  `app/login/page.tsx`, `app/globals.css` (estilos `.cortina-*`).

---

## 2026-06-19 — Tela "Da ata ao sistema" (transparência para a direção)

- Nova tela **`/da-ata`**: painel que mostra, lado a lado, cada ponto levantado
  na reunião de alinhamento (16/06/2026) e na pré-análise **× o que o Orkestria
  faz em resposta**, com selo de status (Entregue · Parcial · Decisão/cautela) e
  placar no topo (24 pontos: 19 entregues, 1 parcial, 4 decisão/cautela).
  Conteúdo fiel a `docs/08` e `docs/09` — sem inventar; pendências e decisões em
  aberto ficam explícitas.
- 10 blocos: cálculo de tempo, previsto/realizado, criticidade, faltas/remanejo,
  serviços eventuais, ociosidade por sede, conformidade/EPI, confirmação por
  ficha/OMR, calendário acadêmico e produtividade/dados sensíveis.
- **Acesso:** item "Da ata ao sistema" no menu Sistema + atalho na tela Início.
- Arquivos: `app/(app)/da-ata/page.tsx` (novo), `components/AppShell.tsx`,
  `app/(app)/inicio/page.tsx`.

---

## 2026-06-19 — Passos do dia inteligentes + favicon novo

- **Passos inteligentes** na faixa da agenda: **Faltas** ganha destaque (âmbar)
  e contagem quando há ausências no dia; **Registrar o realizado** vira botão
  primário com a contagem de tarefas ainda não lançadas (`N a registrar`), e
  vira "✓ Realizado lançado" quando tudo já foi lançado. Usa um novo SWR
  `/api/execucoes?de&ate` para saber o que falta.
- **Dedup:** removido o "🖨 Fichas" da barra de filtros (agora só na faixa).
- **Favicon novo** (`app/icon.svg`): tile evergreen + O amaranto + 3 barras
  marfim ascendentes (símbolo do Orkestria), sem a batuta que poluía no tamanho
  pequeno.

**Verificado (DATA_SOURCE=memory):** build/lint ok; faixa mostra "⚠ Faltas (1)"
(ausência do dia) e "✅ Registrar o realizado (3)" em destaque (3 rotinas sem
execução). Console limpo. Screenshot do favicon não capturou (timeout do
ambiente) — geometria conferida; visível no painel de preview. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx`, `components/agenda/FiltersBar.tsx`,
`app/icon.svg`.

---

## 2026-06-19 — Faixa "Passos do dia" na agenda

Reúne o fluxo diário do supervisor numa linha só, no topo da agenda (modo dia):
- **↺ Repetir o dia anterior (DD/MM)** — só aparece quando há dia anterior com
  rotina (o botão de 1 clique já existente).
- **⚠ Faltas (N)** — link para Ausências, com a contagem de ausentes do dia.
- **🖨 Imprimir fichas** — abre o PDF (data/sede atuais).
- **✅ Registrar o realizado** — link para Acompanhamento.
- **❔ Como usar** — a ajuda da agenda.
No modo semana, mostra só a ajuda.

**Verificado (DATA_SOURCE=memory):** build/lint ok; a faixa renderiza com
"Faltas (1)" (ausência do dia), e os links apontam para /ausencias,
/api/fichas/pdf?data&sede e /acompanhamento; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-19 — Dia a dia do supervisor: "Repetir o dia anterior" em 1 clique

**Contexto:** o supervisor montou que a rotina **quase sempre se repete**. O
"Duplicar / Modelos" existente é completo mas pesado para o uso diário. Foco no
atalho de todo dia.

**O que mudou (`app/(app)/rotinas/page.tsx`):**
- **Botão "↺ Repetir o dia anterior (DD/MM)"** na barra de ação da agenda:
  copia, num clique, as tarefas do **último dia com rotina** (antes da data
  atual, da sede) para o dia aberto — reusa `POST /api/rotinas/duplicar`
  (conflitos pulados). A data-fonte sai do `historico` já carregado.
- **Aviso de "dia vazio"**: quando o dia não tem rotina e existe um dia anterior
  com rotina, um painel convida a repetir ("Dia ainda vazio… copiar o dia
  anterior — DD/MM · N tarefas").

**Verificado (DATA_SOURCE=memory):** build/lint ok; em 20/06 (vazio), o aviso e
o botão apareceram apontando 19/06 (3 tarefas); ao clicar, **3 tarefas copiadas**
para 20/06 e o aviso sumiu. Console limpo. `.env` restaurado.

**Próximo (mesmo tema, se quiser):** deixar mais à mão os outros passos diários
que o supervisor citou — tratar faltas/ausências, imprimir fichas (já no botão
🖨) e registrar o realizado.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-18 — Usabilidade: tela Início, primeiros passos/telas vazias e ajuda da agenda

Três melhorias de "mais fácil e intuitivo" (escolhidas pelo usuário):

- **Tela Início** (`/inicio`, server component): saudação com o nome, atalhos
  grandes (Rotina do dia, Conferir ficha, Dashboard, Acompanhamento) e um guia
  **"Comece por aqui"** (Sede → Local → Tarefa → Funcionário → Montar a rotina),
  cada passo linkado. O pós-login e o logo agora apontam para `/inicio` (antes
  caía direto na agenda). Item "Início" no menu Operação. Hover nos cartões
  (`globals.css`).
- **Telas vazias acolhedoras** (no `CrudManager`, cobre todos os cadastros):
  sem dados → convite + botão "criar o primeiro"; busca sem resultado →
  "Nada encontrado para …". Prop `vazio` com mensagens sob medida em Sedes,
  Locais, Tarefas e Funcionários.
- **Ajuda da agenda** (`components/agenda/AjudaAgenda.tsx`): botão "❔ Como usar"
  na tela de rotinas abre um modal com legenda — montar/mover/redimensionar,
  blocos de 15 min, cores do card, ocupação/ociosidade, coluna bloqueada e o
  painel "Ficou de fora hoje".

**Verificado (DATA_SOURCE=memory):** build/lint ok; Início renderiza saudação +
atalhos + passos; modal de ajuda abre com todas as seções; busca vazia mostra a
mensagem amigável; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/inicio/page.tsx` (novo), `app/(app)/page.tsx` (redirect),
`components/AppShell.tsx`, `components/CrudManager.tsx`,
`components/agenda/AjudaAgenda.tsx` (novo), `app/(app)/rotinas/page.tsx`,
`app/(app)/{sedes,locais,tarefas,funcionarios}/page.tsx`, `app/globals.css`.

---

## 2026-06-18 — Fechamento: campo de EPI no realizado, idempotência e remoção da ficha HTML

Fecha as 3 pendências do fluxo da ficha:

- **Campo próprio de EPIs no realizado:** `ExecucaoRealizada.epis_confirmados`
  (CSV de nomes) + coluna no `SCHEMA`. A tela Conferir passa a enviar os EPIs
  confirmados nesse campo (antes iam na observação). `registrarExecucao`
  normaliza para "" quando não informado (Acompanhamento não envia).
- **Idempotência:** `registrarExecucao` virou **upsert por (rotina, data)** —
  reenviar a mesma ficha ATUALIZA a execução em vez de duplicar. Beneficia
  também o Acompanhamento.
- **Removida a página HTML** `app/(app)/rotinas/imprimir` (substituída pelo PDF
  de layout fixo; já estava sem link).

**Verificado (DATA_SOURCE=memory):** build/lint ok; 2 POSTs idênticos para r1 →
**1 execução** (sem duplicar) com `epis_confirmados="Luvas nitrílicas"`; console
limpo. `.env` restaurado.

**Arquivos:** `types/ExecucaoRealizada.ts`, `lib/schema.ts`,
`services/execucoesService.ts`, `app/(app)/conferir/page.tsx`, removido
`app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-18 — Ficha do app vira PDF de layout fixo (geometria unificada com o leitor)

**Contexto:** a ficha do app era HTML (`/rotinas/imprimir`), com geometria que
não casava exatamente com o leitor OMR (calibrado no PDF de exemplo). Para a
leitura ser 100% confiável a partir das fichas impressas pelo sistema, a ficha
passou a ser **PDF de layout fixo gerado no servidor**, usando as MESMAS
constantes do leitor.

**O que mudou:**
- **`lib/fichaGeometria.ts`** (novo): fonte ÚNICA da geometria (cartão,
  fiduciais, coluna "Feito", bloco de EPIs). `lib/omr.ts` foi refatorado para
  importar daqui — gerador e leitor nunca mais divergem.
- **`services/fichaPdf.ts`** (novo): gera o PDF com **pdf-lib** (uma página por
  funcionário com rotina no dia) — fiduciais, QR (`qrcode`), logo recortado,
  tabela com a caixa "Feito" no x/linha exatos, EPIs no rodapé, assinaturas.
  Aceita `marcarTodas` (gabarito de calibração).
- **`/api/fichas/pdf`** (novo): `GET ?data&sede` → PDF (`Content-Type:
  application/pdf`). `&marcar=todas` = gabarito de teste.
- Botão **🖨 Fichas** (FiltersBar) agora abre o PDF, não mais a página HTML.
- Novas deps: **pdf-lib**, **qrcode** (+ @types/qrcode).

**Verificado (DATA_SOURCE=memory):** gerei a ficha PELO APP (curl com sessão) em
2 versões e li com o leitor (determinístico): **gabarito → tudo marcada**
(tarefas+EPI), **normal → tudo vazia**; QR lido. Prova de que cada caixa
desenhada cai exatamente onde o leitor mede. Build/lint ok; `.env` restaurado.

**Notas:** a página HTML `/rotinas/imprimir` ficou sem link (substituída pelo
PDF) — pode ser removida depois. Falta: campo próprio p/ EPIs no realizado e
idempotência ao salvar.

**Arquivos:** `lib/fichaGeometria.ts` (novo), `lib/omr.ts`,
`services/fichaPdf.ts` (novo), `app/api/fichas/pdf/route.ts` (novo),
`components/agenda/FiltersBar.tsx`, `package.json`.

---

## 2026-06-18 — Conferir ficha: grava o realizado (fecha o ciclo) + leitura mais limpa

**Gravar o realizado:** o botão "Salvar realizado" na tela Conferir ficha agora
grava de verdade — uma `execucao_realizada` por rotina, reusando
`POST /api/execucoes` (`registrarExecucao`, que também atualiza o status da
rotina). Marcada → `conforme_planejado` (tempo = previsto); não marcada →
`nao_realizada` com justificativa automática ("Não confirmada na ficha (leitura
OMR)"). Os **EPIs** (sem campo próprio no schema) vão na `observacao`
("[Confirmado via ficha/OMR] · EPIs usados: …").

**Leitura mais limpa:** removidos os `%` e o "linha N" do corpo (eram ruído de
diagnóstico) — % só no tooltip. Tabela casada: Horário · Tarefa · Feito
(feito/não + selo "revisar" só em marca fraca). Leitura bruta (ficha sem
rotinas): contagem + chips numerados verde/cinza.

**Verificado (DATA_SOURCE=memory):** gerei uma ficha apontando para f1 (Maria,
2 rotinas hoje), marquei a tarefa 1 e o EPI, e "Salvar" → 2 execuções gravadas
(r1 conforme_planejado/80min, r2 nao_realizada/0), status das rotinas atualizado
(t1 realizada, t2 não realizada), EPI na observação. Build/lint ok, console
limpo. `.env` restaurado.

**Pendente:** unificação de geometria (ficha do app como PDF de layout fixo,
casando 100% com o leitor); campo próprio p/ EPIs no realizado (hoje na
observação); evitar regravar (idempotência) se salvar a mesma ficha 2×.

**Arquivos:** `app/(app)/conferir/page.tsx`.

---

## 2026-06-18 — OMR lê os EPIs (bloco no rodapé) + EPIs movidos para o rodapé na ficha

**Contexto:** o leitor lia só a coluna "Feito" das tarefas; faltavam os EPIs.
Os EPIs ficavam inline no topo (posições variáveis, difíceis de localizar). A
pedido, foram para o **rodapé** (aproveita o espaço em branco e dá posição fixa).

**O que mudou:**
- **`lib/omr.ts`** + **`omr-service/reader.py`**: nova geometria do bloco de
  EPIs (coluna fixa, `EPI_X=76`, `EPI_LINHA0=382`, `EPI_DELTA=18`) e leitura dos
  EPIs igual às tarefas. `lerFicha` aceita `numEpis` (determinístico) e retorna
  `epis: []`.
- **`app/(app)/conferir/page.tsx`**: deriva os EPIs do dia (união dos requisitos
  tipo `epi` das tarefas), lê com `numTarefas`+`numEpis` e mostra um bloco
  **"EPIs utilizados"** editável (com flag "revisar").
- **`app/(app)/rotinas/imprimir`**: os EPIs saíram do topo e viraram um bloco
  **"EPIs utilizados (marque o que usou)"** no rodapé, antes das assinaturas.
- Novo PDF de exemplo gerado em Downloads com os EPIs no rodapé.

**Verificado (DATA_SOURCE=memory):** build/lint ok; gerei uma ficha de teste com
marcas conhecidas (tarefas 1,3,6 + EPI 1) e rodei o leitor TS no navegador em
modo determinístico — leu tarefas `1:X 2:- 3:X 4:- 5:- 6:X 7:- 8:-` e **EPI
`1:X`**, exato. `.env` restaurado.

**Pendente:** gravar `execucoes_realizadas`; e a unificação de geometria
ficha-do-app × leitor (hoje o leitor casa com o PDF de exemplo; a ficha HTML do
app é visualmente igual mas a leitura fina exige uma geometria única — ideal:
ficha gerada como PDF de layout fixo).

**Arquivos:** `lib/omr.ts`, `omr-service/reader.py`,
`app/(app)/conferir/page.tsx`, `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-18 — Leitor OMR no NAVEGADOR (TypeScript) + tela "Conferir ficha"

**Contexto:** decidido manter tudo no Vercel (sem serviço externo). Portei o
leitor OMR do Python para **TypeScript rodando no navegador** e criei a tela de
upload. O `omr-service/` Python continua como referência/calibração.

**O que mudou:**
- **`lib/omr.ts`** — porte 1:1 do leitor: cinza + Otsu, detecção dos 4 fiduciais
  por **componentes conectados** (escolhendo os 4 pontos extremos — robusto ao
  cartão não preencher a imagem), **homografia** (PDF→pixel) e medição da tinta
  de cada caixa. QR via **jsQR** (nova dep). Sem WASM/serviço externo.
- **`app/(app)/conferir/page.tsx`** — sobe/fotografa a ficha → canvas → `lib/omr`
  lê QR + caixas → casa com as `rotinas_planejadas` do dia (ordenadas) e mostra
  o realizado **editável** (com flag "revisar" para marca fraca). Sem casamento
  (QR sem rotinas) mostra a leitura bruta para diagnóstico.
- Menu: **Operação → Conferir ficha**.

**Verificado (DATA_SOURCE=memory):** build/lint ok; carreguei uma das fichas
reais escaneadas (Elenice) no navegador → o leitor TS deu **8 caixas · 6
marcadas · 1 a revisar**, idêntico ao Python e ao visual (inclusive sinalizando
o ponto fraco de 16%). QR lido. `.env` restaurado.

**Pendente:** gravar o realizado (`execucoes_realizadas`) — botão "Salvar (em
breve)"; e validar o **casamento QR→rotinas** com dados reais (o QR de exemplo
F001 não existe nos dados de memória).

**Arquivos:** `lib/omr.ts` (novo), `app/(app)/conferir/page.tsx` (novo),
`components/AppShell.tsx`, `package.json` (+jsqr).

---

## 2026-06-18 — Leitor OMR (Python/OpenCV) das fichas — protótipo validado

**Contexto:** o usuário imprimiu as fichas de exemplo, marcou à mão de vários
jeitos (X, tique, risco, ponto, preenchido, vazias) e mandou escaneado
(CamScanner, 4 fichas). Objetivo: provar que dá para ler automaticamente.

**O que foi feito — novo módulo `omr-service/` (roda fora do Vercel):**
- `reader.py` — núcleo: decodifica o **QR** (identifica sede·data·funcionário),
  acha os **4 fiduciais** dos cantos, **endireita** (perspectiva) e mede a
  **tinta dentro de cada caixa "Feito"** → marcada/vazia. Não lê letra; só mede
  tinta, então qualquer estilo de marca funciona. Geometria = a do gerador de
  fichas (pontos PDF). Marca fraca/ambígua → `confianca: "baixa"` (revisão).
- `app.py` — serviço HTTP FastAPI (`POST /ler`).
- `testar.py` — CLI de validação contra PDF/imagem.
- `requirements.txt`, `README.md`, `.gitignore`.

**Validado nas 4 fichas reais escaneadas:** QR lido nas 4; leitura **bateu marca
a marca** — Edineia 6/6, Elenice (vazia, marcada×5, vazia → flag "revisar" no
ponto fraco 0.182), Antônio 6/6, David (feita,vazia,feita,vazia,vazia,feita).
Sem letra, sem padrão de marca exigido.

**Notas:** em produção o `num_tarefas` vem do QR→banco (leitura determinística,
sem adivinhar nº de linhas). Próximo: tela de upload no app + casar com
`rotinas_planejadas` → gravar `execucoes_realizadas`; baixa confiança → revisão.

**Arquivos:** `omr-service/` (novo).

---

## 2026-06-18 — Logos sem margem branca (recorte na fonte) em todo o app

**Contexto:** as logos pareciam pequenas porque os PNGs tinham **margem
transparente embutida** (43–55% da altura desperdiçada). Auditadas todas.

**O que mudou:**
- **Recorte na fonte** dos 4 PNGs em `public/` (sobrescritos na área útil):
  `logo-fundo-claro` 1254² → 1031×686, `logo-fundo-escuro` → 1027×691,
  `logo-horizontal-fundo-claro` 1983×793 → 1637×358, `logo-horizontal-fundo-escuro`
  → 1542×345. (SVGs de símbolo/favicon são vetoriais e não entram como logo na UI.)
- **Reajuste de tamanho** nos 4 usos (a altura caiu, já que agora preenchem):
  - `AppShell` (header escuro): 52→**30 px**, sem o `margin -8px` de compensação.
  - `app/(app)/rotinas/imprimir` (ficha): 44→**34 px**, sem margem.
  - `app/(app)/relatorios` (relatório): 44→**32 px**, sem margem.
  - `app/login` (logo quadrado): removidas as margens negativas `-48/-54px` que
    compensavam o vazio; largura `min(420,78%)`→`min(300,62%)`, `margin 0 auto 8px`.

**Verificado (DATA_SOURCE=memory):** build/lint ok; via DOM, cada `<img>` agora
carrega o natural recortado (login 1027×691→300×202; header 1542×345→134×30;
ficha 1637×358→155×34) sem espaço branco; console limpo. `.env` restaurado.

**Arquivos:** `public/logo-*.png` (4, recortados), `components/AppShell.tsx`,
`app/(app)/rotinas/imprimir/page.tsx`, `app/(app)/relatorios/page.tsx`,
`app/login/page.tsx`.

---

## 2026-06-17 — Distribuição automática (sugestão) no Remanejo

**Contexto:** quando alguém falta, as tarefas viram órfãs e o supervisor
remaneja na mão. Agora há um botão que **sugere a distribuição** das órfãs entre
quem tem folga — o supervisor revisa e confirma (servidor revalida ao aplicar).

**O que mudou em `/remanejo`:**
- Botão **"✨ Distribuir automaticamente (sugestão)"**: encaixe ganancioso —
  ordena as órfãs por **criticidade → prioridade → horário** e, para cada uma,
  escolhe o melhor candidato **elegível**, preenchendo os destinos.
- **Elegibilidade espelha as regras do servidor:** gênero (ex.: banheiro
  feminino só mulher), **conformidade** (aptidão/treinamento não vencidos; EPI
  não bloqueia), **expediente** do candidato (não inicia fora) e **intervalo**,
  e **sem conflito** de horário (considerando atribuições já sugeridas na rodada).
- **Critério de sede:** prefere colega da **mesma sede**; só cruza sede quando
  não há ninguém elegível na sede do ausente.
- O que não consegue encaixar fica **sem candidato** e é avisado na mensagem
  ("N sem candidato disponível") — sem propor quem seria recusado.
- Botão **"Aplicar todas as sugestões"** (sequencial, cada uma revalidada).
- Novas leituras na tela: `/api/requisitos` e `/api/qualificacoes`.

**Verificado (DATA_SOURCE=memory):** build/lint ok. Maria (f1) em falta + José
liberado → sugeriu a "Limpeza concorrente" para **José (mesma sede)** e deixou a
"Higienização de banheiro feminino" **sem candidato** (exige treinamento que só a
Maria tinha; ninguém qualificado/disponível). "Aplicar todas" gravou só a
viável (t1→José), sem erro, e manteve a órfã restante para decisão manual.
Console limpo. `.env` restaurado.

**Arquivo:** `app/(app)/remanejo/page.tsx`.

---

## 2026-06-17 — Duração por dia para presença/plantão (e regra manual)

**Contexto:** tarefas de **presença/plantão** e de **regra manual** têm duração
que varia a cada dia (a ata: "toda quarta a fulana tem plantão, um dia 20 min,
outro 15"). A duração é da **alocação**, não da tarefa.

**O que mudou:**
- Ao **soltar** uma tarefa de presença ou regra manual na agenda, abre o modal
  **"Quanto tempo hoje?"** (presets 15/30/60/90/120 + campo livre em minutos). O
  card entra já com a duração escolhida; cancelar aborta o drop.
- **Servidor passa a respeitar a duração informada** (`duracao_min` em
  `NovaRotina`) — **só** para tarefas `presenca` ou regra `manual`; para as
  demais continua calculando (m² × ambiente × serviço). Antes o servidor sempre
  recalculava e a escolha do supervisor se perdia.
- Tarefas de tempo fixo/manual não recebem fator de intensidade (já vigente), e
  presença não cobra desvio — então o número fica exatamente o escolhido.

**Verificado (DATA_SOURCE=memory):** build/lint ok; soltei "Acompanhamento de
pátio" (presença) às 14:00, escolhi 1h30 → rotina gravada com previsto/visual 90
e fim 15:30; modal aparece e cancelar aborta; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx` (modal + duracao_min no POST),
`services/rotinasService.ts` (`NovaRotina.duracao_min` + uso no `createRotina`).

---

## 2026-06-17 — Cabeçalho da ficha enxugado (logo + nome + sede)

A pedido: o cabeçalho de `/rotinas/imprimir` agora mostra só **logo + nome do
funcionário + sede·data**. Removidos "Ficha de rotina diária", a linha de
Expediente/Intervalo e a de Planejado. O **QR de leitura** e os marcadores
fiduciais permanecem (são funcionais, não informação). Imports
`jornadaLiquidaMin`/`tempoPlanejadoMin` removidos (sem uso). Verificado em
memória (build ok, screenshot, console limpo); `.env` restaurado.

**Arquivo:** `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-17 — Ficha OMR-ready (base para leitura automática por OpenCV)

**Contexto:** decidido o caminho da confirmação por **OMR clássico (OpenCV)** —
como a ficha é gerada por nós, basta detectar marcação (não precisa OCR de
letra). Esta entrega deixa a ficha pronta para leitura; o motor OpenCV é o
próximo spike.

**O que mudou em `/rotinas/imprimir`:**
- **QR code por ficha** (`qrcode.react`) com payload `ORK1|sede|data|funcionario`
  — o leitor decodifica e busca as rotinas dessa data/sede/funcionário na MESMA
  ordem de impressão (por horário) para casar cada linha sem ler texto.
- **Marcadores fiduciais** (4 quadrados pretos nos cantos da ficha) para alinhar/
  endireitar o scan.
- **Caixas de marcação reais** (`<Caixa>`, borda 2px #000, fundo branco): a
  coluna "Feito?" (Sim/Não em texto) virou uma única caixa "Feito" por linha; os
  EPIs viraram caixa + nome. Tudo #000/#fff para sair limpo no scan.
- Instrução curta ("Marque um X… não escreva sobre os quadrados dos cantos").
- Nova dependência: **qrcode.react ^4.2.0**.

**Verificado (DATA_SOURCE=memory):** build/lint ok; ficha renderiza com 4
fiduciais, QR (62px) e caixas reais (2 tarefas + 1 EPI na ficha da Maria);
screenshot confere; console limpo. `.env` restaurado.

**Próximo (spike 4.2):** motor OMR — OpenCV é Python/WASM, roda fora do Next
(worker Python ou OpenCV.js em route Node) recebendo o scan → casa com
`rotinas_planejadas` → gera `execucoes_realizadas`. Precisa de **scans reais**
para calibrar e da decisão de deploy.

**Arquivos:** `app/(app)/rotinas/imprimir/page.tsx`, `package.json`
(+qrcode.react), `docs/08`.

---

## 2026-06-17 — Correção: cards da agenda "sumiam" e geravam sobreposição fantasma

**Sintoma (relatado):** ao montar a agenda de vários funcionários, alguns cards
sumiam da tela; tentar pôr outra tarefa onde o servidor já tinha uma acusava
"Sobreposição com tarefa já planejada às HH:MM" mesmo sem nada visível; **F5
trazia tudo de volta**.

**Causa:** todas as rotinas do dia (todos os funcionários) vivem numa **única
chave SWR**. As mutações otimistas usavam `revalidate: false` — então o cache do
cliente **nunca reconciliava com o servidor**. Numa adição concorrente que se
perdesse no cache (ou num `rollbackOnError` com snapshot defasado), o card
desaparecia da tela embora gravado. Como a validação local só enxerga o cache,
ela não via a tarefa escondida → o servidor recusava por sobreposição → o erro
revertia ainda mais cards. Só o F5 (recarga) ressincronizava.

**Correção:** os quatro handlers (`soltarNova`, `mover`, `redimensionar`,
`remover`) passaram de `revalidate: false` → **`revalidate: true`**. O
`populateCache` continua dando o feedback imediato; a revalidação (deduplicada
pela SWR) reconcilia o cache com o servidor após cada operação. **Sem flicker**,
pois `keepPreviousData` já está ligado no `SWRConfig` global (a grade não
desmonta durante a revalidação).

**Verificado (DATA_SOURCE=memory):** build/lint ok; teste determinístico —
inserida uma rotina "por trás" do cliente via API (servidor=4, tela=3); ao
remover um card pela UI, a revalidação **trouxe o card escondido à tela**
(tela=servidor=3, sem sobreposição fantasma). Console limpo. `.env` restaurado.

**Arquivo:** `app/(app)/rotinas/page.tsx` (4× `revalidate`).

---

## 2026-06-17 — Estudo da planilha real (Aldeota): granularidade 15 min, não-limpeza e refino do tempo

**Contexto:** o usuário enviou a planilha "Rota de Trabalho ASG · Aldeota" (rota
operacional real). Analisada e usada para três ajustes concretos.

**1. Estudo documentado** em `docs/11-estudo-planilha-aldeota.md`: estrutura das
3 abas; descobertas — planejam em blocos de 15/10/5 min; a "Produtividade" deles
é m²÷tempo (resultado, não fórmula); muito tempo é não-limpeza (café, aguação,
recolhimento); "Setor"=Local, "Tipo de atividade"="limpeza de rotina <ambiente>",
"Ação"=POP.

**2. Catálogo de não-limpeza + refino do cálculo:**
- Nova categoria **"Apoio operacional"** (c8) e tarefas de exemplo **Café da
  sede** (fixo 60, crítica), **Recolhimento de materiais** (fixo 20), **Aguação
  de plantas** (fixo 15).
- **Refino:** a **intensidade do ambiente agora só incide em `por_m2`/
  `por_unidade`** (limpeza dimensionada pela área); tarefas de **tempo
  fixo/manual NÃO recebem intensidade** (café na copa = 60, não 78; reposição no
  banheiro = 15, não 23). O **fator de serviço** (rotina/pesada/desincrustante)
  continua em todas as regras (vidros fixo desincrustante = 80). Novo helper
  `multiplicadorTempo(tarefa, local)` compartilhado por `tempoPrevistoMin` e
  `SugestoesAjuste`.

**3. Granularidade fina (Onda 2 revista):** `bloco_agenda_min` 30 → **15**
(padrão + seed); `ALTURA_BLOCO` 40 → 30 px para a grade mais densa não ficar
gigante. Régua e snap da agenda agora de 15 em 15 min. Seed de rotinas
recalculado para 15 min.

**Verificado (DATA_SOURCE=memory):** build/lint ok; `/tarefas` mostra Café=1h,
Reposição=15min, Vidros=1h20, e as 3 tarefas de Apoio operacional; `/rotinas`
com régua 07:00·07:15·07:30…; console limpo. `.env` restaurado para `firebase`.

**Arquivos:** `lib/calculations.ts` (`multiplicadorTempo` + refino + padrão 15),
`components/SugestoesAjuste.tsx`, `components/agenda/AgendaGrid.tsx`
(`ALTURA_BLOCO`), `lib/memoryStore.ts` (categoria c8, tarefas t14–t16, p1=15,
rotinas r1–r3), `docs/03`, `docs/08`, `docs/11` (novo).

---

## 2026-06-17 — Onda 5.1 (pós-ata): tipo e grupo de sede

**Contexto:** base para comparar ociosidade entre unidades parecidas e para
visões agregadas por grupo (ex.: Sul 1/2/3). A 5.2 (dados de RH) segue em
estudo, sem decisão — idade/sexo continuam fora do motor (ver `docs/08`).

**O que mudou:**
- Sede ganhou **`tipo_sede`** (educacao_infantil · escola · faculdade ·
  administrativo · outros) e **`grupo`** (texto livre, ex.: "Sul", "Centro"),
  ambos opcionais. Cadastráveis na tela de Sedes (selos "Tipo / Grupo" na lista).
- `lib/schema.ts` (+2 colunas), seed das 3 sedes com tipo/grupo de exemplo.
- A folga-alvo de ociosidade **já é por sede** (`folga_minima_percentual`); o
  tipo/grupo é para categorização e comparação, não muda cálculo sozinho.

**Verificado (DATA_SOURCE=memory):** build/lint ok; `/sedes` lista a coluna
"Tipo / Grupo" com selos (Aldeota=Faculdade·Centro, DT=Escola·Sul,
Centro=Educação infantil·Centro); console limpo. `.env` restaurado para `firebase`.

**Pendente:** visão agregada por tipo/grupo (dashboard/remanejo); 5.2 dados de
RH (decisão jurídica — Davi Rocha).

**Arquivos:** `types/comum.ts` (+`TipoSede`), `types/Sede.ts` (+`tipo_sede`,
`grupo`), `lib/schema.ts`, `lib/memoryStore.ts`, `app/(app)/sedes/page.tsx`,
`docs/02`, `docs/08`.

---

## 2026-06-17 — Onda 4.1 (pós-ata): ficha de confirmação com EPIs

**Contexto:** o ASG não usa celular — a confirmação do que foi feito será por
**ficha de papel** (e, no futuro, leitura por OCR). Esta entrega cobre a ficha;
o OCR (4.2) fica como spike a decidir (ver `docs/08`).

**O que mudou:**
- A impressão `/rotinas/imprimir` ganhou, por ficha (funcionário/dia):
  - **Lista de EPIs obrigatórios** com caixa de confirmação, derivada dos
    `requisitos` tipo `epi` das tarefas do dia (ex.: "🧤 ( ) Luvas nitrílicas").
  - **Tipo de serviço** ao lado da tarefa quando não é rotina
    (ex.: "Higienização de banheiro · pesada").
  - (Checklist por ambiente "Feito? Sim/Não", anotações e assinaturas já
    existiam — o ASG só **confirma**.)
- Seed: a rotina de exemplo da higienização (r2) foi atualizada para o novo
  modelo de tempo (45 min / 60 visual / 2 blocos) — consistência da demo.

**Verificado (DATA_SOURCE=memory):** build/lint ok; ficha de Maria renderiza o
bloco "EPIS OBRIGATÓRIOS: ( ) Luvas nitrílicas" e a tarefa "Higienização de
banheiro · pesada"; console limpo. `.env` restaurado para `firebase`.

**Pendente:** 4.2 ingestão por OCR (spike — escolher serviço/lib + credenciais);
confirmação automática de EPI e reconhecimento facial dependem dessa ingestão.

**Arquivos:** `app/(app)/rotinas/imprimir/page.tsx`, `lib/memoryStore.ts`
(seed r2), `docs/08`.

---

## 2026-06-17 — Onda 3 (pós-ata): calendário acadêmico (período letivo)

**Contexto:** terceira onda. Tarefas que só fazem sentido com aula (ex.: limpeza
de sala) não devem ser cobradas em férias. (A Onda 2 — granularidade — foi
fechada só com documentação: o deslocamento já é parâmetro por sede e a grade
de 30 min é decisão consciente; ver `docs/08`.)

**O que mudou:**
- **Nova entidade `periodos_letivos`** (calendário acadêmico por sede):
  `sede_id`, `nome` (ex.: "2026.2"), `data_inicio`, `data_fim`, `dias_semana`
  (CSV de dias com aula), `ativo` + auditoria. CRUD completo no padrão do
  projeto: `types/PeriodoLetivo.ts`, `services/periodosLetivosService.ts`,
  rotas `app/api/periodos-letivos` (+`[id]`), tela
  `app/(app)/periodos-letivos/page.tsx` (CrudManager). **Escrita só de
  administrador** (`podeGerenciarCatalogo`); leitura para qualquer sessão.
- Item no menu **Estrutura → Calendário acadêmico** (só admin).
- **Tarefa ganhou `depende_calendario`** (checkbox + selo "📅 letiva"). Helper
  puro **`statusPeriodoLetivo(periodos, sede, data)`** em `lib/calculations.ts`
  retorna `dentro` | `fora` | `sem_calendario`.
- **Cobertura (`PendenciasPanel`)**: recebe `periodos` (a tela de rotinas busca
  por sede via SWR) e, para tarefas `depende_calendario`: **`fora` → não exige**
  (some das pendências); **`sem_calendario` com tarefa letiva devida → aviso
  forte** "Calendário acadêmico não cadastrado…" no topo da agenda.
- Seed: período "2026.1" de Aldeota (02/02–03/07, seg–sex) + `t6` (limpeza
  terminal) marcada como letiva.

**Verificado (DATA_SOURCE=memory):** build/lint ok; CRUD via API (lista, cria
201, edita 200, validação de período 422, exclui 200); cobertura testada nos 3
estados na agenda de Aldeota — **dentro** do período a tarefa letiva é cobrada
(1 periódica) sem aviso; com hoje **fora** (período só fim de semana) ela
**some**; **sem período** ela volta **com o aviso**. `.env` restaurado para
`firebase`.

**Arquivos:** `types/PeriodoLetivo.ts` (novo), `types/index.ts`,
`types/Tarefa.ts` (+`depende_calendario`), `lib/schema.ts` (+tabela +coluna),
`lib/memoryStore.ts` (seed), `lib/calculations.ts` (`statusPeriodoLetivo`),
`services/periodosLetivosService.ts` (novo),
`app/api/periodos-letivos/route.ts` (+`[id]/route.ts`, novos),
`app/(app)/periodos-letivos/page.tsx` (novo), `components/AppShell.tsx`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/rotinas/page.tsx`,
`app/(app)/tarefas/page.tsx`, `docs/02`, `docs/08`.

---

## 2026-06-17 — Onda 1 (pós-ata): modelo de tempo m²×ambiente×serviço + regra de horário

**Contexto:** primeira onda das evoluções decididas na ata de 16/06/2026. O
cálculo do tempo previsto passou a refletir o que o diretor descreveu:
**m² × tipo de ambiente × tipo de serviço** (base 1 m² ≈ 1 min).

**O que mudou:**
- **Intensidade migrou da CATEGORIA para o LOCAL.** Novo campo
  `Local.fator_intensidade` (leve 0,8 · normal 1,0 · densa 1,5; ausente/≤0 = 1).
  O fator da categoria **deixou de afetar o cálculo** (neutralizado no seed e
  removido do form/coluna de Categorias). A ação **"Recalibrar" continua** —
  ela mexe no `tempo_base_min`, é independente da intensidade.
- **Tarefa ganhou `tipo_servico`** (`rotina` 1,0 · `pesada` 1,5 ·
  `desincrustante` 2,0 — constantes calibráveis `FATOR_TIPO_SERVICO` em
  `lib/calculations.ts`). Select + selo na tela de Tarefas.
- `tempoPrevistoMin(tarefa, local)` **perdeu o 3º argumento** (categoria) e agora
  multiplica `base × fatorIntensidadeLocal(local) × fatorServico(tarefa)`.
  Atualizados os 6 call sites (rotinasService, TaskPalette, tarefas, rotinas,
  SugestoesAjuste, dashboard). `SugestoesAjuste` passou a dividir pelo fator do
  **local × serviço** ao sugerir novo tempo base.
- **Regra de horário (FORA_DO_EXPEDIENTE):** passou a bloquear **só o início**
  fora do expediente (`inicioMin < entrada || inicioMin >= saida`). Uma tarefa
  **pode terminar** depois da saída; **não pode iniciar** às/após a saída.
- Telas: **Locais** ganhou campo "Intensidade (fator)" + coluna; **Tarefas**
  ganhou "Tipo de serviço" + selo; **Categorias** teve o campo de intensidade
  ocultado (legado) com nota no subtítulo.
- Seed (`memoryStore`): banheiros/copa densos (1,5/1,3), área externa leve (0,8),
  higienizações `pesada`, vidros `desincrustante`; fator das categorias = 1.

**Verificado (DATA_SOURCE=memory):** build ok; `/tarefas` mostra os tempos
corretos (banheiro 45 min = 20×1,5×1,5; área externa 64 min = 0,4×200×0,8;
vidros 80 min = 40×2); regra de horário testada via API (inicia 15:30 e termina
17:30 → **passa**; inicia 16:00 = saída → **FORA_DO_EXPEDIENTE**). Console limpo.
`.env` restaurado para `firebase`.

**Pendente (transversal, não-código):** persistir a ata em
`docs/10-ata-2026-06-16.md`; estudar as planilhas das sedes (atividades
não-limpeza); demais ondas (2–5).

**Arquivos:** `types/comum.ts` (+`TipoServico`), `types/Local.ts`
(+`fator_intensidade`), `types/Tarefa.ts` (+`tipo_servico`), `lib/calculations.ts`,
`lib/validations.ts`, `lib/schema.ts`, `lib/memoryStore.ts`,
`components/SugestoesAjuste.tsx`, `components/agenda/TaskPalette.tsx`,
`services/rotinasService.ts`, `app/(app)/tarefas/page.tsx`,
`app/(app)/locais/page.tsx`, `app/(app)/categorias/page.tsx`,
`app/(app)/dashboard/page.tsx`, `docs/02`, `docs/03`, `docs/08`.

---

## 2026-06-16 — Fase F: login com Google (Firebase Auth)

**O que mudou:**
- **"Entrar com Google"** na tela de login (Firebase Auth, provedor Google que o
  usuário habilitou no console). Fluxo: popup do Google no cliente
  (`lib/firebaseWeb.ts`, SDK `firebase`) → ID token → `POST /api/auth/google` →
  **Admin SDK `verifyIdToken`** → e-mail precisa estar **cadastrado e ativo** em
  `usuarios` → cria a sessão normal (perfil/sede do cadastro). E-mail não
  cadastrado → 403. Convive com o login por e-mail/senha (não substitui).
- Helper `lib/firebaseAdmin.ts` (app Admin compartilhado) extraído; `firebaseClient`
  passou a reusá-lo. Config web é pública (hardcoded em `firebaseWeb.ts`).
- `middleware.ts`: `/api/auth/*` já era público (cobre a nova rota).
- Verificado: build ok; rota defensiva (sem token → 400; token inválido → 401 via
  Admin real). **O popup do Google deve ser testado por você no navegador** (não
  dá para automatizar headless).

**Para você testar / publicar:**
- Rodar `npm run dev` (DATA_SOURCE=firebase) e clicar "Entrar com Google" com uma
  conta cujo e-mail esteja cadastrado em `usuarios` (senão dá 403, que é o esperado).
- No deploy (Vercel), adicionar o domínio em **Authentication → Authorized
  domains** no console do Firebase.
- Nova dependência: `firebase` (SDK cliente) no `package.json`.

**Arquivos:** `lib/firebaseAdmin.ts` (novo), `lib/firebaseWeb.ts` (novo),
`lib/firebaseClient.ts`, `app/api/auth/google/route.ts` (novo), `app/login/page.tsx`,
`package.json` (+firebase), `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase F: login individual (senha por usuário)

**O que mudou:**
- **Senha por usuário** (`Usuario.senha_hash`, hash **scrypt** "salt:hash" em
  `lib/senha.ts`). O login verifica a senha individual; quem ainda não tem cai no
  `ACCESS_PASSWORD` como **bootstrap** (migração suave, nada quebra). Definida a
  senha individual, só ela vale.
- **Admin define** a senha de qualquer usuário (ação "Senha" em `/usuarios` +
  `POST /api/usuarios/[id]/senha`). **Self-service** em `/conta`
  (`POST /api/auth/senha`, usa o id da sessão). Link no nome do usuário (cabeçalho).
- **Segurança:** `getUsuarios` **remove `senha_hash`** da resposta (nunca vai ao
  cliente); senha nunca em texto puro.
- Verificado em memória: admin entra no bootstrap (200); senha definida para o
  supervisor → senha única passa a dar **401** e a individual **200**; self-service
  troca a própria e reloga; a API **não expõe** o hash. Build e console limpos.

**Decisão/escopo:** entreguei "login individual" de verdade dentro da sessão
HMAC atual (segura e verificável). **Trocar o provedor para Firebase Auth** segue
pendente — exige habilitar o Authentication no console do projeto e a config web
pública (apiKey etc.), que não está disponível aqui; é passo de produção.

**Arquivos:** `types/Usuario.ts`, `lib/schema.ts`, `lib/senha.ts` (novo),
`services/usuariosService.ts`, `app/api/auth/login/route.ts`,
`app/api/auth/senha/route.ts` (novo), `app/api/usuarios/[id]/senha/route.ts` (novo),
`app/(app)/usuarios/page.tsx`, `app/(app)/conta/page.tsx` (novo), `components/AppShell.tsx`.

---

## 2026-06-16 — Fase F: remanejo entre sedes + correção de conformidade no "mover"

**O que mudou:**
- **Tela `/remanejo`** (admin, multi-sede): lista as tarefas órfãs (de
  funcionários ausentes) de TODAS as sedes e sugere candidatos com folga,
  inclusive de **outra sede** (tag ↗). A movimentação usa o endpoint de mover
  existente, que valida jornada/conflito; respeita restrição de gênero no filtro
  de candidatos. Cruzar sedes é destacado (há deslocamento — combinar transporte).
- **Correção:** o caminho de "mover" (`updateRotina`) **não checava requisitos
  de conformidade** (só o `criarRotina` checava). Agora também valida aptidão/
  treinamento (faltando/vencido) no destino — fecha a brecha e protege o remanejo.
- Verificado em memória: Maria marcada ausente → r1/r2 órfãs; r1 → Carlos (DT,
  cross-sede) **200**; r2 (Higienização exige química) → Francisca (sem química)
  **422 REQUISITO_FALTANDO**; a tela lista a órfã e só oferece candidata feminina
  de outra sede (↗). Build e console limpos.

**Arquivos:** `services/rotinasService.ts` (conformidade no mover),
`app/(app)/remanejo/page.tsx` (novo), `components/AppShell.tsx`,
`docs/08-plano-evolucao.md`.

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
