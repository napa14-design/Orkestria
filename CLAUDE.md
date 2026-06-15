# CLAUDE.md — instruções para sessões de IA neste projeto

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
7. **Permissões**: supervisor só altera a própria sede; visualizador só lê;
   parâmetros respeitam `editavel_por_supervisor` (`lib/permissions.ts`).

## Comandos

```powershell
npm run dev      # desenvolvimento (http://localhost:3000)
npm run build    # build de produção — RODAR antes de declarar pronto
npm run start    # servidor de produção
```

Login demo (DATA_SOURCE=memory): `admin@empresa.com` ou
`supervisor.aldeota@empresa.com`, senha `mudar123`.

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
- Consultas quentes já usam `DataSource.consultar` (Firestore `where` por campo
  único — índice automático, sem índice composto). A tela de Histórico sem
  filtro de tabela ainda lê a coleção inteira (ordenar+limitar exigiria índice).
