import type { AlertaValidacao } from "@/types";

/** Erro lançado pelos serviços quando a validação de negócio bloqueia. */
export class ErroValidacao extends Error {
  alertas: AlertaValidacao[];

  constructor(alertas: AlertaValidacao[]) {
    super(alertas.map((a) => a.mensagem).join(" "));
    this.name = "ErroValidacao";
    this.alertas = alertas;
  }
}

export class ErroPermissao extends Error {
  constructor(mensagem = "Sem permissão para esta operação.") {
    super(mensagem);
    this.name = "ErroPermissao";
  }
}
