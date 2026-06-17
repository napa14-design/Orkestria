# Estudo da planilha real — "Rota de Trabalho ASG · Aldeota"

> Fonte: planilha enviada pelo usuário (rota operacional real da Sede Aldeota,
> "ROTA 1.0"). Este documento registra o que a planilha revela e como isso
> confirma/ajusta o modelo do Orkestria. É o "dever de casa" das sedes previsto
> no plano de evolução (ver `docs/08`).

## Estrutura da planilha

Três abas:

1. **LOCAÇÕES COLABORADORES** — a rota do dia de cada ASG, em blocos com
   `INÍCIO | FIM | (duração) | Local | Tipo de serviço | Área (m²) |
   Produtividade | Ação`. A coluna **Ação** aponta um **POP** (procedimento
   operacional padrão) por tarefa.
2. **Murilo LOCAÇÕES COLABORADORES** — a mesma rota reorganizada como tabela
   limpa: `Funcionário | Setor | Tipo de atividade | Área (m²) | Produtividade |
   Início | Fim | Tempo`. É, na prática, o modelo de dados desenhado à mão.
3. **RESUMO** — por colaborador: `HH` (jornada), `M² limpos`, `Produtividade`.

8 colaboradores (ELENICE, CRISTINA, DAVID, ANTONIO MARCOS, EDINEIA, JOÃO VITOR…),
jornadas variadas (6:00–16:00, 7:00–17:00, 13:00–22:00).

## O que a planilha revela (e implicação para o sistema)

### 1. Planejamento é minuto a minuto, não em blocos de 30
Durações mais comuns: **15 min (29×)**, 30 min (22×), 1h (12×), **10 min (5×)**,
1h30, 2h, 40/20/5 min. Confirma a diretriz do Murilo de "combater o bloco de
30 min".
**Ação tomada:** a grade/snap da agenda passou de 30 → **15 min**
(`bloco_agenda_min`), reduzindo o arredondamento visual. O tempo previsto e os
indicadores já eram exatos (independem do bloco).

### 2. A coluna "Produtividade" é m²÷tempo — um RESULTADO, não a fórmula
Conferido célula a célula: `Produtividade = Área ÷ Tempo` (ex.: 322,98 m² em
15 min = 1291,92 m²/h). E `RESUMO.M² limpos` = soma das áreas dos setores do
colaborador (ex.: ELENICE = 1327,35 m² = Σ áreas).
**Leitura:** hoje o **tempo é colocado na mão** pelo supervisor; a produtividade
é calculada depois para comparar pessoas/áreas. O modelo do Orkestria
(tempo = m² × ambiente × serviço) é o **alvo normativo**: ele *gera* o tempo que
hoje é estimado no olho. Os dois convivem — o sistema propõe o tempo planejado;
o realizado vira o m²/h que a tela de **Produtividade** já calcula.

### 3. Boa parte do dia NÃO é limpeza
Aparecem **café (1h)**, recolhimento de lixo/materiais, **aguação**, "faz a
secretaria", limpeza de lousas. São atividades de apoio que consomem blocos
relevantes.
**Ação tomada:** criada a categoria **"Apoio operacional"** e tarefas de exemplo
(Café da sede, Recolhimento de materiais, Aguação de plantas) como **tempo fixo**.
Também: a **intensidade do ambiente deixou de incidir em tarefas de tempo
fixo/manual** — só incide em `por_m2`/`por_unidade` (limpeza dimensionada pela
área). Assim, "café na copa" não fica mais inflado pela densidade da copa.

### 4. Vocabulário deles ≈ nosso, com um detalhe
- **"Setor"** = nosso **Local** (COORDENAÇÕES, REITORIA, SALA DE PROFESSORES…).
- **"Tipo de atividade"** = "LIMPEZA **DE ROTINA** WC / ADM / SALA / ÁREA COMUM" —
  junta **natureza do serviço** ("de rotina") + **tipo de ambiente** (wc/adm/sala).
  É exatamente a decomposição do Orkestria: serviço na tarefa × intensidade no local.
- **POP / Ação** = procedimento operacional padrão por tarefa.

## Próximos passos sugeridos (não feitos ainda)
- **Campo POP** na Tarefa (link/observação do procedimento) — pequeno, alinhado à planilha.
- **Importar os tipos de ambiente reais** (wc/adm/sala/área comum/hall/copa/pátio/
  laboratórios) como `tipo_local`/categorias e calibrar as intensidades pelos
  m²/tempo observados.
- **Catálogo de apoio mais completo** (montagem de evento, descarga) como
  serviços fixos/eventuais.
- Repetir o estudo com a planilha da **DT** quando disponível.
