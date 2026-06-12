# Orkestria — Documentação Funcional

Sistema web para planejamento visual de rotinas operacionais, distribuição de
tarefas por funcionário, cálculo de ocupação da jornada e análise de
produtividade prevista × realizada, voltado a equipes de ASG/serviços gerais.

## 1. Visão geral

- **Quem usa:** supervisores e coordenadores (os ASGs não acessam o sistema na fase inicial).
- **O que faz:** cadastra sedes, locais (com metragem), tarefas (com regra de tempo),
  funcionários (com jornada) e monta a rotina diária numa agenda visual com blocos
  de 30 minutos e arrastar-e-soltar.
- **O que calcula:** jornada líquida, tempo planejado, ocupação (%), ociosidade
  prevista, sobrecarga e, na Fase 2, desvio previsto × realizado.

### Diretriz principal

O sistema é uma ferramenta de **planejamento, dimensionamento e melhoria
operacional — não punitiva**. "Ociosidade" significa *tempo sem tarefa
planejada*, não prova de que o funcionário ficou parado. O objetivo é equilibrar
a distribuição de tarefas e gerar dados para justificar equipe, remanejamento ou
revisão de processos.

## 2. Hierarquia de dados

```
Sede
 └─ Local            (obrigatoriamente vinculado a uma sede)
     └─ Tarefa       (obrigatoriamente vinculada a um local; herda a sede)
         └─ Rotina Planejada     (funcionário + tarefa + data + horário)
             └─ Execução Realizada   (Fase 2: o que de fato aconteceu)
```

Não existe local genérico: "Recepção — Sede Aldeota" (80 m²) e "Recepção — Sede
DT" (45 m²) são **registros distintos**, com metragens, tempos e rotinas próprios.

## 3. Perfis e permissões

| Ação | Administrador | Supervisor | Visualizador/Gerência |
|---|---|---|---|
| Cadastrar usuários | ✔ | ✘ | ✘ |
| Cadastrar sedes | ✔ | ✘ | ✘ |
| Cadastrar funcionários/locais/tarefas | ✔ (todas) | ✔ (própria sede) | ✘ |
| Editar parâmetros gerais | ✔ | ✔ (quando `editavel_por_supervisor`) | ✘ |
| Montar/editar rotinas | ✔ | ✔ (própria sede) | ✘ |
| Registrar execução realizada | ✔ | ✔ | ✘ |
| Dashboards e relatórios | ✔ (tudo) | ✔ (sua sede) | ✔ |

O perfil e a sede do usuário vêm do cadastro na tabela `usuarios`; a sede
`geral` dá acesso a todas as sedes.

## 4. Módulos

1. **Login e permissões** — autenticação por e-mail cadastrado + senha de acesso
   (MVP); sessão em cookie assinado; middleware bloqueia rotas sem sessão.
2. **Funcionários** — jornada (entrada/saída/intervalo), turno, sede obrigatória;
   jornada líquida calculada automaticamente.
3. **Sedes** — unidades atendidas (Aldeota, DT, Centro, …).
4. **Locais** — sempre com sede, andar, tipo e metragem; metragem zerada gera alerta.
5. **Tarefas** — sempre com local; sede herdada; regra de cálculo (fixo, por m²,
   por unidade, manual), frequência e prioridade.
6. **Parâmetros gerais** — bloco da agenda, limites de ocupação, % de desvio que
   exige justificativa; escopo global ou por sede; auditoria de quem alterou.
7. **Rotinas planejadas** — agenda do dia por funcionário, montada por drag-and-drop.
8. **Execuções realizadas** (Fase 2) — status real, tempo real, justificativas.
9. **Dashboard** — KPIs e rankings com filtros de período/sede.

## 5. Tela principal (Rotina do dia)

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPO: Data · Sede · Turno · Duplicar dia · Dashboard                  │
├───────────────┬──────────────────────────────────┬───────────────────┤
│ ESQUERDA      │ CENTRO                           │ DIREITA           │
│ Tarefas       │ Agenda: colunas = funcionários   │ Resumo do         │
│ disponíveis   │ linhas = blocos de 30 min        │ funcionário:      │
│ (filtros por  │ · intervalo hachurado/bloqueado  │ jornada líquida,  │
│ andar, tipo,  │ · cards coloridos por status     │ tempo planejado,  │
│ prioridade,   │ · arrastar p/ alocar e mover     │ ociosidade, %,    │
│ busca)        │ · × para remover                 │ status; equipe    │
└───────────────┴──────────────────────────────────┴───────────────────┘
                       Alertas flutuantes (conflito, sobrecarga, …)
```

Comportamentos da agenda:

- Soltar tarefa numa coluna cria a rotina no bloco em que foi solta.
- Arrastar um card existente muda horário e/ou funcionário.
- O sistema **bloqueia**: conflito de horário, alocação no intervalo, tarefa fora
  do expediente, tarefa sem tempo previsto, funcionário sem jornada.
- O sistema **alerta (sem bloquear)**: sobrecarga (>100%), local sem metragem.
- Persistência: cada ação é salva automaticamente (não há estado local não salvo).

### Cores

| Cor | Significado |
|---|---|
| Cinza | horário livre |
| Azul | tarefa planejada |
| Verde | tarefa realizada / ocupação adequada |
| Amarelo | alta ocupação |
| Vermelho | sobrecarga ou conflito |
| Laranja | pendente / atenção / remanejada |
| Hachura escura | intervalo bloqueado |

## 6. Fluxos principais

**Fluxo 1 — Cadastro inicial:** admin cadastra sedes → admin/supervisor cadastra
funcionários → supervisor cadastra locais da sede → tarefas dos locais →
parâmetros → sistema calcula tempos teóricos.

**Fluxo 2 — Planejamento:** supervisor abre Rotina do dia → escolhe data/sede/
turno → arrasta tarefas → sistema calcula ocupação e alerta conflitos → rotina
fica salva.

**Fluxo 3 — Acompanhamento (Fase 2):** supervisor marca cada tarefa como
realizada/não realizada/remanejada → informa tempo real → justifica desvios
acima do parâmetro → indicadores atualizam.

**Fluxo 4 — Análise gerencial:** gestor filtra o dashboard por período/sede →
identifica sobrecarga, subutilização e tarefas mal estimadas → ajusta tempos
padrão nos parâmetros.

## 7. Perguntas que o sistema responde

Quem está com rotina cheia/vazia? Quem está sobrecarregado? Qual sede demanda
mais tempo? Qual local consome mais esforço? Qual tarefa está mal estimada?
Quanto da jornada está planejado e quanto está ocioso? A distribuição está
equilibrada? O tempo teórico bate com a prática? Precisa de mais gente em qual
sede? Quais tempos padrão precisam de revisão?
