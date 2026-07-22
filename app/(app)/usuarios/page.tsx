"use client";

import { useState } from "react";
import useSWR from "swr";
import CrudManager from "@/components/CrudManager";
import Modal from "@/components/Modal";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
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

  const [alvo, setAlvo] = useState<Usuario | null>(null);
  const [senha, setSenha] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");

  async function salvarSenha() {
    if (!alvo) return;
    setEstado("enviando");
    setMsg("");
    try {
      await apiPost(`/api/usuarios/${alvo.id}/senha`, { senha });
      setEstado("ok");
      setMsg(`Senha individual definida para ${alvo.nome}. A partir de agora ele entra só com ela.`);
    } catch (e) {
      setEstado("erro");
      setMsg(e instanceof ErroApi ? e.message : "Erro ao definir senha.");
    }
  }

  return (
    <>
    <CrudManager<Usuario>
      titulo="Usuários"
      subtitulo="Quem acessa o sistema. O perfil define as permissões; a sede limita o alcance dos supervisores. Acesso restrito a administradores."
      endpoint="/api/usuarios"
      textoNovo="+ Novo usuário"
      filtrosRapidos={[
        {
          valor: "sede_invalida",
          rotulo: "Sede inexistente",
          testar: (u) =>
            u.ativo &&
            u.sede_id !== "geral" &&
            Boolean(sedes) &&
            !sedes!.some((s) => s.id === u.sede_id),
        },
        {
          valor: "supervisores",
          rotulo: "Supervisores",
          testar: (u) => u.perfil === "supervisor",
        },
      ]}
      campos={[
        { key: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
        {
          key: "email",
          rotulo: "E-mail",
          tipo: "texto",
          obrigatorio: true,
          ajuda: "Usado no login",
          dica: "O e-mail com que a pessoa entra no sistema. É também por ele que o histórico registra quem fez cada alteração.",
        },
        {
          key: "perfil",
          rotulo: "Perfil",
          tipo: "select",
          obrigatorio: true,
          opcoes: PERFIS,
          dica: "Define o que a pessoa pode fazer. • ADMINISTRADOR: acesso total, em todas as sedes (inclui cadastrar usuários). • SUPERVISOR: monta rotinas e cadastra, mas só na própria sede. • VISUALIZADOR/GERÊNCIA: só consulta dashboards e relatórios, não altera nada.",
        },
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
          dica: "A qual sede o usuário pertence. Para supervisor, limita o que ele enxerga e edita àquela sede. Administrador e gerência costumam usar \"Geral\" (todas as sedes).",
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
        {
          key: "sede_id",
          rotulo: "Sede",
          render: (u) => {
            const invalida =
              u.sede_id !== "geral" &&
              Boolean(sedes) &&
              !sedes!.some((s) => s.id === u.sede_id);
            return invalida ? (
              <span className="selo selo-vermelho" title={`Vínculo inválido: ${u.sede_id}`}>
                sede inexistente
              </span>
            ) : (
              nomeSede(u.sede_id)
            );
          },
        },
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
      acoesExtra={(u) => (
        <button
          className="btn btn-mini btn-fantasma"
          onClick={() => {
            setAlvo(u);
            setSenha("");
            setEstado("idle");
            setMsg("");
          }}
        >
          Senha
        </button>
      )}
    />

    <Modal titulo={`Definir senha — ${alvo?.nome ?? ""}`} aberto={!!alvo} aoFechar={() => setAlvo(null)} larguraMax={420}>
      <p style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 14 }}>
        Define a senha individual de <strong>{alvo?.email}</strong>. Depois disso, esse usuário
        entra <em>apenas</em> com ela (a senha única deixa de valer para ele).
      </p>
      <label className="campo" style={{ marginBottom: 14 }}>
        <span className="rotulo">Nova senha</span>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
      </label>
      {msg && (
        <div className={`alerta ${estado === "erro" ? "alerta-erro" : "alerta-ok"}`} style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn" onClick={() => setAlvo(null)}>
          {estado === "ok" ? "Fechar" : "Cancelar"}
        </button>
        {estado !== "ok" && (
          <button type="button" className="btn btn-primario" onClick={salvarSenha} disabled={estado === "enviando" || senha.length < 4}>
            {estado === "enviando" ? "Salvando…" : "Definir senha"}
          </button>
        )}
      </div>
    </Modal>
    </>
  );
}
