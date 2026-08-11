# 📓 Diário de mudanças — Orkestria

> **Convenção:** toda mudança no sistema gera uma nova entrada **no topo** deste
> arquivo (a entrada mais recente é sempre a primeira). Cada entrada tem data,
> título, o que mudou e os arquivos principais tocados. Quem for trabalhar no
> projeto (pessoa ou IA) deve ler a primeira entrada para saber o estado atual.

---

## 2026-08-11 — Correção: o "zero fechado" era operação que não começou

Correção da entrada abaixo, no mesmo dia, porque ela virou registro errado no
repo e no vault.

**O fato que faltava:** as coordenadoras **começam a construir as rotinas em
11/08**. Os 1.862 blocos em 9 dias esparsos eram montagem e teste do dono do
produto, não uso operacional.

**O que isso derruba:** o argumento central da decisão — meu e da crítica externa
— era *"automatizar aumenta a entrada de um processo cuja saída nunca
funcionou"*. Zero execuções confirmadas não indicava saída quebrada; indicava que
a operação não havia começado. O número estava certo; a **inferência** sobre ele,
errada.

**O que se mantém, e por outro motivo:** não construir a automação agora. Não por
dúvida de adoção, mas porque os **pré-requisitos valem independente dela** —
feriado (hoje "Gerar o dia" num feriado monta um dia cheio), identidade do bloco
por item da rota (mudar horário duplica em vez de reconciliar) e a semântica do
dia criado sem ação humana. E porque em duas semanas de operação real existirá o
dado que hoje não existe.

**O prazo que eu dei estava errado.** Eu disse "meses, não semanas", porque o
portão de 10 dias fechados parecia intransponível para quem fechou zero. Com a
operação começando hoje, são ~2 semanas — e os pré-requisitos levam
aproximadamente o mesmo tempo, então eles deixam de ser atraso e passam a ser
trabalho em paralelo.

**Lição de método:** "zero saída" pode significar processo quebrado **ou**
processo que não começou, e a diferença não está no banco — está na pergunta ao
usuário. Eu medi 12 coleções e não perguntei. Corrigido no ADR-009 e no devlog.

### Arquivos

`DIARIO.md`. No vault: `Referência/Decisões (ADR).md` (ADR-009) e
`Projetos/Orkestria — Devlog.md`.

---

## 2026-08-11 — Decisão: a geração automática do dia espera o ciclo fechar

**Nenhuma mudança de código.** É registro de decisão, porque ela contraria um
pedido do dono do produto e alguém vai querer reabrir.

### O pedido e por que ele fazia sentido

Cadastrar rotas padrão por dia da semana (seg…sáb) e o cron gerar o dia sozinho,
sobrando ao supervisor só registrar falta. A doutrina até favorece: ela diz que o
"Gerar o dia" nasceu para se aposentar, e automatizar remove operação em vez de
adicionar.

### O que a medição de produção mostrou

Contado em 11/08 (agregação `count()`, leitura barata): 18 sedes, **3** com rota
padrão, 336 tarefas, 35 funcionários, 1.862 blocos planejados em **9 dias
esparsos** (o último em 04/08), e **zero** registros em `execucoes_realizadas` —
**nenhum dia foi fechado**. Zero ausências. As 3 sedes sem rota padrão são
esperadas (fase de teste); o que não é esperado é que as sedes que **planejaram**
nunca fecharam.

Automatizar aqui aumentaria a **entrada** de um processo cuja **saída nunca
funcionou** — converteria baixa adoção em milhares de registros com aparência de
operação. Decisão: não construir a automação agora. Registrado como
**ADR-009** no vault.

### Três erros meus, derrubados pela crítica externa

Consultei o Codex (`gpt-5.6-sol`, esforço `xhigh`) com um briefing que incluía a
doutrina, o estado medido e o pedido explícito de contestação. Três coisas que eu
havia afirmado nesta mesma sessão caíram:

1. **"A idempotência protege a regeração."** Não protege. O
   `idMaterializacao` (`m_data_func_tarefa_inicio`) só evita gravar o **mesmo**
   bloco duas vezes. Se a rota mudar 08:00 → 09:00, o bloco das 08:00 **fica** e o
   das 09:00 nasce ao lado. A identidade que reconcilia é `data|id_do_item_da_rota`.
2. **"Ter rota padrão já é o interruptor da automação"** — proposta minha, de
   minutos antes. É quebra semântica: hoje `padrao` significa "fonte do clique
   manual", não "autorização para o sistema escrever todo dia".
3. **O campo "vale nos dias"** que eu propus tem furo de seleção: uma rota "todos
   os dias" e outra "sábado" são **ambas** válidas no sábado. Falta a invariante
   *exatamente um perfil resolvido por sede/data*.

E o custo que eu estimei estava errado: usei ~40 itens por rota (peguei do texto
do tutorial); a média medida é **143**. Nas 18 sedes seriam ~5.160 escritas/dia
com o log de histórico — 26% da franquia gratuita, não os ~1.400 que eu disse.

### Duas críticas dele que NÃO se aplicam

Verificadas contra o código, e registradas para ninguém "consertar" o que não está
quebrado:

- **Limite de 500 do `WriteBatch`**: não usamos batch. `emLotes` faz `Promise.all`
  em fatias de 25, com escritas individuais.
- **"A mesma tarefa varia entre sedes"**: impossível no nosso modelo — tarefa
  pertence a um local, e o local a uma sede (hierarquia obrigatória). Sobra a
  versão estreita, válida: `dias_semana` na tarefa não expressa "mesma tarefa,
  outro horário no sábado".

Uma terceira crítica — "confirmar realizado por bloco é o maior buraco" — nasceu de
**omissão do meu briefing**: o mecanismo existe (um clique na linha para o que
correu como planejado, formulário só no desvio). O buraco é de uso, não de
mecanismo.

### Ordem acordada

1. Descobrir **por que nenhum dia foi fechado** — sem código, perguntando às
   coordenadoras. Vale mais que tirar o clique de gerar.
2. **Geração sombra**: calcular o que o cron geraria e comparar com o planejado à
   mão, sem escrever bloco nenhum.
3. **Calendário operacional** em camadas (Brasil → Ceará → Fortaleza → exceção da
   sede). Já é necessário hoje: clicar "Gerar o dia" num feriado monta um dia cheio.
4. **Identidade por item da rota** — pré-requisito de qualquer regeração.
5. **Definir o que é um dia criado sem ação humana** (rascunho? aprovado?): se
   contar como "planejado", contamina ocupação e ociosidade com dias que ninguém viu.
6. Só então a automação, por sede elegível.

### Arquivos

`DIARIO.md`. No vault: `Referência/Decisões (ADR).md` (ADR-009) e
`Projetos/Orkestria — Devlog.md` (🔁 Materialização + pendências).

---

## 2026-08-11 — Tutorial ensina a tarefa de espera (e uma entra, uma sai)

### Por que só uma das cinco mudanças da planilha virou passo

Das cinco melhorias que a planilha do Pré Sul gerou, **só a tarefa de espera**
entrou no tutorial. O critério foi: ela é a única que **bloqueia**. Quem não
souber do campo tenta reproduzir o `06:00 faz o café` + `06:00 limpa a sala ADM`
da própria planilha, leva **422** e conclui que o sistema não aceita a realidade
da operação — o pior primeiro contato possível, porque a solução existe e a
pessoa não a encontra.

As outras quatro ficaram de fora de propósito:

- **m²/hora** é coluna calculada numa tela que ele já abre; nenhuma decisão nova.
- **Intensidade em escala nomeada** tem padrão seguro ("Herdar do tipo do
  local"). Campo com padrão bom não precisa de tutorial — se precisasse, o padrão
  estaria errado.
- **A conta ao vivo** (`20 min × 3 unidades = 1h`) foi feita para *substituir*
  explicação; explicá-la seria admitir que não funcionou.
- **Sede não nascer em "Geral"** é tela de administrador; a trilha do supervisor
  nem passa por lá.

### A troca, para a etapa não engordar

Doutrina: nada novo entra sem algo sair. A etapa "Cadastrar as tarefas"
continua com **5 passos** — o passo de abertura (só leitura, balão centralizado)
foi fundido no "Cadastre uma tarefa", que já era um clique obrigatório. Um
"Entendi" a menos, mesmo conteúdo.

**Correção da minha própria proposta**: eu tinha sugerido fundir o *último*
passo ("Salve"). Estava errado — é ele que carrega o clique em `crud-salvar` que
**conclui a etapa**; fundi-lo deixaria a etapa sem fim. A fusão certa era a outra
ponta.

### Verificado na tela (build de produção, `DATA_SOURCE=memory`)

Percorrida a etapa inteira: `Agora o que se faz em cada lugar` (avança por
clique no destaque, não por "Entendi") → `Aqui está a diferença para a planilha`
→ `E com que frequência ela acontece` → **`A tarefa que ocupa o relógio, não a
pessoa`** → `Salve`. O alvo `campo-espera` existe e está visível, e **nenhum
alarme de "tutorial desatualizado"** dispara. `scripts/conferir-trilha.mjs`
passa nas 11 etapas — e ele confere `campo-*` pela chave real no formulário da
tela, não por string solta.

Não consegui tirar print: o painel do navegador não estava compondo quadros
nesta sessão. A confirmação acima é por leitura do DOM, não visual.

### Arquivos

`lib/tutorial/trilha.ts`

---

## 2026-08-10 — Login com Google consertado: firebase-admin volta para o 13

### A causa real

O upgrade `firebase-admin 13.10 → 14.2` (commit `ae7af71`, feito para zerar a
auditoria) trouxe `jwks-rsa@4` → **`jose@6`, que é ESM puro** — `"type":
"module"`, um único `default` no `exports`, nenhuma build CommonJS. O `jwks-rsa`
é CommonJS e faz `require('jose')`, então só funciona pelo `require(esm)` do
Node. Na função serverless da Vercel esse caminho falha com `ERR_REQUIRE_ESM`
**mesmo rodando Node v24.18**, que suporta `require(esm)` — algo no
empacotamento/runtime de lá não tem isso habilitado, e não é coisa que se
controle por código.

O conserto é voltar ao **13.10**, que traz `jose@4.15.9` com
`require → dist/node/cjs/index.js`. A fronteira CJS→ESM deixa de existir. Medido:
**`npm audit` continua em 0** — a auditoria zerada e o Google funcionando não
estavam em conflito de verdade. Ficou registrado no `CLAUDE.md` para ninguém
repetir o upgrade às cegas.

### Duas hipóteses minhas que estavam erradas

1. **"É a versão de Node da função."** Eu tinha declarado `engines: >=22.12` e
   mandado trocar a versão no painel da Vercel. Errado: o `process.version` no
   próprio 503 mostrou **Node v24.18.0**, que já suporta `require(esm)`. O
   `engines` foi removido — declarar exigência que não existe é pior que não
   declarar nada.
2. **"É o rastreio de arquivos / import dinâmico."** Também não: o build de
   produção **local** (Node 24, mesmo `next build`) carrega o módulo e responde
   401 normalmente. Só a Vercel falha.

Nenhuma das duas teria caído sem instrumentar. O que fechou o caso foi imprimir
`process.version` e o nome do módulo na mensagem de erro — dois dados, uma linha
cada, depois de horas de dedução em cima de um 401 que mentia.

### Verificado antes de subir

`npx tsc --noEmit` limpo · 71 testes · `next build` limpo · `npm audit` 0 ·
build de produção local: rota do Google devolve 401 com `auth/argument-error`
(módulo carregou) e o login por senha devolve 401 contra o Firestore real (banco
de pé).

### Arquivos

`package.json`, `package-lock.json`, `CLAUDE.md`

---

## 2026-08-10 — Login com Google: a causa era a versão de Node da função

### A causa raiz, em texto

Com o 503 informativo no ar, a produção respondeu:

```
ERR_REQUIRE_ESM — require() of ES Module /var/task/node_modules/jose/dist/webapi/index.js
from /var/task/node_modules/jwks-rsa/src/utils.js not supported
```

O `jwks-rsa` é CommonJS e faz `require('jose')`; o `jose` v6 é **ESM puro**.
`require()` de ESM só existe a partir do **Node 22.12** — daí o
`engines: node >= 22` do `firebase-admin@14`. A função na Vercel roda Node mais
antigo, então `firebase-admin/auth` não carrega. Nada a ver com token, com as
rules do Firestore ou com o cadastro de usuários; a cadeia só é usada pelo login
com Google, que é justamente a única coisa que estava quebrada.

### O conserto

É de **configuração, não de código**: Vercel › Settings › General › **Node.js
Version → 22.x** (ou 24.x), e redeploy — a versão só muda no deploy seguinte.
O `engines` do `package.json` passou de `">=22"` para **`">=22.12"`**, que é o
limiar verdadeiro (`require(esm)`), não um arredondamento.

Alternativas descartadas: escrever a verificação de RS256 à mão com
`node:crypto` (código de segurança próprio para não subir uma versão de Node —
troca ruim) e tirar `firebase-admin` de `serverExternalPackages` para o webpack
empacotar o `jose` (o externo foi posto ali de propósito, contra este mesmo
`ERR_REQUIRE_ESM`; mexer trocaria um problema conhecido por um desconhecido).

### O que este episódio ensinou sobre diagnóstico

O bug era de uma linha de configuração. O que custou tempo foi um `try` grande
demais: ele cobria o import do módulo **e** a verificação do token, então um
defeito de infraestrutura saía com a cara de credencial errada — e eu cheguei a
usar o 401 como *prova* de que o módulo carregava, o que era ao contrário. Não
foi falta de teste: nenhum teste de função pura pega isso. Foi falta de fazer o
erro **chegar até quem pode consertar**.

### Arquivos

`package.json`, `DIARIO.md`

---

## 2026-08-10 — Login com Google: a causa é o módulo que não carrega na Vercel

Continuação direta da entrada abaixo, que subiu e mudou o sintoma.

### O que o deploy anterior revelou

Com as classes de falha separadas, a produção passou a responder **500 com corpo
vazio** em `/api/auth/google`. O resto do deploy estava intacto na mesma medição:
`/login` 200, `/api/auth/login` 400 e 401 (Firestore respondendo), `/api/rotinas`
401. Ou seja: **o handler não chega a rodar** — `firebase-admin/auth` não carrega
na função serverless. Era isso que o catch antigo vestia de "token inválido".

### E por que o import estático foi um passo atrás

Ele estava certo sobre o rastreio de arquivos, e errado sobre observabilidade:
com import no topo, o módulo quebra **antes de o handler existir**, o Next
devolve 500 sem corpo, e ninguém descobre o nome do erro. Voltei ao
`await import()` — agora **fora** do try do token e com catch próprio, que
devolve **503** e imprime na tela o código **e um trecho da mensagem**
(`ERR_REQUIRE_ESM` e `MODULE_NOT_FOUND` sozinhos não dizem *qual* módulo caiu, e
é o nome do módulo que aponta o conserto).

Ficou registrado como comentário na rota, para ninguém "melhorar" o import
dinâmico de volta para estático sem saber o que se perde.

### Suspeita principal

`firebase-admin@14` exige `node >= 22`, provavelmente porque depende de
`require()` de módulo ESM — que **não existe no Node 20** (`ERR_REQUIRE_ESM`) e
funciona no 22+. Localmente, no Node 24, a cadeia inteira roda: o log chega até
*"kid não corresponde a nenhuma chave pública conhecida"*, o que prova módulo
carregado e chaves públicas do Google baixadas pela rede. O `engines` declarado
na entrada anterior existe para forçar isso na Vercel; se o 503 vier com
`ERR_REQUIRE_ESM`, a versão de Node da função é o conserto (Settings › General ›
Node.js Version). Se vier `MODULE_NOT_FOUND`, é o rastreio de arquivos, e o
caminho é tirar `firebase-admin` de `serverExternalPackages` ou declarar
`outputFileTracingIncludes`.

### Arquivos

`app/api/auth/google/route.ts`

---

## 2026-08-10 — Login com Google: o catch que culpava a pessoa por defeito do servidor

### O sintoma

Em produção, "Entrar com Google" respondia **401 "Não foi possível validar o
login do Google"**. O popup funcionava e o token chegava (1186 bytes no corpo do
`POST /api/auth/google`) — a recusa era nossa.

### O erro de diagnóstico que atrasou tudo

Testei a rota de fora com um token inválido, vi 401 e concluí que
`firebase-admin/auth` carregava normalmente. **Não provava nada:** o `try` da
rota envolvia também o `await import("firebase-admin/auth")` e o
`getAuth(obterAppAdmin())`. Falha de módulo, credencial ausente e token
realmente inválido saíam todos com a **mesma** mensagem e o **mesmo** status —
um defeito de servidor vestido de erro de credencial. Diagnóstico impossível de
fora, e a pessoa levando a culpa.

### O que mudou

1. **Três classes de falha separadas** em `app/api/auth/google/route.ts`:
   servidor sem verificação disponível → **503** com texto que manda entrar por
   e-mail e senha e avisar o administrador; token recusado → **401**. As duas
   fazem `console.error` do erro real e mostram na tela o **código curto** do
   Firebase (`auth/argument-error`, `auth/id-token-expired`) — o suficiente para
   a pessoa repassar por telefone, sem vazar nada nosso.
2. **Import estático no lugar do dinâmico.** O `await import()` existia para não
   arrastar jwks-rsa/jose para o caminho do Firestore. O import estático **dentro
   da rota** consegue o mesmo (o Next divide por rota) e elimina o risco de o
   rastreio de arquivos da Vercel não levar um import dinâmico para a função
   serverless. `authAdmin()` saiu de `lib/firebaseAdmin.ts` — era usado só aqui.
3. **`engines.node: ">=22"` no `package.json`.** O `firebase-admin@14` declara
   `engines: node >= 22`; o projeto não declarava nada, então a Vercel escolhia a
   versão pelo padrão dela (Node 20 em projetos mais antigos) e o `npm install`
   só emitia um aviso `EBADENGINE` no build. Incompatibilidade silenciosa de
   runtime, agora declarada.

### O que ficou provado e o que não

Localmente a cadeia inteira está sadia: o log mostra a verificação chegando até
*"kid não corresponde a nenhuma chave pública conhecida"* — ou seja, módulo
carregado, projeto resolvido e **chaves públicas do Google baixadas pela rede**.
O login por senha nunca esteve em causa: ele distingue falha de banco (503) de
credencial errada (401), e em produção responde 401 para e-mail inexistente,
o que prova que o Firestore responde.

**A causa raiz em produção ainda não está nomeada** — só o próximo clique no
botão do Google, com este deploy no ar, mostra o código do erro. O que esta
entrada resolve é o sistema esconder a causa.

### Arquivos

`app/api/auth/google/route.ts`, `lib/firebaseAdmin.ts`, `package.json`

---

## 2026-08-06 — Testes das funções puras: 71 casos, e um bug de autenticação

### O bug que os testes acharam em 20 minutos

`verificarSenha` **aceitava qualquer senha** quando o valor guardado era `":"`.
O `split(":")` devolvia dois pedaços vazios, `Buffer.from("", "hex")` dava zero
byte, o scrypt devolvia zero byte, e `timingSafeEqual(vazio, vazio)` é
**verdadeiro**. Bastava um `senha_hash` valendo `":"` — hex ilegível ou célula
editada à mão — para a conta virar porta aberta. Corrigido: salt e hash vazios
recusam antes de chegar ao scrypt.

