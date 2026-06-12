/** Registro do log de alterações (quem mudou o quê e quando). */
export interface RegistroHistorico {
  id: string;
  /** Nome da tabela alterada (funcionarios, rotinas_planejadas, …). */
  tabela: string;
  registro_id: string;
  acao: "criar" | "atualizar" | "excluir";
  /** Descrição curta: nome do registro criado ou campos alterados. */
  resumo: string;
  /** E-mail de quem fez a alteração ("sistema" quando automática). */
  usuario: string;
  criado_em: string;
}
