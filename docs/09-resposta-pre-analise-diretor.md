# Resposta à pré-análise do Orkestria

> **Para:** Direção · **Base:** documento "Análise e pontos de evolução —
> pré-análise" (junho/2026) · **Data desta resposta:** 16/06/2026
> **Autor:** equipe de desenvolvimento do Orkestria

---

## 1. Como ler esta resposta

Este documento responde, **ponto a ponto**, à pré-análise enviada pela direção.
Para cada tema, repito a leitura da direção e respondo com **o estado atual** —
porque, desde a pré-análise, **já implementamos boa parte dos itens**.

Uso quatro marcações de situação:

| Marca | Significado |
|---|---|
| ✅ **Entregue** | Já está no sistema, em produção, e foi verificado. |
| 🛠 **Em andamento** | Sendo construído agora, nesta sequência de trabalho. |
| 🗺 **Planejado** | No roteiro, com fase definida (ver `docs/08-plano-evolucao.md`). |
| ⚖ **Decisão/cautela** | Depende de uma decisão sua ou exige cuidado (jurídico/dados). |

A diretriz central da direção — **a ferramenta é de planejamento e
dimensionamento, não punitiva** — foi tratada como regra inegociável. Onde um
ponto encosta nessa fronteira (tempo individual, produtividade, premiação),
respondo explicitando a salvaguarda.

---

## 2. Resumo executivo — o que mudou desde a pré-análise

Entregamos duas fases completas de evolução:

**Fase A — ganhos rápidos (5 itens):**
- ✅ Flag **"tempo é referência"** (não cobra desvio em atividades de execução variável).
- ✅ **Janela de horário** por tarefa (ex.: refeitório só após o almoço).
- ✅ **Folga mínima por sede** (ocupação-alvo = 100 − folga; faixa calibrada por sede).
- ✅ **Periodicidade fina** (tarefa semanal em dias fixos da semana, ex.: terça e quinta).
- ✅ **Relatório mensal por funcionário** para o cliente assinar.

**Fase B — fundação estrutural (3 itens):**
- ✅ **Categoria de atividade** (catálogo que agrupa tarefas afins).
- ✅ **Recalibração em cascata** (ajustar um fator propaga para todas as tarefas da categoria).
- ✅ **Nível/intensidade de limpeza** no cálculo (leve/normal/densa, multiplicador por categoria).

**Fase C — segundo eixo do produto (4 itens):**
- ✅ **Registro de serviço eventual** (trabalho avulso, registrado a posteriori).
- ✅ **Registro de imprevisto** (ocorrência que consumiu tempo — não é ociosidade).
- ✅ **Presença/plantão** como classificação de tarefa (não cobra desvio).
- ✅ **Buffer calibrado por sede** (sugere a folga a partir dos imprevistos reais).

A Fase C era a contribuição mais forte da análise (o trabalho não-rotineiro) e
destrava a calibração da folga por sede com dados reais. **A seguir (Fase D):**
deslocamento, tempo por pessoa e criticidade.

---

## 3. Resposta por tema

### Tema 1 — Enriquecimento do cálculo de tempo (tarefa × espaço × local)

- **Definição de tarefa (atividade + local + sede)** — ✅ confirmado: o modelo
  é exatamente esse; a hierarquia local → sede é obrigatória.
- **Tipo/intensidade de limpeza (fina × densa)** — ✅ **Entregue.** Cada
  categoria de atividade tem um **fator de intensidade** (leve 0,8 · normal 1,0 ·
  densa 1,5) que multiplica o tempo previsto de todas as tarefas dela. Os valores
  são **calibráveis** pela direção.
- **Espaço (m², sede, andar, tipo de local)** — ✅ confirmado, já existia.
- **Tipo de uso ligado a nível de exigência** — ⚖ **Decisão.** Optamos por
  colocar a intensidade na **categoria** (um multiplicador por categoria). Por
  isso, amarrar o *tipo do local* (laboratório/clínica/pátio) a um nível só fará
  sentido se, no futuro, a intensidade passar a ser **por tarefa/local**. É uma
  bifurcação de modelagem que deixamos registrada para a direção decidir.
- **Intensidade / horas de uso do espaço** — 🗺 Planejado (Fase D, enriquecimento
  do cálculo). Hoje a intensidade entra pela categoria; "horas de uso" do
  ambiente é um fator adicional a modelar.
- **Tempo de deslocamento / transição** — 🗺 Planejado (Fase D). É uma das
  lacunas mais concretas; depende de decidir **como** o trajeto entra na conta
  (por trajeto, por sede ou bloco de transição) — ver "pontos em aberto".
- **Granularidade do bloco de 30 min** — ✅ esclarecido: a direção está certa de
  que o **cálculo guarda o tempo previsto exato** (não arredondado); só o desenho
  visual arredonda, e o bloco é parametrizável. A precisão dos indicadores não se
  perde. O ponto real é o **deslocamento não contabilizado** (acima).

