# Resposta à pré-análise do Orkestria

> **Para:** Direção · **Base:** documento "Análise e pontos de evolução —
> pré-análise" (junho/2026) · **Atualizado em:** 16/06/2026
> **Autor:** equipe de desenvolvimento do Orkestria

---

## 1. Como ler esta resposta

Este documento responde, **ponto a ponto**, à pré-análise. Para cada tema repito
a leitura enviada e respondo com o estado atual. Boa notícia: desde a
pré-análise, **percorremos o plano inteiro de evolução (Fases A a F)** — a grande
maioria dos pontos já está no ar.

| Marca | Significado |
|---|---|
| ✅ **Entregue** | Já está no sistema e foi testado. |
| ◐ **Parcial** | A base está entregue; falta uma camada (descrita no ponto). |
| ⚖ **Decisão/cautela** | Depende de uma decisão de direção ou exige cuidado (jurídico/dados). |

A diretriz central — **a ferramenta é de planejamento e dimensionamento, não
punitiva** — foi tratada como regra inegociável.

---

## 2. Resumo executivo — o que foi entregue

- **Fase A (ganhos rápidos):** "tempo é referência", janela de horário por tarefa,
  folga mínima por sede, periodicidade por dias da semana, relatório mensal por
  funcionário para o cliente assinar.
- **Fase B (categoria + cálculo):** categoria de atividade, recalibração em
  cascata, nível de intensidade de limpeza entrando no tempo.
- **Fase C (2º eixo):** serviços eventuais e imprevistos, presença/plantão,
  folga por sede calibrada pelos imprevistos reais.
- **Fase D (cálculo):** criticidade/circuito essencial, tempo por pessoa (só para
  planejar), tempo de deslocamento entre espaços.
- **Fase E (conformidade):** catálogo de aptidões/treinamentos/EPIs; bloqueio de
  quem não tem o requisito ou está com treinamento vencido.
- **Fase F (gestão e acesso):** indicador de produtividade, remanejo entre sedes,
  login individual (senha por usuário **e** "Entrar com Google").

Restam poucos itens em aberto, listados na seção 5.

---

## 3. Resposta por tema

### Tema 1 — Enriquecimento do cálculo de tempo (tarefa × espaço × local)
- **Definição de tarefa (atividade + local + sede)** — ✅ confirmado.
- **Tipo/intensidade de limpeza (fina × densa)** — ✅ **Entregue.** Cada categoria
  tem um fator (leve 0,8 · normal 1,0 · densa 1,5) que multiplica o tempo. Valores
  ajustáveis pela operação.
- **Espaço (m², sede, andar, tipo de local)** — ✅ já existia.
- **Tipo de uso → exigência de nível** — ⚖ **decisão em aberto** (explicada na
  seção 5).
- **Tempo de deslocamento / transição** — ✅ **Entregue.** Cada sede pode definir
  quantos minutos de deslocamento contar por tarefa; isso entra na ocupação como
  tempo real (começa em zero até a sede calibrar).
- **Granularidade do bloco de 30 min** — ✅ esclarecido: o cálculo guarda o tempo
  exato; só o desenho arredonda, e o bloco é configurável.

### Tema 2 — Tempo: estimado, realizado, personalizado e de referência
- **Dois tempos (previsto × realizado)** — ✅ já existia.
- **Tempo padrão por funcionário × atividade** — ✅ **Entregue**, e **só para
  planejar** (ver Planejar ≠ avaliar). Cada pessoa pode ter um tempo realista
  próprio numa tarefa, usado ao montar a agenda.
- **Planejar ≠ avaliar** — ⚖ **Compromisso mantido.** O tempo individual serve
  para montar uma rotina realista; não alimenta avaliação/premiação sem decisão
  explícita da direção.
- **Recalibração de tempo padrão** — ✅ já existia (sugestão com base na mediana).
- **Recalibração em cascata por categoria** — ✅ **Entregue.**
- **Flag "tempo é referência"** — ✅ **Entregue.**
- **Atividades de presença / plantão** — ✅ **Entregue** (não cobra desvio; é
  tempo de permanência, distinto da ociosidade).

### Tema 3 — Criticidade e circuito essencial
- **Atividades críticas / circuito essencial** — ✅ **Entregue.** A tarefa pode ser
  marcada como crítica; se ficar sem cobertura no dia, o painel destaca em
  vermelho um aviso de "circuito essencial descoberto", separado das demais
  pendências.
- **Periodicidade bem desenhada** — ✅ **Entregue** (dias fixos da semana).
- **Janela de horário por tarefa** — ✅ **Entregue.**

### Tema 4 — Faltas, remanejo e comunicação
- **Falta → serviços abertos → substituição** — ✅ já existia.
- **Remanejo entre sedes** — ✅ **Entregue.** Tela de gerência que mostra as
  tarefas de ausentes de todas as sedes e permite passá-las a um colega com folga,
  inclusive de outra sede (destacando que há deslocamento). A movimentação valida
  jornada, conflito e conformidade.
- **Comunicar a substituição** — ⚖ pendente: avisar automaticamente quem assumiu
  depende do canal com o funcionário (mesmo bloco do app/QR — seção 5).

### Tema 5 — Serviços eventuais (segundo eixo do produto)
- **Registro do serviço eventual** — ✅ **Entregue** (tela própria, registrado
  depois do fato).
- **Serviços eventuais como categoria própria (2º eixo)** — ✅ **Entregue.** O
  sistema agora tem dois modos: rotina planejada e serviço eventual/imprevisto.

