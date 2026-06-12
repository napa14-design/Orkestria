# Modelo de Dados

O mesmo modelo lógico vale para o Google Sheets (MVP — cada tabela é uma aba)
e para o Firebase Firestore (Fase 3 — cada tabela é uma coleção, cada registro
um documento). A fonte de verdade no código é [lib/schema.ts](../lib/schema.ts).

## Diagrama de relacionamentos

```
usuarios                    sedes
   │ sede_id ───────────────┐ │
   ▼                         ▼ │
parametros (sede_id|geral)   │ ├──< funcionarios (sede_id)
                             │ ├──< locais (sede_id)
                             │ │      └──< tarefas (local_id, sede_id herdada)
                             │ │             └──< rotinas_planejadas
                             │ │                    (funcionario_id, tarefa_id,
                             │ │                     local_id, sede_id, data)
                             │ │                    └──< execucoes_realizadas
                             └─┘                          (rotina_id)
```

## Tabelas / abas

### usuarios
| Campo | Tipo | Observação |
|---|---|---|
| id | string | UUID |
| nome | string | |
| email | string | chave de login |
| perfil | enum | administrador · supervisor · visualizador |
| sede_id | string | `geral` = todas as sedes |
| ativo | boolean | |
| criado_em, atualizado_em | ISO 8601 | |

### funcionarios
| Campo | Tipo | Observação |
|---|---|---|
| id | string | |
| nome, genero, cargo | string | |
| sede_id | string | **obrigatório** |
| turno | enum | manha · tarde · noite · integral |
| entrada, saida | HH:mm | |
| intervalo_min | número | minutos descontados da jornada |
| intervalo_inicio, intervalo_fim | HH:mm | bloqueado na agenda |
| ativo | boolean | |
| observacoes | string | |
| criado_por, criado_em, atualizado_por, atualizado_em | auditoria | |

> Jornada líquida não é armazenada — é sempre calculada:
> `jornada_liquida = saida − entrada − intervalo_min`.

### sedes
id · nome_sede · cidade · endereco · ativo · auditoria (4 campos).

### locais
| Campo | Tipo | Observação |
|---|---|---|
| sede_id | string | **obrigatório — não existe local sem sede** |
| andar | string | Térreo, 1º andar, … |
| nome_local | string | |
| tipo_local | enum | sala · banheiro · corredor · area_comum · area_externa · copa · escada · recepcao · auditorio · almoxarifado · outros |
| metragem | número | m²; 0 gera alerta |
| ativo, observacoes, auditoria | | |

### tarefas
| Campo | Tipo | Observação |
|---|---|---|
| nome_tarefa, tipo_tarefa | string | |
| local_id | string | **obrigatório** |
| sede_id | string | **preenchido automaticamente a partir do local** |
| regra_calculo | enum | fixo · por_m2 · por_unidade · manual |
| tempo_base_min | número | total (fixo/manual) · min/m² (por_m2) · min/un (por_unidade) |
| quantidade | número | usada em por_unidade |
| frequencia | enum | diaria · semanal · quinzenal · mensal · sob_demanda |
| prioridade | enum | alta · media · baixa |
| ativo, observacoes, auditoria | | |

### rotinas_planejadas
| Campo | Tipo | Observação |
|---|---|---|
| data | YYYY-MM-DD | |
| funcionario_id, sede_id, tarefa_id, local_id | string | todos obrigatórios |
| inicio_planejado, fim_planejado | HH:mm | fim = início + tempo_visual |
| tempo_previsto_min | número | tempo REAL da regra (usado em produtividade) |
| tempo_visual_min | número | arredondado para blocos (usado só na agenda) |
| blocos_ocupados | número | teto(previsto / bloco) |
| status | enum | planejada · realizada · nao_realizada · remanejada · cancelada · pendente |
| observacao, supervisor_id, criado_em, atualizado_em | | |

