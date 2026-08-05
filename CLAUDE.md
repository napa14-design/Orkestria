# CLAUDE.md — instruções para sessões de IA neste projeto

## ⛔ Antes de criar qualquer tela, controle, campo ou decisão

**Leia [docs/00-doutrina.md](docs/00-doutrina.md) e passe pelo portão das cinco
perguntas.** Tem força de regra arquitetural. Princípio central: **dados crescem;
operação encolhe** — nada novo entra sem apagar algo velho da rotina do
supervisor. Bug, texto e refino interno passam direto; aumento de superfície do
produto, não.

## O que é este projeto

**Orkestria**: sistema web de planejamento visual de rotinas operacionais para
equipes de ASG/serviços gerais. Supervisores montam a agenda diária por
drag-and-drop (blocos de 30min), o sistema calcula jornada líquida, ocupação,
ociosidade prevista e sobrecarga, e confronta previsto × realizado.
Tudo em **português brasileiro** — código, UI, docs e mensagens.

## ⚠️ Primeiro passo de toda sessão

**Leia a primeira entrada de [DIARIO.md](DIARIO.md)** — ela diz qual foi a
última mudança e o estado atual do sistema.

## ⚠️ Último passo de toda mudança

**Adicione uma nova entrada NO TOPO de [DIARIO.md](DIARIO.md)** com data,
título, o que mudou e os arquivos principais. Nunca edite entradas antigas.

## Regras de arquitetura (não violar)

1. **A interface nunca acessa o banco.** Frontend → rotas em `app/api/` →
   `services/*` → interface `DataSource` (`lib/datasource.ts`). As
   implementações são: memória (demo), Google Sheets (provisório) e Firebase
   Firestore (definitivo) — escolhidas por `DATA_SOURCE` no `.env`.
2. **`lib/schema.ts` é a fonte de verdade** das tabelas/colunas. Nova tabela =
   atualizar `MapaTabelas` + `SCHEMA` + seed do `lib/memoryStore.ts` + docs.
3. **Cálculos e validações são funções puras** (`lib/calculations.ts`,
   `lib/validations.ts`) usadas no cliente (feedback imediato) E no servidor
   (validação definitiva). O servidor nunca confia em números do cliente.
4. **Campos em snake_case** (espelham colunas do Sheets e docs do Firestore).
5. **Hierarquia obrigatória**: local sempre tem sede; tarefa sempre tem local e
   herda a sede dele; rotina sempre tem funcionário+tarefa+local+sede+data+hora.
6. **Auditoria**: toda escrita já é logada automaticamente na tabela
   `historico` pelo decorator `lib/historico.ts` — não criar logs manuais.
7. **Permissões**: supervisor só altera as sedes que opera — `sede_id`
   (principal) + `sedes_extra`, resolvidas por `sedesPermitidas`; as telas
   mostram **uma sede por vez**, nunca agregam; visualizador só lê;
   parâmetros respeitam `editavel_por_supervisor` (`lib/permissions.ts`).

## Comandos

```powershell
npm run dev      # desenvolvimento (http://localhost:3000)
npm run build    # build de produção — RODAR antes de declarar pronto
npm run start    # servidor de produção
```

Não há usuários de demonstração. Para rodar com `DATA_SOURCE=memory`, defina
`DEV_ADMIN_EMAIL` e `DEV_ADMIN_SENHA` no `.env` — o seed cria só esse
administrador. Em produção, o primeiro acesso de cada pessoa é por **código
individual** gerado em Sistema › Usuários.

## Onde está o quê

| Coisa | Lugar |
|---|---|
| Visão geral para humanos | `README.md` |
| Visão geral para IA/gerência | `CONTEXTO-IA.md` |
| Última mudança / estado atual | `DIARIO.md` (primeira entrada) |
| Documentação funcional, modelo de dados, regras, arquitetura, backlog | `docs/01..07` |
| Tela principal (agenda drag-and-drop) | `app/(app)/rotinas/page.tsx` + `components/agenda/` |
| Fórmulas (jornada, blocos, ocupação, desvio) | `lib/calculations.ts` |
| Validações (conflito, intervalo, sobrecarga…) | `lib/validations.ts` |
| Troca de banco / migração Firebase | `lib/datasource.ts`, `docs/07-migracao-firebase.md` |

## Estilo visual

Design system **"Partitura"** em `app/globals.css`: marfim de papel de
partitura, tinta evergreen (#223127), vinho amaranto (#9C0D38) como acento,
bordas firmes, sombras duras e rótulos mono em caixa alta. Fontes: Fraunces
(display/serif), Albert Sans (corpo), Spline Sans Mono (números). A marca é
"Orkestr" + "ia" em destaque. Manter a identidade ao criar telas novas.

## Pendências conhecidas

- Firebase Authentication (substituir cookie HMAC + senha única) — aguarda o
  projeto Firebase real do usuário.
- `FirebaseDataSource` nunca foi testado contra um Firestore real (sem
  credenciais nesta máquina).
- Consultas quentes usam `DataSource.consultar` (Firestore `where`). O padrão é
  campo único (índice automático); a **exceção** são as consultas por **sede +
  data** em `rotinas_planejadas`/`execucoes_realizadas`, que usam índice composto
  declarado em `firestore.indexes.json` — sem isso, ver uma sede leria o dia das
  17 (≈17× leituras). **Deploy dos índices**: `firebase deploy --only
  firestore:indexes` (ou colar os campos no Console → Firestore → Índices) —
  necessário uma vez em produção. Ao criar nova consulta multi-campo, adicione o
  índice lá. A tela de Histórico sem filtro de tabela ainda lê a coleção inteira.
