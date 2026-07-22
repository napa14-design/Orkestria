# Auditoria do ORK4 — veredito antes de integração

Data: 2026-07-22  
Origem analisada: branch `codex-desburocratizacao-full`  
Decisão: **não integrar o ORK4 como está; manter ORK3 no piloto.**

## O problema é real

O ORK3 imprime nominalmente os EPIs e registra uma declaração única, mas não
leva esses nomes no QR. Na conferência, a lista é reconstruída usando as
tarefas e o catálogo atuais. Se um requisito for renomeado ou removido entre a
impressão e a leitura, o registro digital pode divergir do papel assinado.

O ORK4 da branch tenta fechar essa divergência acrescentando ao QR um snapshot
dos nomes de EPIs impressos. Na leitura, esse snapshot vence o catálogo atual e
uma mensagem avisa quando as listas divergem.

## O que está correto na implementação

- ORK1 continua casando por posição.
- ORK2 continua casando as tarefas pelos códigos impressos.
- ORK3 continua usando a declaração única e reconstruindo a lista pelo catálogo
  atual, preservando o comportamento das fichas já impressas.
- ORK4 reutiliza a geometria do ORK3; não muda caixas nem coordenadas do OMR.
- Separadores dos nomes são codificados com `encodeURIComponent`, evitando que
  `|` nos textos quebre os campos do payload.
- A branch documenta round-trip digital PDF → PNG → `jsQR` com 19 tarefas e
  quatro EPIs.

## Por que ainda não deve entrar

### 1. O QR ficou mais denso no mesmo espaço físico

O PDF imprime o QR em 52 pt, aproximadamente 18,34 mm. Com 19 códigos de linha:

| Payload | Caracteres | Versão QR | Módulos | Módulo impresso aproximado |
|---|---:|---:|---:|---:|
| sem nomes de EPI | 176 | 9 | 53 | 0,333 mm |
| snapshot de 4 EPIs reais | 312 | 13 | 69 | 0,258 mm |
| snapshot de 8 EPIs | 433 | 16 | 81 | 0,221 mm |

O round-trip digital da branch comprova a codificação, mas não comprova leitura
de papel impresso, fotocópia, câmera inclinada, iluminação ruim ou impressora
econômica. A mudança reduz a margem física justamente na evidência que precisa
ser mais confiável.

### 2. O snapshot não é autenticado

No ORK3, os nomes gravados vêm do catálogo consultado no servidor. No ORK4 da
branch, o leitor passa a aceitar nomes trazidos pelo próprio QR. Como o payload
não tem assinatura nem referência a um snapshot imutável emitido pelo servidor,
um QR fabricado pode fornecer outra lista para uma sede/data/funcionário reais.
O papel assinado reduz o risco operacional, mas o código não garante a origem
do conteúdo que será persistido.

### 3. Faltam casos adversos específicos da nova versão

O parser rejeita percent-encoding inválido, mas o aceite do ORK4 ainda precisa
cobrir snapshot ausente, payload truncado, lista excessiva e alteração maliciosa,
além da matriz física de impressão e captura.

## Condições para reconsiderar

O ORK4 só deve voltar ao `main` quando a mesma proposta entregar:

1. **Autenticidade**: snapshot imutável recuperado por identificador de emissão,
   ou payload compacto assinado e validado antes de usar os nomes.
2. **Densidade controlada**: formato compacto e/ou QR fisicamente maior, com
   limite explícito de payload.
3. **Teste físico**: impressão real, fotocópia e foto de celular em condições
   representativas, incluindo quatro EPIs e o limite aceito.
4. **Retrocompatibilidade automatizada**: ORK1, ORK2 e ORK3 antigos continuam
   legíveis; ORK4 truncado ou adulterado falha sem gravar.

Até essas condições existirem, o ORK3 é a escolha mais segura para o piloto. O
risco de o catálogo mudar entre impressão e conferência deve ser mitigado pelo
processo: não renomear nem remover EPIs com fichas abertas.
