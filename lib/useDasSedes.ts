"use client";

import useSWR from "swr";
import { useSessao } from "@/components/SessaoContexto";
import { fetcher } from "@/lib/clientApi";
import { sedesPermitidas } from "@/lib/permissions";

/**
 * Lista de um recurso (`funcionarios`, `locais`…) de TODAS as sedes que a
 * pessoa opera.
 *
 * Sem `?sede`, a API devolve ao coordenador só a sede PRINCIPAL — de propósito,
 * cada consulta é de uma sede (`limitarSedeConsulta`). Quem opera uma sede extra
 * não a via em nenhuma tela que pedia a lista sem sede: Parquelândia 2 sumia dos
 * Serviços eventuais, das Ausências, do Painel… (relatos de 21/10/2026). Aqui é
 * uma chamada por sede, juntadas; quem vê todas as sedes continua numa só.
 *
 * Chave SWR própria para várias sedes: depois de gravar, revalide com
 * `mutate((k) => typeof k === "string" && k.includes(recurso))`.
 *
 * `query` nulo = não buscar (ex.: período inválido), como chave nula no SWR.
 */
export function useDasSedes<T>(recurso: string, query: string | null = "") {
  const sessao = useSessao();
  const sedes = sessao ? sedesPermitidas(sessao) : null;
  const umaChamada = `/api/${recurso}${query ? `?${query}` : ""}`;
  const chave =
    query === null ? null : sedes && sedes.length > 1 ? `${recurso}-das-sedes:${sedes.join(",")}?${query}` : umaChamada;
  return useSWR<T[]>(chave, (c: string): Promise<T[]> =>
    c === umaChamada
      ? (fetcher(c) as Promise<T[]>)
      : Promise.all(
          sedes!.map(
            (id) => fetcher(`/api/${recurso}?${query ? `${query}&` : ""}sede=${encodeURIComponent(id)}`) as Promise<T[]>,
          ),
        ).then((listas) => listas.flat()),
  );
}
