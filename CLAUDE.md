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
npm test         # testes — RODAR antes de declarar pronto
npm run emulador # emulador do Firestore (precisa de Java; usa npx, sem instalar nada)
```

Os testes cobrem `lib/`, o **contrato do `DataSource`** e as invariantes do bloco
planejado via `services/`. **Mudou regra de cálculo, validação ou permissão?
Acrescente o caso lá** — foi assim que apareceu um `verificarSenha` que aceitava
qualquer senha quando o hash guardado era `":"`.

### Rodar o contrato contra o Firestore de verdade

`npm test` sozinho roda o contrato só contra o banco de memória e **pula** a perna
do Firestore. Para provar que os dois concordam, suba o emulador numa janela e
rode a suíte com a variável na outra:

```powershell
npm run emulador                              # deixe rodando — CONFIRA que subiu
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085" # e então:
npm test                                      # 190 testes, não 167
```

A variável é a **trava de segurança**: sem ela o adaptador do Firestore nem é
construído, então não existe caminho para o teste escrever na base real. Se ela
apontar para host não-local, o contrato para de propósito.

⚠️ **Confira que o emulador subiu antes de confiar no resultado.** A porta é a
**8085**, e não a 8080 padrão, justamente porque a 8080 costuma estar ocupada por
emulador de outro projeto — e aí o `emulators:start` falha com *"port taken"*
enquanto a suíte roda alegremente contra o emulador alheio. Aconteceu comigo em
20/08: os testes passaram, o resultado era tecnicamente válido (é Firestore de
verdade), mas o comando documentado não era o que estava servindo.

Três bugs de produção nasceram do banco de memória ser mais permissivo que o
Firestore (`push` × `set`, `undefined` aceito, `undefined` apagando valor no
`atualizar`). O contrato existe para essa família não voltar — e ele só prova o
que promete quando roda **nos dois**.

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

## Build (Next 16)

O build roda com **`--webpack`** de propósito (`next build --webpack`): o Next 16
usa Turbopack por padrão e aborta ao ver config webpack, e a nossa regra injeta o
`DIARIO.md` no bundle como texto — Turbopack não tem equivalente nativo, e `fs`
não serve porque na Vercel o arquivo da raiz não vai para a função serverless.
Migrar para Turbopack passa por resolver esse import.

`overrides: { uuid: "^11.1.1" }` no `package.json` existe para zerar a auditoria:
sem ele, a única "correção" que o npm oferece é downgrade de `firebase-admin` e
`exceljs`. Não remover sem rodar `npm audit`.

**`firebase-admin` está preso no 13.x de propósito.** O 14 puxa `jwks-rsa@4` →
`jose@6`, que é ESM puro (sem nenhuma build CommonJS). Na função serverless da
Vercel o `require()` de ESM falha com `ERR_REQUIRE_ESM` **mesmo em Node 24**, que
suporta `require(esm)` — o mesmo build funciona localmente, então não dá para
pegar isso sem medir em produção. Quem usa essa cadeia é só o `verifyIdToken` do
**login com Google**: ele para de carregar e o resto do sistema segue normal, o
que faz o sintoma parecer coisa de credencial. O 13.10 traz `jose@4`, com build
CommonJS, e mantém `npm audit` em 0. Para subir para 14, primeiro troque a
verificação do token por algo sem `jwks-rsa` (a API REST do Identity Toolkit,
`accounts:lookup`, resolve com a apiKey pública).

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
