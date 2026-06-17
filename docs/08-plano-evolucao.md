# Plano de evolução — execução das mudanças (pós pré-análise do diretor)

> Base: documento "Orkestria — Análise e pontos de evolução (pré-análise)" +
> estado real do código (junho/2026). Este plano sequencia os itens por
> **dependência** e **risco**, dizendo o que cada um toca no sistema e qual
> **decisão** precisa estar tomada antes de começar.
> Esforço: **P** pequeno (dias) · **M** médio (1–2 semanas) · **G** grande (projeto).

## Atualização pós-ata de alinhamento (16/06/2026)

A reunião conceitual (Murilo/Filipe/Guilherme) reorganizou as evoluções em
**ondas**. O detalhamento vivo está no plano de execução desta rodada; resumo:

| Onda | Tema | Status |
|---|---|---|
| **1** | **Modelo de tempo + regra de horário** | ✅ **feito** |
| **2** | Granularidade (manter 30 min visual; deslocamento já configurável por sede) | ✅ **feito** (config + nota) |
| **3** | Calendário acadêmico / período letivo | ✅ **feito** |
| 4 | Confirmação do executado (ficha de papel + OCR) | 🟡 **parcial** (ficha pronta; OCR = spike) |
| 5 | Ociosidade por sede/grupo + dados de RH (cautela jurídica) | 🟡 **parcial** (cadastro feito; visão agregada + RH pendentes) |

**Onda 1 (entregue):** o tempo previsto passou a ser
**m² × intensidade do ambiente × tipo de serviço** (base 1 m² ≈ 1 min). A
**intensidade migrou da categoria para o LOCAL** (`fator_intensidade`: leve 0,8
· normal 1,0 · densa 1,5) e a tarefa ganhou **`tipo_servico`** (rotina 1,0 ·
pesada 1,5 · desincrustante 2,0 — calibráveis em `lib/calculations.ts`). A
regra de horário passou a **bloquear só o início** fora do expediente: uma
tarefa pode terminar depois da saída, mas não pode iniciar às/após a saída.
O fator da categoria foi **neutralizado** (deixou de afetar o cálculo; a ação
"Recalibrar" continua, pois mexe no `tempo_base_min`).

**Onda 5 (parcial):** a Sede ganhou **`tipo_sede`** (educação infantil · escola
· faculdade · administrativo · outros) e **`grupo`** (ex.: "Sul"), cadastráveis
na tela de Sedes — base para comparar ociosidade entre unidades parecidas e para
visões agregadas por grupo. A **folga-alvo já é por sede**
(`folga_minima_percentual`), então a "ociosidade-alvo por tipo" se resolve hoje
configurando o parâmetro de cada sede. **Pendente:** a **visão agregada** por
tipo/grupo (dashboard/remanejo somando unidades). **5.2 (dados de RH):** segue
**em estudo, sem decisão** — idade e sexo **continuam fora** do motor de
produtividade/alocação (salvaguarda vigente); aptidões/restrições já cabem em
`qualificacoes`. Antes de qualquer uso de atributos de pessoa em produtividade,
passar pelo jurídico (Davi Rocha) — restrição preferencialmente por
**treinamento**, não por sexo.

**Onda 4 (parcial):** a **ficha de confirmação imprimível** (4.1) está pronta —
`/rotinas/imprimir` agora lista, por funcionário/dia, os **EPIs obrigatórios**
(derivados dos requisitos tipo `epi` das tarefas, com caixa de confirmação) e
marca o **tipo de serviço** (pesada/desincrustante) em cada tarefa, além do
checklist por ambiente (Feito? Sim/Não), anotações e assinaturas que já
existiam. O ASG só **confirma** no papel. **Falta (decisão/spike):**
**4.2 ingestão por OCR** das fichas escaneadas → casar com as rotinas → gerar
execuções; é o maior risco técnico e depende de escolher um serviço/lib de OCR
(com credenciais) — tratar como spike isolado antes de comprometer prazo. A
**confirmação automática de EPI** e o reconhecimento facial (4.3) dependem dessa
etapa de ingestão.

**Onda 3 (entregue):** nova entidade **`periodos_letivos`** (calendário
acadêmico por sede: nome, intervalo, dias com aula) com CRUD completo
(tela em Estrutura → Calendário acadêmico, escrita só de administrador). A
tarefa ganhou a flag **`depende_calendario`**: tarefas letivas (ex.: limpeza de
sala) **só são cobradas em período letivo** — fora dele (férias/recesso) somem
do painel "Ficou de fora hoje". Se a sede não tiver calendário cadastrado e
houver tarefa letiva devida, a agenda mostra um **aviso forte** pedindo o
cadastro. Lógica pura em `statusPeriodoLetivo` (`lib/calculations.ts`).