### Tema 6 — Ociosidade como buffer calibrado por sede
- **Ociosidade planejada × real** — ✅ **Entregue** (folga mínima por sede).
- **Parâmetros por sede** — ✅ já existia.
- **Registrar eventualidades para calibrar a folga** — ✅ **Entregue.** Os
  imprevistos registrados alimentam um painel que sugere a folga de cada sede a
  partir de dados reais.

### Tema 7 — Conformidade e aptidão das pessoas
- **Restrições físicas/médicas (aptidão)** — ✅ **Entregue.** Bloqueia alocar uma
  tarefa a quem não tem a aptidão exigida.
- **Treinamento como pré-requisito, com validade** — ✅ **Entregue.** Treinamento
  vencido volta a bloquear automaticamente.
- **EPI por atividade** — ✅ **Entregue.** A tarefa declara o EPI exigido e a
  ficha ORK4 registra uma declaração única com os nomes impressos preservados no QR.
- **Confirmação da atividade pelo funcionário** — ✅ entregue por ficha de papel
  assinada + leitura OMR; confirmação direta em app individual permanece futura.
- **Inserção das fichas de papel** — ✅ feita na tela Conferir ficha, que lê QR,
  tarefas e declaração de EPI e grava `execucoes_realizadas`.

### Tema 8 — Produtividade, pessoas e dados sensíveis
- **Score de produtividade por funcionário** — ✅ **Entregue.** Tela de
  produtividade com a aderência previsto × realizado por pessoa e exportação em
  planilha (apoia o processo de premiação).
- **Idade e sexo na correlação de produtividade** — ⚖ **RISCO — fora do sistema.**
  Não são usados como fator de produtividade/alocação/premiação. (Salvaguarda
  pedida pela própria direção; a validar com quem cuida do tema.)
- **Restrição de gênero** — ✅ restrição operacional (ex.: banheiro feminino), não
  correlação de produtividade.

### Tema 9 — Relatórios e saídas
- **Relatório mensal por funcionário para o cliente assinar** — ✅ **Entregue.**
- **Exportações e dashboard** — ✅ já existiam.

### Acesso ao sistema (login)
- **Login individual** — ✅ **Entregue.** Cada usuário pode ter senha própria
  (não mais a senha única compartilhada) e há **"Entrar com Google"**. O acesso
  pelo Google só funciona para e-mails já cadastrados como usuário.

---

## 4. Esclarecimento confirmado: sobrecarga × fora do expediente

A leitura está correta. **Fora do expediente** é posicional (a tarefa cai fora da
janela de trabalho → a agenda bloqueia). **Sobrecarga** é agregada (o total do dia
passa da jornada → só alerta). São eixos independentes.

---

## 5. Pontos em aberto — o que falta e por quê

Sobraram poucos itens. Explicando cada um de forma simples:

1. **"Tipo de uso do local → exigência de nível"** — ⚖ **decisão de modelagem.**
   *A ideia:* um laboratório, uma clínica ou um pátio exigiriam, por si só, uma
   limpeza mais pesada — só por serem aquele tipo de espaço.
   *Por que ainda não fizemos:* hoje a "intensidade" da limpeza está presa à
   **categoria da atividade** (ex.: "Higienização" é sempre pesada), e não a cada
   espaço. Em linguagem simples: o sistema já sabe *"esse tipo de serviço é mais
   pesado"*, mas ainda não sabe *"essa sala, por ser um laboratório, é mais
   pesada"*. Para o segundo caso, a intensidade precisaria morar em cada
   espaço/tarefa — é uma forma diferente de organizar os dados, que muda várias
   telas. É uma escolha de direção, não falta de trabalho.
   *Enquanto isso:* já dá para refletir um espaço mais exigente criando uma
   categoria mais intensa ou ajustando o tempo daquela tarefa específica.
2. **Confirmação pelo funcionário (app/QR) + confirmação de EPI + aviso de
   remanejo** — ⚖ formam um bloco só: tudo depende de um **canal direto com o
   ASG** (hoje ele não usa o sistema, recebe ficha de papel). É o passo de abrir o
   sistema para o funcionário confirmar "fiz tal tarefa / usei o EPI" e receber
   avisos. Fica para uma etapa dedicada, quando a direção decidir avançar nisso.
3. **Tempo individual para avaliar** — mantido **só para planejar**; usar para
   avaliação exige decisão explícita e salvaguardas.

---

## 6. Roteiro — situação final

| Fase | Foco | Situação |
|---|---|---|
| A | Ganhos rápidos | ✅ concluída |
| B | Categoria + intensidade no cálculo | ✅ concluída (1 decisão em aberto: tipo de uso) |
| C | Serviços eventuais + buffer | ✅ concluída |
| D | Deslocamento, tempo por pessoa, criticidade | ✅ concluída |
| E | Conformidade (aptidão, treinamento, EPI) | ✅ concluída (confirmação por ficha ORK4) |
| F | Produtividade, remanejo entre sedes, login | ✅ concluída |
| — | Confirmação pelo funcionário (app/QR) | ⚖ etapa futura dedicada |

**Compromissos que atravessam tudo:** (1) planejamento, não punição;
(2) planejar ≠ avaliar; (3) idade/sexo fora do motor de produtividade;
(4) números de tempo sempre ajustáveis pela operação, nunca "inventados" pelo
sistema; (5) toda alteração registrada em histórico (auditoria).
