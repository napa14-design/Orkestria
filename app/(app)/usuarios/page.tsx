"use client";

import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import { fetcher } from "@/lib/clientApi";
import type { Sede, Usuario } from "@/types";

const PERFIS = [
  { valor: "administrador", rotulo: "Administrador" },
  { valor: "supervisor", rotulo: "Supervisor" },
  { valor: "visualizador", rotulo: "Visualizador/Gerência" },
];

const SELO_PERFIL: Record<string, string> = {
  administrador: "selo-vermelho",
  supervisor: "selo-azul",
  visualizador: "selo-cinza",
};

export default function PaginaUsuarios() {
  const { data: sedes } = useSWR<Sede[]>("/api/sedes", fetcher);
  const nomeSede = (id: string) =>
    id === "geral" ? "Geral (todas)" : (sedes?.find((s) => s.id === id)?.nome_sede ?? id);

  return (
    <CrudManager<Usuario>
      titulo="Usuários"
      subtitulo="Quem acessa o sistema. O perfil define as permissões; a sede limita o alcance dos supervisores. Acesso restrito a administradores."
      endpoint="/api/usuarios"
      textoNovo="+ Novo usuário"
      campos={[
        { key: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
        { key: "email", rotulo: "E-mail", tipo: "texto", obrigatorio: true, ajuda: "Usado no login" },
        { key: "perfil", rotulo: "Perfil", tipo: "select", obrigatorio: true, opcoes: PERFIS },
        {
          key: "sede_id",
          rotulo: "Sede",
          tipo: "select",
          obrigatorio: true,
          padrao: "geral",
          opcoes: [
            { valor: "geral", rotulo: "Geral (todas as sedes)" },
            ...(sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ],
        },
        { key: "ativo", rotulo: "Ativo", tipo: "checkbox", padrao: true },
      ]}
      colunas={[
        { key: "nome", rotulo: "Nome" },
        { key: "email", rotulo: "E-mail", render: (u) => <code className="num">{u.email}</code> },
        {
          key: "perfil",
          rotulo: "Perfil",
          render: (u) => (
            <span className={`selo ${SELO_PERFIL[u.perfil] ?? "selo-cinza"}`}>
              {PERFIS.find((p) => p.valor === u.perfil)?.rotulo ?? u.perfil}
            </span>
          ),
        },
        { key: "sede_id", rotulo: "Sede", render: (u) => nomeSede(u.sede_id) },
        {
          key: "ativo",
          rotulo: "Status",
          render: (u) => (
            <span className={`selo ${u.ativo ? "selo-verde" : "selo-cinza"}`}>
              {u.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
    />
  );
}
