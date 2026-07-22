export type ItemNavegacao = {
  href: string;
  rotulo: string;
  apenasAdmin?: boolean;
};

export type GrupoNavegacao = {
  rotulo: string;
  itens: ItemNavegacao[];
};

/** Menu organizado por intenção: do dia a dia → números → cadastros → sistema. */
export const GRUPOS_NAVEGACAO: GrupoNavegacao[] = [
  {
    rotulo: "Operação",
    itens: [
      { href: "/inicio", rotulo: "Início" },
      { href: "/rotinas", rotulo: "Rotina do dia" },
      { href: "/acompanhamento", rotulo: "Acompanhamento" },
      { href: "/conferir", rotulo: "Conferir ficha" },
      { href: "/eventuais", rotulo: "Serviços eventuais" },
      { href: "/remanejo", rotulo: "Remanejo entre sedes", apenasAdmin: true },
    ],
  },
  {
    rotulo: "Painéis",
    itens: [
      { href: "/dashboard", rotulo: "Dashboard" },
      { href: "/panorama", rotulo: "Panorama de sedes" },
      { href: "/capacitacoes", rotulo: "Capacitações" },
      { href: "/produtividade", rotulo: "Produtividade" },
      { href: "/relatorios", rotulo: "Relatórios" },
    ],
  },
  {
    rotulo: "Pessoas",
    itens: [
      { href: "/funcionarios", rotulo: "Funcionários" },
      { href: "/ausencias", rotulo: "Ausências" },
      { href: "/tempos", rotulo: "Tempos por pessoa" },
      { href: "/qualificacoes", rotulo: "Qualificações" },
    ],
  },
  {
    rotulo: "Estrutura",
    itens: [
      { href: "/importar", rotulo: "Importar rota (planilha)" },
      { href: "/sedes", rotulo: "Sedes" },
      { href: "/locais", rotulo: "Locais" },
      { href: "/tarefas", rotulo: "Tarefas" },
      { href: "/categorias", rotulo: "Categorias", apenasAdmin: true },
      { href: "/requisitos", rotulo: "Requisitos", apenasAdmin: true },
      { href: "/periodos-letivos", rotulo: "Calendário acadêmico", apenasAdmin: true },
    ],
  },
  {
    rotulo: "Sistema",
    itens: [
      { href: "/da-ata", rotulo: "Da ata ao sistema" },
      { href: "/parametros", rotulo: "Parâmetros" },
      { href: "/historico", rotulo: "Histórico" },
      { href: "/usuarios", rotulo: "Usuários", apenasAdmin: true },
    ],
  },
];
