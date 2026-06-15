# Orkestria — Contexto completo do sistema (documento para IA)

> **Como usar este documento:** ele é autocontido. Cole-o numa conversa com uma
> IA (Claude, etc.) e ela terá o contexto completo do projeto — o que é, para
> quem, como funciona, regras de negócio, arquitetura e estado atual — sem
> precisar de nenhum outro arquivo.

> **INSTRUÇÕES PARA A IA (leia antes de responder):**
> 1. Responda **somente com base neste documento**. Se algo perguntado não
>    estiver descrito aqui, diga claramente *"isso não consta no escopo
>    documentado do Orkestria"* — **não invente nem suponha** funcionalidades,
>    prazos ou números.
> 2. Fale em **linguagem de gestão**, não técnica: foque no que o sistema
>    resolve e entrega. Só entre em detalhes de tecnologia (seção 6) se for
>    explicitamente perguntado.
> 3. Quando perguntarem *"o sistema faz X?"* ou *"atende a necessidade Y?"*,
>    confira nas seções 4 (funcionalidades) e 5 (regras) e responda de forma
>    direta: **faz / não faz / está planejado** (seção 7), citando onde no
>    sistema isso aparece.
> 4. Lembre o leitor, quando fizer sentido, que ele pode **ver o sistema
>    funcionando** na URL da seção 8 — ler descreve, usar comprova.

---

## 1. Identificação

- **Nome:** Orkestria — "porque ele orquestra as rotinas" (nome definitivo)
- **Tipo:** sistema web interno (intranet/uso da equipe)
- **Domínio:** gestão de rotinas operacionais de equipes de **ASG/serviços
  gerais** (limpeza e conservação) distribuídas em várias sedes
- **Usuários:** supervisores e coordenadores (quem planeja) e gerência (quem
  analisa). **Os ASGs não usam o sistema** — recebem a rotina em fichas de
  papel impressas pelo próprio sistema.
