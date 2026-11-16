import type { Auditoria } from "./comum";

/**
 * Empresa que registra o funcionário — lista FECHADA com cadastro (decisão do dono,
 * 13/11/2026). Mantida pelo administrador; o funcionário só aceita empresa ativa
 * daqui. `nome` é sempre a grafia de `normalizarEmpresa` ("APEL MATRIZ") e não se
 * renomeia: a mesma grafia vai para o Quadro da Infra (Chromos).
 */
export interface Empresa extends Auditoria {
  id: string;
  nome: string;
  ativo: boolean;
}
