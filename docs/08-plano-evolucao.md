# Plano de evolução — execução das mudanças (pós pré-análise do diretor)

> Base: documento "Orkestria — Análise e pontos de evolução (pré-análise)" +
> estado real do código (junho/2026). Este plano sequencia os itens por
> **dependência** e **risco**, dizendo o que cada um toca no sistema e qual
> **decisão** precisa estar tomada antes de começar.
> Esforço: **P** pequeno (dias) · **M** médio (1–2 semanas) · **G** grande (projeto).

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
| **Nível/intensidade de limpeza** | atributo fina × densa que entra no cálculo | categoria | M |
| **Tipo de uso → exigência** | laboratório/clínica/pátio puxam nível de limpeza | categoria + tipo de local (já existe) | M |

## Fase C — Fundação #2: Segundo eixo (serviços eventuais)

A maior contribuição da análise: trabalho **não-rotineiro**. Hoje toda execução
parte de uma rotina planejada; falta a porta de entrada do eventual. Isso
também alimenta o buffer da Fase A (folga por sede).

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Registro de serviço eventual** | atividade não planejada, registrada depois (início/fim/detalhe) | — | G |
| **Registro de eventualidade/imprevisto** | imprevisto que consumiu tempo (não é ociosidade) | serviço eventual | M |
| **Buffer calibrado por sede (dados reais)** | derivar a folga necessária a partir dos imprevistos por sede | eventualidades + folga mínima (Fase A) | M |
| **Atividades de presença/plantão** | tempo de permanência: não cobra desvio, não é ociosidade | classificação de tarefa | M |

## Fase D — Enriquecimento do cálculo de tempo

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Tempo de deslocamento** | trajeto entre espaços como volume real | decisão de modelagem | M–G |
| **Tempo padrão por funcionário × atividade** | reconhecer ritmo de cada pessoa (só planejar) | decisão planejar/avaliar | M |
| **Criticidade / circuito essencial** | conjunto que não pode deixar de ser feito | decisão de modelagem | M |

## Fase E — Conformidade e aptidão (bloco jurídico)

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Matriz de aptidão (restrição médica/NR)** | bloquear atividade para quem tem restrição | categoria de atividade | M |
| **Treinamento como pré-requisito (com validade)** | só executa quem tem treino válido; expira | matriz aptidão | M |
| **EPI por atividade** | registrar/confirmar uso de EPI na tarefa | confirmação (Fase F) | M |

## Fase F — Direção (mudam o alcance; decisões maiores)

| Item | O que é | Depende de | Esforço |
|---|---|---|---|
| **Login individual (Firebase Auth)** | senha por usuário (já pendente de produção) | — | M |
| **Confirmação pelo funcionário (app/QR)** | ASG confirma "fiz tal atividade" → prova jurídica | Auth individual | G |
| **Remanejo entre sedes** | visão acima do supervisor; considera deslocamento/jornada/custo | perfil gerência multi-sede | G |
| **Score de produtividade + premiação** | formalizar a partir do previsto×realizado | guarda-corpos de risco | M |

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
