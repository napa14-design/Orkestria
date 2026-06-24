# Estudo das rotas reais — Christus (DT, Eusébio, Benfica)

> Base: 3 planilhas de "Rota de Trabalho ASG" entregues em 22/06/2026
> (campus Dionísio Torres, Eusébio e Benfica). Objetivo: extrair padrões reais
> para orientar o catálogo e um futuro importador. **Não altera dados** — é
> documentação. Complementa o `docs/11` (Aldeota).

## 1. Fontes

| Arquivo | Campus | Funcionários (abas) | Linhas-tarefa | Particularidade |
|---|---|---|---|---|
| `Rota de trabalho.xlsx` | Colégio Christus — Dionísio Torres | **26** | **413** | setor + **código POP**; 6 "Volantes" |
| `Rota de Trabalho asg- Eusébio.xlsx` | Christus — Eusébio | 7 (1 é "MODELO" em branco) | ~101 | layout com "Área por local" |
| `Rota de Trabalho asg- Benfica.xlsx` | Universidade Christus — Benfica | 4 | — | **m² por local** preenchido |

São a mesma "família" de documento (cabeçalho DAC, tabela Horários→Local/Ação),
mas com **3 layouts diferentes** (colunas deslocadas, campos distintos). Isso é o
ponto crítico para um importador: não dá para um parser único ingênuo.

## 2. Estrutura comum (uma aba = a rota diária de um funcionário)

- **Cabeçalho:** unidade/endereço, setor (DT), **turno/horário**, rota, gênero, nome.
- **Tabela:** `início | fim | duração | Local/Ação` em blocos de **5 a 60 min**
  (muitos de 15–20 min) — confirma a granularidade fina já adotada (grade 15 min,
  cálculo no tempo exato).
- **Primeira linha sempre:** "Base – Ponto de Apoio" (registrar ponto + preparar
  material) — um **setup** de início de jornada.
- **Intervalos** explícitos: Lanche (15 min, às vezes 2× no dia) e Almoço (90 min).
- **Última linha:** "Saída".

## 3. Diferenças de layout (importam para o importador)

- **DT:** dados a partir da coluna A; tem **POP** (coluna Ação) e **setor** no
  cabeçalho "PRODUTIVIDADE". Turnos variados: `06:00–16:00`, `07:00–17:00`,
  `06:00–12:00`.
- **Benfica/Eusébio:** dados deslocados (começam na coluna B); cabeçalho
  `FUNCIONÁRIO: / HORÁRIO DE TRABALHO:`; coluna **"Área por local"** (m²).
  Eusébio traz uma aba **"MODELO"** (template em branco).

## 4. O que confirma do modelo atual ✅

- **Tempo exato e granularidade fina** (blocos de 5/10/15/20 min).
- **Deslocamento / setup** ("Base – Ponto de Apoio", "preparar material").
- **Presença/plantão de tempo variável:** "Disponível para serviço de
  pintura/limpeza de calhas" (Orlando) — exatamente a flag `presenca`.
- **Trabalho não-limpeza (apoio):** "Recolher café do CPA", "Acompanhamento dos
  alunos do Infantil para o Idiomas", "Apoio refeitório do integral", "fica no
  portão e busca/entrega crianças" — categoria **Apoio operacional**.
- **Criticidade/cobertura** e **múltiplos turnos** por sede.

## 5. Novidades a considerar (insumo para o catálogo)

1. **POP = padrão de procedimento de limpeza.** Não há legenda escrita; pelo uso,
   inferimos: **A** = banheiros/WCs · **C** = limpeza geral (coordenações,
   recepções, copas, salas administrativas) · **D** = salas de aula · **E** =
   áreas externas/varrição · **G** = resíduos/coleta (aparece combinado: "A, C e
   G"). Candidato a um **campo/catálogo de POP** na tarefa (≈ irmão do
   `tipo_servico`), útil para checklist e conformidade. *Confirmar a legenda
   oficial com a coordenação (DAC) antes de fixar.*
2. **m² por local (Benfica).** Alimenta diretamente a regra `por_m2`. **Atenção:**
   os valores observados parecem inconsistentes (ex.: "86,933m²" para um WC +
   recepção) — provável problema de formatação/decimal. **Validar** antes de usar.
3. **Periódicos e condicionais (campo OBS).** Há regras que hoje não modelamos bem:
   - Mensal: "verificação do telhado toda **1ª sexta** do mês".
   - Por dia da semana / janela: "segunda a sexta na cantina das 08:40–09:40 e
     15:10–15:40"; "segunda e quarta 16:00–18:00 suporte na quadra".
   - Condicional: "entra às 6h **às quartas** porque tem aula até 19h".
   → reforça **periodicidade por dia da semana** (já existe) e sugere um espaço
   para **observações/condições** por tarefa.
4. **"Volante" (6 pessoas no DT).** Funcionário **coringa/versátil**, sem setor
   fixo ("Apoio para atividades diárias pertinentes a…"). Conecta com a Onda 5
   (folga concentrada nos versáteis) e com o **remanejo**.
5. **Jornada por funcionário** já variada (início/fim e intervalos próprios) —
   o sistema já suporta.

## 6. Implicações / próximos passos sugeridos

- **Importador afinado ao layout Christus** (quando for a hora): detectar o
  offset de coluna por arquivo; mapear **setor → local**, **POP → tipo_servico /
  POP**, **m² → metragem**; criar **tarefas de apoio** (café, acompanhamento,
  refeitório, portão) na categoria Apoio; marcar **presença** nos "disponível
  para…"; jogar OBS para observação/periodicidade. Testar **sempre em memory**
  antes de qualquer carga real.
- **Catálogo de POP** (decisão de produto): adotar A–G como padrão de
  procedimento? Pegar a legenda oficial da DAC.
- **Validar os m²** da Benfica/Eusébio com a coordenação.
- **Tarefas de apoio recorrentes** já podem entrar no catálogo global (não
  dependem de importador).

## 7. Conclusão

As 3 rotas **validam o desenho atual** (granularidade fina, presença, apoio,
periodicidade, deslocamento) e trazem 3 insumos novos: **POP**, **m² por local**
e **regras periódicas/condicionais**. O volume (≈37 rotas, 500+ tarefas) torna a
digitação manual inviável — o caminho escalável é um **importador dedicado ao
layout Christus**, tratado como projeto próprio e testado em memory. Este estudo
é a base para decidir esse passo.
