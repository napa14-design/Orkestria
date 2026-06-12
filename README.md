# Orkestria

Sistema web de **planejamento visual de rotinas operacionais** para equipes de
ASG/serviços gerais: agenda com blocos de 30 minutos e arrastar-e-soltar,
cálculo automático de jornada líquida, ocupação, ociosidade prevista e
sobrecarga — com Google Sheets como banco provisório e Firebase Firestore
como banco definitivo (já implementado, troca por variável de ambiente).

> Ferramenta de **planejamento e dimensionamento**, não punitiva: ociosidade =
> tempo sem tarefa planejada, não prova de inatividade.

## Rodando em 2 minutos (modo demo)

```powershell
npm install
copy .env.example .env     # DATA_SOURCE=memory já vem como padrão
npm run dev
```

Abra <http://localhost:3000> e entre com:

| E-mail | Perfil | Senha |
|---|---|---|
| `admin@empresa.com` | Administrador | `mudar123` |
| `supervisor.aldeota@empresa.com` | Supervisor (Sede Aldeota) | `mudar123` |
| `gerencia@empresa.com` | Visualizador | `mudar123` |

O modo demo (`DATA_SOURCE=memory`) traz sedes, funcionários, locais, tarefas e
uma rotina de exemplo. Os dados vivem na memória do servidor — reiniciou,
voltou ao estado inicial.

## Usando o Google Sheets como banco (provisório)

Siga [docs/06-setup-google-sheets.md](docs/06-setup-google-sheets.md)
(service account → compartilhar planilha → `.env` com `DATA_SOURCE=sheets` →
`POST /api/setup` cria as abas e cabeçalhos).

## Usando o Firebase Firestore como banco (definitivo)

Siga [docs/07-migracao-firebase.md](docs/07-migracao-firebase.md): crie o
projeto no Firebase, preencha `FIREBASE_*` no `.env`, rode
`POST /api/migrar-firebase` (como admin, com a fonte antiga ainda ativa) para
copiar os dados, e então troque para `DATA_SOURCE=firebase`.

## Como usar

1. **Sedes → Locais → Tarefas → Funcionários** (nessa ordem): todo local exige
   sede, toda tarefa exige local (e herda a sede dele).
2. **Rotina do dia**: escolha data/sede/turno e arraste tarefas da paleta para a
   coluna do funcionário. Conflito, intervalo e fora-de-expediente são
   bloqueados; sobrecarga gera alerta. Cada ação é salva automaticamente.
3. **Painel direito**: clique no nome do funcionário para ver jornada líquida,
   tempo planejado, ociosidade prevista e ocupação (subutilizado/adequado/alta/sobrecarga).
4. **Duplicar dia** copia a rotina para outra data. **Dashboard** consolida os
   indicadores por período/sede.
5. **Parâmetros** controla o tamanho do bloco, os limites de ocupação e o % de
   desvio que exigirá justificativa (globais ou por sede).

## Documentação

| Documento | Conteúdo |
|---|---|
| [DIARIO.md](DIARIO.md) | **diário de mudanças** — a primeira entrada é sempre o estado atual |
| [CONTEXTO-IA.md](CONTEXTO-IA.md) | documento autocontido para uma IA (ou a gerência) entender o sistema inteiro |
| [CLAUDE.md](CLAUDE.md) | instruções automáticas para sessões de IA trabalharem neste código |
| [docs/01-documentacao-funcional.md](docs/01-documentacao-funcional.md) | visão, perfis, módulos, telas e fluxos |
| [docs/02-modelo-de-dados.md](docs/02-modelo-de-dados.md) | entidades, relacionamentos e abas do Sheets |
| [docs/03-regras-de-negocio-e-calculos.md](docs/03-regras-de-negocio-e-calculos.md) | regras essenciais, fórmulas e validações |
| [docs/04-arquitetura.md](docs/04-arquitetura.md) | camadas, pastas e decisões técnicas |
| [docs/05-backlog.md](docs/05-backlog.md) | escopo do MVP, Fase 2 e Fase 3 |
| [docs/06-setup-google-sheets.md](docs/06-setup-google-sheets.md) | passo a passo do banco provisório |
| [docs/07-migracao-firebase.md](docs/07-migracao-firebase.md) | migração para o Firebase Firestore (banco definitivo) |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · SWR · Google Sheets API v4
(`googleapis`) · Firebase Firestore (`firebase-admin`) · drag-and-drop nativo
HTML5 · sessão via cookie HMAC.

A regra de ouro da arquitetura: **a interface nunca sabe de onde vêm os
dados**. Tudo passa por `services/*` → `DataSource` (memória | Google Sheets |
Firebase Firestore — escolhido por `DATA_SOURCE` no `.env`).