**Onda 2 (já atendida):** a precisão dos números **não depende do bloco visual**
— `tempo_previsto_min` é exato e o **deslocamento** já é parâmetro por sede
(`deslocamento_min_por_tarefa`, entregue na Fase D), entrando na ocupação como
tempo real. A grade segue em 30 min por decisão.

> ⚠️ **Tensão a discutir com o diretor (Murilo):** ele quer "combater o bloco de
> 30 min" para capturar ganhos de 3 em 3 minutos. Hoje o `tempo_visual_min`
> ainda **arredonda o tamanho do card** para blocos cheios (uma tarefa de 8 min
> ocupa 30 min no desenho), embora a ocupação seja calculada no minuto exato. Se
> ele insistir no ganho de **empacotar tarefas curtas** lado a lado, o próximo
> passo é reduzir o *snap* (ex.: 10/15 min) — deixando claro que isso é só
> visual e não muda os números.

## Princípios que valem para tudo (guarda-corpos)

1. **Planejar ≠ avaliar.** Qualquer número por pessoa (tempo individual, score)
   nasce para *planejar melhor*. Usar para avaliação/premiação/cobrança é outra
   decisão, separada, e passa por validação trabalhista. Não misturar os dois
   usos no mesmo dado sem rótulo explícito.
2. **Não trair a diretriz "não punitiva".** Ociosidade = tempo sem tarefa
   planejada; presença/plantão e imprevistos não são ociosidade.
3. **Atributos de risco** (idade, sexo) ficam **fora** de correlação de
   produtividade e de alocação/premiação até decisão formal de quem cuida do
   jurídico.
4. Toda mudança mantém a arquitetura: frontend → API → serviços → `DataSource`;
   cálculos/validações puros e compartilhados cliente/servidor.

## Decisões em aberto que destravam fases (resolver antes de codar)

| Decisão | Trava qual item | Opções |
|---|---|---|
| Como modelar **criticidade** | Circuito essencial (Fase C) | atributo na tarefa · nível · regra de cobertura obrigatória |
| Como entra o **deslocamento** | Deslocamento (Fase D) | tempo por trajeto · por sede · bloco de transição fixo |
| **Granularidade** da grade | (transversal) | manter 30min · baixar p/ 15/10 · desacoplar do bloco visual |
| **Tempo individual**: usar p/ avaliar? | Tempo por pessoa (Fase D) | só planejar · também avaliar (com salvaguardas) |
| Quais **atributos de pessoa** são legítimos | Pessoas/score (Fase F) | definir lista permitida vs. de risco |
| **Catálogo mestre por sede** | base de tudo (operacional) | levantar atividades × espaços reais (dever de casa, não código) |

---

## Fase A — Ganhos rápidos, dentro do escopo (baixo risco)

Itens pequenos que refinam o que já existe. Bom para entregar valor enquanto as
fases estruturais são decididas.

| Item | O que é | Onde toca | Esforço |
|---|---|---|---|
| **Flag "tempo é referência"** | tarefa marcada não gera alerta de desvio (ex.: montagem de palco) | `Tarefa` (campo) · `execucoesService`/cálculo de desvio · selo na UI | P |
| **Janela de horário por tarefa** | tarefa só pode cair entre X e Y (ex.: refeitório após o almoço) | `Tarefa` (h_inicio/h_fim) · `validations.validarAlocacao` | P |
| **Folga mínima por sede** | reservar % da jornada como buffer; faixa de ocupação calibrada por sede | `parametros` (já por sede) + leitura no dashboard/resumo | P |
| **Periodicidade fina** ✅ | tarefa semanal em dias fixos da semana (ex.: terça e quinta); cobrança exata nesses dias | `Tarefa.dias_semana` · `PendenciasPanel` (grupo "do dia") | P–M |
| **Relatório mensal por funcionário** | saída formatada (PDF) para o cliente assinar | novo gerador (temos os dados em acompanhamento/dashboard) | M |

## Fase B — Fundação #1: Categoria de atividade

