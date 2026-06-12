# Migração — Google Sheets → Firebase Firestore (Fase 3)

O banco definitivo do sistema é o **Firebase Firestore**. A arquitetura já foi
desenhada para a troca: o `FirebaseDataSource`
([lib/firebaseClient.ts](../lib/firebaseClient.ts)) implementa a mesma
interface `DataSource` dos demais — **frontend e serviços não mudam nada**.

## Modelo no Firestore

Cada tabela vira uma **coleção** com o mesmo nome
(`usuarios`, `funcionarios`, `sedes`, `locais`, `tarefas`,
`rotinas_planejadas`, `execucoes_realizadas`, `parametros`, `modelos_rotina`,
`ausencias`, `historico`);
cada registro é um **documento** cujo ID é o próprio campo `id`. Os campos são
exatamente os de [lib/schema.ts](../lib/schema.ts) — nenhuma transformação de
dados é necessária na migração.

## Passo a passo

### 1. Criar o projeto Firebase

1. Acesse <https://console.firebase.google.com> e crie um projeto
   (ex.: `orkestria`).
2. Em **Criação → Firestore Database**, clique em *Criar banco de dados* →
   modo **produção** → localização `southamerica-east1` (São Paulo).
3. Em **Configurações do projeto → Contas de serviço**, clique em
   **Gerar nova chave privada** e baixe o JSON.

### 2. Configurar o `.env`

Ainda com a fonte antiga ativa (`DATA_SOURCE=sheets` ou `memory`), adicione:

```env
FIREBASE_PROJECT_ID=orkestria
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@orkestria.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

(Os valores vêm do JSON baixado: `project_id`, `client_email`, `private_key`.)

### 3. Migrar os dados

1. Suba o sistema e faça login como administrador.
2. Execute (no console do navegador):

```js
fetch("/api/migrar-firebase", { method: "POST" }).then(r => r.json()).then(console.log)
```

3. Confira as contagens retornadas por tabela. A migração é **idempotente**
   (documentos usam o mesmo `id`; rodar de novo apenas sobrescreve).

### 4. Virar a chave

```env
DATA_SOURCE=firebase
```

Reinicie o servidor. Congele a planilha do Sheets (somente leitura) como
arquivo histórico.

### 5. Regras de segurança do Firestore

O acesso é feito **exclusivamente pelo firebase-admin no servidor** (que
ignora as regras), então bloqueie todo acesso de clientes:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

## O que melhora com o Firestore

| Aspecto | Sheets (provisório) | Firestore (definitivo) |
|---|---|---|
| Concorrência | escritas podem se entrelaçar | transações nativas (`atualizar` já usa) |
| Latência | ~0,5–2 s por operação | dezenas de ms |
| Cotas | ~300 leituras/min | 50k leituras/dia grátis, escala além |
| Backup | cópia manual | exportações agendadas (gcloud) |
| Escala | milhares de linhas | milhões de documentos |
| Edição manual indevida | qualquer um com a planilha | só pelo sistema (regras bloqueiam) |

## Limitações e como tratamos

- **Sem integridade referencial nativa** (é NoSQL): as regras de hierarquia
  (local→sede, tarefa→local) continuam garantidas pelos serviços — como já é
  hoje. Validação dupla cliente/servidor permanece.
- **Consultas**: os serviços hoje listam a coleção e filtram em memória (ok
  até dezenas de milhares de docs). Otimização futura: `where("data", "==", …)`
  em `rotinas_planejadas` com índice composto `(data, sede_id)`.
- **Auditoria**: os campos criado/atualizado continuam; um log de alterações
  pode ser adicionado depois com uma coleção `historico` alimentada nos
  serviços.

## Evoluções pós-migração

1. **Firebase Authentication** no lugar do cookie HMAC + senha única
   (e-mail/senha por usuário, reset de senha, MFA) — trocar apenas
   `lib/session.ts` e o login.
2. Consultas indexadas por data/sede nas rotinas (performance).
3. Exportação agendada do Firestore para backup (Cloud Storage).
4. Hospedagem: o Next.js pode ir para o Firebase App Hosting, Vercel ou
   continuar em servidor próprio — o Firestore funciona de qualquer origem.