- **Status:** **Em produção.** MVP + Fase 2 concluídos; banco definitivo
  **Firebase Firestore ativo** (dados reais persistindo) e sistema publicado
  na web (Vercel: https://orkestria-christus.vercel.app).
- **Identidade visual:** design system "Partitura" — marfim de papel de
  partitura, tinta evergreen, vinho amaranto como acento; fontes Fraunces
  (títulos), Albert Sans (corpo), Spline Sans Mono (números). Nome e logo
  remetem à orquestração de rotinas.

## 2. O problema que resolve

Supervisores de serviços gerais distribuem tarefas de cabeça ou em planilhas
soltas. Não há visibilidade de: quem está com a rotina cheia ou vazia, quanto
da jornada está realmente planejado, qual sede/local consome mais esforço, e
se os tempos estimados batem com a prática. O sistema responde a perguntas
como: *Quem está sobrecarregado? Quanto tempo está ocioso? Precisamos de mais
gente nesta sede? Qual tarefa está mal estimada?*

**Diretriz central (importante):** a ferramenta é de **planejamento e
dimensionamento, não punitiva**. "Ociosidade" significa *tempo sem tarefa
planejada* — um problema de planejamento a corrigir, não prova de que alguém
ficou parado. O confronto previsto × realizado serve para **melhorar os tempos
padrão**, não para vigiar pessoas.

## 3. Conceitos do domínio

- **Hierarquia obrigatória:**
  `Sede → Local → Tarefa → Rotina Planejada → Execução Realizada`.
  Todo local pertence a uma sede (não existe "Recepção" genérica — existe
  "Recepção — Sede Aldeota" com 80 m² e "Recepção — Sede DT" com 45 m²,
  registros distintos com tempos distintos). Toda tarefa pertence a um local e
  **herda a sede dele automaticamente**.
- **Jornada líquida** = saída − entrada − intervalo. Ex.: 07:00–16:00 com 1h
  de almoço = 8h. A jornada pode variar por dia da semana: o funcionário tem
  uma **escala** (seg–sex, seg–sáb ou todos os dias) e pode ter horário
  próprio de sábado (ex.: turno de 4h, escala de 44h). Em dias fora da escala
  a agenda mostra "Folga" e bloqueia tarefas.
- **Tempo previsto da tarefa** depende da regra de cálculo: **fixo** (ex.:
  reposição = 15min), **por m²** (ex.: 1 min/m² × 80 m² = 80min), **por
  unidade** (ex.: 20min × nº de banheiros) ou **manual**.
- **Blocos:** a agenda é dividida em blocos de 30min (parametrizável). Uma
  tarefa de 80min ocupa ⌈80/30⌉ = 3 blocos (90min visuais). O sistema guarda
  os dois números: `tempo_previsto_min` (80 — usado em ocupação e
  produtividade) e `tempo_visual_min` (90 — usado só no desenho da agenda).
- **Ocupação** = tempo planejado ÷ jornada líquida × 100. Classificação
  (parametrizável): 0–60% subutilizado · 61–85% adequado · 86–100% alta
  ocupação · >100% sobrecarga.
- **Ociosidade prevista** = jornada líquida − tempo planejado.
- **Desvio** = tempo real − tempo previsto; desvio % acima do parâmetro (30%)
  exige justificativa do supervisor.

## 4. Funcionalidades por tela

| Tela | O que faz |
|---|---|
| **Rotina do dia** (principal) | Agenda visual: colunas por funcionário, linhas por bloco de 30min. Paleta de tarefas à esquerda (filtros por andar/tipo/prioridade); arrastar para alocar, arrastar card para mover, alça inferior para redimensionar duração, × para remover. Intervalo hachurado e bloqueado. Painel direito com resumo do funcionário (jornada, planejado, ociosidade, ocupação %, status) e da equipe. Salvamento automático a cada ação. Alternância **Dia/Semana** (visão semanal resume cada dia por funcionário; clique abre o dia). Botões: Duplicar dia para período (com dias da semana), salvar/aplicar **modelos de rotina**, imprimir **fichas** |
| **Painéis na tela de rotina** | "Cobertura de ausência": tarefas de funcionários ausentes com sugestão de colegas por ociosidade e remanejo em 1 clique. "Ficou de fora hoje": tarefas diárias não alocadas + periódicas vencidas |
| **Acompanhamento** | Registrar o realizado por tarefa: status (realizada conforme/com atraso/parcial/não realizada/remanejada/cancelada), horários e tempo real, desvio em tempo real, **justificativa obrigatória** quando desvio > 30% ou status crítico. Banner de dias anteriores sem registro. Exportação CSV |
| **Dashboard** | KPIs (funcionários ativos, tarefas, tempo planejado/realizado, ociosidade, ocupação média, sobrecarga, subutilizados), ocupação por funcionário, top locais por tempo, tempo por sede, tarefas por status, **top 10 desvios previsto × realizado** e **sugestões de ajuste de tempo padrão** (quando a mediana real desvia ≥15% em ≥3 execuções, aplica o novo tempo base com 1 clique). Filtros por período/sede. Exportação CSV |
| **Cadastros** | Sedes, Funcionários (jornada/turno/intervalo), Locais (sede+andar+tipo+metragem), Tarefas (local+regra+tempo base+frequência+prioridade), Ausências (falta/atestado/férias/folga por período), Parâmetros (globais ou por sede, com auditoria), Usuários (só admin) |
| **Histórico** | Log automático de toda criação/alteração/exclusão com autor, campos alterados e horário |
| **Fichas** (`/rotinas/imprimir`) | Ordem de serviço em papel por funcionário: tarefas com horário/local/tempo, checkbox feito sim/não, anotações e assinaturas. Uma página por funcionário |

## 5. Regras de negócio essenciais

1. Não existe local sem sede, nem tarefa sem local; a tarefa herda a sede do local.
2. Todo funcionário pertence a uma sede; rotina exige funcionário+tarefa+local+sede+data+hora.
3. A agenda **bloqueia**: sobreposição de tarefas, alocação no intervalo,
   fora do expediente, funcionário ausente, tarefa sem tempo previsto,
   funcionário sem jornada, e **restrição de gênero** (tarefa marcada como
   "apenas mulheres"/"apenas homens" só pode ir para ASG do gênero
   correspondente — ex.: banheiro feminino). Intervalo e sobreposição podem ser
   **autorizados manualmente** (com confirmação; a rotina fica marcada
   "[Autorizado manualmente]"); a restrição de gênero é bloqueio rígido.
4. Sobrecarga (>100%) e local sem metragem **alertam mas não bloqueiam**.
5. Toda validação roda duas vezes: no navegador (feedback imediato) e no
   servidor (definitiva) — o servidor recalcula todos os tempos e nunca confia
   no cliente.
6. Justificativa obrigatória: desvio real > 30% (parametrizável) ou tarefa não
   realizada/remanejada/cancelada.
7. Exclusão de cadastros com histórico é bloqueada (orienta a inativar) — os
   relatórios antigos nunca quebram.
8. Permissões: **administrador** (tudo), **supervisor** (cadastros e rotinas
   apenas da própria sede; parâmetros quando autorizado), **visualizador/
   gerência** (só leitura).
9. Tudo é auditado: campos criado_por/atualizado_por + log automático na
   tabela `historico`.

## 6. Arquitetura técnica

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · SWR ·
  drag-and-drop nativo HTML5 · sessão via cookie HMAC httpOnly.
- **Camadas:** `Frontend → API interna (app/api) → Serviços (services/) →
  DataSource (lib/datasource.ts)`. **A interface nunca sabe de onde vêm os
  dados.**
- **Bancos plugáveis** (variável `DATA_SOURCE`):
  - `memory` — demo com dados de exemplo (roda sem configurar nada);
  - `sheets` — **Google Sheets como banco provisório** (service account; 11
    abas; setup automático via `POST /api/setup`);
  - `firebase` — **Firebase Firestore como banco definitivo** (firebase-admin;
    cada tabela vira coleção; migração de dados via `POST /api/migrar-firebase`).
- **Login do MVP:** e-mail cadastrado na tabela de usuários (define perfil e
  sede) + senha única de acesso (env). Evolução planejada: Firebase
  Authentication com senha individual.
- **Modelo de dados (11 tabelas):** `usuarios`, `sedes`, `funcionarios`,
  `locais`, `tarefas`, `rotinas_planejadas`, `execucoes_realizadas`,
  `parametros`, `modelos_rotina`, `ausencias`, `historico`. Campos em
  snake_case, espelhados entre TypeScript, abas do Sheets e coleções do
  Firestore.
- **Cálculos como funções puras** compartilhadas entre cliente e servidor
  (`lib/calculations.ts`, `lib/validations.ts`).

## 7. Estado atual e roadmap

**Em produção e verificado:** tudo na seção 4, mais — banco **Firebase
Firestore ativo** (`DATA_SOURCE=firebase`, dados migrados e operações de
escrita/leitura/validação testadas contra o banco real), **publicado na
Vercel** (deploy automático a cada push no GitHub: `napa14-design/Orkestria`),
**responsivo** (otimizado para notebook ~1366×768; em telas pequenas a tela de
rotina empilha e o Acompanhamento vira cards; montar rotina por arrasto é
desktop), e **paginação de funcionários** na agenda (8 por página + busca por
nome) para sedes grandes (de 8 a 50+ ASGs).

**Próximos passos planejados (em ordem de prioridade):**
1. **Firebase Authentication** (senha individual por usuário) — hoje o acesso
   ainda usa uma senha única compartilhada definida em variável de ambiente;
   é o principal item de segurança pendente.
2. Regras de segurança do Firestore + `COOKIE_SECURE=true` em produção.
3. Testes automatizados dos cálculos/validações (funções puras).
4. Com volume de dados: consultas indexadas por data/sede; arquivamento do
   histórico.
5. Visão gerencial comparando sedes + relatório PDF para a diretoria.
6. Fase futura (após meses de dados): app/QR Code/ponto — hoje
   intencionalmente fora do escopo.

## 8. Como acessar / rodar

**Em produção (uso real):** https://orkestria-christus.vercel.app — roda sobre
o Firebase, com os dados reais. O deploy é automático: todo push no
repositório `napa14-design/Orkestria` gera uma nova versão no ar.

**Localmente (desenvolvimento):**
```bash
npm install
copy .env.example .env   # DATA_SOURCE=memory roda sem credenciais (modo demo)
npm run dev              # http://localhost:3000
```

Perfis de acesso (no modo demo): `admin@empresa.com` (administrador),
`supervisor.aldeota@empresa.com` (supervisor de uma sede) ou
`gerencia@empresa.com` (visualizador, só leitura). Em produção, os usuários e a
senha de acesso são definidos pelo administrador.

## 9. Mapa de arquivos para quem for mexer no código

- `DIARIO.md` — **última mudança e histórico de evolução (ler primeiro)**
- `CLAUDE.md` — instruções para sessões de IA (regras de arquitetura)
- `docs/01..07` — documentação funcional, modelo de dados, regras/fórmulas,
  arquitetura, backlog, setup do Sheets, migração Firebase
- `lib/` — cálculos, validações, permissões, sessão, datasources, schema
- `services/` — regras de negócio por entidade
- `app/api/` — rotas REST; `app/(app)/` — telas; `components/` — UI

## 10. Resumo em uma frase

> Sistema web em que supervisores de serviços gerais montam visualmente a
> rotina diária da equipe (arrastar tarefas em blocos de 30min), enxergam na
> hora ocupação/ociosidade/sobrecarga de cada funcionário, registram o que foi
> realizado e usam os desvios para calibrar os tempos padrão — em produção
> sobre Firebase, com a camada de dados desacoplada (já passou por memória e
> Google Sheets sem reescrever o sistema).