### execucoes_realizadas (Fase 2)
| Campo | Tipo | Observação |
|---|---|---|
| rotina_id | string | FK para rotina planejada |
| data_execucao | YYYY-MM-DD | |
| status_realizado | enum | conforme_planejado · com_atraso · parcial · nao_realizada · remanejada · cancelada |
| inicio_real, fim_real | HH:mm | opcionais |
| tempo_real_min | número | |
| justificativa | string | obrigatória quando desvio > parâmetro ou status crítico |
| observacao, supervisor_id, criado_em, atualizado_em | | |

### modelos_rotina (Fase 2)
Cada linha é um item de um modelo (template) de rotina; o modelo é o conjunto
de linhas com o mesmo `nome_modelo` + `sede_id`.

| Campo | Tipo | Observação |
|---|---|---|
| nome_modelo | string | identifica o modelo dentro da sede |
| sede_id | string | |
| funcionario_id, tarefa_id, local_id | string | o que será recriado ao aplicar |
| inicio_planejado | HH:mm | |
| criado_por, criado_em | auditoria | |

Aplicar um modelo recria as rotinas passando pelas validações normais —
itens que conflitam na data de destino são pulados e contabilizados.

### ausencias
Faltas, atestados, férias e folgas. Durante a ausência a agenda do funcionário
fica bloqueada (alocação é rejeitada no cliente e no servidor) e as tarefas já
planejadas dele entram no painel de cobertura para remanejamento.

| Campo | Tipo | Observação |
|---|---|---|
| funcionario_id | string | obrigatório |
| sede_id | string | herdada do funcionário |
| tipo | enum | falta · atestado · ferias · folga · outro |
| data_inicio, data_fim | YYYY-MM-DD | período inclusivo |
| observacao, auditoria | | |

### historico
Log de alterações preenchido automaticamente: toda escrita em qualquer tabela
gera um registro com autor (da sessão) e horário. Implementado como decorator
do `DataSource` ([lib/historico.ts](../lib/historico.ts)) — nenhum serviço
precisa logar manualmente.

| Campo | Tipo | Observação |
|---|---|---|
| tabela | string | onde ocorreu a alteração |
| registro_id | string | id do registro alterado |
| acao | enum | criar · atualizar · excluir |
| resumo | string | nome do registro criado ou campos alterados |
| usuario | string | e-mail da sessão ("sistema" quando automático) |
| criado_em | ISO 8601 | |

### parametros
| Campo | Tipo | Observação |
|---|---|---|
| chave | string | ex.: `bloco_agenda_min` |
| valor | string | convertido conforme `tipo` |
| tipo | enum | numero · percentual · min_por_m2 · texto |
| descricao | string | |
| sede_id | string | `geral` ou id da sede (override) |
| editavel_por_supervisor | boolean | |
| ativo, auditoria | | quem alterou e quando |

**Resolução de parâmetros:** padrão do sistema → sobrescrito pelos registros
`geral` → sobrescrito pelos registros da sede.

**Parâmetros iniciais:**

| chave | valor | tipo | escopo |
|---|---|---|---|
| bloco_agenda_min | 30 | numero | geral |
| ocupacao_baixa | 60 | percentual | geral |
| ocupacao_adequada | 85 | percentual | geral |
| ocupacao_alta | 100 | percentual | geral |
| desvio_justificativa_percentual | 30 | percentual | geral |
| tolerancia_sobrecarga_min | 0 | numero | geral |
| min_execucoes_ajuste | 3 | numero | geral |
| desvio_ajuste_percentual | 15 | percentual | geral |

## Google Sheets (banco provisório)

Uma planilha com **11 abas** com exatamente os nomes das tabelas acima
(`usuarios`, `funcionarios`, `sedes`, `locais`, `tarefas`,
`rotinas_planejadas`, `execucoes_realizadas`, `parametros`, `modelos_rotina`,
`ausencias`, `historico`). A linha 1 é o
cabeçalho com os nomes das colunas; cada linha seguinte é um registro.
Booleanos são gravados como `TRUE`/`FALSE`; datas/horas como texto.

O endpoint `POST /api/setup` (admin) cria as abas e cabeçalhos automaticamente
— ver [06-setup-google-sheets.md](06-setup-google-sheets.md).