### Tema 2 — Tempo: estimado, realizado, personalizado e de referência

- **Dois tempos (previsto × realizado)** — ✅ confirmado, já existia.
- **Tempo padrão por funcionário × atividade** — 🗺 Planejado (Fase D). Hoje o
  padrão é por tarefa/local; o tempo por pessoa é peça nova.
- **Planejar ≠ avaliar** — ⚖ **Compromisso assumido.** Quando existir tempo
  individual, ele servirá **só para planejar** (montar rotina realista). Não
  alimentará avaliação, premiação ou cobrança sem uma decisão explícita da
  direção e salvaguardas — em linha com a diretriz "não punitiva".
- **Recalibração de tempo padrão (mediana real)** — ✅ confirmado, já existia
  (sugere ajuste com ≥3 execuções e desvio ≥15%, aplicável em 1 clique).
- **Recalibração em cascata por categoria** — ✅ **Entregue.** Criamos a camada
  de **categoria** e uma ação que aplica um fator ao tempo base de todas as
  tarefas da categoria de uma vez, registrada no histórico.
- **Flag "tempo é referência"** — ✅ **Entregue** (não gera alerta de desvio,
  não entra no "Top desvios" nem nas sugestões de ajuste).
- **Atividades de presença / plantão** — ✅ **Entregue.** Classificação própria
  na tarefa (`presença`): não cobra desvio (a duração varia por contexto, não é
  erro de estimativa). É tempo ocupado e necessário — distinta da ociosidade.

### Tema 3 — Criticidade e circuito essencial

- **Atividades críticas / circuito essencial** — 🗺 Planejado (Fase D) · ⚖ ainda
  precisa de decisão de modelagem (atributo da tarefa? nível? regra de cobertura
  obrigatória?). Hoje há "prioridade" e os painéis de cobertura, mas não um
  conceito formal de criticidade — ver "pontos em aberto".
- **Periodicidade bem desenhada** — ✅ **Entregue.** A tarefa semanal pode fixar
  os **dias da semana** (ex.: terça e quinta) e o painel "Ficou de fora hoje"
  passa a cobrá-la exatamente nesses dias.
- **Janela de horário por tarefa** — ✅ **Entregue** (a tarefa só pode ser
  alocada dentro do intervalo definido; a agenda bloqueia fora dele).

### Tema 4 — Faltas, remanejo e comunicação

- **Falta → serviços abertos → substituição** — ✅ confirmado, já existia
  (painel de cobertura de ausência, remanejo em 1 clique).
- **Comunicar a substituição** — 🗺 Planejado (Fase F). Notificar quem assume a
  tarefa é o elo que falta; será tratado junto com a confirmação pelo funcionário.
- **Remanejo entre sedes** — 🗺 Planejado (Fase F) · ⚖ é evolução de direção:
  exige uma visão acima do supervisor (gerência/admin) e considerar deslocamento,
  jornada e custo entre sedes.

### Tema 5 — Serviços eventuais (segundo eixo do produto)

- **Registro do serviço eventual** — ✅ **Entregue.** Nova tela "Serviços
  eventuais" registra o trabalho não planejado a posteriori (início, fim,
  detalhes), sem partir de uma rotina prévia.
- **Serviços eventuais como categoria própria (2º eixo)** — ✅ **Entregue.** O
  Orkestria passa a ter **dois modos**: rotina planejada (o de hoje) e serviço
  eventual / imprevisto (registrado depois). Os imprevistos têm tratamento
  próprio e alimentam a calibração da folga.

### Tema 6 — Ociosidade como buffer calibrado por sede

- **Ociosidade planejada × real** — ✅ **Entregue (parte 1).** A meta de
  ocupação deixou de ser faixa única: cada sede reserva uma **folga mínima**
  (buffer), e a ocupação-alvo passa a ser 100 − folga.
- **Parâmetros por sede** — ✅ confirmado, já existia.
- **Registrar eventualidades para calibrar a folga** — ✅ **Entregue.** Os
  imprevistos registrados alimentam um painel no dashboard que **deriva** a folga
  sugerida de cada sede (imprevistos médios por dia ÷ capacidade da sede) — em vez
  de um número arbitrado. Fecha o ciclo com o Tema 5.

### Tema 7 — Conformidade e aptidão das pessoas

- **Confirmação da atividade pelo funcionário (app/QR)** — 🗺 Planejado (Fase F) ·
  ⚖ direção. Registramos a justificativa jurídica levantada (prova de atuação
  dentro das atribuições do cargo). Hoje o ASG não usa o sistema; a confirmação
  digital é a fase futura.
- **Confirmação de uso de EPI por atividade** — 🗺 Planejado (Fase E).
- **Restrições físicas/médicas por funcionário** — 🗺 Planejado (Fase E). Uma
  **matriz de aptidão** (funcionário × tipo de tarefa), juridicamente defensável
  (restrição médica/NR). Hoje só existe a restrição de gênero (rígida).
