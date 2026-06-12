# Regras de Negócio e Cálculos

Implementação de referência: [lib/calculations.ts](../lib/calculations.ts) e
[lib/validations.ts](../lib/validations.ts) — funções puras usadas igualmente
no cliente (feedback imediato) e no servidor (validação definitiva).

## 1. Regras essenciais

1. Não permitir cadastrar **local sem sede**.
2. Não permitir cadastrar **tarefa sem local**.
3. Toda tarefa **herda a sede do local** (nunca informada manualmente).
4. Todo funcionário precisa estar vinculado a uma sede.
5. Toda rotina planejada precisa ter funcionário, tarefa, local, sede, data e horário.
6. Não permitir tarefa durante o intervalo (bloqueio; autorização manual fica para Fase 2).
7. Não permitir sobreposição de tarefas para o mesmo funcionário.
8. Alertar quando a ocupação ultrapassar 100% (alerta, não bloqueio — o supervisor decide).
9. Alertar quando a ocupação ficar abaixo do limite de subutilização.
10. Solicitar justificativa quando o tempo real desviar além do parâmetro.
11. Registrar quem criou/alterou os principais dados (auditoria).
12. Parâmetros podem ser globais (`geral`) ou específicos por sede.
13. Supervisores editam parâmetros apenas quando `editavel_por_supervisor = true`.
14. Ociosidade inicial é **prevista** (baseada no planejamento), não realizada.
15. A comparação com o realizado serve para melhorar a base teórica de tempos.

## 2. Fórmulas

```
jornada_liquida_min        = horario_saida − horario_entrada − intervalo_min
tempo_previsto_min         = regra da tarefa:
                               fixo/manual  → tempo_base_min
                               por_m2       → tempo_base_min × metragem_do_local
                               por_unidade  → tempo_base_min × quantidade
blocos                     = teto(tempo_previsto_min / bloco_agenda_min)
tempo_visual_min           = blocos × bloco_agenda_min
tempo_planejado_min        = Σ tempo_previsto_min das rotinas do dia (exceto canceladas)
ociosidade_prevista_min    = jornada_liquida_min − tempo_planejado_min
ocupacao_prevista_%        = tempo_planejado_min / jornada_liquida_min × 100
tempo_realizado_min        = Σ tempo_real_min informados
ociosidade_realizada_min   = jornada_liquida_min − tempo_realizado_min
desvio_min                 = tempo_realizado_min − tempo_previsto_min
desvio_%                   = desvio_min / tempo_previsto_min × 100
produtividade_m2_hora      = total_m2 / horas (planejada e realizada)
```

### Exemplo de bloco vs. tempo real

Tarefa de 80 min com bloco de 30 min → `teto(80/30) = 3 blocos` → ocupa 90 min
na agenda. O sistema **guarda os dois valores**: `tempo_previsto_min = 80`
(usado em produtividade/ocupação) e `tempo_visual_min = 90` (usado só no
desenho da agenda).

### Exemplo por m²

| Local | Metragem | Regra | Tempo previsto |
|---|---|---|---|
| Recepção — Sede Aldeota | 80 m² | 1 min/m² | 80 min |
| Recepção — Sede DT | 45 m² | 1 min/m² | 45 min |

Mesma tarefa, locais diferentes → tempos diferentes.

## 3. Classificação de ocupação (parametrizável)

| Faixa | Classificação | Cor |
|---|---|---|
| 0–60% | Subutilizado | cinza |
| 61–85% | Adequado | verde |
| 86–100% | Alta ocupação | amarelo |
| > 100% | Sobrecarga | vermelho |

Os limites vêm dos parâmetros `ocupacao_baixa`, `ocupacao_adequada` e
`ocupacao_alta` (globais ou por sede).

## 4. Validações da agenda

| Código | Nível | Situação |
|---|---|---|
| SEM_JORNADA | erro | funcionário sem entrada/saída cadastrada |
| FORA_DO_EXPEDIENTE | erro | bloco começa antes da entrada ou termina após a saída |
| INTERVALO | erro | bloco sobrepõe o intervalo |
| SOBREPOSICAO | erro | conflita com outra tarefa do mesmo funcionário |
| SEM_TEMPO_PREVISTO | erro | tarefa com tempo calculado ≤ 0 |
| LOCAL_SEM_METRAGEM | alerta | regra por m² com metragem zerada |
| SOBRECARGA | alerta | ocupação resultante > `ocupacao_alta` |
| LOCAL_SEM_SEDE / TAREFA_SEM_LOCAL / FUNCIONARIO_SEM_SEDE | erro | violação da hierarquia nos cadastros |
| JUSTIFICATIVA_OBRIGATORIA | erro | desvio > `desvio_justificativa_percentual` ou status crítico sem justificativa (Fase 2) |

**Erro bloqueia a gravação; alerta grava e avisa.**

## 5. Justificativas (Fase 2)

Exigem justificativa: tempo real ±30% do previsto (parametrizável), tarefa não
realizada, remanejada ou cancelada. A regra já está implementada em
[services/execucoesService.ts](../services/execucoesService.ts).
