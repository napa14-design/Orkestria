# Arquitetura Técnica

## Camadas

```
Navegador (React 19 / Next.js 15, App Router)
   │  fetch + SWR (deduplicação e cache de requisições)
   ▼
API interna do Next.js (app/api/**)        ← autenticação, permissões, HTTP
   ▼
Serviços (services/*.ts)                   ← regras de negócio, auditoria
   ▼
DataSource (lib/datasource.ts)             ← interface única de persistência
   ├── MemoryDataSource (lib/memoryStore.ts)        DATA_SOURCE=memory (demo)
   ├── GoogleSheetsDataSource (lib/googleSheetsClient.ts)  DATA_SOURCE=sheets
   └── FirebaseDataSource (lib/firebaseClient.ts)   DATA_SOURCE=firebase (definitivo)
```

**O frontend nunca acessa o banco diretamente.** A interface não sabe de onde
vêm os dados; a troca Sheets → Firebase é uma variável de ambiente
(`DATA_SOURCE`) + a migração de dados via `POST /api/migrar-firebase`.

## Estrutura de pastas

```
app/
  login/                 página pública de login
  (app)/                 rotas autenticadas (layout valida a sessão)
    rotinas/             tela principal (agenda drag-and-drop)
    dashboard/           indicadores
    funcionarios/ sedes/ locais/ tarefas/ parametros/   cadastros
  api/                   rotas REST (auth, CRUD, rotinas, setup)
components/
  AppShell, Modal, CrudManager, DashboardCards
  agenda/  AgendaGrid · TaskPalette · OccupancySummary · FiltersBar · AlertPanel
services/                regras de negócio por entidade (+ erros.ts)
lib/
  datasource.ts          interface DataSource + factory (ponto de migração)
  schema.ts              colunas/tipos de todas as tabelas (fonte de verdade)
  googleSheetsClient.ts  implementação Sheets API v4
  memoryStore.ts         implementação demo com dados de exemplo
  calculations.ts        fórmulas puras (jornada, blocos, ocupação, desvio)
  validations.ts         validações de negócio (erro × alerta)
  permissions.ts         regras por perfil
  session.ts             cookie HMAC de sessão
  api.ts / clientApi.ts  helpers de rota e de fetch
types/                   entidades TypeScript (espelham o schema)
middleware.ts            bloqueio de rotas sem sessão
```

## Decisões e justificativas

| Decisão | Motivo |
|---|---|
| Campos em `snake_case` no TS | espelha as colunas do Sheets e os documentos do Firestore — serialização trivial nas duas pontas |
| Cálculos como funções puras em `lib/` | rodam no cliente (feedback instantâneo no drag) e no servidor (validação definitiva) sem duplicação |
| Servidor recalcula tempos ao gravar rotina | nunca confia nos números do cliente; Sheets não tem constraints |
| Salvamento automático por ação (POST/PUT/DELETE no drop) | evita perda de trabalho e conflitos de "salvar tudo" sobre um backend sem transação |
| Drag-and-drop nativo (HTML5) | zero dependência extra; blocos de 30 min tornam o snap trivial |
| Cache de leitura de 10 s no client do Sheets | reduz chamadas à API do Google (cota) sem ferir consistência do MVP |
| Sessão = cookie HMAC + senha única + e-mail cadastrado | "login simples" do escopo do MVP; substituível por Firebase Authentication na Fase 3 |
| `mutate()` do SWR após cada escrita | a tela reflete imediatamente o estado persistido |

## Autenticação e autorização

1. `middleware.ts` exige o cookie de sessão em toda rota não pública.
2. `lib/session.ts` valida a assinatura HMAC e expõe `obterSessao()`.
3. Cada rota de API passa por `comSessao()` ([lib/api.ts](../lib/api.ts)) e
   aplica `lib/permissions.ts`: supervisor só escreve nas sedes que opera (uma ou várias);
   visualizador não escreve; parâmetros respeitam `editavel_por_supervisor`.

## Limitações conhecidas do banco provisório (Sheets)

- Sem transações nem integridade referencial — o servidor valida tudo antes de
  gravar, mas escritas concorrentes podem se entrelaçar.
- Cotas da API do Google (~300 leituras/min por projeto) — mitigado pelo cache.
- Sem índices: toda consulta lê a aba inteira (aceitável até alguns milhares de
  linhas).

Essas limitações são o motivo da Fase 3 (ver
[07-migracao-firebase.md](07-migracao-firebase.md)).