- **Treinamento como pré-requisito, com validade** — 🗺 Planejado (Fase E).
  Mesma família do EPI/NR: matriz de qualificação com data de validade.
- **Inserção das fichas de papel** — ⚖ ponto de atrito reconhecido; resolvido de
  vez pelo app/QR (Fase F). Hoje o laço existe via lançamento no Acompanhamento.

### Tema 8 — Produtividade, pessoas e dados sensíveis

- **Score de produtividade por funcionário** — 🗺 Planejado (Fase F), a partir do
  previsto × realizado que já existe.
- **Atributos seguros (tempo de empresa, engajamento)** — 🗺 Planejado (Fase F).
- **Integração com a política de premiação** — 🗺 Planejado (Fase F) · ⚖ só após
  separar claramente planejar de avaliar (Tema 2).
- **Idade e sexo na correlação de produtividade** — ⚖ **RISCO — não será
  implementado** como fator de produtividade, alocação ou premiação. Tratamos
  idade e sexo como **atributos de risco** (trabalhista/discriminação), fora do
  motor de produtividade. (Não é orientação jurídica; é a salvaguarda que a
  própria direção pediu — a validar com quem cuida do tema.)
- **Restrição de gênero** — ✅ confirmado: existe como bloqueio rígido para casos
  específicos (ex.: banheiro feminino só por ASG mulher). É **restrição
  operacional**, não correlação de produtividade — distinção importante.

### Tema 9 — Relatórios e saídas

- **Relatório mensal por funcionário para o cliente assinar** — ✅ **Entregue.**
  Nova tela gera folhas imprimíveis, uma por funcionário, com os serviços
  realizados no mês, totais e linhas de assinatura (responsável da sede / cliente).
- **Exportações e dashboard** — ✅ confirmado, já existiam.

---

## 4. Esclarecimento confirmado: sobrecarga × fora do expediente

A leitura da direção está correta e o sistema se comporta exatamente assim:
**fora do expediente** é posicional e individual (a tarefa cai fora da janela de
trabalho → a agenda **bloqueia**); **sobrecarga** é agregada (o total do dia passa
da jornada líquida → ocupação > 100% → apenas **alerta**, não bloqueia). São eixos
independentes — dá para ter sobrecarga sem nenhuma tarefa fora do expediente.

---

## 5. Pontos em aberto — nossa posição atual

Para cada decisão que a direção listou como "ainda preciso definir":

1. **Criticidade / circuito essencial** — 🗺 a modelar (Fase D). Recomendação
   inicial: um **atributo de criticidade** na tarefa + regra de cobertura
   obrigatória no painel de pendências. Aguarda a decisão da direção.
2. **Periodicidade** — ✅ **resolvido** para o caso semanal (dias fixos da
   semana). Vencimento de quinzenal/mensal segue por janela; refinamentos futuros
   se necessário.
3. **Tempo de deslocamento** — ⚖ decisão pendente (por trajeto / por sede /
   bloco de transição). Nossa sugestão: começar por um **bloco de transição
   parametrizável por sede**, mais simples de calibrar (Fase D).
4. **Granularidade da grade** — ✅ esclarecido: manter 30 min visuais
   (parametrizável), pois o cálculo já é exato. Reavaliar só se o deslocamento
   exigir.
5. **Tempo individual: planejar ou avaliar** — ⚖ **posição assumida:** só
   planejar, por ora; qualquer uso avaliativo exige decisão explícita + salvaguardas.
6. **Fluxo das fichas de papel** — ⚖ digitação em lote hoje; app/QR resolve
   (Fase F).
7. **Atributos de pessoas legítimos × de risco** — ⚖ **posição assumida:**
   legítimos = operacionais (aptidão, treinamento, EPI, tempo de empresa); de
   risco = idade/sexo para produtividade (fora).
8. **Catálogo mestre por sede** — ⚖ dever de casa conjunto: a camada de
   **categorias** (já entregue) é a base técnica; falta o levantamento real de
   atividades × espaços por sede.

---

## 6. Roteiro adiante (resumo)

| Fase | Foco | Situação |
|---|---|---|
| A | Ganhos rápidos | ✅ concluída (5/5) |
| B | Categoria + intensidade no cálculo | ✅ concluída (3/4; 1 item é decisão de modelagem) |
| C | **Serviços eventuais + eventualidades + buffer calibrado** | ✅ concluída (4/4) |
| D | Deslocamento, tempo por pessoa, criticidade | 🗺 planejado |
| E | Conformidade (aptidão, EPI, treinamento) | 🗺 planejado |
| F | App/QR, remanejo entre sedes, score, premiação | 🗺 planejado |

Detalhe completo em `docs/08-plano-evolucao.md`.

**Compromissos que atravessam todas as fases:** (1) planejamento, não punição;
(2) planejar ≠ avaliar; (3) idade/sexo fora do motor de produtividade;
(4) números de tempo sempre calibráveis pela operação, nunca "inventados" pelo
sistema; (5) toda escrita registrada em histórico (auditoria).
