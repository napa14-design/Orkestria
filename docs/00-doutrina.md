# 00 — Doutrina do produto (regra arquitetural)

> **Este documento tem força de regra.** Nenhuma mudança que aumente a
> superfície do produto (tela, controle, campo ou decisão) entra sem passar
> pelo portão abaixo. Vale para pessoas e para sessões de IA.

## Princípio central

**Dados crescem; operação encolhe.**

O Orkestria existe para colocar as pessoas nas atividades certas, pelo tempo
certo. Toda vez que a base amadurece (sede, locais, tarefas, rota padrão,
qualificações), o ato diário do supervisor deve exigir **menos decisões**, não
mais. O arquétipo é o "Gerar o dia": um clique substituiu montar 40 blocos na
mão. Isso não é uma feature — é a tese. Feature boa tem data de validade.

A burocratização é o que acontece quando o sistema cresce nas duas pontas ao
mesmo tempo: mais dado **e** mais tela. A régua corrige isso:

> **Nada novo entra sem apagar algo velho da rotina do supervisor.**

## As três fases (separadas de propósito)

Não servir a implantação e a operação com a mesma superfície. A confusão nasce
daí.

- **Implantação** (acontece uma vez, pode ser pesada): importação de planilha,
  cadastros completos, kits de tarefa, replicação, ações em massa, correção da
  base. Vive num espaço que se visita raramente.
- **Operação diária** (tem que ser fina): **Central → exceção → resolver.**
- **Acompanhamento**: confirmar o realizado comum em um toque; abrir o
  formulário completo **apenas** para o desvio.

Ferramenta de implantação **não** mora no fluxo da Agenda. Se voltar, volta no
espaço de implantação — e nunca pode ser necessária para o caminho básico
funcionar.

**Dependência obrigatória de retorno:** toda ferramenta de implantação que
voltar por demanda observada deve trazer, na mesma entrega, seu gatilho
programável de aposentadoria. Sem o mecanismo que a faz desaparecer quando os
dados amadurecem, a ferramenta não retorna ao `main`.

## Hipótese mensurável (é uma curva, não um umbral)

> Um supervisor gera e valida um dia comum em **até 5 minutos**, decidindo
> somente sobre exceções.

Os 5 minutos são o **destino**. Com dado cru, ninguém os alcança — e isso é o
princípio funcionando, não uma falha. O que se mede é a **inclinação**: conforme
a rota padrão e o histórico se enchem, o tempo cai? Se cai, a doutrina funciona.
Se fica plano, algo quebrou. Meça a descida, não o ponto.

## O portão (obrigatório para mudanças que aumentam a superfície)

Só se aplica a mudanças que criam tela, controle, campo ou decisão. Correção de
bug, ajuste de texto e refino interno passam direto — o portão não pode virar a
nova burocracia.

Sem respostas concretas às cinco, a mudança não entra:

1. **Qual passo antigo esta mudança elimina?**
2. **Ela pertence à implantação ou à operação?**
3. **Como reduz o tempo dos cinco minutos?**
4. **Em que condição ela deixa de aparecer?** — Não vale intenção ("some quando
   a base amadurece"). Tem que ser um **gatilho que o sistema verifica sozinho**
   (ex.: "some quando a sede tem ≥N tarefas ativas com tempo válido"). Sem
   gatilho programável, a aposentadoria nunca acontece e a feature só acumula.
5. **O caminho básico continua completo sem atalhos nem conhecimento avançado?**
   — O dia mediano tem que ser feito pelo supervisor menos técnico, que ignora
   toda a esperteza (Ctrl+K, sugestões, favoritas). O esperto é bônus, nunca
   dependência.
6. **Isto pode ser derivado do dado que já existe?** — Se puder, derive. Um
   parâmetro novo não é uma decisão adiada: é uma decisão **transferida** para
   quem tem menos contexto que o sistema, e repetida em cada sede.

## Derivar antes de configurar

Configuração parece barata porque adia a decisão. Ela não adia: **transfere** —
para alguém que sabe menos do que o sistema, e uma vez por sede.

O caso que gerou esta regra: o horário de soltar uma tarefa na agenda era o
encaixe na grade, cujo passo é o parâmetro `bloco_agenda_min`. A CESIU herdou 30
min, e a rota real dela tem blocos começando em **todos os múltiplos de 5** —
resultado, **80% dos blocos estavam em horários que a própria agenda não deixava
reproduzir**. Dava para arrastar uma tarefa para fora e não dava para trazer de
volta.

A saída óbvia era configurar 5 min naquela sede. Ela tem três defeitos:

- alguém precisa **saber que o parâmetro existe** e qual o número certo;
- toda sede nova nasce com o problema, porque o padrão continua 30;
- e o número certo **piora outra coisa**: com passo de 5, a grade fica com 190
  linhas e encostar uma tarefa na outra vira mira de 12px.

A saída certa foi **derivar**: soltar perto do fim de um bloco encaixa ali,
porque as bordas das tarefas **são o dado que já está na tela**. Nenhuma
configuração, nenhuma sede especial, e funciona melhor onde a rota é mais fina.

Três exemplos do mesmo movimento no código, para reconhecer o padrão:

- **`CAPACIDADE_TAREFAS`** (ficha impressa) é calculada da geometria — um laço
  acha o último `n` que não colide — em vez de um número escrito à mão que
  envelhece no próximo ajuste de layout.
- **`FATOR_POR_TIPO_LOCAL`** preenche o fator de intensidade pelo tipo do local;
  o valor digitado vence quando existe. **Derivado por padrão, configurável por
  exceção** — esta é a forma preferida quando a configuração precisa existir.
- **`bloco_agenda_min`**, depois do ímã, deixou de governar o que se pode
  planejar e virou só o passo do vazio. O parâmetro não sumiu; parou de ser um
  obstáculo.

Quando a configuração tiver mesmo de existir, uma última pergunta: **quem pode
mudar?** Número que serve para *medir a operação* não pode ser editável por quem
é medido — senão a medida vira opinião.

## A exceção também é uma decisão curta

"Central → exceção → resolver" só é fino se o **resolver** couber em uma decisão.
Se cobrir uma falta exige um sub-fluxo de seis cliques, a gordura só mudou de
lugar. A exceção é tão fina quanto o dia comum.

## Responsabilidade de quem revisa

Revisar deixou de ser só arquitetura, testes e UI. Passa a incluir o **orçamento
de complexidade do operador**. Uma implementação pode estar tecnicamente
impecável e ainda assim ser **rejeitada** porque acrescenta uma decisão
cotidiana. O custo diário é um veredito legítimo.

## Como medir progresso

Pare de medir por *features entregues*. Meça por *passos removidos do dia do
supervisor*. Quando "o que fizemos este mês" for respondido com "tiramos dois
cliques do fechamento" em vez de "adicionamos três telas", a burocratização
morreu na raiz.
