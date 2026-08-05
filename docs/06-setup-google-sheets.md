# Setup do Google Sheets (banco provisório)

## 1. Criar o projeto e o service account

1. Acesse <https://console.cloud.google.com> e crie um projeto (ex.: `orkestria`).
2. Em **APIs & Services → Library**, ative a **Google Sheets API**.
3. Em **IAM & Admin → Service Accounts**, crie uma conta de serviço
   (ex.: `orkestria-bot`). Não precisa de papéis no projeto.
4. Na conta criada, aba **Keys → Add key → JSON**. Baixe o arquivo.

## 2. Criar e compartilhar a planilha

1. Crie uma planilha no Google Sheets (ex.: "Orkestria — Base de Dados").
2. Clique em **Compartilhar** e adicione o e-mail do service account
   (algo como `orkestria-bot@projeto.iam.gserviceaccount.com`) como **Editor**.
3. Copie o ID da planilha — o trecho da URL entre `/d/` e `/edit`.

## 3. Configurar o `.env`

Copie `.env.example` para `.env` e preencha:

```env
DATA_SOURCE=sheets
GOOGLE_SHEETS_SPREADSHEET_ID=<id da planilha>
GOOGLE_SERVICE_ACCOUNT_EMAIL=orkestria-bot@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
AUTH_SECRET=<string aleatória longa>
```

> A chave privada vem do campo `private_key` do JSON baixado. Mantenha as
> quebras de linha como `\n` dentro de aspas duplas.

## 4. Criar as abas e cabeçalhos automaticamente

1. Antes do primeiro setup é preciso conseguir logar. Crie manualmente a aba
   `usuarios` com a linha 1:
   `id | nome | email | perfil | sede_id | senha_hash | ativo | criado_em | atualizado_em | sedes_extra | convite_hash | convite_expira_em`
   e uma linha 2 com seu usuário (deixe `senha_hash` vazio):
   `u1 | Seu Nome | voce@empresa.com | administrador | geral |  | TRUE | 2026-01-01 | 2026-01-01 |  |  | `
2. Suba o sistema (`npm run dev`) e entre com **Google** — é o único caminho
   antes de existir alguém para gerar o seu código de primeiro acesso. Depois,
   em Sistema › Usuários, você gera o código dos demais.
3. Execute o setup (cria as 8 abas e todos os cabeçalhos):

```powershell
# com o cookie de sessão do navegador, ou via fetch no console do navegador:
fetch("/api/setup", { method: "POST" }).then(r => r.json()).then(console.log)
```

4. Preencha a aba `parametros` com os valores iniciais (ou cadastre pela tela
   **Parâmetros** do próprio sistema):

```
bloco_agenda_min | 30 | numero | Tamanho do bloco da agenda em minutos | geral | TRUE | TRUE
ocupacao_baixa | 60 | percentual | Limite para considerar subutilização | geral | TRUE | TRUE
ocupacao_adequada | 85 | percentual | Limite para ocupação adequada | geral | TRUE | TRUE
ocupacao_alta | 100 | percentual | Limite para alta ocupação/sobrecarga | geral | TRUE | TRUE
desvio_justificativa_percentual | 30 | percentual | % de desvio que exige justificativa | geral | TRUE | TRUE
```

## 5. Boas práticas com a planilha

- **Não renomeie as abas nem as colunas** — os nomes são o contrato com o código.
- Evite editar linhas manualmente enquanto supervisores usam o sistema
  (a exclusão de linhas desloca índices; o sistema localiza por `id`, mas
  edições simultâneas manuais podem conflitar).
- A coluna `id` é gerada pelo sistema (UUID) — não preencha à mão, exceto no
  usuário inicial.
- Faça backup periódico (Arquivo → Fazer uma cópia) até a migração ao Firebase.
