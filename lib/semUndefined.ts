/**
 * Remove as chaves cujo valor é `undefined` antes de gravar.
 *
 * Por que existe: em TypeScript, campo opcional (`categoria_id?: string`) aceita
 * `undefined`, e escrever `{ categoria_id: undefined }` é idiomático — significa
 * "não tem". O banco de memória guarda isso sem reclamar; o **Firestore recusa o
 * documento inteiro**: `Cannot use "undefined" as a Firestore value`. O resultado
 * é uma falha que **não aparece em teste nem em desenvolvimento** e só derruba a
 * escrita em produção — foi assim que a primeira importação da CESIU parou no
 * meio, com os 86 locais criados e nenhuma tarefa.
 *
 * `undefined` em campo opcional quer dizer **ausente**, então apagar a chave é a
 * tradução exata — não é contornar o erro. Para **limpar** um campo já gravado, o
 * sistema usa string vazia (ex.: `validade: ""` na renovação de qualificações),
 * nunca `undefined`; por isso remover a chave num `atualizar` preserva o valor
 * antigo, que é o comportamento certo para "não mexi nesse campo".
 *
 * Só o primeiro nível: nenhum registro do `MapaTabelas` guarda objeto aninhado
 * (as listas viram CSV — ver `lib/schema.ts`).
 */
export function semUndefined<T extends object>(registro: T): T {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(registro)) {
    if (valor !== undefined) limpo[chave] = valor;
  }
  return limpo as T;
}

/**
 * Exige que o registro traga `id` preenchido.
 *
 * O `DataSource` usa o campo `id` COMO o id do documento; sem ele o Firestore
 * recebe `doc(undefined)` e estoura com mensagem que não diz o que houve. Pior:
 * um `.set()` avulso (fora do DataSource) pode gravar o documento **sem** o
 * campo, e aí a leitura funciona mas a edição pela tela quebra — foi o que
 * aconteceu com o `bloco_agenda_min` de três sedes, corrigido em 20/08.
 */
export function exigirId(tabela: string, registro: unknown): string {
  const id = (registro as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id === "" || id === "undefined") {
    throw new Error(
      `Registro de "${tabela}" sem id utilizável (recebido: ${JSON.stringify(id)}). ` +
        "O campo `id` é o id do documento — gravar sem ele deixa o registro ilegível para edição.",
    );
  }
  return id;
}
