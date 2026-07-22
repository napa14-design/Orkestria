# AGENTS.md

Instruções para agentes de IA neste projeto. Para não manter duas fontes de
verdade, este arquivo é fino e aponta para as canônicas:

## ⛔ Leia primeiro

**[docs/00-doutrina.md](docs/00-doutrina.md)** — regra arquitetural. Nenhuma
mudança que aumente a superfície do produto (tela, controle, campo ou decisão)
entra sem passar pelo portão das cinco perguntas. Princípio central: **dados
crescem; operação encolhe**.

## Regras do projeto, arquitetura e convenções

Ver **[CLAUDE.md](CLAUDE.md)** — fonte única das regras de arquitetura (UI nunca
acessa o banco; `lib/schema.ts` é a verdade das tabelas; cálculos/validações são
funções puras; snake_case; hierarquia sede→local→tarefa→rotina; auditoria
automática; permissões por sede), comandos, estilo visual e pendências conhecidas.

## Fluxo de toda sessão

- **Primeiro passo**: ler a primeira entrada de [DIARIO.md](DIARIO.md) (estado atual).
- **Último passo**: nova entrada NO TOPO do DIARIO.md. Nunca editar entradas antigas.