Foi encontrado por um caso escrito no automático ("valor guardado inválido não
autentica ninguém"), não por desconfiança. É o argumento inteiro a favor de ter
suíte.

### A suíte

- **71 casos em 4 arquivos, 660ms.** `npm test` (vitest, uma dependência de
  desenvolvimento). Tentei antes com o runner nativo do Node e não deu: os
  imports internos não têm extensão, e fazer o Node aceitar isso exigiria mexer
  em todos os arquivos do projeto.
- **`testes/permissoes.test.ts`** — a propriedade que importa: *supervisor nunca
  amplia o próprio alcance*. Sem sede pedida cai na principal (nunca "todas"),
  sede fora do escopo é recusada, cookie antigo fica preso à principal,
  `limitarSedeConsulta` nunca devolve `undefined` para quem tem escopo.
- **`testes/calculos.test.ts`** — jornada com intervalo único e com lista,
  regras fixo/m²/unidade, herança da intensidade pelo tipo do local, blocos,
  ociosidade negativa como sinal de sobrecarga.
- **`testes/validacoes.test.ts`** — sobreposição bloqueando, horários que só se
  encostam passando, e a **tarefa de espera nos dois sentidos** — incluindo o
  caso que prova que a proteção não foi desligada: com uma espera no dia, duas
  tarefas normais no mesmo horário **continuam bloqueadas**.
- **`testes/acesso.test.ts`** — senha, código e estado do tutorial. Tem um teste
  de **uniformidade do sorteio** do código (4.000 amostras): é ele que impede a
  volta silenciosa do viés do `byte % 30`.

### Duas suposições minhas que os testes derrubaram

- **A intensidade do local NÃO se aplica a tempo fixo** — só a m²/unidade, com
  razão documentada ("evita inflar atividade que não depende da metragem"). Eu
  esperava 45 min num banheiro; são 30. O código estava certo.
- Os parâmetros de ocupação são `ocupacao_baixa/adequada/alta`, não o nome que
  eu inventei. O teste agora fixa que as faixas ficam em ordem crescente —
  fora de ordem, a classificação erra sem dar erro nenhum.

### Rotação "se for seu dia" — sem código, de propósito

Ao ler o código descobri que **já é expressável**: tarefa com frequência
`semanal` + `dias_semana` é respeitada na geração e na aplicação de modelo. Uma
tarefa por pessoa com o dia dela, e a alternativa com os dias complementares.

O que exigiria código é a fila que anda ("quem fez na semana passada não faz
nesta"): o dia teria que ir para o **item da rota padrão**, não para a tarefa —
e não há resposta óbvia de interface, já que a rota padrão nasce de um único dia
montado. Documentado em `docs/03` com o limite explícito, sem construir no chute.

- Arquivos: `testes/` (4 testes + fixtures), `vitest.config.mts`,
  `package.json` (script `test`), `lib/senha.ts` (correção + alfabeto exportado),
  `docs/03-regras-de-negocio-e-calculos.md`, `CLAUDE.md`.

---

## 2026-08-06 — Tarefa de espera, sede sem padrão perigoso e m²/hora visível

Três melhorias que a **planilha real do Pré Sul** apontou.

### 1. Tarefa de espera — o dia da Cristina passou a caber

- A planilha tem `06:00–07:00 faz o café` **e** `06:00–07:00 limpa a sala ADM`,
  com a explicação nas observações: *"o tempo da cafeteira é aproximado de 1h,
  coloca a água e sai para fazer as atividades"*. Não é sobreposição de
  trabalho — é **tempo de máquina, não de pessoa**. E o sistema recusava: em
  `validations.ts` a sobreposição é `nivel: "erro"`, e o importador descartava a
  linha.
- Campo novo `tarefas.espera`: a tarefa ocupa o relógio, não a pessoa. Vale nos
  **dois sentidos** — nem a nova sobre uma existente, nem o contrário.
- **Sem custo de leitura**: no servidor, `esperaEntreOsChoques` lê só as tarefas
  das rotinas que de fato colidem — normalmente nenhuma, às vezes uma. Carregar
  as tarefas da sede a cada arrasto custaria dezenas de leituras para uma
  informação que só importa quando há choque.
- **Limite conhecido e deliberado**: a ocupação continua somando o tempo da
  rotina, porque `resumoFuncionario` não recebe tarefas e enfiá-las ali tocaria
  toda a cadeia. Por isso a dica do campo é explícita: **informe o tempo da
  pessoa, não do equipamento**. Se alguém cadastrar uma espera de 1h, a
  ocupação infla — se isso aparecer na prática, aí vale o refino.
- Verificado pela API, 4 casos: café(espera) entra · limpeza no mesmo horário
  passa · **terceira tarefa normal no mesmo horário BLOQUEIA (422)** · espera por
  cima de normal também passa. O terceiro é o que prova que a proteção continua
  de pé: a validação ficou ciente, não foi desligada.

### 2. Sede não nasce mais em "Geral"

- O formulário abria com **"Geral (todas as sedes)"** pré-selecionado. Salvar um
  supervisor sem olhar esse campo dava a ele escrita nas 17 sedes. Removido o
  padrão: agora abre em "— selecionar —" e exige escolha consciente. Um clique a
  mais no cadastro (raro) para não distribuir acesso por descuido.
- Com perfil **supervisor**, a opção passa a se chamar *"Geral — TODAS as sedes
  (incomum para supervisor)"*. Continua possível; deixou de ser silencioso.

### 3. m²/hora na lista de tarefas

- Nova coluna com a produtividade que **resulta** do tempo — o mesmo número que
  a planilha calculava à mão. É o que revela onde o tempo não fecha: 4 m²/h num
  banheiro ao lado de 1.292 m²/h num corredor não é produtividade variando, é
  tempo escolhido em bloco de conveniência.
- Nenhuma decisão nova para o supervisor: coluna calculada numa tela que ele já
  olha. Sem metragem ou sem tempo, mostra "—" em vez de inventar número.
- Verificado: "Preparar o café" (12 m² em 30 min) mostra **24**.

- Arquivos: `types/Tarefa.ts`, `lib/schema.ts`, `lib/validations.ts`,
  `services/rotinasService.ts`, `app/(app)/rotinas/page.tsx`,
  `app/(app)/tarefas/page.tsx`, `app/(app)/usuarios/page.tsx`.
- `.claude/launch.json` ganhou `autoPort` — outra sessão ocupou a 3000.

---

## 2026-08-06 — Tutorial: passo que ainda não dá para fazer explica o motivo

- **Risco pego a tempo, no dia em que o piloto começou.** Três etapas apontam
  para botões que só existem quando há dado: "★ Ensinar esta rota", "Imprimir
  fichas" e "Confirmar realizados". Numa sede recém-criada eles não existem — e o
  holofote mostrava a faixa **vermelha** dizendo *"o tutorial está
  desatualizado"*. Tecnicamente correto (ele falha alto de propósito), péssimo no
  primeiro contato: a pessoa acharia o sistema quebrado quando só ainda não
  chegou naquela parte.
- **A correção foi transparência, não silêncio.** A etapa agora declara em
  português o que precisa (`precisa: "um dia com tarefas montadas na agenda"`), e
  a mesma frase serve dois lugares:
  - no holofote, vira explicação em verde — *"Este passo ainda não dá para fazer.
    Ele aparece quando você tiver um dia com tarefas montadas. Nada de errado — é
    só a ordem das coisas."* — com botão **"Entendi, seguir →"**;
  - na trilha da Central, vira *"Precisa de um dia com tarefas montadas"*, para a
    ordem não parecer arbitrária.
- **A distinção é o ponto**: etapa que declara `precisa` e não acha o alvo está
  esperando dado — explica e segue, sem sujar o console. Etapa **sem** `precisa`
  que não acha o alvo é defeito nosso — continua gritando em vermelho e no
  `console.error`. O alarme não foi enfraquecido; ficou específico.
- **Furo meu, achado na verificação**: eu só mostrava o pré-requisito nas etapas
  **futuras** da trilha, e a atual — justamente onde a pessoa vai tentar e não
  conseguir — ficava sem. Corrigido.
- **O teste passou a reproduzir o cenário de verdade**, não uma aproximação:
  cria a coordenadora na sede vazia, gera código, faz o primeiro acesso e abre a
  agenda dela. A primeira tentativa não reproduziu nada (a agenda mostrava a sede
  que tem dados, então o botão existia) e passou perto de dar falso "ok".
- Verificado: o botão realmente não existe, a explicação aparece citando o
  pré-requisito, zero alarme, zero erro no console, e a trilha diz o que falta.
- Arquivos: `lib/tutorial/trilha.ts`, `components/tutorial/Holofote.tsx`,
  `components/tutorial/{Tutorial,TrilhaProgresso}.tsx`, `app/globals.css`.

---

## 2026-08-06 — Intensidade em escala nomeada e a conta da tarefa na tela

- **Dois campos confundiam os supervisores**, e por motivos diferentes.
- **Intensidade: o problema era a unidade.** Multiplicador (0,5 · 1,0 · 1,5) é
  linguagem de quem escreveu a fórmula; quem usa pensa "esse banheiro suja
  mais". Virou escala nomeada — **Muito leve · Leve · Médio · Puxado · Pesado** —
  com o fator entre parênteses, para quem quiser conferir. "Entre leve e médio"
  foi descartado: não é nome, é descrição de um vão, e obriga a pessoa a fazer a
  interpolação de cabeça. "Puxado" é a palavra brasileira exata para o degrau de
  cima — mais que o normal, sem ser extremo.
  - **A escala está ancorada nos números que o sistema já usava** (0,8 de área
    externa e 1,5 de banheiro/copa). Uma escala simétrica (0,5 … 1,5) seria mais
    bonita e **mudaria o tempo calculado de todo local já cadastrado**. Escala
    torta que não remexe nos dados é melhor que escala bonita que remexe.
  - Primeira opção é **"Herdar do tipo do local (recomendado)"**, e a ajuda diz
    qual fator o tipo escolhido usa. Local com valor fora da escala ganha um
    "manter o valor atual (×0,7)" — o select não troca nada sem a pessoa pedir.
- **Quantidade: o problema não era o nome, era estar sempre visível.** Só vale na
  regra "por unidade", mas aparecia em todas — campo que aparece sem servir
  ensina a preencher no chute. Agora só aparece nessa regra, chama-se "Quantas
  unidades" e traz exemplos (3 banheiros, 5 lixeiras, 30 carteiras).
- **A cura da dúvida foi mostrar a conta**, não explicar a regra: embaixo do
  tempo base aparece `20 min × 3 unidades = 1h` ao vivo, com os números que a
  pessoa acabou de digitar. Idem para por m² — e quando o local está sem
  metragem, diz isso em vez de mostrar zero.
- **`CrudManager` ganhou três generalizações** reutilizáveis: `opcoes` e `ajuda`
  podem ser função do formulário, e `numerico` converte select para número ao
  salvar.
- **Um defeito meu, achado na verificação**: o select genérico já injeta
  "— selecionar —" com valor vazio, e a minha opção "Herdar" também tinha valor
  vazio — duas opções com o mesmo valor deixavam a minha **inalcançável**, porque
  o navegador seleciona a primeira. O placeholder genérico agora só aparece
  quando o campo não traz a própria opção vazia.
- Verificado na tela: 6 opções sem duplicata, nenhum rótulo só numérico, ajuda
  refletindo o tipo escolhido, "Quantas unidades" oculto na regra padrão e
  visível em "por unidade", e a multiplicação aparecendo com os valores digitados.
- Arquivos: `app/(app)/locais/page.tsx`, `app/(app)/tarefas/page.tsx`,
  `components/CrudManager.tsx`.

---

## 2026-08-06 — Vulnerabilidades: de 17 para 0

- **`npm audit`: 17 → 0.** Antes: 5 altas e 12 moderadas. Agora nenhuma.
- **Next 15.5.19 → 16.3.0.** As 3 altas que sobraram depois do `audit fix` eram
  todas de dependências do próprio Next (`postcss`, `sharp`), e a única correção
  era o salto de major.
  - **`--webpack` nos scripts**: o Next 16 usa Turbopack por padrão e aborta o
    build ao encontrar config webpack. A nossa regra injeta o `DIARIO.md` no
    bundle como texto, e Turbopack não tem equivalente nativo (exigiria
    `raw-loader`, sem manutenção desde 2020). `fs` não serve: na Vercel o
    arquivo da raiz não vai para a função serverless. Migrar para Turbopack no
    futuro passa por resolver esse import.
  - O Next reescreveu o `tsconfig.json` (`jsx: preserve` → `react-jsx`).
- **firebase-admin 13.10 → 14.2** e **googleapis 144 → 174.0.1**, que fecharam 8
  moderadas. A superfície que usamos é mínima e estável (`cert`, `getApps`,
  `initializeApp`, `getAuth`, `getFirestore`).
- **`overrides: { uuid: "^11.1.1" }`** fechou as 7 últimas. Todas desembocavam no
  mesmo `uuid` antigo, e o que o npm propunha como "correção" era **downgrade**
  (firebase-admin 14 → 10, exceljs 4.4 → 3.4) — pior que a falha.
- **Verificação, porque atualizar dependência sem provar é fé:**
  - Leitura real no Firestore de **produção** com o SDK novo (somente leitura):
    `usuarios`, `sedes` e consulta com `where` — todas responderam.
  - `exceljs` com o `uuid` forçado: baixou o modelo (xlsx válido, assinatura ZIP)
    e releu o próprio arquivo — o importador continua interpretando planilha.
  - Portão de autenticação: `/rotinas` sem cookie → 307 para `/login`;
    `/api/rotinas` sem cookie → 401.
  - As 11 telas da trilha do tutorial: 11/11, zero alvos perdidos.
- **Um alarme falso que valeu a lição**: a primeira rodada acusou 1 falha e 18
  alvos perdidos. Não era o Next 16 — era o **meu script de verificação**,
  escrito antes do convite existir, esperando holofote numa conta que ainda não
  respondeu "Ver" (comportamento correto). Script corrigido; teste que grita à
  toa é pior que teste nenhum.
- **Fica pendente**: a convenção `middleware` está **deprecada** no Next 16 (o
  build avisa e pede `proxy`). Não migrei junto de propósito — é o portão de
  autenticação do sistema inteiro, e uma mudança de risco por vez.
- Arquivos: `package.json` (versões, `overrides`, `--webpack`),
  `package-lock.json`, `next.config.ts`, `tsconfig.json`.

---

## 2026-08-05 — E-mail de boas-vindas com o código de primeiro acesso

- Gerar o código passa a **enviar um e-mail** para a pessoa, com o código, o
  endereço do sistema, os três passos para entrar e o aviso de que a senha que
  ela criar ninguém vê. Antes o código só existia na tela do administrador, que
  tinha de repassar por fora.
- **SMTP, não a API de um fornecedor.** A mesma implementação atende o Google
  Workspace do cliente, servidor próprio e Resend/SendGrid/Mailgun (todos têm
  SMTP). Trocar de caminho é trocar variáveis, não código.
- **Melhor esforço, nunca dependência.** `enviarEmail` não lança: o código
  continua na tela e a resposta traz `email: { enviado, motivo }`. Um envio
  quebrado não pode virar uma pessoa sem acesso.
- **O motivo é dito até quando não há o que enviar** ("o envio de e-mail ainda
  não foi configurado"). Um "não enviado" mudo faria o administrador achar que
  algo falhou — e o alerta fica vermelho quando o envio não saiu, para ele não
  fechar a janela achando que estava tudo certo.
- **Timeouts de 10s no transporte.** Sem eles, host errado ou porta bloqueada
  penduraria a tela: medido, o padrão do nodemailer levou **21s** onde o nosso
  corta em **10s**.
- HTML de e-mail conservador de propósito (tabela, estilo inline, nenhuma fonte
  externa) e com texto puro de verdade — é o que aparece na prévia da caixa.
- Sem as variáveis, nada muda no sistema. Verificado: sem SMTP, cadastrar e
  gerar código seguem em 200 com o código na resposta.
- **Falta o usuário fazer**: gerar a senha de aplicativo do Google e preencher
  `SMTP_PASS` no `.env` local e nas variáveis de ambiente da Vercel.
- Arquivos: `lib/email.ts`, `lib/emails/conviteAcesso.ts`,
  `app/api/usuarios/[id]/codigo/route.ts`, `app/(app)/usuarios/page.tsx`,
  `.env.example`, `docs/04-arquitetura.md`, `package.json` (nodemailer).

---

## 2026-08-05 — Campo de sedes extras visível, e exclusão sem o `confirm` do navegador

- **O campo de sedes adicionais estava invisível para quem cadastrava.** Eu o
  havia condicionado a `perfil === supervisor && sede_id !== "geral"` — e como a
  sede começa em "Geral", ele só aparecia depois de escolher uma sede
  específica. Resultado: o administrador não achou o campo e concluiu que não
  dava para selecionar várias sedes. **É o mesmo erro do botão de modelos**, que
  só existia na visão Semana. Agora aparece para todo supervisor, e o texto de
  ajuda avisa que com "Geral" ele é ignorado.
- **Exclusão saiu do `window.confirm`.** Não era só feiura fora da identidade:
  quando alguém marca *"Não permitir que este site mostre mensagens assim
  novamente"* no Chrome, o `confirm` passa a devolver `false` e **excluir para de
  funcionar em silêncio** — ninguém entende por quê. Agora é modal do sistema, e
  ele **diz qual registro** ("Excluir Financeiro / Lojinha definitivamente?"),
  em vez do genérico "este registro". `window.alert` do erro virou alerta
  dentro do modal.
- No `ModalPlanejamento`, a exclusão de modelo virou confirmação em dois toques
  (o botão passa a "Confirmar exclusão"), pelo mesmo motivo. Trocar de modelo no
  select cancela a confirmação pendente.
- Não sobrou nenhum `window.confirm`/`window.alert` no código.
- Verificado: campo aparece ao escolher Supervisor (com 3 sedes marcáveis);
  excluir não abre diálogo do navegador e o modal nomeia o registro.
- Arquivos: `app/(app)/usuarios/page.tsx`, `components/CrudManager.tsx`,
  `components/agenda/ModalPlanejamento.tsx`.

---

## 2026-08-05 — Convite do tutorial: Ver, Adiar e Pular

- **Antes o tutorial começava sozinho** — a pessoa era jogada dentro dele sem
  saber que existia um caminho de 11 etapas. Agora o primeiro acesso abre um
  convite na Central, que diz o que é, quanto é, e pede licença.
- **Três respostas com significados diferentes**: `Ver` liga os holofotes e
  **leva direto à primeira etapa** (ficar na Central obrigaria a adivinhar para
  onde ir); `Adiar` cala tudo por 24h e volta a perguntar; `Pular` não pergunta
  mais. Fechar no ✕ vale como Adiar — a saída menos destrutiva.
- **Quem adiou ou pulou não é perseguido pelas telas.** A volta é a trilha, que
  ganhou um botão "Começar o passo a passo" e um link `?tutorial=<etapa>` que
  abre o holofote mesmo com o convite recusado.
- **Uma coluna, não três flags**: `usuarios.tutorial_estado` guarda
  `""` · `ativo` · `adiado:<ISO>` · `pulado`. Flags booleanas permitiriam
  combinações sem sentido ("pulado e ativo"); como estado, cada pessoa está em
  exatamente um lugar e o texto se lê sozinho no banco (`lib/tutorial/estado.ts`).
- **Dois bugs achados na verificação**, nenhum deles pego pelos testes
  anteriores:
  1. **Retomar pela trilha não abria o holofote.** Dois `useEffect` brigavam —
     o que inicia roda antes do que limpa na troca de rota, e na navegação pelo
     cliente (dados já em cache) o segundo apagava o primeiro. Passou a ser um
     efeito só, que decide abrir ou fechar.
  2. **As quatro etapas da agenda emendavam.** Ao concluir uma, a seguinte da
     mesma tela abria na hora — recriando o tour de 32 passos que o desenho
     inteiro existe para evitar. Agora a tela fica quieta até a pessoa navegar.
- Verificado: convite aparece só no primeiro acesso e sem holofote junto; Ver
  leva a /locais e abre; etapas da agenda não emendam e a seguinte só vem na
  próxima visita; adiado e pulado ficam em silêncio; retomar pela trilha abre.
- Arquivos: `lib/tutorial/estado.ts`, `components/tutorial/BoasVindas.tsx`,
  `components/tutorial/{Tutorial,TrilhaProgresso}.tsx`,
  `services/tutorialService.ts`, `app/api/tutorial/route.ts`,
  `app/(app)/inicio/page.tsx`, `types/Usuario.ts`, `lib/schema.ts`,
  `app/globals.css`.

---

## 2026-08-05 — Tutorial completo: 11 etapas e a trilha na Central

- **A trilha inteira**, na ordem do mapa do caminho: fundação (locais, tarefas,
  equipe, qualificações) → o dia (Central, montar, ensinar a rota, fichas,
  confirmar) → exceções (falta, trabalho fora da rotina). 32 passos no total,
  nenhuma etapa com mais de 5.
- **Uma etapa por visita, não um tour de 32 passos.** A agenda hospeda quatro
  etapas; a pendente mais antiga é a próxima aula. Emendar todas de uma vez
  viraria o tour que a pessoa despacha no automático.
- **Trilha na Central** ("3 de 11"), abaixo da exceção do dia — nunca acima: a
  Central existe para resolver o que está travando agora; aprendizado é o
  segundo assunto. **Some sozinha** quando tudo é concluído.
- **`scripts/conferir-trilha.mjs`**: confere que todo alvo citado no roteiro
  existe no código. Achou dois erros meus na hora (`tipo_calculo` em vez de
  `regra_calculo`; `intervalos` em vez de `intervalo_min`). Testei o testador
  quebrando alvos de propósito — acusa os dois tipos de erro e sai com código 1.
- Verificado percorrendo as 11 telas: todas dispararam a etapa certa, na ordem
  certa, sem nenhum alvo perdido.
- **Falta**: rodar com gente de verdade. O dado de abandono (primeira etapa
  ausente em `tutorial_concluido`) é o que vai dizer qual passo reescrever.
- Arquivos: `lib/tutorial/trilha.ts`, `components/tutorial/TrilhaProgresso.tsx`,
  `components/tutorial/Tutorial.tsx`, `scripts/conferir-trilha.mjs`,
  `app/(app)/inicio/page.tsx`, `app/globals.css`, e marcadores `data-tour` em
  `BarraPassosDoDia`, `FiltersBar`, `TaskPalette`, `OccupancySummary`,
  `CentralDoDia` e `app/(app)/rotinas/page.tsx`.

---

## 2026-08-05 — Tutorial com holofote: a base e a primeira etapa

- **Para quê**: o piloto começa e o coordenador vai ficar sozinho diante de um
  sistema vazio. Manual e vídeo ensinam **fora** do sistema — a pessoa vê, fecha
  e precisa lembrar. O holofote ensina **dentro**, na hora de fazer.
- **Não é um tour narrado; é a implantação acompanhada.** Em vez de "esta é a
  tela de Locais", o roteiro diz "cadastre o primeiro local da sua sede agora".
  A pessoa sai com a sede montada, não com um certificado — e isso resolve o
  problema de não haver nada para apontar numa tela vazia no dia 1.
- **Quatro retângulos, não uma tela com recorte.** O alvo precisa continuar
  clicável de verdade; cobrir tudo e liberar por `pointer-events` viraria briga
  de z-index com modais. Com moldura de quatro faixas, o miolo não tem nada por
  cima e o clique chega ao botão real — verificado inclusive **dentro do modal**
  de cadastro.
- **Só avança quando ela clica.** Passo do tipo `clique` não tem botão de
  avançar. É o que separa treinar de assistir.
- **Falha alto, nunca em silêncio.** Alvo que não aparece em ~2s mostra aviso na
  tela e `console.error` dizendo qual `data-tour` sumiu. Foi a lição de mudar o
  rótulo do `FiltersBar` esta semana: tutorial que procura por texto de botão
  apodrece calado.
- **O roteiro inteiro é dado**, em `lib/tutorial/trilha.ts`. Depois do piloto
  vamos querer trocar palavra, ordem e passo — tem que ser edição de texto.
- **Alvos genéricos de graça**: o `CrudManager` marca todo campo como
  `campo-<chave>`, então qualquer campo de qualquer cadastro já é alvo possível.
- **Progresso** em `usuarios.tutorial_concluido` (ids por vírgula) em vez de
  tabela nova: vem junto com o usuário já lido, sem coleção nem índice novo. A
  primeira etapa ausente é onde a pessoa parou — é o dado que diz quem travou e
  onde, que era o que eu queria colher no piloto.
- **Portão da doutrina**: elimina passos (procurar no manual, perguntar a
  alguém); é de **implantação**, não entra na operação diária; some sozinho por
  pessoa e por etapa — a resposta mais limpa que já demos à pergunta 4; e o
  caminho básico funciona sem ele (dá para sair a qualquer momento).
- **Falta**: as outras 7 etapas do roteiro e a trilha de progresso na Central.
- Arquivos: `lib/tutorial/trilha.ts`, `components/tutorial/{Holofote,Tutorial}.tsx`,
  `services/tutorialService.ts`, `app/api/tutorial/route.ts`,
  `app/(app)/layout.tsx`, `components/CrudManager.tsx`, `app/globals.css`,
  `types/Usuario.ts`, `lib/schema.ts`.

---

## 2026-08-05 — Fim da senha compartilhada: código individual de primeiro acesso

- **Motivo**: a `ACCESS_PASSWORD` era um segredo único para todo mundo. Quem a
  soubesse podia assumir a conta de **qualquer** pessoa que ainda não tivesse
  senha. E a tela de login **anunciava as credenciais de demonstração em
  produção** — e-mail e senha, à vista de todos.
- **Código individual**: o administrador gera em `Sistema › Usuários` e repassa.
  Formato `K7M-4QP-92X` — alfabeto sem `O/0`, `I/1/L` e `U`, em grupos de três,
  para ditar por telefone sem erro. O leitor aceita minúscula e sem hífen.
- **Propriedades**: individual (vazar um expõe uma conta, não todas), **uso
  único** (a criação da senha apaga o código), **prazo de 14 dias**, guardado
  como hash scrypt — o texto puro existe só no instante em que é mostrado.
- **Sorteio uniforme**: `byte % 30` fazia os 16 primeiros caracteres do alfabeto
  saírem ~12% mais que os outros (medido: 7,7% de desvio em 180 mil amostras).
  Agora descarta os bytes acima do último múltiplo de 30 — desvio caiu a 2,7%,
  que é só ruído de amostragem.
- **Esqueceu a senha**: mesmo botão. Gerar um código novo apaga a senha atual.
- **Coluna "Acesso"** com quatro estados: senha própria · código enviado ·
  código vencido · sem acesso. É o painel de acompanhamento da implantação.
- **`ACCESS_PASSWORD` não existe mais** — removida do código, do `.env`, do
  `.env.example` e das docs.
- **Demo apagada**: nem a dica na tela de login, nem os usuários no seed. O modo
  memória agora sobe **sem ninguém**; para desenvolver, defina `DEV_ADMIN_EMAIL`
  e `DEV_ADMIN_SENHA` no `.env` (só tem efeito com `DATA_SOURCE=memory`).
- **`aoCriar`** no `CrudManager`: gancho opcional para a tela reagir ao registro
  novo — Usuários usa para já mostrar o código de quem acabou de ser cadastrado.
- Verificado de ponta a ponta: a senha compartilhada antiga não entra mais;
  cadastrar → gerar código → entrar com ele (mesmo minúsculo e sem hífen) →
  criar senha → o código não serve de novo; código chutado, senha igual ao
  código e reuso são todos recusados; nenhum hash sai na API.
- **Atenção na migração**: usuários que já existem em produção **sem senha
  definida** perderam a forma antiga de entrar. Cada um precisa de um código
  gerado por você (ou entrar com Google) — a coluna "Acesso" mostra quem é.
- Arquivos: `lib/senha.ts`, `types/Usuario.ts`, `lib/schema.ts`,
  `services/usuariosService.ts`, `app/api/auth/{login,primeiro-acesso}`,
  `app/api/usuarios/[id]/codigo` (nova, substitui `.../senha`),
  `app/(app)/usuarios/page.tsx`, `app/login/page.tsx`, `components/CrudManager.tsx`,
  `lib/memoryStore.ts`, `.env.example`, `docs/04`, `docs/06`, `docs/08`, `CLAUDE.md`.

---

## 2026-08-05 — Primeiro acesso: a pessoa cria a própria senha

- **Buraco real**: ninguém criava senha. A conta nascia sem `senha_hash` e a
  pessoa entrava com a senha compartilhada (`ACCESS_PASSWORD`) — **sem nada na
  tela dizendo que aquilo era temporário**. Trocar era possível em "Minha
  conta", mas escondido; e **esquecer não tinha saída**: o admin digitava uma
  senha nova e transmitia para a pessoa, ficando sabendo a senha dela.
- **Primeiro acesso**: o login detecta conta sem senha própria e responde
  `primeiro_acesso: true` **sem criar sessão**. A tela vira "crie a sua senha"
  (nova + confirmação) e `POST /api/auth/primeiro-acesso` revalida tudo do zero
  antes de gravar e abrir a sessão — não confia em ter passado pelo login.
- **A prova de identidade é a senha compartilhada.** Sem isso, bastaria digitar
  o e-mail de outra pessoa para tomar a conta. É o mesmo nível de acesso que o
  login já exigia, e ela deixa de valer para a pessoa depois da troca.
- **Esqueceu**: o admin **reseta** (apaga a senha) e a pessoa volta ao primeiro
  acesso. Removida a rota de o admin *definir* a senha de alguém — mesmo
  resultado, sem ele conhecer a senha de ninguém.
- **Regras**: mínimo de 6 caracteres (era 4) e **proibido repetir a senha
  compartilhada**, senão a troca não trocaria nada. `MIN_SENHA` mora em
  `lib/sessionConstants.ts` para cliente e servidor não divergirem — a tela
  "Minha conta" ainda cobrava 4 e daria erro só depois de clicar em salvar.
- **Erros indistinguíveis** no primeiro acesso: e-mail inexistente, senha errada
  e conta que já tem senha devolvem a mesma mensagem. Diferenciar contaria a
  estranhos quais e-mails existem e quais contas estão sem senha.
- **Coluna "Senha"** em Usuários mostra quem ainda está no primeiro acesso —
  serve para acompanhar a implantação e saber quando o risco da senha
  compartilhada acabou. O hash nunca sai do servidor (novo tipo
  `UsuarioListado`, com booleano em vez do hash).
- **Bug corrigido de tabela**: `/api/auth/google` não montava `sedes` na sessão —
  quem opera mais de uma sede e entrava pelo Google ficava só com a principal.
- Demo: os três usuários ganharam senha pronta (senão todo login da demo cairia
  no primeiro acesso a cada reinício) e entrou `coordenador.novo@empresa.com`
  sem senha, para demonstrar o fluxo.
- Verificado por API: senha fraca, senha igual à compartilhada, primeiro acesso
  sem saber a senha compartilhada e tentativa de tomar conta que já tem senha
  são todos recusados; após a troca a compartilhada para de valer; supervisor
  não reseta senha de ninguém (403); reset devolve a pessoa ao primeiro acesso.
- **Risco em aberto**: quem souber a senha compartilhada pode assumir contas que
  ainda não definiram senha. Antes de liberar: trocar `ACCESS_PASSWORD` do padrão
  e garantir que os administradores já tenham senha própria.
- Arquivos: `lib/senha.ts`, `lib/sessionConstants.ts`,
  `app/api/auth/{login,primeiro-acesso,google}`, `app/api/usuarios/[id]/senha`,
  `services/usuariosService.ts`, `types/Usuario.ts`, `app/login/page.tsx`,
  `app/(app)/{usuarios,conta}/page.tsx`, `lib/memoryStore.ts`, `docs/04`.

---

## 2026-08-05 — Supervisor pode operar mais de uma sede

- **Lacuna real**: o modelo era binário — `sede_id` aceitava **uma** sede ou
  `geral` (todas as 17). Não existia "estas três". Um coordenador que cobre
  sedes vizinhas só tinha saídas ruins: três logins, ou `geral`, que é acesso de
  escrita a todas — um excesso de permissão disfarçado de solução.
- **Modelo novo**: `sede_id` continua sendo a sede **principal** (a que abre por
  padrão) e entra `sedes_extra` (ids separadas por vírgula, coluna no fim).
  Escopo efetivo = principal + extras, resolvido por `sedesPermitidas`.
  Aditivo: quem tem uma sede só não muda em nada.
- **Alcance contido**: as ~40 rotas de API já passavam todas por
  `limitarSedeConsulta` e `podeAlterarSede`. Ensinar lista a essas duas funções
  tornou a API inteira multi-sede sem tocar nas rotas.
- **Uma sede por vez, nunca agregado**: a Central ganhou seletor (`?sede=`) e a
  Agenda usa o filtro que já existia. Decisão de custo: agregar multiplicaria as
  leituras por sede, e a grade da Agenda é por natureza de uma sede (colunas =
  pessoas dela). O seletor mostra o total — "você opera 2 sedes · vendo …" —
  porque sem isso é fácil esquecer que as outras existem.
- **Não amplia escopo**: sede pedida fora do escopo **cai na principal**, nunca
  em "todas". Verificado por API: ler e escrever na 2ª sede passa; numa 3ª sede
  dá 403; `?sede=` inventada volta para a principal.
- **Compatibilidade**: cookie emitido antes do campo cai em `[sede_id]` — mantém
  o comportamento de hoje e só ganha o escopo novo ao relogar (falha fechando).
- **`sedeDoEscopo` da Central foi removida** (lógica de permissão duplicada) e
  as mensagens de erro deixaram de dizer "da própria sede".
- Demo: a supervisora agora opera Dionísio Torres + Aldeota (a segunda sem
  cadastro, que é o estado real de uma unidade no primeiro dia).
- Arquivos: `lib/permissions.ts`, `types/Usuario.ts`, `lib/schema.ts`,
  `app/api/auth/login`, `app/api/sedes`, `app/api/central-dia`,
  `services/centralDiaService.ts`, `services/usuariosService.ts`,
  `components/CentralDoDia.tsx`, `app/(app)/usuarios/page.tsx`,
  `lib/memoryStore.ts`, `docs/02`, `docs/01`, `docs/04`, `CLAUDE.md`.
- **Portão da doutrina**: elimina passos (um login por sede, ou pedir a alguém
  para olhar a outra unidade); é campo de **implantação** (cadastro de usuário,
  mexido pelo admin), não de operação diária; o dia do supervisor não ganha
  nenhuma decisão nova — quem tem uma sede não vê seletor. Não tem gatilho de
  aposentadoria porque não é ferramenta de implantação: é atributo de permissão,
  da mesma natureza de `perfil`.

---

## 2026-08-04 — Material de apresentação para os coordenadores de sede

- **Nada mudou no sistema.** Esta entrada registra o material produzido para a
  implantação, que mora **fora do repositório** (é grande e binário), em
  `Desktop/Orkestria - Material de Apresentacao/`.
- **Persona definida**: o destinatário não é "usuário leigo" genérico — é o
  **coordenador que hoje monta a rota na planilha**. Isso mudou o material
  inteiro: em vez de descrever telas, ele compara ferramentas ("na planilha /
  no Orkestria") e trata o conhecimento da rota como algo que a pessoa já tem.
- **Entregas**:
  - `Orkestria-Guia-Completo.mp4` — 8min14, narrado (voz neural pt-BR), com
    legenda, destaque no clique e **zoom aplicado na própria página** durante a
    gravação (não na imagem depois, para o texto não borrar). Quatro módulos:
    o seu dia · dia de evento · quando o dia foge do plano · montar a sede.
  - `Orkestria-Manual-do-Coordenador.pdf` — 23 páginas, com glossário e tabela
    de "deu errado → o que fazer".
  - `Orkestria-Guia-de-Operacao.pdf` — 27 páginas, referência completa.
  - `telas-do-sistema/` e `telas-anotadas/` — 21 capturas cada, para slides.
- **Honestidade no encerramento**: o vídeo termina dizendo que os primeiros dias
  dão *mais* trabalho, porque o sistema ainda não conhece a rota da sede. Quem
  espera ganho no dia 1 e não encontra, abandona.
- Ferramentas de captura (Chrome headless + CDP, narração, anotação) ficaram no
  scratchpad da sessão — descartáveis, mas o roteiro está reproduzível.

---

## 2026-08-03 — Modelos de rotina deixaram de ficar escondidos na visão Semana

- **Problema real relatado**: "não achei onde salva uma rotina de evento". Não era
  falta de atenção — o botão que abre a janela de modelos **só existia no modo
  Semana** (`modo === "semana"` em `FiltersBar`). Quem monta um evento monta no
  **Dia**, e ali o caminho simplesmente não existia.
- **Correção**: o botão passa a aparecer nos dois modos, e o rótulo mudou de
  "⧉ Planejar período" para **"⧉ Duplicar e modelos"** — a pessoa procura pela
  palavra *modelo*, não por *período*. O tooltip agora cita as três coisas que a
  janela faz: duplicar o dia, salvar como rota padrão ou modelo de evento, e
  aplicar em datas futuras.
- Verificado no navegador: no modo Dia o botão aparece e abre a janela com a
  caixa "É um modelo de evento (formatura, feira, prova…)".
- **Passa no portão da doutrina**: não acrescenta superfície — torna alcançável
  um caminho que já existia e estava inacessível na tela onde é usado.
- Arquivo: `components/agenda/FiltersBar.tsx`.
- Junto disso foi produzido o **guia de operação em PDF** (27 páginas, com as
  telas reais capturadas do sistema) para a apresentação aos coordenadores de
  sede — fica fora do repositório, entregue direto ao usuário.

---

## 2026-07-22 — Marcos da evolução mais didáticos para a direção

- Os seis MARCOS da página "Da ata ao sistema" foram reescritos para o leitor
  não-técnico (o diretor, que não estava nas conversas de desenvolvimento): cada
  `impacto` abstrato virou cena ou número (40 tarefas → 35 cliques; "Maria · 9h30
  · confirmar"; "as regras estão no sistema, não em quem saiu"), o jargão nosso é
  ancorado na primeira menção ("a primeira tela do supervisor — a Central") e a
  ideia-guia ("o sistema ganha capacidade por dentro, o supervisor vê menos por
  fora") aterrissa no marco 06. Mesmo comprimento — âncora melhor, não texto a
  mais.
- Só a camada executiva curada mudou; a linha do tempo alimentada pelo DIARIO e
  o resto da página seguem iguais. Arquivo: `app/(app)/da-ata/page.tsx`.

---

## 2026-07-22 — Da ata ao sistema virou memória executiva completa

- **Substituição, não nova aba**: `/da-ata` deixou de ser apenas a lista estática
  dos pedidos da reunião. A mesma rota agora abre com uma narrativa executiva
  em seis movimentos, comparações `Antes → Agora`, impacto operacional e a
  separação explícita entre o que está ativo, preservado e em validação.
- **Duas camadas, duas fontes conscientes**: os marcos executivos são curados à
  mão porque apresentação exige síntese; o mapa integral da ata continua
  preservado por tema; e a linha do tempo abaixo incorpora automaticamente
  todas as entradas do `DIARIO.md`.
- **DIARIO no build, não no request**: o Markdown entra como `asset/source` no
  bundle do Next. O parser roda uma vez no módulo e não toca no filesystem a
  cada visita autenticada. Entrada que não casar com `data — título` aparece
  integralmente como `formato livre`, em vez de sumir ou derrubar a página.
- **Transparência fora da rotina local**: o item saiu do menu do supervisor e a
  própria página valida a sessão no servidor. Administração e gerência acessam;
  supervisor que digita `/da-ata` é redirecionado para `/inicio`.
- **Portão da doutrina**: a mudança substitui a página existente e remove uma
  opção irrelevante da navegação do supervisor. Não acrescenta decisão ao dia;
  transforma pesquisa manual em DIARIO/commits numa prestação de contas pronta.
- **Direção visual**: a skill de frontend orientou um caderno executivo dentro
  do sistema Partitura — abertura editorial, pauta, marcos legíveis à distância,
  arquivo recolhido e impressão limitada à narrativa, sem estética de dashboard
  genérico.
- **Validação**: TypeScript, `git diff --check` e build de produção com 67
  páginas/rotas aprovados. Em `DATA_SOURCE=memory`, admin e gerência abriram
  `/da-ata` com `200` e conteúdo completo; supervisor autenticado terminou em
  `/inicio`. O fallback foi exercitado com um bloco fora do formato e preservou
  o texto bruto sem erro. Nenhuma escrita ocorreu no Firebase.
- **Arquivos principais**: `app/(app)/da-ata/page.tsx`, `lib/diarioProduto.ts`,
  `next.config.ts`, `types/conteudo.d.ts`, `components/AppShell.tsx`,
  `lib/permissions.ts` e `app/globals.css`.

---

## 2026-07-22 — Agenda contextual: menos decisões simultâneas (passo 6)

- **Uma preparação por vez**: `Gerar o dia` e `Repetir o dia anterior` deixaram
  de aparecer também na barra. Num dia vazio, só o chamado principal adequado
  ao estado da sede fica visível; a faixa de utilidades nem ocupa espaço antes
  de existir rotina ou ausência concreta.
- **Operação separada do planejamento**: `Duplicar / Modelos` saiu da visão
  diária e virou `Planejar período`, disponível apenas na visão semanal. A
  ferramenta continua completa, mas não compete com a terça-feira do
  supervisor. O atalho redundante para Dashboard também saiu do cabeçalho — o
  painel continua no menu global.
- **Ações com gatilho de saída**: ausência só aparece quando `nFaltas > 0`;
  confirmação só aparece quando há rotina encerrada sem realizado; impressão e
  compactação só aparecem com dia montado; `Ensinar esta rota` desaparece assim
  que a sede ganha uma rota padrão.
- **Sem cobrança antes da hora**: a Agenda usava todas as rotinas sem execução
  no contador de realizado, inclusive blocos futuros. A nova função pura
  `rotinaAguardaConfirmacao` é compartilhada com a Central: dia passado cobra,
  dia futuro não cobra e hoje só entra depois de `fim_planejado`.
- **Portão da doutrina**: elimina ações duplicadas e irrelevantes da rotina;
  mantém a operação diária separada do planejamento de período; reduz escolhas
  antes de montar/fechar o dia; cada controle tem condição programável para
  sumir; drag-and-drop e menu global continuam sendo o caminho básico.
- **Direção visual**: a skill de frontend orientou uma faixa operacional
  utilitária, densa e coerente com o sistema Partitura, em vez de outro painel
  decorativo. O próximo passo mantém destaque único e as utilidades ficam
  secundárias.
- **Validação**: `git diff --check` e build de produção com 67 páginas/rotas
  aprovados. Em `DATA_SOURCE=memory`, supervisor abriu `/rotinas` com `200` e
  permaneceu em `christus_dt`; das 44 rotinas sem execução, somente as 36 já
  encerradas apareceram como pendentes. Nenhuma escrita ocorreu no Firebase.
- **Arquivos principais**: `app/(app)/rotinas/page.tsx`,
  `app/(app)/rotinas/useRotinaData.ts`, `components/agenda/FiltersBar.tsx`,
  `components/agenda/BarraPassosDoDia.tsx`, `lib/agenda.ts`,
  `services/centralDiaService.ts` e `app/globals.css`.

---

## 2026-07-22 — Próxima exceção resolvida em uma decisão (passo 5)

- **Decisão pronta, não modo novo**: quando uma tarefa de pessoa ausente ou fora
  da escala tem substituta segura, a Central mostra pessoa + horário e permite
  `Confirmar alocação` em um toque. Não há modal, tela ou fluxo intermediário.
- **Zero alerta é o portão**: a sugestão reutiliza as regras da Agenda para
  jornada, intervalos, sobreposição, gênero, janela, qualificação, cadastro e
  carga. Até um alerta não bloqueante de sobrecarga remove o atalho e mantém
  `Redistribuir` na Agenda como caminho manual completo.
- **Servidor não confia no clique**: `/api/central-dia/resolver` recalcula a
  próxima decisão e exige os mesmos ids antes de gravar. Proposta antiga ou
  manipulada recebe `422`; visualizador recebe `403`; uma segunda validação
  estrita fecha mudanças concorrentes entre o cálculo e a escrita.
- **Aposentadoria executável**: `resolucao` só existe enquanto aquela rotina é a
  primeira exceção e há candidato com zero alerta. Após confirmar, a rotina
  deixa a condição, a contagem cai e a Central recalcula a próxima sozinha.
- **Leituras contidas**: a carga comum da Central continua sem histórico. A
  exceção consulta apenas tarefa, local, parâmetros e, quando necessários,
  requisitos/qualificações da sede em foco. Mover rotina também deixou de ler o
  dia de todas as sedes e agora rejeita vínculo funcionário↔rotina entre sedes.
- **Portão da doutrina**: substitui abrir Agenda → localizar órfã → escolher
  pessoa → confirmar; pertence à operação; reduz o caso seguro a uma decisão;
  desaparece pelo predicado acima; e a Agenda segue suficiente sem o atalho.
- **Validação**: `git diff --check` e build de produção com 67 páginas/rotas
  aprovados. Em `DATA_SOURCE=memory`, `/inicio` retornou `200`; sem candidato
  seguro não houve atalho; a proposta foi `Maria Apoio · 06:05`; confirmação
  moveu a rotina e reduziu 19 pendências para 18; a próxima virou `christus_r2`;
  visualizador recebeu `403`; corpo manipulado e repetição receberam `422`.
  Nenhuma escrita ocorreu no Firebase.
- **Arquivos principais**: `components/CentralDoDia.tsx`,
  `app/api/central-dia/resolver/route.ts`, `services/centralDiaService.ts`,
  `services/rotinasService.ts`, `types/CentralDia.ts` e `app/globals.css`.

---

## 2026-07-22 — Realizado comum confirmado na linha (passo 4)

- **Um toque substitui o formulário**: tarefas pendentes sem EPI agora exibem
  `✓ Conforme` diretamente no card mobile e na linha desktop. O servidor usa
  horário e duração planejados; o supervisor não redigita dados iguais.
- **Exceção continua explícita**: `Desvio` abre o formulário completo para
  atraso, parcial, não realizada, remanejada, cancelada, justificativas e
  horários diferentes. Registros existentes continuam com `Reabrir`.
- **EPI não virou atalho**: tarefa com requisito de EPI mostra
  `Confirmar + EPI` e permanece no formulário com declaração humana. A nova
  rota `/api/execucoes/conforme` também recusa chamadas diretas nesses casos;
  esconder o botão no navegador não é a única proteção.
- **Backend deriva o registro**: o cliente rápido envia somente `rotina_id`.
  Data, status, horários, duração, sede e supervisor são obtidos no servidor,
  evitando que o atalho aceite números manipulados.
- **Portão da doutrina**: elimina abrir e confirmar um formulário no caso
  mediano, pertence ao Acompanhamento, reduz o fechamento a um toque, e o botão
  desaparece assim que existe execução. O formulário completo continua sendo o
  caminho básico para qualquer desvio ou declaração de EPI.
- **Sem lote deliberadamente**: confirmação em massa e “registrar próxima” não
  entraram. O ganho desta etapa vem de retirar o formulário repetitivo, sem
  criar outro modo ou uma decisão de grande alcance.
- **Validação**: TypeScript, `git diff --check` e build de produção com 66
  páginas/rotas aprovados. Em `DATA_SOURCE=memory`, confirmação comum retornou
  `201`; repetição manteve uma única execução; EPI retornou `422`; visualizador
  retornou `403`; e a Central reduziu as pendências de 32 para 31. Nenhuma
  escrita ocorreu no Firebase.
- **Arquivos principais**: `app/(app)/acompanhamento/page.tsx`,
  `app/api/execucoes/conforme/route.ts`, `services/execucoesService.ts` e
  `app/globals.css`.

---

## 2026-07-22 — Central enxuta: uma próxima decisão (passo 3)

- **Substituição, não soma**: a página inicial deixou de ser uma grade com cinco
  atalhos e um tutorial permanente de implantação. Agora apresenta uma única
  próxima exceção, seguida apenas pela fila operacional que já está em ordem.
- **Cadastros contextuais**: saúde cadastral, prontidão, kits e percentuais não
  moram na Central. Um cadastro só aparece quando uma condição verificável
  bloqueia o dia — sede inválida, ausência de equipe ativa ou ausência de
  tarefas utilizáveis numa sede com pessoas disponíveis e agenda vazia.
- **Leituras contidas**: a carga normal faz somente consultas do dia para
  equipe, rotinas, execuções e ausências, mais a sede do supervisor. Não lê
  locais, qualificações, usuários nem 31 dias de histórico. Tarefas só são
  consultadas no caminho excepcional de uma sede específica com o dia vazio.
- **Escopo**: supervisor comum recebe apenas a própria sede; administração e
  gerência recebem o resumo global sem cálculo de cobertura histórica. O menu
  passou de “Início” para “Central”, tornando explícita a função da tela.
- **Portão da doutrina**: elimina escolha entre atalhos, pertence à operação,
  reduz o primeiro gesto a um botão, e cada aviso desaparece automaticamente
  quando sua condição é resolvida. O caminho básico não depende da fila nem de
  conhecimento avançado.
- **Validação**: TypeScript, `git diff --check`, build de produção com 65
  páginas/rotas e testes HTTP em `DATA_SOURCE=memory` aprovados. Supervisor foi
  escopado em `christus_dt`; admin e gerência ficaram em `geral`; uma sede vazia
  exibiu `sem-equipe`. Em 20 chamadas, a API teve média de 4,42 ms e p95 de
  5,75 ms. Nenhuma escrita ocorreu no Firebase.
- **Arquivos principais**: `app/(app)/inicio/page.tsx`,
  `app/api/central-dia/route.ts`, `components/CentralDoDia.tsx`,
  `services/centralDiaService.ts`, `types/CentralDia.ts`, `app/globals.css` e
  `components/AppShell.tsx`.

---

## 2026-07-22 — Auditoria aguardada sem serializar o Gerar o dia (passo 2)

- **Escolha explícita**: toda criação, atualização ou exclusão agora aguarda a
  escrita correspondente no histórico. O log deixou de ser `fire-and-forget`,
  que podia ser perdido quando uma execução serverless terminasse.
- **Falha transitória**: a auditoria tenta até três vezes, com esperas curtas de
  40 ms e 80 ms e reutilizando o mesmo ID. Se as três falharem, o erro é
  registrado no servidor e a operação principal permanece concluída — ela já
  foi persistida e não é seguro repeti-la automaticamente.
- **Lote preservado**: o Gerar o dia continua processando blocos em paralelo;
  apenas cada gravação aguarda o próprio histórico. A evolução correta para
  reduzir latência real no Firestore é escrita em lote/BulkWriter, não voltar a
  abandonar a auditoria em segundo plano.
- **Medição comparável**: com rota padrão de 44 blocos e banco isolado em
  memória, a média geral de oito gerações foi de 6,02 ms para 6,21 ms. Nos seis
  dias úteis que realmente geraram 44 rotinas, foi de 6,32 ms para 6,53 ms
  (+0,21 ms). A diferença é ruído operacional nesse modo e confirma que o lote
  não foi serializado; não pretende estimar a latência de rede do Firestore.
  Sábado e domingo pularam corretamente os 44 blocos.
- **Validação**: TypeScript, `git diff --check`, build de produção (64
  páginas/rotas) e fluxo HTTP real de salvar modelo e gerar dias aprovados.
  Uma criação seguida imediatamente pela leitura do histórico já encontrou o
  log correspondente, com ação, resumo e usuário corretos. Nenhuma escrita
  ocorreu no Firebase.
- **Arquivo funcional**: `lib/historico.ts`.

---

## 2026-07-22 — Fechamento independente da fundação de permissões (passo 1c)

- **Revisão antes de empilhar**: os dois commits iniciais do Passo 1 foram
  auditados novamente antes do início da auditoria aguardada. A integridade dos
  dados estava melhor, mas várias rotas ainda autorizavam apenas a sede atual
  do registro; um supervisor poderia tentar trocar o destino para funcionário,
  local ou sede fora do próprio escopo.
- **Destino também autorizado**: edição de rotina, ausência, funcionário,
  local, tarefa, qualificação, tempo personalizado e serviço eventual agora
  valida o destino antes de chamar o serviço. Criação de rotina também verifica
  tarefa e funcionário, e execução realizada confirma a sede da rotina.
- **Vínculos completos**: tempo personalizado exige funcionário e tarefa da
  mesma sede. Exclusão de sede considera todas as tabelas que carregam
  `sede_id`; requisito considera tarefas e qualificações; categoria considera
  tarefas e eventuais. O administrador não consegue inativar a própria conta.
- **Parâmetros sem escalada**: supervisor só cria parâmetro editável no próprio
  escopo e não consegue mover ou alterar chave, tipo ou regra de permissão de
  um parâmetro existente.
- **Histórico protegido provisoriamente**: registros legados de auditoria não
  têm `sede_id`; por isso, o histórico global foi retirado do menu e bloqueado
  para supervisor até existir auditoria escopada. Administração e gerência
  mantêm a leitura.
- **Validação**: TypeScript, `git diff --check` e `npm run build` aprovados, com
  64 páginas/rotas. Em servidor isolado `DATA_SOURCE=memory`, foi criada uma
  segunda sede descartável: dez tentativas de cruzar escopo retornaram `403`,
  vínculo de tempo entre sedes retornou `422` e auto-inativação retornou `400`.
  Os caminhos legítimos de parâmetro, ausência, qualificação, tempo e execução
  retornaram `200/201`; exclusões com vínculos retornaram `422`. Nenhuma escrita
  ocorreu no Firebase.
- **Arquivos principais**: rotas `app/api/*/[id]`, `app/api/rotinas`,
  `app/api/execucoes`, `app/api/parametros`, `app/api/historico`,
  `components/AppShell.tsx`, `services/temposPersonalizadosService.ts`,
  `services/sedesService.ts`, `services/requisitosService.ts` e
  `services/categoriasService.ts`.

---

## 2026-07-22 — Auditoria do ORK4: manter ORK3 no piloto

- **Veredito**: **não integrar o ORK4** como está; o piloto segue com ORK3. A
  análise completa está em [docs/14-auditoria-ork4.md](docs/14-auditoria-ork4.md).
- O ORK4 (na branch `codex-desburocratizacao-full`) resolve uma limitação real —
  o ORK3 não leva os nomes dos EPIs no QR, então a conferência os reconstrói do
  catálogo atual e pode divergir do papel assinado se um requisito mudar entre
  imprimir e ler. Mas cria dois riscos que pesam mais no piloto:
  1. **QR mais denso no mesmo espaço físico**: o módulo impresso cai de ~0,333 mm
     (sem nomes) para ~0,258 mm (4 EPIs) e ~0,221 mm (8 EPIs). O round-trip
     digital passa, mas não há teste de papel impresso, fotocópia nem foto de
     celular — justo na evidência que precisa ser mais confiável.
  2. **Snapshot não autenticado**: o leitor passaria a aceitar a lista de EPIs
     vinda do próprio QR, sem assinatura. Um QR fabricado poderia fornecer outra
     lista para uma sede/data/funcionário reais. É uma regressão de segurança.
- Condições para reconsiderar (em docs/14): autenticidade do snapshot, densidade
  controlada com teste físico, e retrocompat automatizada ORK1–3. Até lá, o risco
  do ORK3 se mitiga por processo: não renomear/remover EPI com ficha aberta.
- **Doutrina** ganhou a regra que faltava: toda ferramenta de implantação que
  voltar por demanda observada só retorna ao `main` **acompanhada do seu gatilho
  programável de aposentadoria** — sem o off-switch, não entra
  ([docs/00-doutrina.md](docs/00-doutrina.md)).
- Arquivos: `docs/14-auditoria-ork4.md` (novo), `docs/00-doutrina.md`.

---

## 2026-07-22 — Fundação de segurança e integridade (passo 1 do piloto)

- **Contexto**: as 8 entregas de desburocratização do Codex (~5.300 linhas) foram
  preservadas inteiras na branch `codex-desburocratizacao-full` e **não** viram
  baseline. O `main` reconstrói só o essencial, sob a regra de
  [docs/00-doutrina.md](docs/00-doutrina.md). Esta é a fundação — proteção
  invisível que não burocratiza — trazida antes de qualquer fluxo de piloto.
- **1a · Isolamento de leitura por sede**: `limitarSedeConsulta`
  (`lib/permissions.ts`) clampa toda consulta de leitura à sede da sessão do
  supervisor comum, mesmo se o `?sede=` for omitido ou adulterado. Admin,
  visualizador e supervisor `geral` preservam o filtro pedido. Aplicado às 14
  rotas GID de leitura. Verificado: supervisor não amplia escopo por nenhum
  caminho; admin mantém acesso amplo.
- **1b · Integridade de vínculos**: create/update passam a exigir que as FKs
  existam e pertençam à sede — qualificação (requisito existe/ativo/não-EPI +
  dedup), usuário (sede existe, admin não se auto-inativa), serviço eventual
  (func/local/categoria da mesma sede), tempo personalizado (func/tarefa
  existem), ausência (func existe), e funcionário/local/tarefa não trocam de
  sede com vínculos vivos. Verificado: EPI, requisito inexistente e func
  inexistente são barrados (422).
- **Reconstruído, não extraído**: `tarefasService` recebeu só os *hunks* de
  integridade — `aplicarKitTarefasLocal` e `replicarTarefaParaLocais` (kits e
  replicação) **continuam só na branch**, como implantação sob demanda.
- Arquivos: `lib/permissions.ts`, 14 rotas GET em `app/api/*`, e os services de
  qualificações, usuários, funcionários, locais, serviços eventuais, tempos
  personalizados, ausências e tarefas.
- **A seguir**: passo 2 (auditoria aguardada + teste de latência do "Gerar o
  dia"), depois Central enxuta, confirmação inline e resolução de exceção em uma
  decisão. ORK4 fica em auditoria isolada (passo 7), sem compromisso de inclusão.

---

## 2026-07-20 — Ficha: declaração de EPIs no lugar da marcação item a item (ORK3)

- Pedido da reunião: em vez de o funcionário **escolher** quais EPIs marcar, a
  ficha traz uma **declaração** de que usou os EPIs corretos.
- Cuidado deliberado com o anexo jurídico da ata (a ficha assinada é elemento
  probatório): a declaração **não é genérica** — os EPIs saem **nominalmente
  impressos** ao lado ("Declaro que utilizei os EPIs abaixo: …"), senão o
  registro deixaria de dizer o que de fato foi usado.
- **Versionamento**: o QR virou `ORK3` (mesmo formato do ORK2 + bloco de EPI de
  uma caixa). O leitor escolhe a geometria pela versão, então **fichas ORK2 já
  impressas continuam sendo lidas** pelo layout antigo — sem reimpressão urgente.
- `declaracaoPos(n)` na geometria (fonte única) ocupa a posição da 1ª caixa do
  layout antigo, então a âncora do bloco e as Observações seguem valendo.
- **Caminho digital alinhado**: no acompanhamento, os checkboxes por EPI
  **pré-marcados** (padrão frágil que eu mesmo tinha criado) viraram uma
  declaração única, **desmarcada por padrão** — o formulário não afirma sozinho
  algo que ninguém conferiu.
- Verificado por **round-trip real** (PDF gerado → `pdftoppm` → OMR de produção):
  QR ORK3 com n=19 e 19 códigos, 19 tarefas lidas, bloco de EPI = exatamente 1
  caixa lida como marcada (tinta 0,531 vs limiar 0,12, confiança alta). Geometria
  sem colisão de 1 a 27 tarefas. O leitor NOVO lê ficha ORK2 ANTIGA corretamente.
- **Achados da auditoria, corrigidos**: (a) **bug sério** — uma segunda condição
  ficou em `versao === 2`, então a ficha ORK3 caía no caminho ORK1 (casa por
  POSIÇÃO) e perderia a proteção contra a rotina mudar depois de imprimir,
  gravando o realizado na rotina errada em silêncio. (b) Os nomes de EPI eram
  cortados em 2 linhas e o excedente **sumia sem aviso** — inaceitável numa
  declaração que diz "os EPIs abaixo"; agora quebra em quantas linhas precisar.
  (c) Registro antigo com lista parcial de EPIs podia ser sobrescrito sem o
  supervisor notar — agora a tela mostra o que está gravado. (d) Código morto.
- ⚠️ **Limitação conhecida (não corrigida nesta entrega)**: o QR não carrega os
  NOMES dos EPIs — a conferência os reconstrói dos requisitos **atuais** das
  tarefas. Se os requisitos mudarem entre imprimir e conferir, o
  `epis_confirmados` gravado pode divergir da lista impressa e assinada. Já era
  assim no ORK2 (e pior). Corrigir exigiria levar os nomes (ou um hash) no QR —
  vale decidir com o Murilo, já que é ponto jurídico.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`,
  `app/(app)/conferir/page.tsx`, `app/(app)/acompanhamento/page.tsx`.

---

## 2026-07-20 — Rotinas por tipo de evento (ata 17/07)

- **A principal lacuna apontada pela operação**: "não adianta organizar a rotina,
  porque os eventos a desmontam". E no dia do evento o supervisor não tem tempo
  de montar a programação — o lançamento precisa ser **prévio**.
- Reuso do mecanismo de modelos (já cobria ~80%): `ModeloRotinaItem.evento?`
  marca o modelo como **de evento**. O "tipo de evento" é o próprio nome do
  modelo ("Formatura", "Feira de Ciências") — sem tabela nova.
- Fluxo, sem editor novo: o supervisor monta o 1º evento na agenda normal (com
  todas as validações ao vivo), salva marcando "modelo de evento" e, nos
  próximos, **aplica com antecedência** (sexta → fim de semana). `aplicarModelo`
  já fazia isso, passando por `createRotina` (ausência, conflito, requisitos).
- **Invariante**: evento e rota padrão se excluem — senão o "Gerar o dia" passaria
  a montar a programação do evento todo dia. Barrado no serviço
  (`MODELO_EVENTO_PADRAO`), nos checkboxes e com um filtro defensivo em
  `getRotaPadrao` (`padrao && !evento`) para o caso de dado antigo.
- No dia do evento: gera a rota padrão normalmente e aplica o evento **por cima**
  — o que conflitar de horário é pulado e informado (texto no modal explica).
- O catálogo separa "Rotas" e "Eventos" em `<optgroup>` e mostra a faixa de
  horário do modelo (menor início–maior fim).
- Verificado: padrão+evento juntos → 422; "Gerar o dia" devolve `semRota` quando
  só há evento (não confunde); aplicar em data futura cria; reaplicar cria 0
  (idempotente); rota padrão e evento convivem no mesmo dia.
- **Achados da auditoria, corrigidos**: (a) os checkboxes não eram resetados após
  salvar e o modal fica montado — um "rota padrão" esquecido faria o PRÓXIMO
  modelo **roubar a rota padrão da sede** (bug pré-existente, agora fechado).
  (b) Salvar um modelo com o nome da rota padrão sem remarcá-la a apagava **em
  silêncio**; agora dá erro explicando (`MODELO_SOBRESCREVE_PADRAO`).
  (c) `temRotaPadrao` na tela não excluía evento — oferecia "Gerar o dia" e a
  geração respondia "sem rota". (d) Duração inválida virava `NaN` no rótulo.
- ⚠️ **Se algum dia rodar com `DATA_SOURCE=sheets`**: o campo novo só é lido
  depois de rechamar `/api/setup` (o cabeçalho da aba precisa ganhar a coluna);
  sem isso o flag é gravado e ignorado na leitura. No Firestore não se aplica.
- Arquivos: `types/ModeloRotina.ts`, `lib/schema.ts`, `services/modelosService.ts`,
  `app/api/modelos/route.ts`, `components/agenda/ModalPlanejamento.tsx`,
  `app/(app)/rotinas/useRotinaData.ts`.

---

## 2026-07-20 — Aptidão: nível de habilitação na qualificação (ata 17/07)

- Pedido da operação: o sistema devia **direcionar a pessoa mais habilitada**
  para uma atividade de evento (ex.: montagem de palco). Hoje a qualificação era
  binária — só distinguia quem executa de quem não executa.
- `QualificacaoFuncionario.nivel?` = `apto | experiente | referencia`
  (vazio = apto). **Invariante que não pode cair**: o nível SÓ ordena sugestão —
  não libera nem bloqueia. Quem tem a qualificação válida executa, seja qual for
  o degrau; quem não tem continua bloqueado. `validarAlocacao` não foi tocada.
- Nova função pura `sugerirPorHabilitacao` (`lib/validations.ts`) repete o mesmo
  critério de conformidade do bloqueio (posse + validade, EPI não conta) e só
  ordena. Nível efetivo = **menor** entre os requisitos exigidos.
- Na paleta de tarefas, as que exigem requisito ganham "★ Habilitados: Fulano
  (referência), …" (top 3). Custo zero de dados — a tela já carregava tudo.
- **Guardrail jurídico** (anexo confidencial da ata): é degrau de HABILITAÇÃO,
  nunca avaliação de desempenho. Os textos da UI dizem isso explicitamente.
- Verificado: nível inválido → 422; vazio = apto; ordenação decrescente; **"apto"
  PASSA** numa tarefa que exige o requisito e **"referência" é BLOQUEADO** quando
  falta o requisito exigido (os dois sentidos da invariante).
- **Achados da auditoria, corrigidos**: (a) `nivel in NIVEL_ORDEM` aceitava
  chaves de protótipo — `"toString"` passava como nível válido e quebrava a
  ordenação com `NaN`; agora `Object.hasOwn`. (b) A sugestão divergia do bloqueio
  para requisito com `tipo` em branco (sugeria quem a alocação recusaria).
  (c) `.find` linear dentro do laço + memo dependente da busca recalculava tudo a
  cada tecla — virou índice `Map` e memo sobre `tarefas`. (d) Ausentes do dia
  saíram das sugestões.
- **Ordem de coluna no schema**: `nivel` (e o `sede_id` das execuções, de ontem)
  foram para o FIM da tabela. O Google Sheets grava por POSIÇÃO — inserir coluna
  no meio deslocaria os dados das planilhas já preenchidas. Firestore/memória não
  se importam (campos por nome), mas a regra vale para todo campo novo.
- Arquivos: `types/QualificacaoFuncionario.ts`, `lib/schema.ts`,
  `lib/validations.ts`, `services/qualificacoesService.ts`,
  `app/(app)/qualificacoes/page.tsx`, `components/agenda/TaskPalette.tsx`,
  `app/(app)/rotinas/page.tsx`.

---

## 2026-07-20 — O local guia o nível de limpeza (ata 17/07)

- Decisão da reunião: **o tipo de uso do local puxa o fator automaticamente**,
  mantendo o fator da tarefa (os dois multiplicam, com o local como prioritário).
- `FATOR_POR_TIPO_LOCAL` em `lib/calculations.ts` (banheiro/copa 1,5 · área
  externa 0,8 · demais 1,0 — segue a orientação que já estava publicada na tela
  de Locais). `fatorIntensidadeLocal` usa esse padrão **só quando o cadastro está
  em branco**; valor digitado sempre vence. Corredor e escada ficaram em 1,0 até
  a operação calibrar — a formalização dos fatores é item do Murilo na ata.
- O form não força mais `1` no campo (nascia preenchido, impedindo a herança);
  agora nasce vazio e a listagem mostra o fator **efetivo**, com `*` quando veio
  do tipo.
- **Impacto conferido em produção antes de subir**: dos 23 locais, 0 mudam de
  tempo — todos são `tipo_local: "outros"` (vieram do importador) e nenhum tem
  fator explícito. A regra passa a valer conforme os supervisores classificarem
  os locais, que é o comportamento desejado.
- Não vaza para tarefa de tempo fixo/manual: a intensidade só incide em
  `por_m2`/`por_unidade` (inalterado).
- Arquivos: `lib/calculations.ts`, `app/(app)/locais/page.tsx`, `types/Local.ts`,
  `docs/02-modelo-de-dados.md`, `docs/03-regras-de-negocio-e-calculos.md`.

---

## 2026-07-20 — Coluna da esquerda fixa na rolagem (ata 17/07)

- Pedido do Pedro Ícaro na demonstração: além do cabeçalho, **fixar a coluna da
  esquerda** para não perder a referência ao navegar entre funcionários.
- **Visão diária** (`AgendaGrid`): a régua de horários virou `sticky left:0` com
  `z-index 13` — acima dos cabeçalhos de funcionário (12), então as colunas
  passam **por baixo** dela. As células já tinham fundo opaco (`--papel-2`),
  requisito para o sticky não deixar vazar conteúdo.
- **Visão semanal** (`SemanaGrid`): mesmo sintoma (a coluna "Funcionário" sumia).
  Nova classe `.col-fixa` no `globals.css` — repete a regra de `:hover` porque um
  `background` opaco mataria o realce da linha.
- Verificado no navegador por medição de DOM: diária rolou 176px e a régua ficou
  cravada na borda (coluna de funcionário 360→184); semanal rolou 300px com a
  coluna fixa parada (outra coluna 427→127).
- Arquivos: `components/agenda/AgendaGrid.tsx`, `components/agenda/SemanaGrid.tsx`,
  `app/globals.css`.

---

## 2026-07-20 — Corte de leituras do Firestore (escala: 17 sedes)

- **Problema previsto**: no cota grátis (50k leituras/dia), o jeito atual estoura
  com o efetivo real. Causa raiz: as consultas quentes filtravam **só por `data`**
  e reduziam a sede **em memória** → ver a agenda de UMA sede lia o dia das 17
  (~17× leituras). A agenda ainda puxa 31 dias de histórico por carga → chegava a
  ~155k leituras **numa única abertura**.
- **Correção central (índice composto sede + data)**: `getRotinasByData` e
  `getRotinasPeriodo` agora combinam `sede_id ==` com `data` quando a sede é
  informada (a UI já mandava `&sede=`, o serviço é que ignorava). Cai de ~5.000
  para ~300 leituras por consulta na agenda/acompanhamento.
- **Execuções**: `execucoes_realizadas` ganhou `sede_id` (desnormalizado da rotina
  no `registrarExecucao`) + consulta composta (`sede_id` + `data_execucao`).
  Dashboard/acompanhamento/agenda passam a mandar `&sede=`.
- **Índices**: novo `firestore.indexes.json` (rotinas: `sede_id,data`; execuções:
  `sede_id,data_execucao`). **Deploy uma vez**: `firebase deploy --only
  firestore:indexes` (ou colar no Console). Sem isso, a consulta composta falha.
- **`delete*` (funcionário/local/tarefa)** contavam vínculos lendo a **coleção
  inteira** de rotinas → agora consultam pela FK (só os vínculos daquele registro).
- Já estavam prontos e ajudam: `SWRConfig` global com `revalidateOnFocus:false`
  (não rebusca tudo a cada foco de aba) e `keepPreviousData`.
- **Backfill**: execuções antigas (se houver) não têm `sede_id` — a consulta por
  sede não as pega até um backfill. Fase 2 mal usada em produção, então é seguro.
- Verificado (memory): rotinas/execuções escopam por sede; execução nasce com
  `sede_id` da rotina; sede inexistente → 0 (o filtro é aplicado na query).
- Arquivos: `services/{rotinasService,execucoesService,funcionariosService,
  locaisService,tarefasService}.ts`, `types/ExecucaoRealizada.ts`, `lib/schema.ts`,
  `lib/datasource.ts`, `app/api/execucoes/route.ts`, `app/(app)/{dashboard,
  acompanhamento}/page.tsx`, `app/(app)/rotinas/useRotinaData.ts`,
  `firestore.indexes.json`, `CLAUDE.md`.

---

## 2026-07-20 — Importador de planilha (+ modelo para o supervisor preencher)

- Nova tela **`/importar`**: o supervisor baixa o modelo `.xlsx`, preenche a rota no
  Excel e sobe. O sistema mostra um **preview sem gravar** (quantos funcionários,
  locais, tarefas e rotinas seriam criados + erros linha a linha) e só então importa.
- **O modelo é a própria rota: uma linha por tarefa.** Funcionários (jornada,
  intervalos, turno), locais, tarefas (`tempo_base_min` = fim − início) e as rotinas
  do dia são todos **derivados** dela — é como as planilhas reais do Christus já são
  escritas. Não há coluna de duração nem de turno (seriam redundantes).
- **Não duplica nada**: entidades casam por nome dentro da sede e as rotinas usam o
  id determinístico (`idMaterializacao`) — reimportar a mesma planilha é seguro
  (verificado: 2ª importação = 0 criados, 5 já existiam). Opcionalmente já salva a
  rota como **rota padrão** da sede.
- Validação (bloqueia): campo obrigatório vazio, hora fora de `HH:mm`, fim ≤ início,
  saída ≤ entrada, duas tarefas sobrepostas da mesma pessoa. Avisos (não bloqueiam):
  tarefa fora do expediente, jornadas/durações divergentes, categoria ou EPI que não
  existe no catálogo (a linha entra sem eles). A linha de exemplo do modelo é
  ignorada se o supervisor esquecer de apagá-la.
- Só `.xlsx` — o CSV do Excel pt-BR usa `;` e quebraria o parser.
- Arquivos: `lib/importacaoRota.ts` (colunas + derivação, puro),
  `services/importacaoService.ts`, `app/api/importar/{modelo,analisar,aplicar}/route.ts`,
  `app/(app)/importar/page.tsx`, `components/AppShell.tsx`. Dependência nova: `exceljs`.

---

## 2026-06-25 — Rota padrão respeita o dia da semana da tarefa

- `gerarDiaDaRotaPadrao` e `aplicarModelo` agora **pulam** itens cuja tarefa é
  `frequencia: "semanal"` e cujos `dias_semana` não incluem o dia gerado — usando o
  campo que **já existe** (cadastro em Tarefas) + `parseDiasSemana`/`diaDaSemana`.
  Sem campo novo, sem migração; retrocompat (tarefa sem `dias_semana` = todos os
  dias). O "Ficou de fora hoje" segue apontando as semanais do dia ausentes da rota.
- Verificado (memory): tarefa semanal com o dia excluído → 0 na geração (43); com o
  dia incluído → gerada (44).
- Arquivo: `services/modelosService.ts`.

---

## 2026-06-25 — Histórico paginado por janela de tempo

- `/api/historico` sem filtro de tabela lia a **coleção inteira** (a que mais cresce
  — toda escrita loga). Agora, sem tabela, restringe por **janela de dias** em
  `criado_em` (campo único → índice automático, sem índice composto): padrão **30
  dias**, seletor 7/30/90/Tudo na tela. Filtro por tabela segue por campo único
  (nunca combina os dois → sem índice composto). Verificado (memory): 44 entradas
  na janela, ordenadas desc, todas dentro do período.
- Arquivos: `app/api/historico/route.ts`, `app/(app)/historico/page.tsx`.

---

## 2026-07-14 — Modais: select estourava a largura (fix global)

- **Bug:** nos modais de cadastro, o `<select>` da coluna da direita (ex.: Tarefa em
  "Tempos por pessoa") **vazava para fora** do modal, criando scroll horizontal.
- **Causa (CSS Grid):** `.form-grade` usava `1fr 1fr`, e coluna `1fr` herda
  `min-width: auto` — o select **não encolhe** abaixo da opção mais longa (nomes de
  tarefa são enormes) e empurra a coluna para fora. Os controles também não tinham
  `width: 100%` / `min-width: 0`.
- **Correção (1 lugar, vale para TODOS os modais):** `grid-template-columns:
  minmax(0, 1fr) minmax(0, 1fr)`; `.campo { min-width: 0 }`; e
  `input/select/textarea { width: 100%; min-width: 0; max-width: 100%; box-sizing:
  border-box }`.
- Verificado: "Tempos por pessoa" (4 campos) e "Funcionários" (15 campos) → **0 campos
  estourando, 0 scroll horizontal**; o select agora termina exatamente na borda do form.
- Arquivo: `app/globals.css`.

---

## 2026-07-14 — Estrutura real de sedes (17) + limpeza das fictícias

- **Sede ganhou `codigo`** (a sigla que a operação usa: DT, SUL 1, PQL 3…) — tipo,
  schema e tela de Sedes (aparece como selo ao lado do nome). `grupo` passa a guardar
  a **região**, que é o que o `/panorama` agrega.
- **Cadastradas as 17 sedes reais** (14 novas + 3 atualizadas **sem recriar**, para não
  perder funcionários/rotinas/rota padrão):
  - 🎓 **Universidade (UNI)**: ALD Aldeota · BN Benfica *(existente)* · DL Dom Luís ·
    EUS Eusébio *(existente)* · PE Parque Ecológico · PQL 3 Parquelândia 3
  - 🏫 **Colégio**: **RDT** DT *(existente)* · **RAL** BS, SP, PN · **RPQ** PQL 1, PQL 2,
    PJV · **RSU** SUL 1, SUL 2, SUL 3, PSUL
  - Decisões do usuário: BN e UNIBENFICA são **a mesma unidade**; DT2/PDT/IDIOMAS **não
    existem**; EDV e Construtora **não são sedes**.
- **Limpeza:** removidas as 3 sedes **fictícias** de demonstração que ainda estavam em
  produção (`sede_aldeota`, `sede_centro`, `sede_dt`) e todo o dado pendurado nelas —
  **36 documentos** (5 funcionários, 9 locais, 12 tarefas, 5 rotinas, 1 parâmetro, 1
  ausência). Iam aparecer para o diretor e a "Sede Aldeota" fake conviveria com a
  Aldeota real. Nada do Christus real foi tocado.
- Verificado: 17 sedes, 0 fictícias, agrupamento UNI(6)/RAL(3)/RDT(1)/RPQ(3)/RSU(4),
  siglas visíveis na tela.
- Arquivos: `types/Sede.ts`, `lib/schema.ts`, `app/(app)/sedes/page.tsx` (+ operação de dados).

---

## 2026-07-14 — Ficha: bloco de EPI colidia com as tarefas (geometria dinâmica)

- **Bug:** o bloco de EPI tinha posição **fixa** (`EPI.linha0=350`, título em y=356),
  mas a lista de tarefas é **dinâmica**. Com ~22 tarefas (Tamires) a lista descia até
  y=367 e a instrução caía em y≈346 — **abaixo** do título dos EPIs → o "EPIS
  UTILIZADOS" aparecia espremido/por cima do fim das tarefas.
- **Correção (fonte única `lib/fichaGeometria.ts`, vale p/ gerador E leitor):** o topo
  do bloco de EPI agora **acompanha o fim das tarefas** — `epiTopo(n)` entre um **teto**
  (350: poucas tarefas → EPI logo abaixo, sem buraco) e um **piso** (302: muitas → desce
  sem invadir Observações). `epiPos(i, n)` passou a receber `n` (o leitor já tinha).
  `TAREFA.floor` 392→345 e `deltaMin` 14,5→13,2 (mínimo seguro: caixa de 12pt, leitor
  amostra ±3,3pt do centro). Observações agora se posicionam abaixo do bloco anterior.
- Verificado (cálculo + geração): **sem colisão de 4 a 27 tarefas** (folga ≥ 0; o caso
  real, 22, ganhou 12pt); ficha gera PDF válido. Limite prático ≈ **27 tarefas/página**.
- ⚠️ **Reimprima as fichas** feitas antes desta mudança — a geometria mudou e o leitor
  novo procura os EPIs na posição nova.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`.

---

## 2026-06-25 — Catálogo de requisitos na produção (treinamentos + EPIs)

- Com confirmação, gravados no Firebase **9 treinamentos** (Integração admissional,
  Produtos químicos/FISPQ, Boas práticas, Concorrente×Terminal, Biossegurança,
  EPIs/NR-6, Resíduos/RSS, NR-32, Ergonomia) — base do Programa Permanente de
  Capacitação. Falta o RH **atribuir** às pessoas (Qualificações) p/ a cobertura sair do 0%.
- **Bug encontrado e corrigido:** produção tinha **0 requisitos**, mas **201 tarefas
  referenciavam `rq3/rq4/rq5/rq9`** (EPIs) — referências quebradas (o import trouxe as
  tarefas, nunca a coleção `requisitos`; mesmo caso das categorias). Efeito: ficha
  impressa **sem bloco de EPI**, conferência sem EPIs, checkboxes de EPI invisíveis.
  Gravados os **8 EPIs** (rq3–rq10) com os ids exatos. Verificado: **0 referências
  quebradas**; **20 das 26 fichas** de 24/06 agora saem com EPI.
- Catálogo final: **17 requisitos** (8 EPI + 9 treinamento). Operação de dados.

---

## 2026-06-25 — EPI no realizado manual (/acompanhamento)

- Lacuna que sobrou no DIARIO: o realizado manual não registrava EPI (só a
  conferência por ficha/OMR gravava `epis_confirmados`). Agora o modal de registro
  mostra **"EPIs utilizados"** — checkboxes com os EPIs exigidos pela tarefa
  (requisitos tipo epi), **pré-marcados** como usados (desmarca a exceção);
  ao reabrir, carrega os já confirmados. Grava `epis_confirmados` (vazio se não
  realizada). Verificado (memory): modal mostra "Luvas nitrílicas", salva e recarrega.
- Arquivo: `app/(app)/acompanhamento/page.tsx`.

---

## 2026-06-25 — Dashboard imprimível (relatório gerencial)

- O Dashboard agora dobra como **relatório gerencial impresso**: botão "Imprimir / PDF",
  **cabeçalho só-impressão** (título + período + sede) e as ferramentas interativas
  (filtros, Exportar CSV, CalibracaoFolga, SugestoesAjuste) escondidas na impressão
  (`.nao-imprimir`). Sem lib de PDF — usa `@media print` + "Salvar como PDF" do navegador.
  (O `/relatorios` mensal por funcionário, p/ o cliente assinar, já existia.)
- Nova classe `.so-impressao` no globals (oculta na tela, visível na impressão).
  Verificado: cabeçalho oculto na tela, botão presente, blocos `nao-imprimir` no lugar.
- Arquivos: `app/(app)/dashboard/page.tsx`, `app/globals.css`.

---

## 2026-06-25 — OMR v2: conferência casa por código (não por posição)

- A ficha casava marcações pela **ordem** das tarefas → se a rotina mudasse depois
  de imprimir, gravava realizado errado **em silêncio** (identidade E geometria
  desalinhavam, pois a geometria depende do total `n`). Novo QR **ORK2**
  = `sede|data|func|n|codigos`: carrega o **nº impresso** e um **código estável por
  linha** (`codigoLinha` = hash de func|tarefa|início, em `lib/fichaGeometria`).
  Conferir casa **por código**, usa o `n` impresso na geometria, marca linhas que
  saíram da agenda como "fora da agenda" (não salva) e **avisa** quando a rotina
  mudou. Fichas **ORK1** antigas seguem lidas por posição, com aviso. Retrocompat total.
- Verificado (memory): ficha ORK2 gera (PDF 257KB, válido), `/conferir` monta.
  Scan físico não é testável aqui. ⚠️ Sempre **reiniciar o preview após build**
  (rebuild com `next start` vivo desencontra chunks → "Application error").
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`, `app/(app)/conferir/page.tsx`.

---

## 2026-06-25 — Materialização de rotinas: robustez (lote + id determinístico)

- **`salvarModelo`/`excluirModelo`** gravavam 1 a 1 e `salvarModelo` destruía o
  modelo antigo ANTES de recriar (falha no meio = rota padrão perdida). Agora:
  helper `emLotes` (lotes paralelos de 25); `salvarModelo` **cria os novos → desmarca
  padrão → remove os antigos por id**, nessa ordem (create-then-delete).
- **Id determinístico** na materialização (`idMaterializacao` = `m_data_func_tarefa_inicio`):
  gerar/repetir/aplicar usam id fixo → 2 cliques simultâneos gravam o MESMO doc
  (last-write-wins) em vez de duplicar. Dedup por chave + preservação de status já
  realizado seguem. Alocação manual mantém id aleatório.
- Verificado (memory, via API): salvar 44→44 (overwrite ok), gerar 44/0 → re-gerar
  0/44 (idempotente), 44 ids `m_…`, sem duplicar.
- Arquivos: `services/modelosService.ts`, `services/rotinasService.ts`.

---

## 2026-06-25 — Painel de Capacitações (Painéis → Capacitações)

- Nova página `/capacitacoes` (só leitura) — o "sistema de controle de treinamentos
  + KPIs" pedido no diagnóstico de capacitação dos ASGs (relatório Região Sul). Agrega
  `requisitos` (tipo treinamento/aptidão) + `qualificacoes_funcionario`: KPIs (ativos,
  capacitados %, sem capacitação, vencendo 30d, vencidas), **cobertura por sede** (barras)
  e tabela de **validades vencidas/vencendo**. EPI fora (não é capacitação possuída).
  Cadastro reaproveita as telas existentes Requisitos + Qualificações; link no menu Painéis.
- Estado vazio com orientação (em produção ainda não há capacitações registradas — bate
  com o achado do relatório). Verificado: 40 ativos, 0% cobertura, aviso de vazio, console limpo.
- Arquivos: `app/(app)/capacitacoes/page.tsx`, `components/AppShell.tsx`.

---

## 2026-06-25 — Agenda: régua mais leve (rótulo só em :00 e :30)

- Com bloco de 15min a régua ficou densa. Agora o rótulo de hora aparece só nas
  **marcas cheias**: :00 (negrito) e :30 (esmaecido); :15/:45 viram **linha-guia sem
  texto**. Regra geral `min % 30 === 0` (independe do bloco). Mantém o snap fino sem
  poluir. Verificado: régua alterna "06:00","","06:30","".
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-25 — Bloco da agenda 30→15 min nas 3 sedes Christus (produção)

- Com confirmação, gravado `bloco_agenda_min=15` (override por sede sobre o geral=30)
  para DT, Eusébio e Benfica → **snap do arrasto em :00/:15/:30/:45**, casando com as
  tarefas reais de 10–20min, e arredondamento visual mais fiel. Os cards **não
  encolheram** (a escala é por minuto, desacoplada do bloco). Verificado: régua a cada
  15min, cards no tamanho novo. Operação de dados.

---

## 2026-06-25 — Agenda: escala por minuto (desacoplada do tamanho do bloco)

- Cards estavam apertados (~1,6px/min). A escala vertical agora é **por minuto**,
  não por bloco: `alturaBloco = blocoMin × fator` (2,4 normal / 1,4 denso) → ~2,4px/min
  fixo. Tarefa de 20min: 32→**48px**; 30min: 48→72. Efeito colateral bom: trocar o
  `bloco_agenda_min` (ex.: 30→15) passa a mudar **só o snap do arrasto**, não o tamanho
  do card nem a rolagem.
- Arquivo: `app/(app)/rotinas/page.tsx`.

---

## 2026-06-25 — Agenda: tempo ocioso como faixa verde hachurada

- A pedido: o **tempo ocioso** (lacunas dentro do expediente que não são pausa nem
  tarefa) agora aparece como **faixa verde clara hachurada** — sinaliza capacidade
  livre. Calculado por funcionário subtraindo tarefas+pausas de [entrada, saída]
  (mescla os ocupados e pega os buracos); desenhado como `div` absoluta por minuto
  exato (z abaixo de pausas/cards). CSS `.faixa-ocioso`. Legenda da ajuda atualizada
  (verde claro=ocioso, verde escuro=pausa, cinza=fora do turno).
- Arquivos: `components/agenda/AgendaGrid.tsx`, `app/globals.css`, `components/agenda/AjudaAgenda.tsx`.

---

## 2026-06-25 — Conferir ficha: deixar claro que salva o realizado

- A conferência por OMR (`/conferir`) **já** gravava o realizado e marcava a rotina
  como `realizada` (`registrarExecucao` sincroniza o status), mas a tela passava a
  impressão de "só conferir". Ajustada a copy: o texto da página + a dica no botão
  "Salvar realizado" agora explicitam que salvar **marca as tarefas feitas (verdes)
  na agenda** e que reenviar a mesma ficha atualiza (não duplica). Sem mudança de lógica.
- Arquivo: `app/(app)/conferir/page.tsx`.

---

## 2026-06-25 — Performance: gerar/repetir o dia (2min → ~1-2s) + loading

- "Repetir o dia anterior" levava ~2min: `duplicarDia` gravava as ~274 rotinas
  **uma a uma** (await por escrita). `gerarDiaDaRotaPadrao` era pior — fazia
  `ausenteEm` **por item** (274 queries) + escrita 1 a 1.
- Os dois agora: pré-aquecem a checagem de ausência em paralelo (Promise.all
  pelos funcionários únicos) e **gravam em lotes paralelos de 25**. Benchmark no
  Firestore: 100 escritas 8,4s→0,4s (**19×**); ~274 → ~1-2s.
- UX: overlay com o loader "Tetris" (`Carregando`) durante repetir/gerar/salvar
  rota padrão, no lugar do "Repetindo…" discreto.
- Arquivos: `services/rotinasService.ts`, `services/modelosService.ts`,
  `app/(app)/rotinas/page.tsx`.

---

## 2026-06-25 — Limpeza: tarefas de duração 0 na DT (cards espremidos)

- Cards de **duração 0** apareciam espremidos (14px). Eram 4 rotinas: "Descer
  garrafas de café para o cpa" (real, importada sem duração — bug) e "Encerramento
  das atividades" (marcador de fim de turno). Com confirmação:
  - "Descer garrafas" → **10min** (tarefa + 2 rotinas 16:50–17:00 + item do modelo).
  - "Encerramento das atividades" → **removido** da agenda (2 rotinas), do catálogo
    (tarefa t63) e da rota padrão (item de modelo), p/ não voltar ao gerar.
- Verificado: 0 rotinas de duração 0 na DT. Operação de dados; sem mudança de código.

---

## 2026-06-25 — duplicarDia idempotente (guarda contra duplicata exata)

- `duplicarDia` (endpoint "Repetir o dia anterior") agora pula rotina **idêntica**
  já existente no destino (chave `funcionário|tarefa|início`), além do conflito de
  horário que já existia. Fecha a porta no servidor para não reintroduzir as
  duplicatas que infláram a ocupação — independente da versão publicada.
- Os outros caminhos já tinham a mesma guarda: `aplicarModelo` e
  `gerarDiaDaRotaPadrao`. Agora os 3 (gerar/aplicar/duplicar) são idempotentes.
- Arquivo: `services/rotinasService.ts`.

---

## 2026-06-25 — Limpeza: duplicatas de rotinas em 25/06 (ocupação 198%)

- Usuário viu ocupação ~198% (vermelho geral). Diagnóstico: **não era erro de
  cálculo** (fórmula `planejado/jornada` correta; sem deslocamento; 24/06 dava
  76–111%). O dia **25/06** tinha **125 rotinas duplicadas exatas** (mesma
  data|funcionário|tarefa|início) — o dia foi materializado mais de uma vez
  (provável "Gerar o dia" + "Repetir" no Vercel ainda sem o fix de idempotência).
- Com confirmação, removidas as 125 duplicatas (mantendo 1 de cada) nas sedes
  Christus. Verificado: 25/06 DT = 278 rotinas, 0 duplicatas, ocupação 76–111%.
  Operação de dados; sem mudança de código.
- **Atenção:** enquanto o deploy do Vercel estiver atrás dos commits de
  idempotência, gerar/repetir o mesmo dia pode reintroduzir duplicatas.

---

## 2026-06-24 — Agenda: grade estende até a última tarefa (fim do corte)

- A grade ia só até a **maior saída** (`fimGrade` = max saída). Pela regra "pode
  terminar depois da saída", tarefas que terminam após o expediente ficavam
  desenhadas além da última linha e **cortadas embaixo**. Agora o `fimGrade` (e o
  `inicioGrade`) também consideram os `inicio/fim_planejado` das rotinas, então a
  grade engloba sempre a última tarefa. Verificado (firebase, DT 24/06):
  **0 colunas com corte** (todas com folga ≥ 0). Console limpo.
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-24 — Agenda: faixas de pausa por minuto exato (fim da colisão)

- O lanche (15min) era pintado na **célula inteira de 30min**, enquanto os cards
  são posicionados por minuto. Aí a tarefa das 09:15 caía no meio da célula e
  ficava **por cima da metade de baixo da faixa de lanche** (sobreposição).
- Agora as faixas de pausa são **divs absolutas com altura pela duração real**
  (lanche 15min = 24px, almoço 90min = 144px), abaixo dos cards. As células de
  fundo só marcam fora-da-jornada. Verificado (firebase, DT 24/06): lanche=24px,
  **0 colisões faixa×card**, rótulo visível. Console limpo.
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-24 — Refatoração: rotinas/page decomposto (branch própria)

- Branch `refactor/rotinas-page`. A tela principal tinha **1038 linhas** (acima do
  limite de 1k). Decomposta sem mudar comportamento:
  - `app/(app)/rotinas/useRotinaData.ts`: todos os `useSWR` + derivações puras
    (sedeId, ausentesMap, fonteRepetir, nFaltas, faltamRegistrar, semana).
  - `components/agenda/BarraPassosDoDia.tsx`: a toolbar "Passos do dia".
  - `components/agenda/ModaisRotina.tsx`: os 2 modais (autorizar conflito / duração).
- Os handlers de mutação (otimistas) **ficaram no container** de propósito — são o
  comportamento próprio da tela; um hook com ~20 deps seria pior que o problema.
- `page.tsx` **1038 → 784 linhas**. Verificado no preview (firebase, 24/06): 55
  cards, painéis, toolbar e clique→balão OK, console limpo. (Remover/adicionar não
  testado ao vivo p/ não tocar dado de produção; handlers movidos verbatim.)

---

## 2026-06-24 — Refatoração: AgendaGrid decomposto (revisão de qualidade)

- Revisão de qualidade do código da sessão. O `AgendaGrid.tsx` tinha virado um
  monólito (render de ~480 linhas com merge de runs, card e popover inline).
  **Decomposto sem mudar comportamento**: `lib/agenda.ts` (`agruparRuns` puro),
  `components/agenda/CardRotina.tsx` (o card) e `components/agenda/BalaoDetalhe.tsx`
  (o popover, que agora deriva a exibição do `Run` em vez de um objeto
  pré-formatado). Removidos: mapa redundante `corCategoria`, lógica de remover
  duplicada (agora `removerRun`), e o effect de Esc/scroll migrou pro balão.
- `AgendaGrid` caiu de **698 → 449 linhas**; novos arquivos: CardRotina 138,
  BalaoDetalhe 115, agenda 45. Verificado no preview (firebase, 24/06): 55 cards,
  merge ok, 5 cores de categoria, alça de resize, clique→balão com dados certos,
  Esc fecha, console limpo.
- Pendência anotada (não desta branch): `rotinas/page.tsx` já tem 1038 linhas —
  decompor numa branch própria.

---

## 2026-06-24 — Agenda: card só com o nome + balãozinho de detalhes

- A pedido: o card agora exibe **só o nome da tarefa** (em até 3 linhas, então
  mostra o nome inteiro em vez de truncar). **Clicar** no card abre um
  **balãozinho** (popover) com horário, duração, local, categoria (bolinha de
  cor) e situação, além do botão **Remover**. Fecha no Fechar, no Esc, ao rolar
  ou clicando fora.
- `AgendaGrid`: estado `detalhe` + `LinhaDetalhe`/`ROTULO_STATUS`; conteúdo do
  card reduzido ao nome (`-webkit-line-clamp`); `onClick` abre o popover. Ajuda
  atualizada. Verificado no preview (firebase): clique mostra os dados certos.
- Arquivos: `components/agenda/AgendaGrid.tsx`, `components/agenda/AjudaAgenda.tsx`.

---

## 2026-06-24 — Agenda: escala vertical maior (fim das "fatias finas")

- O "sobreposto/feio" relatado **não era sobreposição** (medido ao vivo: 0
  sobreposições na coluna da Aurilene) — era **escala apertada**: ~1px/min fazia
  tarefas de 20min virarem 18px e as de 10min ~13px, empilhadas e coladas.
- Subimos a escala para ~1.6px/min: `ALTURA_BLOCO_PADRAO` 30→**48** e o toggle de
  densidade 20/30→**30/48**. Agora 20min=30px (nome+horário), 10min=22px (1 linha),
  com separação clara. Piso de altura 11→14. Verificado ao vivo (firebase): 19
  cards da Aurilene, 0 sobreposição, espinhas coloridas por categoria.
- Arquivos: `components/agenda/AgendaGrid.tsx`, `app/(app)/rotinas/page.tsx`.

---

## 2026-06-24 — Categorias subidas para a produção (cor por atividade)

- Com confirmação, gravadas as **8 categorias** (c1–c8: limpeza, higienização,
  coleta, organização, reposição, limpeza terminal, externa, apoio) no Firebase —
  faltavam (o import nunca levou a coleção). Agora a agenda real **colore a
  espinha do card por tipo de atividade** e o filtro "Categoria" funciona.
  Operação de dados; sem mudança de código.

---

## 2026-06-24 — Redesign da agenda: cartões "Partitura" (papel + categoria)

- Saímos do **muro de blocos azuis** para **cartões de papel (marfim) com texto
  em tinta** e uma **espinha colorida à esquerda pela CATEGORIA** da tarefa
  (limpeza, higienização, apoio…). O **status** deixou de ser o preenchimento e
  virou **tom suave do fundo** (realizada=verde claro, não realizada=vermelho
  claro, remanejada=âmbar) + selo. Bem mais leve e escaneável, fiel à marca.
- `AgendaGrid` recebe `categorias` e mapeia `categoria_id→cor`; `ESTILO_STATUS`
  define fundo/espinha/selo. Legenda da ajuda atualizada.
- Verificado em memory: cartões marfim, 5 cores de espinha por categoria, tinta
  escura. **Em produção a cor por categoria ainda não pinta** porque a coleção
  `categorias` nunca foi importada para o Firebase (só existe no seed) — espinha
  cai no azul padrão. Próximo passo: subir as categorias para a produção.
- Arquivos: `components/agenda/AgendaGrid.tsx`, `components/agenda/AjudaAgenda.tsx`,
  `app/(app)/rotinas/page.tsx`.

---

## 2026-06-24 — Intervalos de Eusébio/Benfica inferidos pelas lacunas

- Com confirmação, gravados no Firebase os intervalos de **Eusébio (5) e Benfica
  (4)**, inferidos pelas **lacunas das rotas** (maior folga = almoço; ~15min =
  lanche), já que as planilhas deles não rotulam o almoço. Ex.: Benfica (turno
  13:30–22:30) com almoço 16:00–18:00. Cobertura total agora: **DT 26/26, Eus
  5/5, Ben 4/4** com intervalos. Operação de dados; sem mudança de código.

---

## 2026-06-24 — Intervalos reais da DT aplicados na produção

- Com confirmação explícita, gravados no Firebase os **intervalos reais dos 26
  funcionários da DT** (lanche + almoço + lanche, extraídos das planilhas) —
  substituindo o almoço fixo 12:00–13:00. Eusébio/Benfica mantidos (planilhas não
  expõem o almoço com clareza). Também **apagadas 4 rotinas com início duplicado**
  (ruído do import). Confirmado por leitura (26/26 com intervalos; 0 duplicados).
- Script de carga temporário (parser refinado p/ ignorar "apoio durante o
  intervalo dos alunos" etc.). Operação de dados; sem mudança de código.

---

## 2026-06-24 — Múltiplos intervalos por funcionário (lanches + almoço)

- O funcionário passa a ter **vários intervalos no dia** (2 lanches + almoço, em
  horários próprios), fiel às planilhas Christus — antes era um único intervalo
  fixo. Novo campo `Funcionario.intervalos` (CSV de pares "HH:mm-HH:mm").
- `lib/calculations.ts`: `intervalosDoFuncionario` + `minutosIntervalo`;
  `jornadaLiquidaMin` desconta a soma de todos; `JornadaEfetiva`/`jornadaDoDia`
  carregam `intervalos`. `lib/validations.ts`: bloqueio de alocação checa TODOS
  os intervalos. `AgendaGrid`: desenha uma faixa por intervalo, rotulada
  **Almoço** (≥45min) ou **Lanche**. Fallback p/ o intervalo único quando o
  campo não existe.
- Seed (memory) dos 4 Christus DT com os intervalos reais. Verificado: Aurilene
  mostra Lanche/Almoço/Lanche e jornada líquida cai p/ 8h (600−120). Console limpo.
- **Pendente:** reimportar os intervalos reais de TODOS os funcionários na
  produção (Firebase) + limpar 2 rotinas com início duplicado — com confirmação.
- Arquivos: `types/Funcionario.ts`, `lib/schema.ts`, `lib/calculations.ts`,
  `lib/validations.ts`, `components/agenda/AgendaGrid.tsx`, `lib/memoryStore.ts`.

---

## 2026-06-24 — Agenda: bloco mesclado vira 1 card (sem linhas internas)

- Refino da mescla: tarefas iguais e contíguas agora viram **um card único**
  (altura cheia, borda única) em vez de fatias sobrepostas — some o efeito de
  "linhas atravessando" o rótulo. `runs` por funcionário; cada run = 1 card com
  nome + horário + duração do bloco. Blocos de fatia única mantêm arrastar/
  redimensionar; blocos mesclados (multi-fatia) não redimensionam e o × remove
  todas as fatias do bloco. Rotinas seguem individuais por baixo.
- Verificado em produção (Tamires: 22 rotinas → **16 blocos, 0 sobreposições**).
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-24 — Agenda: blocos mesclados (tarefas iguais e contíguas)

- Depois do print da Tamires (Benfica): tarefas iguais repetidas em sequência
  (ex.: "Limpeza entrada e caramanchão" 4× de 5–15 min) viravam várias barrinhas
  de ~10px com texto espremido. Agora **tarefas iguais e contíguas** (fim de uma
  = início da próxima) se **mesclam num bloco visual único**: o nome e o horário
  do bloco inteiro aparecem **uma vez**, as fatias seguintes ficam sem texto e sem
  borda de topo (vira um bloco só). As rotinas seguem individuais por baixo
  (leitura OMR/realizado intactas).
- Também: card com `box-sizing: border-box` (altura exata), piso mínimo 11px, e
  a alça de redimensionar só em blocos de fatia única.
- Verificado em produção (Tamires, 22 rotinas → 16 rótulos + 6 continuações):
  coluna limpa, sem barrinhas sobrepostas. Console limpo.
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-24 — Agenda: cards por tempo exato (fim da sobreposição)

- **Correção da coluna "empilhada"** (ex.: Tamires/Benfica): rotas finas de
  5–15 min se sobrepunham porque o card era desenhado pelo **bloco visual de
  15 min** (mín. 1 bloco). Agora o card usa a **altura/posição por tempo real**
  (`tempo_previsto_min`), então tarefas curtas consecutivas **encaixam** sem
  sobrepor. Verificado na produção (Benfica, 62 cards): de coluna toda sobreposta
  → 2 sobreposições de 1–5px (resíduo de tarefas < 8 min com piso de clicabilidade).
- Conteúdo do card **adapta à altura**: curto = só o nome; médio = + horário;
  alto = + local. Tooltip mostra o detalhe completo.
- Cabeçalho da coluna com **tooltip de nome completo + jornada**; **linhas de
  hora** reforçadas (ajuda a alinhar entre colunas).
- Arquivo: `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-24 — Removido placeholder "Beltrano" da produção

- Com confirmação explícita, apagado do Firebase o funcionário **Beltrano**
  (`christus_eus_f1`) — placeholder da aba "MODELO" do Eusébio que vazou na
  importação — junto com suas 17 rotinas e 17 itens de rota padrão. Eusébio fica
  com 5 funcionários reais. Operação de dados; sem mudança de código.

---

## 2026-06-24 — Seed só com exemplo real + visual da agenda melhorada

- **Seed limpo:** removidas as sedes fictícias de demonstração (Aldeota, Sede DT,
  Sede Centro) e seus funcionários/locais/tarefas/rotinas/eventuais/qualificações/
  ausências do `lib/memoryStore.ts`. O modo memory agora traz só o **catálogo
  global** (categorias, requisitos, parâmetros) + o **exemplo real Christus DT**.
- **Agenda — visualização:** (1) **× e alça** de redimensionar só aparecem no
  **hover/foco** (cards limpos quando o dia está cheio); (2) card com **listra de
  status** à esquerda (4px) + borda/sombra mais nítidas; (3) **tooltip** com nome
  completo no hover (já existia, mantido); (4) novo **toggle de densidade**
  ("⊖ Compactar / ⊕ Expandir") que reduz a altura do bloco (30→20px) pra ver o
  dia inteiro com menos rolagem.
- `AgendaGrid` ganhou prop `alturaBloco` (export renomeado p/ `ALTURA_BLOCO_PADRAO`).
- Verificado em produção (Benfica, 62 cards): × oculto sem hover, listra 4px,
  toggle 21→13px, console limpo.
- Arquivos: `lib/memoryStore.ts`, `components/agenda/AgendaGrid.tsx`,
  `app/(app)/rotinas/page.tsx`, `app/globals.css`.

---

## 2026-06-24 — Rotas padrão das sedes Christus ativadas em produção

- Com confirmação explícita, definidas as **rotas padrão das 3 sedes Christus**
  no Firebase de produção (via API `/api/modelos` com `padrao+com_duracao`, a
  partir do dia 24/06): christus_dt (278 itens), christus_eus (108), christus_ben
  (62). Confirmado por leitura. Agora "⚡ Gerar o dia" funciona nessas sedes no ar.
- Reversível pelos `sede_id` christus_*. Sem mudança de código.

---

## 2026-06-24 — Rota padrão + "Gerar o dia" (rotina adaptativa)

- A rotina deixa de ser só montada à mão: cada sede pode ter uma **rota padrão**
  e a agenda **gera o dia em 1 clique** a partir dela — o supervisor só revisa as
  exceções (que os painéis já mostram). Reusa quase tudo que já existia.
- **Rota padrão** (estende `modelos_rotina`): novos campos `padrao` (um por sede)
  e `duracao_min` (snapshot fiel da duração). `salvarModelo` aceita
  `{padrao, comDuracao}` e desmarca o padrão antigo; novo `getRotaPadrao`.
- **Geração** (`gerarDiaDaRotaPadrao`, `POST /api/rotinas/gerar`): reproduz a rota
  **fielmente** (tempo exato gravado — não re-encaixa na grade de 15 min, o que
  criava sobreposições em rotas de 5/10 min), **idempotente** (não duplica) e
  **adaptativa** (pula ausentes, folga pela escala e tarefas `depende_calendario`
  fora do período letivo).
- **UI** (`app/(app)/rotinas/page.tsx` + `ModalPlanejamento`): botão "⚡ Gerar o
  dia da rota padrão" + sugestão no dia vazio; "★ Salvar como rota padrão";
  checkbox no modal; cache de modelos revalidado.
- Verificado em memory (sede Christus DT, 44 itens): gerar = 44/0; 2ª vez = 0/44
  (idempotente); 0 sobreposições; tempos idênticos ao dia de origem; sábado pula
  por escala. Build/console limpos. OMR/fichas intactos (geometria não muda).
- **Falta o bootstrap em produção**: definir a rota padrão das 3 sedes Christus
  no Firebase (1 clique por sede ou script) — será feito com confirmação.
- Arquivos: `types/ModeloRotina.ts`, `lib/schema.ts`, `services/modelosService.ts`,
  `app/api/rotinas/gerar/route.ts` (novo), `app/api/modelos/route.ts`,
  `app/(app)/rotinas/page.tsx`, `components/agenda/ModalPlanejamento.tsx`,
  `docs/02-modelo-de-dados.md`.

---

## 2026-06-24 — Importação completa dos 3 campi Christus no Firebase

- A pedido (confirmação explícita), importados **todos os 3 campi** para o
  Firestore de produção (`ociosidade-88ce4`): **3 sedes, 23 locais, 36
  funcionários, 337 tarefas, 448 rotinas** (data de hoje). Substitui a carga
  parcial anterior (christus_* antigos foram apagados antes).
  - Christus — Dionísio Torres: 26 funcionários / 278 rotinas
  - Christus — Eusébio: 6 funcionários / 108 rotinas
  - Universidade Christus — Benfica: 4 funcionários / 62 rotinas
- Parser one-off (Python) leu os 2 layouts das planilhas (DT com setor/POP;
  Eusébio/Benfica com "FUNCIONÁRIO:"/m²); detecta a coluna de horário
  dinamicamente. Gênero ausente em Eusébio/Benfica ficou **vazio** (sem chutar)
  e anotado em observações. Escrita direta (sem validação/histórico).
- **Reversível**: todos os ids têm prefixo `christus_` → dá para apagar tudo.
  Scripts de carga foram temporários (não versionados).
- Sem mudança de código — registro de operação de dados.

---

## 2026-06-24 — Exemplo Christus DT carregado no Firebase de produção

- A pedido (e com confirmação explícita), os registros de exemplo **`christus_*`**
  foram gravados **direto no Firestore de produção** (`ociosidade-88ce4`) via
  `firebase-admin` (service account do `.env`): **1 sede, 4 locais, 4 funcionários,
  33 tarefas, 44 rotinas** (data 2026-06-24). Confirmado por leitura de volta.
- Escrita **direta** (script one-off, igual ao seed): não passou por validações
  de agenda nem gerou histórico/auditoria. **Reversível** — todos os ids têm
  prefixo `christus_`; dá para apagar com um script de limpeza quando quiser.
- O script de carga foi temporário (não versionado). Mesma origem dos dados do
  seed em `lib/memoryStore.ts`.
- Sem mudança de código nesta entrada — é registro de uma operação de dados.

---

## 2026-06-24 — Ficha com linhas dinâmicas + exemplo real Christus DT no banco

- **Ficha dinâmica:** o espaçamento das linhas de tarefa agora é função do total
  (folgado com poucas, comprimido com muitas) — `deltaTarefas(n)`/`tarefaY(i,n)`
  em `lib/fichaGeometria.ts`, usados pelo gerador (`services/fichaPdf.ts`) E pelo
  leitor (`lib/omr.ts`). Resolve o caso de fichas com ~20 tarefas (antes só ~12
  cabiam). Verificado: ficha de **19 tarefas** cabe numa folha A4.
- **Exemplo real no banco (demo/memory):** nova sede **"Christus — Dionísio
  Torres"** com 4 funcionários reais extraídos da planilha (Aurilene 19 tarefas,
  Naiane pedagogia, Do Vale coleta, Orlando pintura/plantão), 4 locais (setores),
  33 tarefas e 44 rotinas no dia. Gerado a partir do `.xlsx` via script (one-off)
  e inserido no `lib/memoryStore.ts`.
- **OMR validado na carga real:** gabarito da Aurilene (19 tarefas) lido 19/19 +
  4/4 EPIs, QR ok, 0 revisar — leitura bate com a impressão na densidade alta.
- PDFs em Downloads: `Fichas-Christus-DT.pdf` e `-Gabarito.pdf`.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`,
  `lib/memoryStore.ts`.

---

## 2026-06-22 — Estudo das rotas reais Christus (docs/12)

- Analisadas 3 planilhas de rota ASG (DT, Eusébio, Benfica): **37 rotas, 500+
  linhas-tarefa**. Novo `docs/12-estudo-rotas-christus.md` consolida os padrões.
- Confirmam o modelo atual (granularidade fina, presença/plantão, apoio
  não-limpeza, periodicidade, deslocamento) e trazem 3 insumos novos: **POP**
  (padrão de procedimento A–G, legenda inferida — confirmar com a DAC), **m² por
  local** (Benfica — valores a validar) e **regras periódicas/condicionais** (OBS:
  mensal, por dia da semana, entrada condicional).
- Achado importante: os **3 arquivos têm layouts diferentes** (offset de coluna,
  campos distintos) → um importador precisa ser afinado ao layout, tratado como
  projeto próprio (testar em memory). Só estudo/documentação — nada de código.
- Arquivo: `docs/12-estudo-rotas-christus.md` (novo).

---

## 2026-06-22 — Onda 5 marcada como concluída (docs + tela "Da ata")

- `docs/08`: Onda 5 passou de 🟡 parcial → ✅ **feito** (parte de produto:
  cadastro de grupo/tipo + visão agregada `/panorama`); RH registrado como
  **fora do sistema** (decisão de direção, não é item de dev).
- Tela **`/da-ata`** atualizada: "visão agregada por grupo" virou **entregue**
  (aponta o Panorama) e a confirmação por ficha/OMR ganhou a nota de **validado
  em scan real**. Placar agora: **20 entregue · 0 parcial · 4 decisão** (24).
- Sem mudança de código de produto — só docs/conteúdo da tela.
- Arquivos: `docs/08-plano-evolucao.md`, `app/(app)/da-ata/page.tsx`.

---

## 2026-06-22 — Panorama de sedes (visão agregada — Onda 5)

- Novo painel **`/panorama`** (menu Painéis): agrega ocupação e ociosidade de
  **todas as sedes**, agrupando por **grupo** (ex.: "Centro"/"Sul") ou por
  **tipo de sede** (educação infantil, escola, faculdade…). Por grupo mostra:
  ocupação média (ponderada por funcionário, com cor de classificação),
  ociosidade prevista total, nº de sobrecarga, barras de ocupação por sede e uma
  dica de remanejo (sede com mais folga × mais cheia).
- Só **leitura** — reusa `jornadaLiquidaMin`/`classificarOcupacao` e os endpoints
  existentes (`/api/sedes|funcionarios|rotinas|parametros`); não toca em dados de
  pessoas nem muda cálculo. Sedes sem planejamento no período aparecem como "—".
- Fecha a parte de produto da **Onda 5** (visão agregada). A discussão jurídica
  de atributos de RH segue **fora do sistema**, por decisão de direção.
- Verificado em memory: agrupou Centro/Sul e Faculdade/Escola/Educação infantil,
  métricas corretas, console limpo.
- Arquivos: `app/(app)/panorama/page.tsx` (novo), `components/AppShell.tsx`.

---

## 2026-06-22 — OMR validado em scan real (fecha a Onda 4)

- Teste de ponta a ponta com **scan real**: ficha impressa, preenchida à mão e
  fotografada (celular, imagem torta 1070×1500). O leitor `lib/omr.ts` rodado
  sobre a foto **acertou tudo**: QR decodificado (`ORK1|sede_aldeota|...|f1`),
  **12 tarefas + 10 EPIs** lidos corretamente, alinhamento pelos fiduciais ok.
- **Limiar 0,12 confirmado**: pegou até marcas fracas; os 2 traços mais fininhos
  (1 tarefa + 1 EPI) foram lidos como marcados mas sinalizados **"revisar"** —
  comportamento desejado (não chuta, pede conferência humana).
- Recomendação de uso: orientar a equipe a fazer **X cheio dentro da caixa**
  (ponto/risco fino cai em "revisar").
- `docs/08`: Onda 4 (confirmação por ficha/OMR) passou de 🟡 parcial → ✅ **feito**,
  com o parágrafo atualizado para o que foi entregue de fato (PDF + leitor TS no
  navegador, sem serviço externo). Sem mudança de código — só validação e docs.

---

## 2026-06-22 — Ficha ocupa a folha A4 inteira (+ área de observações)

- O cartão da ficha passou a ocupar **a folha A4 inteira** (antes terminava no
  meio, com vão branco embaixo — ficava feio). `CARD.yBot` desceu de 250 → 42 e
  os fiduciais de baixo acompanharam (`FID.BR/BL` → y56).
- Conteúdo redistribuído ao longo da página: tabela de tarefas no topo (linhas
  um pouco mais espaçadas, `TAREFA.delta` 21→24), **bloco de EPIs mais embaixo**
  (`EPI.linha0` 388→350), nova área **"Observações / ocorrências do dia"** com
  linhas para anotar preenchendo o rodapé, e **assinaturas na base** (`yBot+44`).
- Geometria é fonte única: o leitor OMR (`lib/omr.ts`) acompanhou os fiduciais e
  as caixas automaticamente (homografia agora usa cantos mais distantes — leitura
  até mais robusta).
- Verificado por imagem: ficha curta (2 tarefas) e ficha cheia (12 tarefas + 10
  EPIs) — ambas preenchem a folha sem colisões e sem vão branco no fim.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`.

---

## 2026-06-22 — Ficha: bloco de EPIs em 2 colunas + mais EPIs no exemplo

- O bloco de EPIs da ficha virou **2 colunas** (cabe ~10 EPIs sem bater nas
  assinaturas; antes só ~5 em coluna única). Geometria via novo helper
  `epiPos(i)` em `lib/fichaGeometria.ts` (fonte única) — usado pelo **gerador**
  (`services/fichaPdf.ts`) E pelo **leitor OMR** (`lib/omr.ts`), que continuam
  alinhados por construção.
- Dados de exemplo enriquecidos: de 1 para **8 EPIs** no catálogo (luvas, máscara
  PFF2, botas, avental, óculos, touca, luvas de raspa, protetor auricular),
  ligados às tarefas do funcionário-exemplo — a ficha de exemplo agora lista 8.
- Verificado: ficha-gabarito gerada (`?marcar=todas`) renderizada em imagem
  mostra os 8 EPIs em 2 colunas, todos marcados; ordem da tela Conferir bate com
  a do gerador (rotinas por horário + união em ordem). EPI não bloqueia alocação
  (`validations.ts:121`), então ligar EPIs às tarefas é seguro.
- Arquivos: `lib/fichaGeometria.ts`, `services/fichaPdf.ts`, `lib/omr.ts`,
  `lib/memoryStore.ts`.

---

## 2026-06-19 — Removida a cortina de entrada

- A animação de cortina ao logar foi **removida** (decisão do time). O login
  continua indo direto para `/inicio`, sem transição.
- Apagado `components/CortinaEntrada.tsx`; removidos o uso no `AppShell`, o
  bloco CSS `.cortina-*` em `globals.css` e o flag `sessionStorage` no login.
- Arquivos: `components/AppShell.tsx`, `app/login/page.tsx`, `app/globals.css`,
  `components/CortinaEntrada.tsx` (excluído).

---

## 2026-06-19 — Cortina com cara de teatro (bandô drapeado)

- A cortina de entrada ganhou um **bandô (sanca) com swags curvos no topo** —
  a assinatura visual da cortina de teatro — desenhado em SVG (curvas de
  verdade), que **sobe** (`translateY`) ao abrir, enquanto as laterais franzem
  para os lados.
- Laterais ganharam **brilho curvo (sheen)** e **sombra de drapeado** na borda
  interna (radial-gradients) para tirar o aspecto chapado; barra inferior agora
  **reta** (encosta no "chão"), em vez do serrilhado que parecia renda.
- Detalhe técnico: o `<svg>` do bandô vai dentro de um `<div>` wrapper porque,
  com `viewBox`, o SVG tende a se dimensionar pela proporção e não preenchia a
  largura toda; o div dimensiona certo e o svg preenche 100%×100%.
- Arquivos: `app/globals.css` (`.cortina-*`), `components/CortinaEntrada.tsx`.

---

## 2026-06-19 — Cortina mais suave (veludo que franze)

- Refino da cortina de entrada para um gesto mais macio e menos rígido:
  removido o fio dourado reto do centro (agora um vinco suave por gradiente),
  **barra inferior ondulada** em vez de reta (máscara radial), pregas de veludo
  mais sutis, e ao abrir a cortina **franze para os lados** (`scaleX`) enquanto
  desliza — com easing mais lento e macio (1,8s, `cubic-bezier(0.3,0.02,0.12,1)`).
- Arquivos: `app/globals.css` (`.cortina-*`), `components/CortinaEntrada.tsx` (tempo).

---

## 2026-06-19 — Cortina de teatro abre ao entrar (pós-login)

- Toque lúdico no tema "Partitura": ao logar, uma **cortina de veludo amaranto**
  cobre a tela e **abre deslizando para os lados**, revelando a tela inicial.
- Como funciona: o login marca `sessionStorage["ork:cortina"]` e manda para
  `/inicio`; o componente `CortinaEntrada` (montado no `AppShell`) lê o flag no
  mount, desenha as duas metades fechadas, dá um beat e as desliza para fora
  (transição de 1,35s), depois se desmonta. Roda **uma vez por login** e
  **respeita `prefers-reduced-motion`** (não anima).
- Login agora vai para `/inicio` (era `/rotinas`) — coerente com a tela inicial
  orientadora.
- Arquivos: `components/CortinaEntrada.tsx` (novo), `components/AppShell.tsx`,
  `app/login/page.tsx`, `app/globals.css` (estilos `.cortina-*`).

---

## 2026-06-19 — Tela "Da ata ao sistema" (transparência para a direção)

- Nova tela **`/da-ata`**: painel que mostra, lado a lado, cada ponto levantado
  na reunião de alinhamento (16/06/2026) e na pré-análise **× o que o Orkestria
  faz em resposta**, com selo de status (Entregue · Parcial · Decisão/cautela) e
  placar no topo (24 pontos: 19 entregues, 1 parcial, 4 decisão/cautela).
  Conteúdo fiel a `docs/08` e `docs/09` — sem inventar; pendências e decisões em
  aberto ficam explícitas.
- 10 blocos: cálculo de tempo, previsto/realizado, criticidade, faltas/remanejo,
  serviços eventuais, ociosidade por sede, conformidade/EPI, confirmação por
  ficha/OMR, calendário acadêmico e produtividade/dados sensíveis.
- **Acesso:** item "Da ata ao sistema" no menu Sistema + atalho na tela Início.
- Arquivos: `app/(app)/da-ata/page.tsx` (novo), `components/AppShell.tsx`,
  `app/(app)/inicio/page.tsx`.

---

## 2026-06-19 — Passos do dia inteligentes + favicon novo

- **Passos inteligentes** na faixa da agenda: **Faltas** ganha destaque (âmbar)
  e contagem quando há ausências no dia; **Registrar o realizado** vira botão
  primário com a contagem de tarefas ainda não lançadas (`N a registrar`), e
  vira "✓ Realizado lançado" quando tudo já foi lançado. Usa um novo SWR
  `/api/execucoes?de&ate` para saber o que falta.
- **Dedup:** removido o "🖨 Fichas" da barra de filtros (agora só na faixa).
- **Favicon novo** (`app/icon.svg`): tile evergreen + O amaranto + 3 barras
  marfim ascendentes (símbolo do Orkestria), sem a batuta que poluía no tamanho
  pequeno.

**Verificado (DATA_SOURCE=memory):** build/lint ok; faixa mostra "⚠ Faltas (1)"
(ausência do dia) e "✅ Registrar o realizado (3)" em destaque (3 rotinas sem
execução). Console limpo. Screenshot do favicon não capturou (timeout do
ambiente) — geometria conferida; visível no painel de preview. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx`, `components/agenda/FiltersBar.tsx`,
`app/icon.svg`.

---

## 2026-06-19 — Faixa "Passos do dia" na agenda

Reúne o fluxo diário do supervisor numa linha só, no topo da agenda (modo dia):
- **↺ Repetir o dia anterior (DD/MM)** — só aparece quando há dia anterior com
  rotina (o botão de 1 clique já existente).
- **⚠ Faltas (N)** — link para Ausências, com a contagem de ausentes do dia.
- **🖨 Imprimir fichas** — abre o PDF (data/sede atuais).
- **✅ Registrar o realizado** — link para Acompanhamento.
- **❔ Como usar** — a ajuda da agenda.
No modo semana, mostra só a ajuda.

**Verificado (DATA_SOURCE=memory):** build/lint ok; a faixa renderiza com
"Faltas (1)" (ausência do dia), e os links apontam para /ausencias,
/api/fichas/pdf?data&sede e /acompanhamento; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-19 — Dia a dia do supervisor: "Repetir o dia anterior" em 1 clique

**Contexto:** o supervisor montou que a rotina **quase sempre se repete**. O
"Duplicar / Modelos" existente é completo mas pesado para o uso diário. Foco no
atalho de todo dia.

**O que mudou (`app/(app)/rotinas/page.tsx`):**
- **Botão "↺ Repetir o dia anterior (DD/MM)"** na barra de ação da agenda:
  copia, num clique, as tarefas do **último dia com rotina** (antes da data
  atual, da sede) para o dia aberto — reusa `POST /api/rotinas/duplicar`
  (conflitos pulados). A data-fonte sai do `historico` já carregado.
- **Aviso de "dia vazio"**: quando o dia não tem rotina e existe um dia anterior
  com rotina, um painel convida a repetir ("Dia ainda vazio… copiar o dia
  anterior — DD/MM · N tarefas").

**Verificado (DATA_SOURCE=memory):** build/lint ok; em 20/06 (vazio), o aviso e
o botão apareceram apontando 19/06 (3 tarefas); ao clicar, **3 tarefas copiadas**
para 20/06 e o aviso sumiu. Console limpo. `.env` restaurado.

**Próximo (mesmo tema, se quiser):** deixar mais à mão os outros passos diários
que o supervisor citou — tratar faltas/ausências, imprimir fichas (já no botão
🖨) e registrar o realizado.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-18 — Usabilidade: tela Início, primeiros passos/telas vazias e ajuda da agenda

Três melhorias de "mais fácil e intuitivo" (escolhidas pelo usuário):

- **Tela Início** (`/inicio`, server component): saudação com o nome, atalhos
  grandes (Rotina do dia, Conferir ficha, Dashboard, Acompanhamento) e um guia
  **"Comece por aqui"** (Sede → Local → Tarefa → Funcionário → Montar a rotina),
  cada passo linkado. O pós-login e o logo agora apontam para `/inicio` (antes
  caía direto na agenda). Item "Início" no menu Operação. Hover nos cartões
  (`globals.css`).
- **Telas vazias acolhedoras** (no `CrudManager`, cobre todos os cadastros):
  sem dados → convite + botão "criar o primeiro"; busca sem resultado →
  "Nada encontrado para …". Prop `vazio` com mensagens sob medida em Sedes,
  Locais, Tarefas e Funcionários.
- **Ajuda da agenda** (`components/agenda/AjudaAgenda.tsx`): botão "❔ Como usar"
  na tela de rotinas abre um modal com legenda — montar/mover/redimensionar,
  blocos de 15 min, cores do card, ocupação/ociosidade, coluna bloqueada e o
  painel "Ficou de fora hoje".

**Verificado (DATA_SOURCE=memory):** build/lint ok; Início renderiza saudação +
atalhos + passos; modal de ajuda abre com todas as seções; busca vazia mostra a
mensagem amigável; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/inicio/page.tsx` (novo), `app/(app)/page.tsx` (redirect),
`components/AppShell.tsx`, `components/CrudManager.tsx`,
`components/agenda/AjudaAgenda.tsx` (novo), `app/(app)/rotinas/page.tsx`,
`app/(app)/{sedes,locais,tarefas,funcionarios}/page.tsx`, `app/globals.css`.

---

## 2026-06-18 — Fechamento: campo de EPI no realizado, idempotência e remoção da ficha HTML

Fecha as 3 pendências do fluxo da ficha:

- **Campo próprio de EPIs no realizado:** `ExecucaoRealizada.epis_confirmados`
  (CSV de nomes) + coluna no `SCHEMA`. A tela Conferir passa a enviar os EPIs
  confirmados nesse campo (antes iam na observação). `registrarExecucao`
  normaliza para "" quando não informado (Acompanhamento não envia).
- **Idempotência:** `registrarExecucao` virou **upsert por (rotina, data)** —
  reenviar a mesma ficha ATUALIZA a execução em vez de duplicar. Beneficia
  também o Acompanhamento.
- **Removida a página HTML** `app/(app)/rotinas/imprimir` (substituída pelo PDF
  de layout fixo; já estava sem link).

**Verificado (DATA_SOURCE=memory):** build/lint ok; 2 POSTs idênticos para r1 →
**1 execução** (sem duplicar) com `epis_confirmados="Luvas nitrílicas"`; console
limpo. `.env` restaurado.

**Arquivos:** `types/ExecucaoRealizada.ts`, `lib/schema.ts`,
`services/execucoesService.ts`, `app/(app)/conferir/page.tsx`, removido
`app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-18 — Ficha do app vira PDF de layout fixo (geometria unificada com o leitor)

**Contexto:** a ficha do app era HTML (`/rotinas/imprimir`), com geometria que
não casava exatamente com o leitor OMR (calibrado no PDF de exemplo). Para a
leitura ser 100% confiável a partir das fichas impressas pelo sistema, a ficha
passou a ser **PDF de layout fixo gerado no servidor**, usando as MESMAS
constantes do leitor.

**O que mudou:**
- **`lib/fichaGeometria.ts`** (novo): fonte ÚNICA da geometria (cartão,
  fiduciais, coluna "Feito", bloco de EPIs). `lib/omr.ts` foi refatorado para
  importar daqui — gerador e leitor nunca mais divergem.
- **`services/fichaPdf.ts`** (novo): gera o PDF com **pdf-lib** (uma página por
  funcionário com rotina no dia) — fiduciais, QR (`qrcode`), logo recortado,
  tabela com a caixa "Feito" no x/linha exatos, EPIs no rodapé, assinaturas.
  Aceita `marcarTodas` (gabarito de calibração).
- **`/api/fichas/pdf`** (novo): `GET ?data&sede` → PDF (`Content-Type:
  application/pdf`). `&marcar=todas` = gabarito de teste.
- Botão **🖨 Fichas** (FiltersBar) agora abre o PDF, não mais a página HTML.
- Novas deps: **pdf-lib**, **qrcode** (+ @types/qrcode).

**Verificado (DATA_SOURCE=memory):** gerei a ficha PELO APP (curl com sessão) em
2 versões e li com o leitor (determinístico): **gabarito → tudo marcada**
(tarefas+EPI), **normal → tudo vazia**; QR lido. Prova de que cada caixa
desenhada cai exatamente onde o leitor mede. Build/lint ok; `.env` restaurado.

**Notas:** a página HTML `/rotinas/imprimir` ficou sem link (substituída pelo
PDF) — pode ser removida depois. Falta: campo próprio p/ EPIs no realizado e
idempotência ao salvar.

**Arquivos:** `lib/fichaGeometria.ts` (novo), `lib/omr.ts`,
`services/fichaPdf.ts` (novo), `app/api/fichas/pdf/route.ts` (novo),
`components/agenda/FiltersBar.tsx`, `package.json`.

---

## 2026-06-18 — Conferir ficha: grava o realizado (fecha o ciclo) + leitura mais limpa

**Gravar o realizado:** o botão "Salvar realizado" na tela Conferir ficha agora
grava de verdade — uma `execucao_realizada` por rotina, reusando
`POST /api/execucoes` (`registrarExecucao`, que também atualiza o status da
rotina). Marcada → `conforme_planejado` (tempo = previsto); não marcada →
`nao_realizada` com justificativa automática ("Não confirmada na ficha (leitura
OMR)"). Os **EPIs** (sem campo próprio no schema) vão na `observacao`
("[Confirmado via ficha/OMR] · EPIs usados: …").

**Leitura mais limpa:** removidos os `%` e o "linha N" do corpo (eram ruído de
diagnóstico) — % só no tooltip. Tabela casada: Horário · Tarefa · Feito
(feito/não + selo "revisar" só em marca fraca). Leitura bruta (ficha sem
rotinas): contagem + chips numerados verde/cinza.

**Verificado (DATA_SOURCE=memory):** gerei uma ficha apontando para f1 (Maria,
2 rotinas hoje), marquei a tarefa 1 e o EPI, e "Salvar" → 2 execuções gravadas
(r1 conforme_planejado/80min, r2 nao_realizada/0), status das rotinas atualizado
(t1 realizada, t2 não realizada), EPI na observação. Build/lint ok, console
limpo. `.env` restaurado.

**Pendente:** unificação de geometria (ficha do app como PDF de layout fixo,
casando 100% com o leitor); campo próprio p/ EPIs no realizado (hoje na
observação); evitar regravar (idempotência) se salvar a mesma ficha 2×.

**Arquivos:** `app/(app)/conferir/page.tsx`.

---

## 2026-06-18 — OMR lê os EPIs (bloco no rodapé) + EPIs movidos para o rodapé na ficha

**Contexto:** o leitor lia só a coluna "Feito" das tarefas; faltavam os EPIs.
Os EPIs ficavam inline no topo (posições variáveis, difíceis de localizar). A
pedido, foram para o **rodapé** (aproveita o espaço em branco e dá posição fixa).

**O que mudou:**
- **`lib/omr.ts`** + **`omr-service/reader.py`**: nova geometria do bloco de
  EPIs (coluna fixa, `EPI_X=76`, `EPI_LINHA0=382`, `EPI_DELTA=18`) e leitura dos
  EPIs igual às tarefas. `lerFicha` aceita `numEpis` (determinístico) e retorna
  `epis: []`.
- **`app/(app)/conferir/page.tsx`**: deriva os EPIs do dia (união dos requisitos
  tipo `epi` das tarefas), lê com `numTarefas`+`numEpis` e mostra um bloco
  **"EPIs utilizados"** editável (com flag "revisar").
- **`app/(app)/rotinas/imprimir`**: os EPIs saíram do topo e viraram um bloco
  **"EPIs utilizados (marque o que usou)"** no rodapé, antes das assinaturas.
- Novo PDF de exemplo gerado em Downloads com os EPIs no rodapé.

**Verificado (DATA_SOURCE=memory):** build/lint ok; gerei uma ficha de teste com
marcas conhecidas (tarefas 1,3,6 + EPI 1) e rodei o leitor TS no navegador em
modo determinístico — leu tarefas `1:X 2:- 3:X 4:- 5:- 6:X 7:- 8:-` e **EPI
`1:X`**, exato. `.env` restaurado.

**Pendente:** gravar `execucoes_realizadas`; e a unificação de geometria
ficha-do-app × leitor (hoje o leitor casa com o PDF de exemplo; a ficha HTML do
app é visualmente igual mas a leitura fina exige uma geometria única — ideal:
ficha gerada como PDF de layout fixo).

**Arquivos:** `lib/omr.ts`, `omr-service/reader.py`,
`app/(app)/conferir/page.tsx`, `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-18 — Leitor OMR no NAVEGADOR (TypeScript) + tela "Conferir ficha"

**Contexto:** decidido manter tudo no Vercel (sem serviço externo). Portei o
leitor OMR do Python para **TypeScript rodando no navegador** e criei a tela de
upload. O `omr-service/` Python continua como referência/calibração.

**O que mudou:**
- **`lib/omr.ts`** — porte 1:1 do leitor: cinza + Otsu, detecção dos 4 fiduciais
  por **componentes conectados** (escolhendo os 4 pontos extremos — robusto ao
  cartão não preencher a imagem), **homografia** (PDF→pixel) e medição da tinta
  de cada caixa. QR via **jsQR** (nova dep). Sem WASM/serviço externo.
- **`app/(app)/conferir/page.tsx`** — sobe/fotografa a ficha → canvas → `lib/omr`
  lê QR + caixas → casa com as `rotinas_planejadas` do dia (ordenadas) e mostra
  o realizado **editável** (com flag "revisar" para marca fraca). Sem casamento
  (QR sem rotinas) mostra a leitura bruta para diagnóstico.
- Menu: **Operação → Conferir ficha**.

**Verificado (DATA_SOURCE=memory):** build/lint ok; carreguei uma das fichas
reais escaneadas (Elenice) no navegador → o leitor TS deu **8 caixas · 6
marcadas · 1 a revisar**, idêntico ao Python e ao visual (inclusive sinalizando
o ponto fraco de 16%). QR lido. `.env` restaurado.

**Pendente:** gravar o realizado (`execucoes_realizadas`) — botão "Salvar (em
breve)"; e validar o **casamento QR→rotinas** com dados reais (o QR de exemplo
F001 não existe nos dados de memória).

**Arquivos:** `lib/omr.ts` (novo), `app/(app)/conferir/page.tsx` (novo),
`components/AppShell.tsx`, `package.json` (+jsqr).

---

## 2026-06-18 — Leitor OMR (Python/OpenCV) das fichas — protótipo validado

**Contexto:** o usuário imprimiu as fichas de exemplo, marcou à mão de vários
jeitos (X, tique, risco, ponto, preenchido, vazias) e mandou escaneado
(CamScanner, 4 fichas). Objetivo: provar que dá para ler automaticamente.

**O que foi feito — novo módulo `omr-service/` (roda fora do Vercel):**
- `reader.py` — núcleo: decodifica o **QR** (identifica sede·data·funcionário),
  acha os **4 fiduciais** dos cantos, **endireita** (perspectiva) e mede a
  **tinta dentro de cada caixa "Feito"** → marcada/vazia. Não lê letra; só mede
  tinta, então qualquer estilo de marca funciona. Geometria = a do gerador de
  fichas (pontos PDF). Marca fraca/ambígua → `confianca: "baixa"` (revisão).
- `app.py` — serviço HTTP FastAPI (`POST /ler`).
- `testar.py` — CLI de validação contra PDF/imagem.
- `requirements.txt`, `README.md`, `.gitignore`.

**Validado nas 4 fichas reais escaneadas:** QR lido nas 4; leitura **bateu marca
a marca** — Edineia 6/6, Elenice (vazia, marcada×5, vazia → flag "revisar" no
ponto fraco 0.182), Antônio 6/6, David (feita,vazia,feita,vazia,vazia,feita).
Sem letra, sem padrão de marca exigido.

**Notas:** em produção o `num_tarefas` vem do QR→banco (leitura determinística,
sem adivinhar nº de linhas). Próximo: tela de upload no app + casar com
`rotinas_planejadas` → gravar `execucoes_realizadas`; baixa confiança → revisão.

**Arquivos:** `omr-service/` (novo).

---

## 2026-06-18 — Logos sem margem branca (recorte na fonte) em todo o app

**Contexto:** as logos pareciam pequenas porque os PNGs tinham **margem
transparente embutida** (43–55% da altura desperdiçada). Auditadas todas.

**O que mudou:**
- **Recorte na fonte** dos 4 PNGs em `public/` (sobrescritos na área útil):
  `logo-fundo-claro` 1254² → 1031×686, `logo-fundo-escuro` → 1027×691,
  `logo-horizontal-fundo-claro` 1983×793 → 1637×358, `logo-horizontal-fundo-escuro`
  → 1542×345. (SVGs de símbolo/favicon são vetoriais e não entram como logo na UI.)
- **Reajuste de tamanho** nos 4 usos (a altura caiu, já que agora preenchem):
  - `AppShell` (header escuro): 52→**30 px**, sem o `margin -8px` de compensação.
  - `app/(app)/rotinas/imprimir` (ficha): 44→**34 px**, sem margem.
  - `app/(app)/relatorios` (relatório): 44→**32 px**, sem margem.
  - `app/login` (logo quadrado): removidas as margens negativas `-48/-54px` que
    compensavam o vazio; largura `min(420,78%)`→`min(300,62%)`, `margin 0 auto 8px`.

**Verificado (DATA_SOURCE=memory):** build/lint ok; via DOM, cada `<img>` agora
carrega o natural recortado (login 1027×691→300×202; header 1542×345→134×30;
ficha 1637×358→155×34) sem espaço branco; console limpo. `.env` restaurado.

**Arquivos:** `public/logo-*.png` (4, recortados), `components/AppShell.tsx`,
`app/(app)/rotinas/imprimir/page.tsx`, `app/(app)/relatorios/page.tsx`,
`app/login/page.tsx`.

---

## 2026-06-17 — Distribuição automática (sugestão) no Remanejo

**Contexto:** quando alguém falta, as tarefas viram órfãs e o supervisor
remaneja na mão. Agora há um botão que **sugere a distribuição** das órfãs entre
quem tem folga — o supervisor revisa e confirma (servidor revalida ao aplicar).

**O que mudou em `/remanejo`:**
- Botão **"✨ Distribuir automaticamente (sugestão)"**: encaixe ganancioso —
  ordena as órfãs por **criticidade → prioridade → horário** e, para cada uma,
  escolhe o melhor candidato **elegível**, preenchendo os destinos.
- **Elegibilidade espelha as regras do servidor:** gênero (ex.: banheiro
  feminino só mulher), **conformidade** (aptidão/treinamento não vencidos; EPI
  não bloqueia), **expediente** do candidato (não inicia fora) e **intervalo**,
  e **sem conflito** de horário (considerando atribuições já sugeridas na rodada).
- **Critério de sede:** prefere colega da **mesma sede**; só cruza sede quando
  não há ninguém elegível na sede do ausente.
- O que não consegue encaixar fica **sem candidato** e é avisado na mensagem
  ("N sem candidato disponível") — sem propor quem seria recusado.
- Botão **"Aplicar todas as sugestões"** (sequencial, cada uma revalidada).
- Novas leituras na tela: `/api/requisitos` e `/api/qualificacoes`.

**Verificado (DATA_SOURCE=memory):** build/lint ok. Maria (f1) em falta + José
liberado → sugeriu a "Limpeza concorrente" para **José (mesma sede)** e deixou a
"Higienização de banheiro feminino" **sem candidato** (exige treinamento que só a
Maria tinha; ninguém qualificado/disponível). "Aplicar todas" gravou só a
viável (t1→José), sem erro, e manteve a órfã restante para decisão manual.
Console limpo. `.env` restaurado.

**Arquivo:** `app/(app)/remanejo/page.tsx`.

---

## 2026-06-17 — Duração por dia para presença/plantão (e regra manual)

**Contexto:** tarefas de **presença/plantão** e de **regra manual** têm duração
que varia a cada dia (a ata: "toda quarta a fulana tem plantão, um dia 20 min,
outro 15"). A duração é da **alocação**, não da tarefa.

**O que mudou:**
- Ao **soltar** uma tarefa de presença ou regra manual na agenda, abre o modal
  **"Quanto tempo hoje?"** (presets 15/30/60/90/120 + campo livre em minutos). O
  card entra já com a duração escolhida; cancelar aborta o drop.
- **Servidor passa a respeitar a duração informada** (`duracao_min` em
  `NovaRotina`) — **só** para tarefas `presenca` ou regra `manual`; para as
  demais continua calculando (m² × ambiente × serviço). Antes o servidor sempre
  recalculava e a escolha do supervisor se perdia.
- Tarefas de tempo fixo/manual não recebem fator de intensidade (já vigente), e
  presença não cobra desvio — então o número fica exatamente o escolhido.

**Verificado (DATA_SOURCE=memory):** build/lint ok; soltei "Acompanhamento de
pátio" (presença) às 14:00, escolhi 1h30 → rotina gravada com previsto/visual 90
e fim 15:30; modal aparece e cancelar aborta; console limpo. `.env` restaurado.

**Arquivos:** `app/(app)/rotinas/page.tsx` (modal + duracao_min no POST),
`services/rotinasService.ts` (`NovaRotina.duracao_min` + uso no `createRotina`).

---

## 2026-06-17 — Cabeçalho da ficha enxugado (logo + nome + sede)

A pedido: o cabeçalho de `/rotinas/imprimir` agora mostra só **logo + nome do
funcionário + sede·data**. Removidos "Ficha de rotina diária", a linha de
Expediente/Intervalo e a de Planejado. O **QR de leitura** e os marcadores
fiduciais permanecem (são funcionais, não informação). Imports
`jornadaLiquidaMin`/`tempoPlanejadoMin` removidos (sem uso). Verificado em
memória (build ok, screenshot, console limpo); `.env` restaurado.

**Arquivo:** `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-17 — Ficha OMR-ready (base para leitura automática por OpenCV)

**Contexto:** decidido o caminho da confirmação por **OMR clássico (OpenCV)** —
como a ficha é gerada por nós, basta detectar marcação (não precisa OCR de
letra). Esta entrega deixa a ficha pronta para leitura; o motor OpenCV é o
próximo spike.

**O que mudou em `/rotinas/imprimir`:**
- **QR code por ficha** (`qrcode.react`) com payload `ORK1|sede|data|funcionario`
  — o leitor decodifica e busca as rotinas dessa data/sede/funcionário na MESMA
  ordem de impressão (por horário) para casar cada linha sem ler texto.
- **Marcadores fiduciais** (4 quadrados pretos nos cantos da ficha) para alinhar/
  endireitar o scan.
- **Caixas de marcação reais** (`<Caixa>`, borda 2px #000, fundo branco): a
  coluna "Feito?" (Sim/Não em texto) virou uma única caixa "Feito" por linha; os
  EPIs viraram caixa + nome. Tudo #000/#fff para sair limpo no scan.
- Instrução curta ("Marque um X… não escreva sobre os quadrados dos cantos").
- Nova dependência: **qrcode.react ^4.2.0**.

**Verificado (DATA_SOURCE=memory):** build/lint ok; ficha renderiza com 4
fiduciais, QR (62px) e caixas reais (2 tarefas + 1 EPI na ficha da Maria);
screenshot confere; console limpo. `.env` restaurado.

**Próximo (spike 4.2):** motor OMR — OpenCV é Python/WASM, roda fora do Next
(worker Python ou OpenCV.js em route Node) recebendo o scan → casa com
`rotinas_planejadas` → gera `execucoes_realizadas`. Precisa de **scans reais**
para calibrar e da decisão de deploy.

**Arquivos:** `app/(app)/rotinas/imprimir/page.tsx`, `package.json`
(+qrcode.react), `docs/08`.

---

## 2026-06-17 — Correção: cards da agenda "sumiam" e geravam sobreposição fantasma

**Sintoma (relatado):** ao montar a agenda de vários funcionários, alguns cards
sumiam da tela; tentar pôr outra tarefa onde o servidor já tinha uma acusava
"Sobreposição com tarefa já planejada às HH:MM" mesmo sem nada visível; **F5
trazia tudo de volta**.

**Causa:** todas as rotinas do dia (todos os funcionários) vivem numa **única
chave SWR**. As mutações otimistas usavam `revalidate: false` — então o cache do
cliente **nunca reconciliava com o servidor**. Numa adição concorrente que se
perdesse no cache (ou num `rollbackOnError` com snapshot defasado), o card
desaparecia da tela embora gravado. Como a validação local só enxerga o cache,
ela não via a tarefa escondida → o servidor recusava por sobreposição → o erro
revertia ainda mais cards. Só o F5 (recarga) ressincronizava.

**Correção:** os quatro handlers (`soltarNova`, `mover`, `redimensionar`,
`remover`) passaram de `revalidate: false` → **`revalidate: true`**. O
`populateCache` continua dando o feedback imediato; a revalidação (deduplicada
pela SWR) reconcilia o cache com o servidor após cada operação. **Sem flicker**,
pois `keepPreviousData` já está ligado no `SWRConfig` global (a grade não
desmonta durante a revalidação).

**Verificado (DATA_SOURCE=memory):** build/lint ok; teste determinístico —
inserida uma rotina "por trás" do cliente via API (servidor=4, tela=3); ao
remover um card pela UI, a revalidação **trouxe o card escondido à tela**
(tela=servidor=3, sem sobreposição fantasma). Console limpo. `.env` restaurado.

**Arquivo:** `app/(app)/rotinas/page.tsx` (4× `revalidate`).

---

## 2026-06-17 — Estudo da planilha real (Aldeota): granularidade 15 min, não-limpeza e refino do tempo

**Contexto:** o usuário enviou a planilha "Rota de Trabalho ASG · Aldeota" (rota
operacional real). Analisada e usada para três ajustes concretos.

**1. Estudo documentado** em `docs/11-estudo-planilha-aldeota.md`: estrutura das
3 abas; descobertas — planejam em blocos de 15/10/5 min; a "Produtividade" deles
é m²÷tempo (resultado, não fórmula); muito tempo é não-limpeza (café, aguação,
recolhimento); "Setor"=Local, "Tipo de atividade"="limpeza de rotina <ambiente>",
"Ação"=POP.

**2. Catálogo de não-limpeza + refino do cálculo:**
- Nova categoria **"Apoio operacional"** (c8) e tarefas de exemplo **Café da
  sede** (fixo 60, crítica), **Recolhimento de materiais** (fixo 20), **Aguação
  de plantas** (fixo 15).
- **Refino:** a **intensidade do ambiente agora só incide em `por_m2`/
  `por_unidade`** (limpeza dimensionada pela área); tarefas de **tempo
  fixo/manual NÃO recebem intensidade** (café na copa = 60, não 78; reposição no
  banheiro = 15, não 23). O **fator de serviço** (rotina/pesada/desincrustante)
  continua em todas as regras (vidros fixo desincrustante = 80). Novo helper
  `multiplicadorTempo(tarefa, local)` compartilhado por `tempoPrevistoMin` e
  `SugestoesAjuste`.

**3. Granularidade fina (Onda 2 revista):** `bloco_agenda_min` 30 → **15**
(padrão + seed); `ALTURA_BLOCO` 40 → 30 px para a grade mais densa não ficar
gigante. Régua e snap da agenda agora de 15 em 15 min. Seed de rotinas
recalculado para 15 min.

**Verificado (DATA_SOURCE=memory):** build/lint ok; `/tarefas` mostra Café=1h,
Reposição=15min, Vidros=1h20, e as 3 tarefas de Apoio operacional; `/rotinas`
com régua 07:00·07:15·07:30…; console limpo. `.env` restaurado para `firebase`.

**Arquivos:** `lib/calculations.ts` (`multiplicadorTempo` + refino + padrão 15),
`components/SugestoesAjuste.tsx`, `components/agenda/AgendaGrid.tsx`
(`ALTURA_BLOCO`), `lib/memoryStore.ts` (categoria c8, tarefas t14–t16, p1=15,
rotinas r1–r3), `docs/03`, `docs/08`, `docs/11` (novo).

---

## 2026-06-17 — Onda 5.1 (pós-ata): tipo e grupo de sede

**Contexto:** base para comparar ociosidade entre unidades parecidas e para
visões agregadas por grupo (ex.: Sul 1/2/3). A 5.2 (dados de RH) segue em
estudo, sem decisão — idade/sexo continuam fora do motor (ver `docs/08`).

**O que mudou:**
- Sede ganhou **`tipo_sede`** (educacao_infantil · escola · faculdade ·
  administrativo · outros) e **`grupo`** (texto livre, ex.: "Sul", "Centro"),
  ambos opcionais. Cadastráveis na tela de Sedes (selos "Tipo / Grupo" na lista).
- `lib/schema.ts` (+2 colunas), seed das 3 sedes com tipo/grupo de exemplo.
- A folga-alvo de ociosidade **já é por sede** (`folga_minima_percentual`); o
  tipo/grupo é para categorização e comparação, não muda cálculo sozinho.

**Verificado (DATA_SOURCE=memory):** build/lint ok; `/sedes` lista a coluna
"Tipo / Grupo" com selos (Aldeota=Faculdade·Centro, DT=Escola·Sul,
Centro=Educação infantil·Centro); console limpo. `.env` restaurado para `firebase`.

**Pendente:** visão agregada por tipo/grupo (dashboard/remanejo); 5.2 dados de
RH (decisão jurídica — Davi Rocha).

**Arquivos:** `types/comum.ts` (+`TipoSede`), `types/Sede.ts` (+`tipo_sede`,
`grupo`), `lib/schema.ts`, `lib/memoryStore.ts`, `app/(app)/sedes/page.tsx`,
`docs/02`, `docs/08`.

---

## 2026-06-17 — Onda 4.1 (pós-ata): ficha de confirmação com EPIs

**Contexto:** o ASG não usa celular — a confirmação do que foi feito será por
**ficha de papel** (e, no futuro, leitura por OCR). Esta entrega cobre a ficha;
o OCR (4.2) fica como spike a decidir (ver `docs/08`).

**O que mudou:**
- A impressão `/rotinas/imprimir` ganhou, por ficha (funcionário/dia):
  - **Lista de EPIs obrigatórios** com caixa de confirmação, derivada dos
    `requisitos` tipo `epi` das tarefas do dia (ex.: "🧤 ( ) Luvas nitrílicas").
  - **Tipo de serviço** ao lado da tarefa quando não é rotina
    (ex.: "Higienização de banheiro · pesada").
  - (Checklist por ambiente "Feito? Sim/Não", anotações e assinaturas já
    existiam — o ASG só **confirma**.)
- Seed: a rotina de exemplo da higienização (r2) foi atualizada para o novo
  modelo de tempo (45 min / 60 visual / 2 blocos) — consistência da demo.

**Verificado (DATA_SOURCE=memory):** build/lint ok; ficha de Maria renderiza o
bloco "EPIS OBRIGATÓRIOS: ( ) Luvas nitrílicas" e a tarefa "Higienização de
banheiro · pesada"; console limpo. `.env` restaurado para `firebase`.

**Pendente:** 4.2 ingestão por OCR (spike — escolher serviço/lib + credenciais);
confirmação automática de EPI e reconhecimento facial dependem dessa ingestão.

**Arquivos:** `app/(app)/rotinas/imprimir/page.tsx`, `lib/memoryStore.ts`
(seed r2), `docs/08`.

---

## 2026-06-17 — Onda 3 (pós-ata): calendário acadêmico (período letivo)

**Contexto:** terceira onda. Tarefas que só fazem sentido com aula (ex.: limpeza
de sala) não devem ser cobradas em férias. (A Onda 2 — granularidade — foi
fechada só com documentação: o deslocamento já é parâmetro por sede e a grade
de 30 min é decisão consciente; ver `docs/08`.)

**O que mudou:**
- **Nova entidade `periodos_letivos`** (calendário acadêmico por sede):
  `sede_id`, `nome` (ex.: "2026.2"), `data_inicio`, `data_fim`, `dias_semana`
  (CSV de dias com aula), `ativo` + auditoria. CRUD completo no padrão do
  projeto: `types/PeriodoLetivo.ts`, `services/periodosLetivosService.ts`,
  rotas `app/api/periodos-letivos` (+`[id]`), tela
  `app/(app)/periodos-letivos/page.tsx` (CrudManager). **Escrita só de
  administrador** (`podeGerenciarCatalogo`); leitura para qualquer sessão.
- Item no menu **Estrutura → Calendário acadêmico** (só admin).
- **Tarefa ganhou `depende_calendario`** (checkbox + selo "📅 letiva"). Helper
  puro **`statusPeriodoLetivo(periodos, sede, data)`** em `lib/calculations.ts`
  retorna `dentro` | `fora` | `sem_calendario`.
- **Cobertura (`PendenciasPanel`)**: recebe `periodos` (a tela de rotinas busca
  por sede via SWR) e, para tarefas `depende_calendario`: **`fora` → não exige**
  (some das pendências); **`sem_calendario` com tarefa letiva devida → aviso
  forte** "Calendário acadêmico não cadastrado…" no topo da agenda.
- Seed: período "2026.1" de Aldeota (02/02–03/07, seg–sex) + `t6` (limpeza
  terminal) marcada como letiva.

**Verificado (DATA_SOURCE=memory):** build/lint ok; CRUD via API (lista, cria
201, edita 200, validação de período 422, exclui 200); cobertura testada nos 3
estados na agenda de Aldeota — **dentro** do período a tarefa letiva é cobrada
(1 periódica) sem aviso; com hoje **fora** (período só fim de semana) ela
**some**; **sem período** ela volta **com o aviso**. `.env` restaurado para
`firebase`.

**Arquivos:** `types/PeriodoLetivo.ts` (novo), `types/index.ts`,
`types/Tarefa.ts` (+`depende_calendario`), `lib/schema.ts` (+tabela +coluna),
`lib/memoryStore.ts` (seed), `lib/calculations.ts` (`statusPeriodoLetivo`),
`services/periodosLetivosService.ts` (novo),
`app/api/periodos-letivos/route.ts` (+`[id]/route.ts`, novos),
`app/(app)/periodos-letivos/page.tsx` (novo), `components/AppShell.tsx`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/rotinas/page.tsx`,
`app/(app)/tarefas/page.tsx`, `docs/02`, `docs/08`.

---

## 2026-06-17 — Onda 1 (pós-ata): modelo de tempo m²×ambiente×serviço + regra de horário

**Contexto:** primeira onda das evoluções decididas na ata de 16/06/2026. O
cálculo do tempo previsto passou a refletir o que o diretor descreveu:
**m² × tipo de ambiente × tipo de serviço** (base 1 m² ≈ 1 min).

**O que mudou:**
- **Intensidade migrou da CATEGORIA para o LOCAL.** Novo campo
  `Local.fator_intensidade` (leve 0,8 · normal 1,0 · densa 1,5; ausente/≤0 = 1).
  O fator da categoria **deixou de afetar o cálculo** (neutralizado no seed e
  removido do form/coluna de Categorias). A ação **"Recalibrar" continua** —
  ela mexe no `tempo_base_min`, é independente da intensidade.
- **Tarefa ganhou `tipo_servico`** (`rotina` 1,0 · `pesada` 1,5 ·
  `desincrustante` 2,0 — constantes calibráveis `FATOR_TIPO_SERVICO` em
  `lib/calculations.ts`). Select + selo na tela de Tarefas.
- `tempoPrevistoMin(tarefa, local)` **perdeu o 3º argumento** (categoria) e agora
  multiplica `base × fatorIntensidadeLocal(local) × fatorServico(tarefa)`.
  Atualizados os 6 call sites (rotinasService, TaskPalette, tarefas, rotinas,
  SugestoesAjuste, dashboard). `SugestoesAjuste` passou a dividir pelo fator do
  **local × serviço** ao sugerir novo tempo base.
- **Regra de horário (FORA_DO_EXPEDIENTE):** passou a bloquear **só o início**
  fora do expediente (`inicioMin < entrada || inicioMin >= saida`). Uma tarefa
  **pode terminar** depois da saída; **não pode iniciar** às/após a saída.
- Telas: **Locais** ganhou campo "Intensidade (fator)" + coluna; **Tarefas**
  ganhou "Tipo de serviço" + selo; **Categorias** teve o campo de intensidade
  ocultado (legado) com nota no subtítulo.
- Seed (`memoryStore`): banheiros/copa densos (1,5/1,3), área externa leve (0,8),
  higienizações `pesada`, vidros `desincrustante`; fator das categorias = 1.

**Verificado (DATA_SOURCE=memory):** build ok; `/tarefas` mostra os tempos
corretos (banheiro 45 min = 20×1,5×1,5; área externa 64 min = 0,4×200×0,8;
vidros 80 min = 40×2); regra de horário testada via API (inicia 15:30 e termina
17:30 → **passa**; inicia 16:00 = saída → **FORA_DO_EXPEDIENTE**). Console limpo.
`.env` restaurado para `firebase`.

**Pendente (transversal, não-código):** persistir a ata em
`docs/10-ata-2026-06-16.md`; estudar as planilhas das sedes (atividades
não-limpeza); demais ondas (2–5).

**Arquivos:** `types/comum.ts` (+`TipoServico`), `types/Local.ts`
(+`fator_intensidade`), `types/Tarefa.ts` (+`tipo_servico`), `lib/calculations.ts`,
`lib/validations.ts`, `lib/schema.ts`, `lib/memoryStore.ts`,
`components/SugestoesAjuste.tsx`, `components/agenda/TaskPalette.tsx`,
`services/rotinasService.ts`, `app/(app)/tarefas/page.tsx`,
`app/(app)/locais/page.tsx`, `app/(app)/categorias/page.tsx`,
`app/(app)/dashboard/page.tsx`, `docs/02`, `docs/03`, `docs/08`.

---

## 2026-06-16 — Fase F: login com Google (Firebase Auth)

**O que mudou:**
- **"Entrar com Google"** na tela de login (Firebase Auth, provedor Google que o
  usuário habilitou no console). Fluxo: popup do Google no cliente
  (`lib/firebaseWeb.ts`, SDK `firebase`) → ID token → `POST /api/auth/google` →
  **Admin SDK `verifyIdToken`** → e-mail precisa estar **cadastrado e ativo** em
  `usuarios` → cria a sessão normal (perfil/sede do cadastro). E-mail não
  cadastrado → 403. Convive com o login por e-mail/senha (não substitui).
- Helper `lib/firebaseAdmin.ts` (app Admin compartilhado) extraído; `firebaseClient`
  passou a reusá-lo. Config web é pública (hardcoded em `firebaseWeb.ts`).
- `middleware.ts`: `/api/auth/*` já era público (cobre a nova rota).
- Verificado: build ok; rota defensiva (sem token → 400; token inválido → 401 via
  Admin real). **O popup do Google deve ser testado por você no navegador** (não
  dá para automatizar headless).

**Para você testar / publicar:**
- Rodar `npm run dev` (DATA_SOURCE=firebase) e clicar "Entrar com Google" com uma
  conta cujo e-mail esteja cadastrado em `usuarios` (senão dá 403, que é o esperado).
- No deploy (Vercel), adicionar o domínio em **Authentication → Authorized
  domains** no console do Firebase.
- Nova dependência: `firebase` (SDK cliente) no `package.json`.

**Arquivos:** `lib/firebaseAdmin.ts` (novo), `lib/firebaseWeb.ts` (novo),
`lib/firebaseClient.ts`, `app/api/auth/google/route.ts` (novo), `app/login/page.tsx`,
`package.json` (+firebase), `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase F: login individual (senha por usuário)

**O que mudou:**
- **Senha por usuário** (`Usuario.senha_hash`, hash **scrypt** "salt:hash" em
  `lib/senha.ts`). O login verifica a senha individual; quem ainda não tem cai no
  `ACCESS_PASSWORD` como **bootstrap** (migração suave, nada quebra). Definida a
  senha individual, só ela vale.
- **Admin define** a senha de qualquer usuário (ação "Senha" em `/usuarios` +
  `POST /api/usuarios/[id]/senha`). **Self-service** em `/conta`
  (`POST /api/auth/senha`, usa o id da sessão). Link no nome do usuário (cabeçalho).
- **Segurança:** `getUsuarios` **remove `senha_hash`** da resposta (nunca vai ao
  cliente); senha nunca em texto puro.
- Verificado em memória: admin entra no bootstrap (200); senha definida para o
  supervisor → senha única passa a dar **401** e a individual **200**; self-service
  troca a própria e reloga; a API **não expõe** o hash. Build e console limpos.

**Decisão/escopo:** entreguei "login individual" de verdade dentro da sessão
HMAC atual (segura e verificável). **Trocar o provedor para Firebase Auth** segue
pendente — exige habilitar o Authentication no console do projeto e a config web
pública (apiKey etc.), que não está disponível aqui; é passo de produção.

**Arquivos:** `types/Usuario.ts`, `lib/schema.ts`, `lib/senha.ts` (novo),
`services/usuariosService.ts`, `app/api/auth/login/route.ts`,
`app/api/auth/senha/route.ts` (novo), `app/api/usuarios/[id]/senha/route.ts` (novo),
`app/(app)/usuarios/page.tsx`, `app/(app)/conta/page.tsx` (novo), `components/AppShell.tsx`.

---

## 2026-06-16 — Fase F: remanejo entre sedes + correção de conformidade no "mover"

**O que mudou:**
- **Tela `/remanejo`** (admin, multi-sede): lista as tarefas órfãs (de
  funcionários ausentes) de TODAS as sedes e sugere candidatos com folga,
  inclusive de **outra sede** (tag ↗). A movimentação usa o endpoint de mover
  existente, que valida jornada/conflito; respeita restrição de gênero no filtro
  de candidatos. Cruzar sedes é destacado (há deslocamento — combinar transporte).
- **Correção:** o caminho de "mover" (`updateRotina`) **não checava requisitos
  de conformidade** (só o `criarRotina` checava). Agora também valida aptidão/
  treinamento (faltando/vencido) no destino — fecha a brecha e protege o remanejo.
- Verificado em memória: Maria marcada ausente → r1/r2 órfãs; r1 → Carlos (DT,
  cross-sede) **200**; r2 (Higienização exige química) → Francisca (sem química)
  **422 REQUISITO_FALTANDO**; a tela lista a órfã e só oferece candidata feminina
  de outra sede (↗). Build e console limpos.

**Arquivos:** `services/rotinasService.ts` (conformidade no mover),
`app/(app)/remanejo/page.tsx` (novo), `components/AppShell.tsx`,
`docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase F (parcial): score de produtividade por funcionário

**O que mudou:**
- **Tela `/produtividade`**: indicador OPERACIONAL derivado do previsto ×
  realizado. Por funcionário (período + sede): nº de serviços realizados, tempo
  realizado e **aderência** (% das execuções comparáveis dentro de ±X% do
  previsto). Ranking (🥇🥈🥉) e export CSV (apoia o processo de premiação).
- **Salvaguardas do diretor**: banner explícito — não usa idade/sexo, não é
  punitivo, não substitui avaliação de gestão; tarefas de referência/presença
  ficam de fora (a variação é esperada). "Sem base" para quem não tem execuções
  comparáveis.
- Verificado em memória: Maria (real ≈ previsto) 🥇 100%; José (real bem acima)
  🥈 0%; demais "sem base". Build e console limpos.

**Fase F — em aberto (decisões da direção / produção):** os outros 3 itens não
foram feitos por exigirem decisão sua e/ou configuração de produção:
- **Login individual (Firebase Auth)**: troca a autenticação de produção (hoje
  senha única + cookie HMAC) — precisa do Firebase Auth habilitado no console.
- **Confirmação pelo funcionário (app/QR)** + **EPI confirmado**: fluxo voltado
  ao ASG; depende do login individual.
- **Remanejo entre sedes**: visão de gerência multi-sede + como o deslocamento
  entre sedes entra na conta.

**Arquivos:** `app/(app)/produtividade/page.tsx` (novo), `components/AppShell.tsx`,
`docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase E: conformidade (aptidão, treinamento, EPI) — Fase E concluída

**O que mudou (bloco jurídico de conformidade):**
- **Catálogo `requisitos`** (incremento 1): aptidão | treinamento | epi
  (global, admin). `Tarefa.requisitos` (CSV) define o que a tarefa exige —
  campo **multiselect** novo no CrudManager; selos por tipo (🩺/🎓/🧤) na tela de
  Tarefas. Tela `/requisitos`.
- **Qualificações do funcionário** (incremento 2): tabela
  `qualificacoes_funcionario` (funcionário possui aptidão/treinamento, com
  **validade**). Tela `/qualificacoes` (selo verde válido / vermelho vencido).
- **Validação na alocação** (`validarAlocacao`): bloqueia (erro) quem não tem um
  requisito de aptidão/treinamento exigido pela tarefa, ou cujo requisito está
  **vencido** na data. EPI **não bloqueia** (exibido como lembrete; a confirmação
  de uso é a Fase F). Cliente e servidor; não é contornável por "forçar".
- Seed: rq1 química (treinamento), rq2 NR-35 (aptidão), rq3 luvas (EPI);
  Higienização exige rq1+rq3, Limpeza de vidros exige rq2; Maria tem NR-35 (ok) e
  química vencida; José tem química válida.
- Verificado em memória: Maria+vidros (tem NR-35) **201**; José+vidros (sem
  NR-35) **bloqueado** (REQUISITO_FALTANDO); Maria+higienização (química vencida)
  **bloqueado** (REQUISITO_VENCIDO). Selos e telas OK. Build e console limpos.

**Fase E concluída** — matriz de aptidão e treinamento com validade completas;
EPI exigido pela tarefa entregue, faltando só a *confirmação de uso* (Fase F,
depende do app/QR). Próximo: Fase F (Auth individual, app/QR, remanejo entre
sedes, score).

**Decisão de modelagem:** um catálogo único `requisitos` com `tipo` cobre os três
itens; aptidão/treinamento são possuídos pelo funcionário e bloqueiam; EPI é
exigência da tarefa exibida como lembrete. Requisitos exigidos guardados como CSV
em `Tarefa.requisitos` (espelha colunas escalares; multiselect na UI).

**Arquivos:** `types/{comum,Requisito,QualificacaoFuncionario,Tarefa,index}.ts`,
`lib/schema.ts`, `lib/validations.ts`, `services/{requisitos,qualificacoes,rotinas}Service.ts`,
`app/api/{requisitos,qualificacoes}/...`, `app/(app)/{requisitos,qualificacoes,tarefas,rotinas}/page.tsx`,
`components/CrudManager.tsx` (multiselect), `components/AppShell.tsx`,
`app/globals.css` (selo-roxo), `lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase D (3/3): deslocamento — Fase D concluída

**O que mudou (último item do enriquecimento do cálculo):**
- **Tempo de deslocamento** (`deslocamento_min_por_tarefa`, parâmetro por sede,
  **default 0**): minutos de transição atribuídos por tarefa alocada. Entra na
  ocupação como tempo real (`resumoFuncionario`: ocupado = planejado + nº tarefas
  × param; ociosidade e ocupação recalculadas), SEM poluir o desvio de cada
  tarefa. Linha "Deslocamento estimado" no resumo quando > 0. Default 0 = neutro
  até a sede calibrar.
- Seed: p11 (Aldeota 5min/tarefa).
- Verificado em memória (servidor fixado no boot, sem tocar Firestore): Maria com
  2 tarefas → "Deslocamento estimado 10min", ociosidade 6h10 (480 − 100 − 10).
  Build e console limpos.

**Fase D concluída** (3/3): criticidade (incremento 1), tempo por pessoa
(incremento 2) e deslocamento (este). Próximo: Fase E (conformidade: aptidão,
treinamento, EPI).

**Arquivos:** `types/Parametro.ts`, `lib/calculations.ts` (`resumoFuncionario`),
`components/agenda/OccupancySummary.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

> Nota: a folga/ociosidade do **dashboard** (agregado) ainda soma só tempo de
> tarefa; o deslocamento é um overlay por funcionário/dia exibido no resumo da
> agenda. Unificar no dashboard fica para quando o parâmetro for calibrado.

---

## 2026-06-16 — Fase D (2/3): tempo padrão por funcionário × atividade (só planejamento)

**O que mudou:** tabela `tempos_personalizados` (funcionário × tarefa → minutos).
Na alocação (cliente e servidor), o tempo pessoal **substitui** o padrão
calculado — reconhece o ritmo de cada pessoa. Tela `/tempos`, service e rotas
com permissão por sede e unicidade por (funcionário, tarefa). **Só planejamento**
— nunca avaliação/score (planejar ≠ avaliar). Verificado: Maria 70 / José 95 /
Ana (sem override) 80; duplicata bloqueada.

**Arquivos:** `types/TempoPersonalizado.ts` (novo), `types/index.ts`,
`lib/schema.ts`, `services/temposPersonalizadosService.ts` (novo),
`app/api/tempos-personalizados/{route,[id]/route}.ts` (novos),
`app/(app)/tempos/page.tsx` (novo), `services/rotinasService.ts`,
`app/(app)/rotinas/page.tsx`, `components/AppShell.tsx`, `lib/memoryStore.ts`.

---

## 2026-06-16 — Fase D (1/3): criticidade / circuito essencial

**O que mudou:** `Tarefa.critica` — tarefas que não podem deixar de ser feitas.
Quando uma crítica fica sem cobertura no dia, o `PendenciasPanel` mostra uma
seção "Circuito essencial descoberto" em vermelho, separada e acima das demais
pendências. Campo + selo "⛔ crítica" na tela de Tarefas. Seed: t2 e t8 críticas.
Verificado: Coleta (crítica, não alocada) aparece no circuito; Higienização
(crítica, alocada hoje) não aparece.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/tarefas/page.tsx`,
`lib/memoryStore.ts`.

---

## 2026-06-16 — Fase C (2/2): presença/plantão + buffer calibrado — Fase C concluída

**O que mudou (fecha o segundo eixo):**
- **Presença/plantão** (`Tarefa.presenca`): classificação de tarefa para tempo de
  permanência (ex.: acompanhar pátio). NÃO cobra desvio — criamos o helper
  `cobraDesvio(tarefa) = !(tempo_referencia || presenca)` e o aplicamos em TODOS
  os pontos de desvio (execucoesService, SugestoesAjuste, dashboard, acompanhamento).
  Campo no form de Tarefas + selo "presença".
- **Buffer calibrado por sede** (`components/CalibracaoFolga.tsx`, no dashboard):
  painel que sugere a folga de cada sede = tempo médio de imprevistos por dia ÷
  capacidade diária (soma das jornadas líquidas). Sugestão transparente, NÃO
  aplica sozinha — fecha o ciclo do Tema 6 da pré-análise.
- Seed: t13 "Acompanhamento de pátio" (presença).
- Verificado em memória: presença com real 120 / previsto 60 sem justificativa →
  201 (não cobra); tarefa normal igual → 422 (exige justificativa). Calibração:
  Aldeota 45min de imprevisto / cap. 24h, DT 30min / 16h — cálculo correto. Selo
  "presença" na tela. Build e console limpos.

**Fase C concluída** (4/4). Próximo: Fase D (deslocamento, tempo por pessoa,
criticidade) — toca o cálculo de tempo e tem decisões de modelagem em aberto.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/calculations.ts`
(`cobraDesvio`), `services/execucoesService.ts`, `components/SugestoesAjuste.tsx`,
`components/CalibracaoFolga.tsx` (novo), `app/(app)/{tarefas,dashboard,acompanhamento}/page.tsx`,
`lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase C (1/2): serviços eventuais e imprevistos (2º eixo)

**O que mudou (a porta de entrada do trabalho não-rotineiro):**
- **Nova entidade `servicos_eventuais`** (separada de `execucoes_realizadas`,
  que sempre parte de uma rotina): registro a posteriori de trabalho fora da
  rotina, com `tipo` distinguindo **eventual** (trabalho avulso produtivo) de
  **imprevisto** (ocorrência que consumiu tempo). Campos: sede, funcionário
  (opcional), local/categoria (opcionais), data, descrição, início/fim, tempo
  em minutos, observação, supervisor.
- **Tela /eventuais** (supervisor+admin): CRUD via CrudManager, selos
  Eventual/Imprevisto, tempo formatado. Link no menu após Acompanhamento.
- **Service + rotas** (`/api/servicos-eventuais`): GET por intervalo de data
  (campo único) + filtro de sede em memória; POST/PUT/DELETE com permissão de
  sede (supervisor só na própria sede). Escritas logadas no histórico.
- Seed demo: 3 registros (1 eventual + 2 imprevistos em Aldeota/DT).
- Verificado em memória: seed 3 → cria → 4; filtro por sede DT retorna só o da
  DT; supervisor Aldeota recebe 403 ao registrar em outra sede e 201 na própria;
  tela lista os 5 com selos; form completo. Build e console limpos.

**Decisão de modelagem:** eventuais e imprevistos compartilham uma tabela
(distintos por `tipo`), separados das execuções de rotina — o "2º modo" do
produto. Isso prepara o **buffer calibrado por sede** (próximo incremento), que
deriva a folga a partir do volume de imprevistos por sede.

**Falta na Fase C (2/2):** presença/plantão como classificação de tarefa (não
cobra desvio, não é ociosidade) + buffer calibrado por sede a partir dos
imprevistos registrados.

**Arquivos:** `types/comum.ts`, `types/ServicoEventual.ts` (novo), `types/index.ts`,
`lib/schema.ts`, `services/servicosEventuaisService.ts` (novo),
`app/api/servicos-eventuais/{route,[id]/route}.ts` (novos),
`app/(app)/eventuais/page.tsx` (novo), `components/AppShell.tsx`, `lib/memoryStore.ts`.

---

## 2026-06-16 — Fase B (2/2): intensidade de limpeza no cálculo — Fase B (quase) concluída

**O que mudou (incremento que toca a fórmula de tempo):**
- **Fator de intensidade na categoria** (`Categoria.fator_intensidade`, padrão
  1,0): multiplica o tempo previsto de TODAS as tarefas da categoria. Presets
  leve 0,8 · normal 1,0 · densa 1,5 (calibráveis). `tempoPrevistoMin` ganhou um
  3º parâmetro opcional `categoria` e aplica o fator no fim; helper
  `fatorIntensidade` blinda contra valor ausente/≤0 (→ 1).
- Aplicado em TODOS os pontos que calculam tempo previsto: servidor
  (`rotinasService` busca a categoria ao alocar), paleta, tela de Tarefas,
  alocação na agenda. `SugestoesAjuste` usa o fator no previsto E **divide por
  ele** ao sugerir o novo tempo base (senão a sugestão super-corrigiria).
- Tela Categorias: campo "Fator de intensidade" + selo "×1,5 densa / ×0,8 leve"
  na lista. Seed: Higienização e Limpeza terminal densas (1,5); Organização e
  Reposição leves (0,8).
- Verificado em memória: alocar Higienização (base 20 ×1,5) → previsto **30**;
  Organização (30 ×0,8) → **24**; Reposição (15 ×0,8) → **12** — na tela e no
  servidor. SugestoesAjuste com 3 execuções de 45min (previsto 30) sugeriu base
  **30** (= 45 ÷ 1,5), confirmando a divisão do fator. Build e console limpos.

**Decisão de modelagem (sua):** intensidade fica na **categoria** (multiplicador
único), não por tarefa/local. Consequência: o item "tipo de uso do local →
exigência de nível" da Fase B fica **em aberto** (pressupõe nível por
local/tarefa) — documentado em `docs/08`. Fase B entrega 3 de 4 itens; o 4º é
decisão de modelagem futura, não pendência de esforço.

**Arquivos:** `types/Categoria.ts`, `lib/schema.ts`, `lib/calculations.ts`,
`services/rotinasService.ts`, `components/SugestoesAjuste.tsx`,
`components/agenda/TaskPalette.tsx`, `app/(app)/{tarefas,rotinas,dashboard,categorias}/page.tsx`,
`lib/memoryStore.ts`, `docs/08-plano-evolucao.md`.

---

## 2026-06-16 — Fase B (1/2): categoria de atividade + recalibração em cascata

**O que mudou (fundação estrutural da Fase B, sem mexer na fórmula de tempo):**
- **Entidade `categorias`** (catálogo global, compartilhado entre sedes):
  id, nome, descricao, cor, ativo. Formaliza o antigo campo livre
  `tipo_tarefa`. `Tarefa` ganhou `categoria_id` (opcional p/ compat).
- **Tela Categorias** (`/categorias`, só admin): CRUD padrão + ação
  **Recalibrar** — aplica um fator ao `tempo_base_min` de TODAS as tarefas da
  categoria de uma vez (presets ±10/±20% ou fator manual). Cada ajuste é logado
  no histórico pelo decorator. Bloqueia exclusão de categoria com tarefas.
- **Tela Tarefas**: novo select **Categoria** (catálogo) + coluna com selo
  colorido; `tipo_tarefa` rebaixado a "Tipo (texto livre)" legado.
- **Paleta da agenda**: filtro "Tipo" (texto livre) virou **Categoria** (só as
  usadas na sede); cada card mostra a pílula colorida da categoria.
- **Permissões**: catálogo global → só administrador cria/edita/exclui/recalibra
  (`podeGerenciarCatalogo`); supervisor/visualizador apenas leem (para escolher
  ao cadastrar tarefa). Verificado: supervisor recebe 403.
- Schema dirige tudo (setup/migração Firestore incluem `categorias`
  automaticamente). Seed: 7 categorias (c1–c7) e todas as tarefas vinculadas.
- Verificado em memória: GET 7 categorias; recalibrar c2 ×1.2 → 3 tarefas
  20→24min, 3 registros no histórico; modal mostra "N tarefa(s) ajustada(s)";
  filtro da paleta e selos coloridos OK. Build e console limpos.

**Decisão de modelagem:** categoria é **catálogo global** (não por sede) — a
questão "catálogo mestre por sede" do plano fica em aberto. Recalibração é uma
**ação** (multiplica tempo_base_min), não um campo herdado, evitando acoplar a
fórmula a esta etapa.

**Arquivos:** `types/Categoria.ts` (novo), `types/index.ts`, `types/Tarefa.ts`,
`lib/schema.ts`, `lib/permissions.ts`, `services/categoriasService.ts` (novo),
`app/api/categorias/{route,[id]/route,recalibrar/route}.ts` (novos),
`components/CrudManager.tsx` (prop `acoesExtra`), `app/(app)/categorias/page.tsx`
(novo), `app/(app)/tarefas/page.tsx`, `components/agenda/TaskPalette.tsx`,
`app/(app)/rotinas/page.tsx`, `components/AppShell.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

**Falta na Fase B (2/2):** nível/intensidade de limpeza entrando no cálculo de
tempo + tipo de uso do local → exigência de nível (mexem na fórmula
`tempoPrevistoMin` — próximo incremento).

---

## 2026-06-16 — Fase A: periodicidade fina (dias fixos da semana) — Fase A concluída

**O que mudou (último item da Fase A):**
- **Periodicidade fina** (`Tarefa.dias_semana`, CSV "0".."6", 0=dom): uma tarefa
  **semanal** pode fixar os dias da semana em que é devida (ex.: "2,4" = terça e
  quinta; marcar 2 dias = "2× por semana"). Vazio mantém o comportamento antigo
  (janela deslizante de 7 dias). Advisory — não bloqueia a agenda.
- **Painel "Ficou de fora hoje"** ganhou um terceiro grupo: **"do dia (dia
  fixo)"** — tarefas semanais cujo dia da semana de hoje está marcado e que não
  foram alocadas. Aparece com selo do dia (ex.: "terça"). As semanais sem dias
  fixos continuam na regra de vencimento por janela.
- **Tela de Tarefas**: novo seletor de dias (linha de toggles D-S-T-Q-Q-S-S),
  que só aparece quando a frequência é "Semanal" (campo condicional via
  `mostrarSe` no `CrudManager`). Selo "ter, qui" na coluna "Regras".
- Helpers de data em `lib/dateUtils.ts` (`DIAS_SEMANA`, `parseDiasSemana`,
  `serializarDiasSemana`, `rotularDiasSemana`, `diaDaSemana`).
- Seed demo: t12 "Limpeza de vidros" semanal terça/quinta (Aldeota).
- Verificado em memória: na terça o painel mostra "1 do dia (dia fixo)" com selo
  "terça"; na quarta a tarefa não é cobrada (contraprova); seletor traz terça+
  quinta marcados e some ao trocar para Diária. Build e console OK.

**Decisão de modelagem:** `dias_semana` ficou como **string CSV** (não array)
para espelhar colunas escalares do Sheets/Firestore (regra do schema) e evitar
serialização de array; a UI/lógica usa `parse/serializarDiasSemana`. Escopo
fino e advisory de propósito — não vira bloqueio de alocação.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/dateUtils.ts`,
`components/CrudManager.tsx`, `app/(app)/tarefas/page.tsx`,
`components/agenda/PendenciasPanel.tsx`, `lib/memoryStore.ts`,
`docs/08-plano-evolucao.md`.

**Fase A concluída** (5/5). Próximo: Fase B (categoria de atividade), a primeira
fundação estrutural do plano.

---

## 2026-06-16 — Fase A (2/2): folga mínima por sede + relatório mensal

**O que mudou (conclui os itens viáveis da Fase A):**
- **Folga mínima por sede** (`folga_minima_percentual`): parâmetro que reserva
  uma fatia da jornada como buffer para imprevistos. Define a **ocupação-alvo**
  da sede = 100 − folga. No resumo do funcionário e nas barras da equipe
  aparece um marcador (tick) na barra de ocupação na posição-alvo, mais a
  legenda "Folga reservada X% · ocupação-alvo ≤ Y%". Puramente informativo
  (não bloqueia). Seed demo: 10% geral.
- **Relatório mensal por funcionário** (nova tela `/relatorios`): consolida as
  execuções do mês (a partir do que foi marcado no Acompanhamento) em folhas
  imprimíveis, uma por funcionário, com data/tarefa/local/status/tempo real,
  totais (nº de serviços realizados + tempo) e linhas de assinatura
  (responsável pela sede / cliente). Filtros de mês e sede; botão Imprimir.
  Para o cliente assinar — atende o pedido do diretor de "formalizar a saída".
- Verificado em memória: registradas 2 execuções (conforme + com atraso) →
  relatório lista as 2 linhas, resumo "2 serviço(s) · 1h45", só aparece quem
  teve execução; folga: tick em left:90% e legenda ≤ 90%. Build e console OK.

**Arquivos:** `types/Parametro.ts`, `lib/calculations.ts`, `lib/memoryStore.ts`,
`components/agenda/OccupancySummary.tsx`, `app/(app)/relatorios/page.tsx` (novo),
`components/AppShell.tsx`.

**Falta na Fase A:** periodicidade fina (tarefas em dias fixos da semana) —
adiada por exigir decisão de modelagem à parte. Próximo: Fase B (categoria de
atividade) por `docs/08-plano-evolucao.md`.

---

## 2026-06-12 — Fase A (1/2): janela de horário + "tempo é referência"

**O que mudou (primeiros itens do plano de evolução):**
- **Janela de horário por tarefa** (`janela_inicio`/`janela_fim`): a tarefa só
  pode ser alocada dentro do intervalo (ex.: refeitório só após o almoço). A
  agenda bloqueia fora (`JANELA_HORARIO`), cliente e servidor.
- **Flag "tempo é referência"** (`tempo_referencia`): tarefas cuja execução
  varia muito (ex.: montagem de palco) não cobram justificativa de desvio, não
  entram no "Top 10 desvios" do dashboard nem nas sugestões de ajuste de tempo.
- Tela de Tarefas: campos novos (com dicas), selos na coluna "Regras"
  (♀/♂, janela, referência). Seed demo com exemplos (t5 janela 13–16h, t6
  referência).
- Verificado em memória: janela bloqueia 09:00 / aceita 13:30; execução de
  tarefa-referência com desvio 3× passa sem justificativa, tarefa normal é
  bloqueada (contraprova). Build e console OK.

**Arquivos:** `types/Tarefa.ts`, `lib/schema.ts`, `lib/validations.ts`,
`lib/memoryStore.ts`, `services/execucoesService.ts`, `components/SugestoesAjuste.tsx`,
`app/(app)/{tarefas,dashboard,acompanhamento}/page.tsx`.

**Falta na Fase A:** folga mínima por sede, periodicidade fina, relatório
mensal por funcionário.

---

## 2026-06-12 — Plano de evolução (pós pré-análise do diretor)

**O que mudou:** o diretor enviou uma pré-análise classificando ideias de
evolução (JÁ EXISTE / MELHORIA / LACUNA / DIREÇÃO / RISCO) em 9 temas. Conferi
contra o código (classificações batem; e registrei que a "periodicidade por dia
da semana" já avançou via `escala`). Criado `docs/08-plano-evolucao.md`:
sequencia tudo em fases A–F por dependência/risco (ganhos rápidos → categoria de
atividade → serviços eventuais/eventualidades → deslocamento/tempo por pessoa →
conformidade/aptidão → direção: Auth, app/QR, remanejo entre sedes), com as
decisões em aberto que travam cada fase e os guarda-corpos de risco
(tempo individual planejar≠avaliar; idade/sexo fora de produtividade).
Nada implementado ainda — é o mapa de execução.

**Arquivos:** `docs/08-plano-evolucao.md`.

---

## 2026-06-12 — Consultas filtradas (corta leituras do Firestore)

**O que mudou:** novo método `DataSource.consultar(tabela, condicoes)` que no
Firestore vira `where` — sempre por **um único campo** (igualdade ou intervalo
no mesmo campo), usando só índices automáticos (zero índice composto p/ criar).
Filtros secundários (ex.: sede além da data) ficam em memória sobre o conjunto
já reduzido. Aplicado nos caminhos quentes: rotinas por data/período,
ausências por sede e por funcionário (`ausenteEm`), funcionários/tarefas/locais
por sede, usuários por e-mail (login), modelos por sede, execuções por período,
histórico por tabela. Antes cada carga lia coleções **inteiras** (causa do
estouro de cota); agora lê só o recorte. Memory/Sheets filtram em JS (mesmo
resultado).

**Verificado** em modo memória (mesma lógica): login, funcionários/tarefas/
rotinas retornam só o recorte correto da sede/data; agenda renderiza. (Firebase
ao vivo não testado por causa da cota esgotada hoje — caminho `where` é padrão
e usa índices automáticos.)

**Arquivos:** `lib/datasource.ts`, `lib/{memoryStore,firebaseClient,googleSheetsClient,historico}.ts`,
`services/{rotinas,ausencias,funcionarios,tarefas,locais,usuarios,modelos,execucoes}Service.ts`,
`app/api/historico/route.ts`.

---

## 2026-06-12 — Agenda instantânea (otimista) + alerta de cota Firestore

**O que mudou:** soltar/mover/redimensionar/remover tarefa na agenda agora é
**otimista** — o card aparece/muda na hora (SWR `optimisticData`), o servidor
valida em 2º plano, a resposta substitui o provisório (sem rebuscar a lista) e,
se o servidor recusar, `rollbackOnError` reverte. Antes: ~3-4s (esperava o POST
+ uma rebusca da coleção inteira). Agora instantâneo e com **menos leituras**.

**⚠️ Observação importante (cota):** durante os testes de hoje o **limite
gratuito de leituras do Firestore (50k/dia) foi esgotado** (RESOURCE_EXHAUSTED)
— porque cada carregamento lê coleções inteiras (`listar` + filtro em memória).
Reseta à meia-noite (Pacífico). Reforça a pendência de **consultas indexadas
por data/sede** (reduzir leituras por carga) e/ou avaliar o plano Blaze. A
mudança otimista já ajuda (remove a rebusca por ação). Verificação ao vivo do
otimista ficou pendente por causa da cota; build/typecheck OK.

**Arquivos:** `app/(app)/rotinas/page.tsx`.

---

## 2026-06-12 — Agenda: faixa "fora do turno" com mais destaque

**O que mudou:** as células fora do horário do funcionário (ex.: manhã de
quem trabalha à tarde) estavam quase invisíveis (hachura rgba 0,05). Agora têm
fundo acinzentado leve (0,06) + hachura mais marcada (0,13) — claramente
"indisponível", mas ainda mais suave que o intervalo (verde-escuro), mantendo
a hierarquia visual. Verificado na coluna da Ana (13:00–22:00).

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Ajuste: blocos do login sumiam / caíam rápido demais

**O que mudou (bug do efeito anterior):** (1) "Sumindo" — o `forwards` só
preserva propriedades declaradas no quadro 100%, e eu só pus `transform` lá;
a opacidade revertia ao base (0). Corrigido fixando `opacity: 1` de 40% a
100%. (2) "Rápido demais" — duração 0,95s → **1,5s** e cascata mais espaçada
(delays 0,15s → 1,6s); brilho passa a iniciar em 3,4s+ (após assentarem).
Confirmado forçando a animação ao fim no preview: todos terminam em opacity 1
e posição final (o preview headless pausa animações, por isso parecia sumir lá).

**Arquivos:** `app/globals.css`, `app/login/page.tsx`.

---

## 2026-06-12 — Login: blocos caem com gravidade e quicam (Tetris)

**O que mudou (pedido fru-fru do usuário):** os blocos da partitura agora
**caem de cima (-220px) com aceleração de gravidade e quicam 2x** ao bater na
pauta, em cascata — como peças de Tetris assentando perto do texto/logo.
Keyframe `bloco-cai` (0,95s, timing-functions por segmento p/ gravidade +
ricochete), gated em `prefers-reduced-motion: no-preference`; fallback é um
fade simples (`bloco-aparece`). Optei pela queda-com-quique em CSS no lugar de
colisão física literal (seria pesado/arriscado numa tela de login).
Verificado: keyframe ativo, delays 0,1–0,65s. (Screenshot trava por causa do
brilho infinito — limitação do capturador, não do código.)

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Login: logo maior e centralizada no palco

**O que mudou:** a logo do palco estava pequena e encostada no canto. Agora o
palco é centralizado (alignItems/textAlign center), a logo cresceu para
`min(420px, 78%)` e ficou centralizada no topo, com headline, partitura e
rótulo também centralizados — presença "onipotente" pedida pelo usuário.

**Arquivos:** `app/login/page.tsx`.

---

## 2026-06-12 — Jornada por escala (sábado de 4h / 44h) + loaders espalhados

**Jornada variável:** funcionário agora tem `escala` (seg_sex / seg_sab /
todos) e horário próprio de sábado (`entrada_sabado`/`saida_sabado`, ex.: turno
de 4h sem intervalo). `jornadaDoDia(f, data)` resolve o horário efetivo por
data; `funcionarioNoDia` aplica na agenda/validação; `cargaSemanalMin` mostra
a carga (ex.: 44h) na tabela. A agenda usa o horário do dia, marca **Folga**
nos dias fora da escala (coluna bloqueada, como ausência) e o servidor bloqueia
alocação em folga (`FOLGA`) e valida o expediente do sábado. Padrão p/ dados
sem escala = seg_sex. **Verificado no Firebase real:** domingo→folga (422),
sábado 11:30→fora do expediente 07:00–11:00 (422), sábado 08:00→ok.
*Obs.: o dashboard ainda usa jornada padrão na média (aproximação).*

**Loaders Tetris espalhados:** carregamento inicial da Rotina do dia e do
Dashboard, e ação de salvar nos modais (CrudManager) agora mostram o
`<Carregando>` (bloquinhos caindo) em vez de nada/"Salvando…".

**Arquivos:** `types/comum.ts`, `types/Funcionario.ts`, `lib/schema.ts`,
`lib/memoryStore.ts`, `lib/calculations.ts`, `services/rotinasService.ts`,
`app/(app)/rotinas/page.tsx`, `app/(app)/funcionarios/page.tsx`,
`app/(app)/dashboard/page.tsx`, `components/CrudManager.tsx`.

---

## 2026-06-12 — Loading "Tetris" (bloquinhos caindo) no lugar do spinner

**O que mudou:** componente `Carregando` com bloquinhos coloridos
(azul/amarelo/verde/vinho, estilo tijolo do sistema) que caem com gravidade e
empilham num loop — remete à agenda de blocos do Orkestria. Substitui o texto
"Carregando…" no `CrudManager` (vale para todas as listas: funcionários,
sedes, locais, tarefas, ausências, parâmetros, usuários, histórico). Tem texto
opcional e um `role=status` oculto p/ leitores de tela. Verificado: keyframe
`tetris-cai` ativo (1,8s), 4 blocos empilhando (screenshot).

**Reutilizável** em outros loadings (rotinas/dashboard) — basta importar
`<Carregando />`.

**Arquivos:** `components/Carregando.tsx`, `app/globals.css`,
`components/CrudManager.tsx`.

---

## 2026-06-12 — Animações mais suaves na Rotina do dia

**O que mudou (feedback "tá muito seco"):** entrada da página mais macia e
viva, sem atrapalhar o uso. (1) `.entra*` com easing cubic-bezier suave e
0,42s (antes 0,25s ease-out), + `.entra-4`. (2) Colunas de funcionário
surgem em **cascata** na agenda (`.col-agenda`, delay via `--d` por índice,
limitado a 8). (3) Cards da paleta com **leve elevação no hover** (afinidade
de arraste). (4) Cards de rotina **nascem com pop** ao serem criados/soltos
(`.pop-card`; só anima no mount, não a cada re-render). Mantido `backwards`
em tudo (não quebra os modais). Verificado: cascata 0/0,05/0,1s, pop nos 3
cards de 12/06, 0 erros.

**Arquivos:** `app/globals.css`, `components/agenda/AgendaGrid.tsx`.

---

## 2026-06-12 — Brilho animado nos blocos da partitura (login)

**O que mudou:** os blocos da partitura, além de entrarem em sequência,
agora têm um brilho suave que os varre em cascata (loop lento de 5,5s,
delays escalonados via `--brilho-delay` inline) — como uma batuta passando
pela partitura. Implementado com `::after` + `overflow:hidden`, dentro de
`@media (prefers-reduced-motion: no-preference)` para respeitar quem prefere
menos animação. Verificado: ::after com `bloco-brilho`, delays 1,2s→3,9s.

**Arquivos:** `app/globals.css`, `app/login/page.tsx`.

---

## 2026-06-12 — Tela de login redesenhada (split + Google)

**O que mudou:** login virou split-screen. Esquerda = "palco" evergreen com a
logo (versão marfim), headline "A rotina da sua equipe, orquestrada." e uma
**partitura animada** (blocos de agenda azul/verde/amarelo/vinho sobre pautas,
revelados em sequência) — amarra o nome à função. Direita = formulário limpo
(e-mail/senha, Entrar) + divisor "ou" + **botão "Entrar com Google"** com o G
oficial. Responsivo: <880px empilha e esconde a partitura. Verificado:
2 colunas no desktop, 1 no mobile, sem estouro, 0 erros de console.

**Importante:** o botão do Google é **só visual por enquanto** — ao clicar
mostra aviso "será habilitado em breve". Tornar funcional = item de Firebase
Authentication (verificar ID token no servidor + casar com a tabela usuarios).

**Arquivos:** `app/login/page.tsx`, `app/globals.css`.

---

## 2026-06-12 — Correção: fichas saíam 2 por página na impressão

**O que mudou (bug reportado):** ao imprimir, duas fichas caíam na mesma
página. O `page-break-after: always` não era respeitado de forma consistente.
Trocado pelo padrão confiável de "um por página": `page-break-before: always`
em cada ficha após a primeira (`.ficha-impressao + .ficha-impressao`) +
`break-inside: avoid` para não partir uma ficha no meio. Também adicionado
`print-color-adjust: exact` para as faixas coloridas do cabeçalho saírem na
impressão. Verificar via Ctrl+P (mudança só em @media print).

**Arquivos:** `app/globals.css`.

---

## 2026-06-12 — Balão de ajuda no estilo "Partitura"

**O que mudou:** o balão flutuante do (?) ganhou a identidade do sistema —
fundo marfim (--cartao), borda firme em tinta evergreen, barra vinho de 5px à
esquerda (assinatura dos alertas) e sombra dura (offset 4px sem blur), no
lugar do balão escuro genérico. Verificado via estilos computados.

**Arquivos:** `components/CrudManager.tsx`.

---

## 2026-06-12 — Ajuda (?) virou balão flutuante no hover

**O que mudou (preferência do usuário):** a ajuda dos campos deixou de
expandir uma caixa inline (que empurrava o formulário) e passou a ser um
**balão flutuante** que aparece ao passar o mouse (ou focar pelo teclado) no
(?). Renderizado em portal no `<body>` com posição fixed calculada a partir
do ícone (centralizado, com flip para cima quando perto do rodapé), z-index
alto e `pointer-events:none` — nunca é cortado pelo modal. Some ao tirar o
mouse/foco. Conteúdo das dicas inalterado.

**Arquivos:** `components/CrudManager.tsx`.

---

## 2026-06-12 — Ajuda contextual (?) nos campos dos modais

**O que mudou (pedido do usuário, foco em leigos):** todo campo de cadastro
pode ter uma `dica` que aparece como um botão **(?)** ao lado do rótulo;
clicar abre/fecha uma caixa com a explicação em linguagem simples. Mecanismo
único no `CrudManager` (vale para todos os modais). Dicas escritas para os
campos com jargão: Tarefas (regra de cálculo, tempo base, quantidade,
frequência, restrição de gênero, etc.), Funcionários (jornada/intervalo),
Locais (metragem/tipo), Parâmetros (chave/valor/escopo) e Usuários (perfil).
Reseta ao abrir/trocar registro. Verificado: 9 campos com (?) no modal de
tarefa, explicação expande ao clicar.

**Arquivos:** `components/CrudManager.tsx`, `app/(app)/tarefas/page.tsx`,
`app/(app)/funcionarios/page.tsx`, `app/(app)/locais/page.tsx`,
`app/(app)/parametros/page.tsx`, `app/(app)/usuarios/page.tsx`.

---

## 2026-06-12 — PDF de apresentação para a diretoria

**O que mudou:** gerado `Orkestria-Contexto.pdf` (na raiz) — versão formatada
do contexto do sistema para o diretor, com a identidade visual (capa com o
símbolo vetorial, cores vinho/evergreen sobre marfim, tabelas e caixas).
Conteúdo fiel ao `CONTEXTO-IA.md`, em linguagem de gestão. Gerador
reproduzível em `scripts/gerar-pdf-contexto.py` (reportlab) — basta rodar
`python scripts/gerar-pdf-contexto.py` para regenerar quando o sistema evoluir.
Cuidado registrado: fonte Helvetica não tem `→`/`−` (usar `›`/`-`) e o texto
de cabeçalho de tabela precisa de cor clara (senão some no fundo verde).

**Arquivos:** `scripts/gerar-pdf-contexto.py`, `Orkestria-Contexto.pdf`.

---

## 2026-06-12 — Restrição de gênero por tarefa (ex.: banheiro feminino)

**O que mudou (pedido do usuário):** tarefas podem exigir gênero específico do
executante. Campo `restricao_genero` na Tarefa (`""`/`feminino`/`masculino`,
opcional p/ compatibilidade). A agenda **bloqueia** (erro `RESTRICAO_GENERO`,
não autorizável) alocar tarefa restrita para funcionário de gênero
incompatível — no cliente e no servidor (`validarAlocacao`).
- Tela de Tarefas: select "Restrição de gênero" + coluna/selo (♀/♂).
- Paleta: marcador ♀/♂ no card da tarefa restrita.
- Cobertura de ausência: só sugere colegas de gênero compatível.
- Seed demo: banheiro feminino → mulheres, masculino → homens.
- Verificado no Firebase real: José (masc.) bloqueado (422), Maria (fem.)
  permitida (201), campo persistido.
- **Nota**: tarefas migradas antes deste campo não têm restrição — definir
  editando a tarefa (ex.: "Higienização de banheiro").

**Arquivos:** `types/comum.ts`, `types/Tarefa.ts`, `lib/schema.ts`,
`lib/memoryStore.ts`, `lib/validations.ts`, `app/(app)/tarefas/page.tsx`,
`components/agenda/TaskPalette.tsx`, `components/agenda/CoberturaPanel.tsx`.

---

## 2026-06-12 — Correção: filtros da paleta estouravam a caixa

**O que mudou:** os `<select>` de Andar/Tipo/Prioridade na paleta de tarefas
vazavam para fora do painel. Causa: colunas `1fr 1fr` têm `min-width:auto`,
então o select (que não encolhe abaixo da maior opção) empurrava a coluna.
Corrigido com `minmax(0,1fr)` nas colunas e `width:100%/minWidth:0/
box-sizing:border-box` nos selects e no input. Verificado: nenhum elemento
ultrapassa a borda da paleta (260px).

**Arquivos:** `components/agenda/TaskPalette.tsx`.

---

## 2026-06-12 — Deploy na Vercel + correção da logo (middleware 307)

**O que mudou:** sistema publicado em https://orkestria-christus.vercel.app
(repositório renomeado para `napa14-design/Orkestria`; remote atualizado).
- **Bug corrigido**: o `matcher` do middleware não excluía arquivos da pasta
  `public/`, então requisições de imagens por usuário deslogado (a logo na
  própria tela de login) eram redirecionadas para `/login` com HTTP 307 em
  vez de servir o PNG. Adicionadas extensões estáticas (png/jpg/svg/…/woff)
  à exceção do matcher. Verificado no ar: todos os assets agora HTTP 200.
- **Lembrete de produção**: na Vercel as variáveis do `.env` são cadastradas
  uma a uma (Environment Variables); `FIREBASE_PRIVATE_KEY` com `\n` literais
  e sem aspas; `COOKIE_SECURE=true` (HTTPS).

**Arquivos:** `middleware.ts`.

---

## 2026-06-12 — Correção: modal colado no menu superior

**O que mudou (bug reportado pelo usuário):** os modais abriam "colados" no
menu e sem escurecer o cabeçalho. Causa raiz: o transform residual das
classes de animação `.entra` (containing block para `position:fixed` — o
modal se posicionava em relação ao conteúdo, não à janela). Correções:
- **Modal agora renderiza em portal no `<body>`** (`createPortal`) — imune a
  qualquer ancestral com transform/animação. Vale para todos os modais
  (cadastros, acompanhamento, planejamento).
- Animações `.entra*` trocadas de `both` para `backwards` (não deixam
  transform residual após terminar).
- **Título do modal agora é sticky**: ao rolar formulários longos em telas
  de 700px, "Novo — X" e o botão fechar continuam visíveis.

Verificado em 1300×700: overlay cobre a janela inteira (cabeçalho escurece),
modal centralizado com folga acima/abaixo, título fixo na rolagem.

**Arquivos:** `components/Modal.tsx`, `app/globals.css`.

---

## 2026-06-12 — Sedes grandes (50+ ASGs) e logos horizontais

**O que mudou:**
- **Paginação de colunas na agenda**: a tela de rotina agora mostra **8
  funcionários por vez** (ordenados alfabeticamente), com barra
  "‹ Funcionários 1–8 de N ›" que só aparece quando a sede tem mais que 8.
  Equipe/cobertura continuam considerando todos; clicar num nome na lista da
  equipe **pula automaticamente para a página** daquela coluna.
- **Busca por funcionário** nos filtros do topo (filtra colunas, equipe e
  cobertura; reseta a página).
- Testado de ponta a ponta com 7 funcionários temporários criados no
  Firestore real (10 no total → 2 páginas, busca, salto de página) e
  removidos ao final.
- **Logos horizontais** (novas artes do usuário) copiadas para
  `public/logo-horizontal-fundo-{claro,escuro}.png` (nomeadas pelo fundo de
  uso): a versão para fundo escuro substituiu símbolo+texto no **cabeçalho**
  (52px) e a clara entrou no cabeçalho das **fichas impressas**.

**Arquivos:** `app/(app)/rotinas/page.tsx`, `components/agenda/FiltersBar.tsx`,
`components/AppShell.tsx`, `app/(app)/rotinas/imprimir/page.tsx`,
`public/logo-horizontal-*.png`.

---

## 2026-06-12 — Responsividade (alvo: notebook 1366×768)

**O que mudou:** breakpoints adicionados ao design system
(`app/globals.css`). Alvo principal confirmado pelo usuário: notebooks
~1300×700 — verificado: paleta 260 + agenda 682 (3 colunas de funcionários)
+ resumo 280, sem estouro.
- **< 1000px**: a tela de rotina empilha (`.linha-rotina` vira coluna) —
  paleta e resumo em largura total, agenda inteira visível (antes ficava com
  4px). Classes novas: `.paleta-tarefas`, `.resumo-lateral`.
- **< 720px**: utilitários `.so-desktop`/`.so-mobile` — o **Acompanhamento
  vira cards empilhados** (funcionário, tarefa, horários, desvio, botão
  registrar em largura total), pensado para o supervisor andando pelo prédio
  com o celular; a tabela some. Nome do usuário some do cabeçalho.
- **< 560px**: formulários de modal (`.form-grade`) viram 1 coluna.
- **Limitação conhecida**: montar rotina por toque (drag-and-drop não existe
  em touch) ficou de fora por decisão — caso de uso real é desktop.

**Arquivos:** `app/globals.css`, `components/agenda/TaskPalette.tsx`,
`components/agenda/OccupancySummary.tsx`, `components/CrudManager.tsx`,
`components/AppShell.tsx`, `app/(app)/rotinas/page.tsx`,
`app/(app)/acompanhamento/page.tsx`.

---

## 2026-06-12 — Arte oficial da logo (PNG) no login

**O que mudou:** o usuário colocou os PNGs da logo na raiz do projeto.
Copiados para `public/` com nomes pelo fundo de uso (atenção — os nomes
originais eram pelo tom do texto, o inverso):
- `public/logo-fundo-claro.png` ← `Logo-escuro.png` (wordmark evergreen,
  para fundos claros/marfim)
- `public/logo-fundo-escuro.png` ← `Logo-claro.png` (wordmark marfim,
  para fundos escuros)

Ambos 1254×1254 com fundo transparente (alpha verificado). O **login agora
usa a arte oficial completa** (símbolo + wordmark + tagline) no lugar do
conjunto recriado em vetor; h1 ficou visualmente oculto para acessibilidade.
O cabeçalho e as fichas seguem com o símbolo vetorial (sem tagline).
Os PNGs originais continuam na raiz (podem ser apagados).

**Arquivos:** `public/logo-fundo-{claro,escuro}.png`, `app/login/page.tsx`.

---

## 2026-06-12 — Conjunto da logo fiel à arte + fantasma de drop na agenda

**O que mudou (feedback do usuário):**
- **Logo como conjunto fiel à arte**: o login agora mostra o lockup completo
  centralizado — símbolo 112px, wordmark "Orkestria" em cor única (sem o "ia"
  destacado) e a tagline "Planeje · Distribua · Otimize · Evolua" com filetes
  vinho laterais, como na arte original. O cabeçalho usa símbolo + wordmark
  sem a tagline. (A arte PNG veio pelo chat — sem o arquivo, o conjunto foi
  recriado em vetor; se o usuário salvar em `public/logo.png` dá para usar a
  arte exata.)
- **Fantasma de drop**: ao arrastar uma tarefa, em vez do tracejado na coluna
  inteira, agora aparece um fantasma tracejado **do tamanho exato da tarefa
  (blocos × altura)** no slot onde ela cairá, com o horário de início no
  canto. Segue o mouse, some ao soltar ou cancelar o arrasto. Implementação:
  estado `blocosArrasto` na página (setado no dragstart da paleta e dos
  cards), prévia `{funcionarioId, slot}` no AgendaGrid; o fantasma só
  renderiza enquanto há item em arrasto.

**Arquivos:** `components/agenda/AgendaGrid.tsx`,
`components/agenda/TaskPalette.tsx`, `app/(app)/rotinas/page.tsx`,
`app/login/page.tsx`, `components/AppShell.tsx`, `app/globals.css`
(removido `.coluna-drop-ativa`).

---

## 2026-06-12 — Logo oficial integrada (símbolo vetorial + favicon)

**O que mudou:** o usuário criou a logo da Orkestria (o "O" em vinho
atravessado pela batuta de maestro, com barras de crescimento dentro;
tagline "Planeje. Distribua. Otimize. Evolua."). Integração feita:
- **Símbolo recriado em SVG vetorial** como componente React
  (`components/LogoOrkestria.tsx`) com variantes `claro` (barras evergreen)
  e `escuro` (barras marfim) + arquivos standalone em
  `public/logo-simbolo-{claro,escuro}.svg` para uso externo.
- **Favicon** (`app/icon.svg`): versão simplificada do símbolo (O + batuta,
  sem barras — que somem em 16px), servida automaticamente pelo Next.
- **Aplicada em**: cabeçalho do app (símbolo 30px + wordmark), tela de login
  (símbolo 88px + tagline em vinho) e fichas de rotina impressas (símbolo 40px
  no cabeçalho de cada ordem de serviço).

**Arquivos:** `components/LogoOrkestria.tsx`, `app/icon.svg`,
`public/logo-simbolo-*.svg`, `components/AppShell.tsx`,
`app/login/page.tsx`, `app/(app)/rotinas/imprimir/page.tsx`.

---

## 2026-06-12 — 🎼 Novo nome (Orkestria) e identidade visual "Partitura"

**O que mudou:**
- **Rename completo**: o sistema agora se chama **Orkestria** ("porque ele
  orquestra as rotinas") — substituído em código, UI (logo "Orkestr·ia"),
  docs, package.json e launch.json.
- **Nova identidade "Partitura"** (escolhida pelo usuário entre 3 direções
  propostas a partir das paletas que ele enviou): marfim de papel de partitura
  (#F5F1E6), tinta evergreen (#223127), **vinho amaranto (#9C0D38)** como
  acento/marca; status retonalizados (azul #2F5D9E, verde #2E7D52, vermelho
  #C73A2B, laranja #D97C26). Fontes: **Fraunces** (display serif), **Albert
  Sans** (corpo), **Spline Sans Mono** (números). Direções descartadas:
  "Maestro" (dark + latão) e "Pauta serena" (slate + celadon).
- **Bug corrigido**: as classes de fonte do next/font estavam no `<body>`,
  mas os tokens `--fonte-*` do globals.css vivem no `:root` — as fontes nunca
  renderizaram desde o início do projeto (caíam no fallback do navegador).
  Movidas para o `<html>`; agora Fraunces/Albert Sans/Spline Sans Mono
  carregam de verdade.

**Arquivos:** `app/layout.tsx` (fontes + fix), `app/globals.css` (paleta),
`components/AppShell.tsx` e `app/login/page.tsx` (marca), rename em ~16
arquivos, `CLAUDE.md`/`CONTEXTO-IA.md`/`docs/05` (identidade e nome).

---

## 2026-06-12 — 🚀 Firebase Firestore EM PRODUÇÃO

**O que mudou:** o usuário ativou o Firestore no console e a configuração foi
concluída de ponta a ponta. **`DATA_SOURCE=firebase` é agora a fonte oficial
de dados** — os dados persistem de verdade (reiniciar o servidor não zera mais
nada).

- Banco "(default)" confirmado no projeto `ociosidade-88ce4`.
- Migração executada (`POST /api/migrar-firebase`): 3 usuários, 3 sedes,
  5 funcionários, 9 locais, 11 tarefas, 9 parâmetros, 3 rotinas, 1 ausência.
- Verificado contra o Firestore real: login (usuarios na nuvem), leituras,
  criação de rotina com validação (conflito → 422), exclusão e histórico de
  auditoria gravado.
- **Os dados atuais são os de demonstração** — basta editar/cadastrar por cima
  pelas telas do sistema.
- Pendência seguinte da Fase 3: Firebase Authentication (senha individual).

**Arquivos:** `.env` (DATA_SOURCE=firebase — não versionado).

---

## 2026-06-12 — Configuração do Firebase real (em andamento)

**O que mudou:** o usuário forneceu o service account do projeto Firebase
`ociosidade-88ce4`. Criado o `.env` com as credenciais (DATA_SOURCE ainda em
`memory`) e o script `scripts/firestore-setup.mjs`, que verifica/cria o banco
Firestore "(default)" em southamerica-east1 e tenta ativar a API.

**Bloqueio encontrado:** a **Cloud Firestore API está desativada** no projeto
e o service account não tem permissão para ativá-la (exige Editor/Owner).
Aguardando o usuário ativar a API (1 clique) ou criar o banco pelo console do
Firebase. **Próximo passo após o desbloqueio:** rodar
`node scripts/firestore-setup.mjs`, depois `POST /api/migrar-firebase` logado
como admin, e por fim trocar `DATA_SOURCE=firebase` no `.env`.

**Arquivos:** `.env` (não versionado), `scripts/firestore-setup.mjs`.

---

## 2026-06-12 — Diário de mudanças e documentação para IA

**O que mudou:** criados o próprio `DIARIO.md` (este arquivo), o `CLAUDE.md`
(instruções automáticas para sessões do Claude Code neste projeto) e o
`CONTEXTO-IA.md` (documento autocontido para uma IA entender o sistema inteiro,
voltado à gerência).

**Arquivos:** `DIARIO.md`, `CLAUDE.md`, `CONTEXTO-IA.md`, `README.md`.

---

## 2026-06-12 — Fase 2 concluída: histórico, redimensionar, override e pendências

**O que mudou:**
- **Histórico de alterações** (tela `/historico` + 11ª aba/coleção `historico`):
  toda escrita em qualquer tabela é registrada automaticamente com autor, ação,
  campos alterados e horário. Implementado como decorator do `DataSource`
  (`lib/historico.ts`) + AsyncLocalStorage com o e-mail da sessão
  (`lib/contextoUsuario.ts`) — nenhum serviço precisa logar manualmente.
- **Redimensionar card na agenda**: alça inferior (⠿⠿) arrastável em incrementos
  de bloco; servidor recalcula blocos/fim e revalida conflitos.
- **Autorização manual** (regras 6 e 7): conflito de intervalo/sobreposição
  agora pode ser autorizado com confirmação; a rotina recebe a marca
  "[Autorizado manualmente]" na observação. Demais bloqueios continuam rígidos.
- **Alerta de dias sem registro**: banner no Acompanhamento lista os dias da
  última semana com tarefas planejadas sem status; clique abre o dia.

**Arquivos:** `lib/historico.ts`, `lib/contextoUsuario.ts`, `lib/api.ts`,
`app/api/historico/`, `app/(app)/historico/`, `components/agenda/AgendaGrid.tsx`,
`services/rotinasService.ts` (forcar + tempo_previsto_min),
`app/(app)/rotinas/page.tsx`, `app/(app)/acompanhamento/page.tsx`.

---

## 2026-06-12 — Ajuste de tempos padrão, visão semanal e proteção contra exclusão

**O que mudou:**
- **Sugestão de ajuste de tempo padrão** (dashboard): com ≥3 execuções reais e
  mediana desviando ≥15% do previsto atual (parâmetros `min_execucoes_ajuste` e
  `desvio_ajuste_percentual`), o sistema sugere o novo tempo base respeitando a
  regra de cálculo (min/m², min/unidade, fixo) — aplicável com 1 clique.
- **Visão semanal**: alternância Dia/Semana na tela de rotina; grade
  funcionário × dia com resumo (tarefas, tempo, ocupação colorida, ausência);
  clique na célula abre o dia.
- **Inativar em vez de excluir**: exclusão de sede/funcionário/local/tarefa é
  bloqueada (HTTP 422) quando há histórico vinculado, com orientação a inativar.

**Arquivos:** `components/SugestoesAjuste.tsx`, `components/agenda/SemanaGrid.tsx`,
`components/agenda/FiltersBar.tsx`, `app/(app)/dashboard/page.tsx`,
`services/{funcionarios,tarefas,locais,sedes}Service.ts`, `types/Parametro.ts`,
`lib/calculations.ts` (mediana).

---

## 2026-06-12 — Ausências/cobertura, fichas imprimíveis e cobertura de frequência

**O que mudou:**
- **Ausências** (tela `/ausencias` + 10ª aba `ausencias`): falta, atestado,
  férias, folga por período. Coluna do ausente fica hachurada/bloqueada na
  agenda; alocação rejeitada no cliente e no servidor; duplicação/modelos pulam
  ausentes no destino.
- **Painel de cobertura**: tarefas planejadas de ausentes viram "órfãs", com
  sugestão de colegas ordenados por ociosidade e botão "Mover →".
- **Fichas de rotina imprimíveis** (`/rotinas/imprimir`, botão "🖨 Fichas"):
  ordem de serviço em papel por funcionário, com assinaturas, uma página por
  ficha (os ASGs não usam o sistema).
- **Painel "Ficou de fora hoje"**: tarefas diárias sem alocação + periódicas
  vencidas (semanal 7d, quinzenal 14d, mensal 30d, janela de 31 dias).

**Arquivos:** `types/Ausencia.ts`, `services/ausenciasService.ts`,
`app/api/ausencias/`, `app/(app)/ausencias/`, `components/agenda/CoberturaPanel.tsx`,
`components/agenda/PendenciasPanel.tsx`, `app/(app)/rotinas/imprimir/`,
`app/globals.css` (@media print).

---

## 2026-06-12 — Banco definitivo trocado para Firebase Firestore

**O que mudou:** a pedido do usuário, a Fase 3 deixou de ser Supabase e passou
a ser **Firebase Firestore**. Implementado `FirebaseDataSource`
(`lib/firebaseClient.ts`, firebase-admin, transação no atualizar),
`DATA_SOURCE=firebase` no factory, endpoint `POST /api/migrar-firebase`
(admin; copia todas as tabelas da fonte atual para o Firestore, idempotente) e
documentação `docs/07-migracao-firebase.md` (substituiu a de Supabase).
**Atenção:** ainda não testado contra um projeto Firestore real (sem
credenciais na máquina) — o primeiro `migrar-firebase` real é o teste final.

**Arquivos:** `lib/firebaseClient.ts`, `lib/datasource.ts`,
`app/api/migrar-firebase/`, `.env.example`, `docs/07-migracao-firebase.md`.

---

## 2026-06-12 — Modelos de rotina, exportação CSV e gestão de usuários

**O que mudou:**
- **Modelos de rotina** (9ª aba `modelos_rotina`): salvar o dia montado com um
  nome e aplicá-lo em qualquer período (datas + dias da semana); conflitos no
  destino são pulados e contados. Modal "⧉ Duplicar / Modelos" na tela de rotina.
- **Duplicar para período** (substituiu o prompt de data única).
- **Exportação CSV** (Excel pt-BR: separador `;`, BOM UTF-8) no dashboard e no
  acompanhamento, incluindo desvio e justificativa.
- **Tela de usuários** (`/usuarios`, só admin) com perfis e sede.

**Arquivos:** `services/modelosService.ts`, `app/api/modelos/`,
`components/agenda/ModalPlanejamento.tsx`, `lib/csv.ts`,
`app/(app)/usuarios/`, `app/api/usuarios/`.

---

## 2026-06-12 — Fase 2 iniciada: acompanhamento realizado × previsto

**O que mudou:** tela `/acompanhamento` para registrar o que de fato aconteceu:
status realizado (6 opções), horários/tempo real (com "calcular pelo horário"),
desvio em tempo real no modal e **justificativa obrigatória** quando o desvio
passa do parâmetro (30%) ou o status é crítico — validado no cliente e no
servidor. Dashboard ganhou KPI "Tempo realizado" e "Top 10 desvios previsto ×
realizado". Registrar execução sincroniza o status da rotina na agenda.

**Arquivos:** `app/(app)/acompanhamento/`, `services/execucoesService.ts`,
`app/(app)/dashboard/page.tsx`.

---

## 2026-06-12 — MVP completo (criação do projeto)

**O que mudou:** projeto criado do zero — Next.js 15 + React 19 + TypeScript.
- **Arquitetura**: frontend → API interna → serviços → `DataSource`
  (interface única; implementações em memória/demo e Google Sheets). A
  interface nunca sabe de onde vêm os dados.
- **Cadastros**: sedes, funcionários (jornada líquida automática), locais
  (sempre com sede), tarefas (sempre com local, sede herdada, 4 regras de
  cálculo), parâmetros (globais/por sede, com auditoria).
- **Agenda visual** (`/rotinas`): blocos de 30min parametrizáveis,
  drag-and-drop nativo, intervalo hachurado, validação dupla
  (cliente + servidor) de conflito/intervalo/expediente, alerta de sobrecarga,
  salvamento automático por ação, painel de ocupação
  (subutilizado/adequado/alta/sobrecarga).
- **Dashboard** com KPIs e rankings; **login** por e-mail cadastrado + senha
  única (cookie HMAC); permissões por perfil e por sede.
- **Modo demo** (`DATA_SOURCE=memory`) com dados de exemplo; setup automático
  das abas do Sheets (`POST /api/setup`).
- Documentação completa em `docs/01..07`.

**Decisões importantes:** campos em snake_case (espelham Sheets/Firestore);
cálculos puros em `lib/calculations.ts` (rodam no cliente e no servidor);
rotina guarda `tempo_previsto_min` (real, para produtividade) e
`tempo_visual_min` (arredondado em blocos, só para a agenda); cookie sem flag
`Secure` por padrão (uso interno em HTTP/LAN — ativar `COOKIE_SECURE=true`
atrás de HTTPS).

**Credenciais demo:** `admin@empresa.com` / `supervisor.aldeota@empresa.com` /
`gerencia@empresa.com` — senha `mudar123`.