Hoje as tarefas são registros soltos por local; falta uma camada de
**categoria/tipo de atividade** que as agrupe. É pré-requisito de vários itens.

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Categoria de atividade** ✅ | entidade `categorias` (catálogo global) que agrupa tarefas afins | — | M |
| **Recalibração em cascata** ✅ | ação que aplica um fator ao tempo base de todas as tarefas da categoria | categoria | M |
| **Nível/intensidade de limpeza** ✅ | `fator_intensidade` na categoria (leve 0,8 · normal 1,0 · densa 1,5) multiplica `tempoPrevistoMin` | categoria | M |
| **Tipo de uso → exigência** ⏸ | laboratório/clínica/pátio puxam nível de limpeza | categoria + tipo de local | M |

> **Decisão (2026-06-16):** a intensidade ficou na **categoria** (multiplicador
> único por categoria), não por tarefa/local. Por isso "tipo de uso → exigência"
> (que pressupõe nível por local/tarefa) fica **em aberto**: só faz sentido se,
> no futuro, a intensidade passar a ser por tarefa. Parado por decisão de
> modelagem, não por esforço.

## Fase C — Fundação #2: Segundo eixo (serviços eventuais)

A maior contribuição da análise: trabalho **não-rotineiro**. Hoje toda execução
parte de uma rotina planejada; falta a porta de entrada do eventual. Isso
também alimenta o buffer da Fase A (folga por sede).

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Registro de serviço eventual** ✅ | atividade não planejada, registrada depois (início/fim/detalhe) | — | G |
| **Registro de eventualidade/imprevisto** ✅ | imprevisto que consumiu tempo (não é ociosidade); `tipo` na mesma entidade | serviço eventual | M |
| **Buffer calibrado por sede (dados reais)** ✅ | painel no dashboard sugere folga = imprevistos médios/dia ÷ capacidade da sede | eventualidades + folga mínima (Fase A) | M |
| **Atividades de presença/plantão** ✅ | flag `presenca` na tarefa: não cobra desvio (helper `cobraDesvio`) | classificação de tarefa | M |

## Fase D — Enriquecimento do cálculo de tempo

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Tempo de deslocamento** ✅ | parâmetro por sede `deslocamento_min_por_tarefa` (default 0) entra na ocupação como tempo real | decisão de modelagem | M–G |
| **Tempo padrão por funcionário × atividade** ✅ | tabela `tempos_personalizados`; override no planejamento (só planejar) | decisão planejar/avaliar | M |
| **Criticidade / circuito essencial** ✅ | flag `critica` + seção "circuito essencial" no painel de pendências | decisão de modelagem | M |

## Fase E — Conformidade e aptidão (bloco jurídico)

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Matriz de aptidão (restrição médica/NR)** ✅ | catálogo `requisitos` + `qualificacoes_funcionario`; bloqueia alocação sem o requisito | categoria de atividade | M |
| **Treinamento como pré-requisito (com validade)** ✅ | validade na qualificação; vencido volta a bloquear | matriz aptidão | M |
| **EPI por atividade** ◐ | EPI exigido pela tarefa (selo/lembrete) entregue; a *confirmação de uso* é Fase F | confirmação (Fase F) | M |

## Fase F — Direção (mudam o alcance; decisões maiores)

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Login individual** ✅ | senha por usuário (hash scrypt) **e** "Entrar com Google" (Firebase Auth): popup → ID token → Admin verifica → e-mail precisa estar cadastrado → sessão. ACCESS_PASSWORD vira bootstrap | — | M |
| **Confirmação pelo funcionário (app/QR)** | ASG confirma "fiz tal atividade" → prova jurídica | Auth individual | G |
| **Remanejo entre sedes** ✅ | tela `/remanejo` (admin): órfãs de todas as sedes, candidatos com folga inclusive de outra sede (tag ↗); move valida jornada/conflito/conformidade | perfil gerência multi-sede | G |
| **Score de produtividade + premiação** ✅ | tela `/produtividade`: aderência previsto×realizado por funcionário + CSV; salvaguardas (sem idade/sexo, não punitivo) | guarda-corpos de risco | M |

## Sequência recomendada

1. **Fase A** em paralelo com as **decisões em aberto** (a tabela acima).
2. **Fase B** (categoria) — destrava recalibração em cascata e a Fase E.
3. **Fase C** (serviço eventual) — segundo eixo + fecha o buffer da Fase A.
4. **Fase D** (deslocamento, tempo por pessoa) — depende das decisões.
5. **Fase E** (conformidade) — depois da categoria.
6. **Fase F** (Auth → app/confirmação, remanejo entre sedes, score) — por último.

> **Itens de risco (não são tarefas de build, são travas):** correlação
> idade/sexo × produtividade e uso de tempo individual para avaliar/premiar.
> Manter como decisão consciente, fora do MVP de cada fase.
