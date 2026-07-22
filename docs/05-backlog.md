# Backlog — MVP, Fase 2 e Fase 3

## MVP (entregue neste repositório)

| # | História | Status |
|---|---|---|
| 1 | Login simples por e-mail cadastrado + senha de acesso | ✔ |
| 2 | Perfis administrador/supervisor/visualizador com permissões por sede | ✔ |
| 3 | CRUD de sedes | ✔ |
| 4 | CRUD de funcionários com jornada e cálculo de jornada líquida | ✔ |
| 5 | CRUD de locais vinculados obrigatoriamente a sedes (com metragem) | ✔ |
| 6 | CRUD de tarefas vinculadas a locais, com sede herdada e 4 regras de cálculo | ✔ |
| 7 | CRUD de parâmetros gerais (globais e por sede) com auditoria | ✔ |
| 8 | Agenda diária com blocos de 30 min (parametrizável) | ✔ |
| 9 | Arrastar tarefa da paleta para o funcionário | ✔ |
| 10 | Mover tarefa de horário/funcionário; remover tarefa | ✔ |
| 11 | Bloqueio de conflito, intervalo, fora de expediente | ✔ |
| 12 | Alerta de sobrecarga e de local sem metragem | ✔ |
| 13 | Resumo por funcionário: jornada, planejado, ociosidade, ocupação %, status | ✔ |
| 14 | Duplicar rotina do dia para outra data | ✔ |
| 15 | Persistência no Google Sheets (ou memória para demo) | ✔ |
| 16 | Setup automático das abas da planilha (`POST /api/setup`) | ✔ |
| 17 | Dashboard com KPIs, ocupação por funcionário, top locais, tempo por sede, tarefas por status | ✔ |

Fora do MVP (por decisão de escopo): app mobile, ponto eletrônico,
geolocalização, QR Code, IA, integrações complexas.

## Fase 2 — Realizado × Previsto

| # | História | Observação |
|---|---|---|
| F2-1 | Tela de acompanhamento do dia: marcar realizada/não realizada/remanejada | ✔ entregue (`/acompanhamento`) |
| F2-2 | Informar tempo real e horários reais (com cálculo pelo horário) | ✔ entregue |
| F2-3 | Justificativa obrigatória quando desvio > parâmetro ou status crítico | ✔ entregue (cliente + servidor) |
| F2-4 | Comparação previsto × realizado no dashboard (tempo realizado + top 10 desvios) | ✔ entregue |
| F2-5 | Exportação Excel (CSV com BOM, separador “;”) no dashboard e acompanhamento | ✔ entregue (PDF: usar imprimir do navegador; relatório dedicado fica p/ Fase 3) |
| F2-6 | Modelos de rotina + duplicação para período com dias da semana | ✔ entregue (aba `modelos_rotina`; conflitos no destino são pulados) |
| F2-7 | Redimensionar duração do card na agenda (alça inferior, blocos) | ✔ entregue |
| F2-8 | Autorização manual para intervalo/sobreposição (confirmação + marca "[Autorizado manualmente]") | ✔ entregue |
| F2-9 | Histórico de alterações (log automático de toda escrita, tela `/historico`) | ✔ entregue (aba `historico`) |
| F2-10 | Gestão de usuários pela interface (tela restrita a administradores) | ✔ entregue (`/usuarios`) |
| F2-11 | Alerta "tarefa planejada sem status ao final do dia" (banner de dias anteriores no Acompanhamento) | ✔ entregue |
| F2-12 | Ausências (falta/atestado/férias/folga) com coluna bloqueada na agenda e painel de cobertura/remanejamento | ✔ entregue (`/ausencias` + aba `ausencias`) |
| F2-13 | Fichas de rotina imprimíveis por funcionário (ordem de serviço em papel) | ✔ entregue (`/rotinas/imprimir`) |
| F2-14 | Cobertura de frequência: diárias não alocadas e periódicas vencidas no dia | ✔ entregue (painel na tela de rotina) |
| F2-15 | Sugestão de ajuste de tempo padrão pela mediana do realizado (aplicável com 1 clique) | ✔ entregue (dashboard; parâmetros `min_execucoes_ajuste` e `desvio_ajuste_percentual`) |
| F2-16 | Visão semanal da agenda (resumo por funcionário × dia, clique abre o dia) | ✔ entregue (alternância Dia/Semana) |
| F2-17 | Proteção "inativar em vez de excluir": exclusão bloqueada quando há histórico vinculado | ✔ entregue (sedes, funcionários, locais, tarefas) |

## Fase 3 — Migração para Firebase Firestore

| # | Item | Status |
|---|---|---|
| F3-1 | Implementar `FirebaseDataSource` (mesma interface `DataSource`) | ✔ entregue |
| F3-2 | Migração de dados Sheets/memória → Firestore (`POST /api/migrar-firebase`) | ✔ entregue |
| F3-3 | Firebase Authentication (substitui cookie HMAC + senha única) | |
| F3-4 | Consultas indexadas por data/sede nas rotinas (performance) | ✔ entregue (`firestore.indexes.json`) |
| F3-5 | Histórico de alterações (coleção `historico`) | |
| F3-6 | Backup automático (exportação agendada do Firestore) e relatórios gerenciais | |

Detalhes em [07-migracao-firebase.md](07-migracao-firebase.md).

## Nome do sistema

**Orkestria** (definitivo, escolhido em 2026-06-12) — "porque ele orquestra as
rotinas". O nome inspirou a identidade visual "Partitura" (marfim + evergreen
+ vinho amaranto, Fraunces/Albert Sans/Spline Sans Mono).
