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
      subtitulo="Quem acessa o sistema. O perfil define as permissões; as sedes limitam o alcance dos supervisores — um coordenador pode operar mais de uma. Acesso restrito a administradores."
      endpoint="/api/usuarios"
      textoNovo="+ Novo usuário"
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
          dica: "Define o que a pessoa pode fazer. • ADMINISTRADOR: acesso total, em todas as sedes (inclui cadastrar usuários). • SUPERVISOR: monta rotinas e cadastra, apenas nas sedes que opera (uma ou várias). • VISUALIZADOR/GERÊNCIA: só consulta dashboards e relatórios, não altera nada.",
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
          dica: "A sede principal do usuário — é ela que abre por padrão nas telas. Para supervisor, define o alcance básico; se ele cobre mais de uma sede, acrescente as outras no campo abaixo. Administrador e gerência costumam usar \"Geral\" (todas as sedes).",
        },
        {
          key: "sedes_extra",
          rotulo: "Outras sedes que ele opera",
          tipo: "multiselect",
          inteira: true,
          opcoes: (sedes ?? []).map((s) => ({ valor: s.id, rotulo: s.nome_sede })),
          ajuda: "Deixe vazio se ele cuida só da sede principal",
          dica:
            "Para o coordenador que cobre mais de uma sede. Ele passa a enxergar e editar todas as marcadas aqui, além da principal, trocando de sede num seletor — a Central e a Agenda mostram uma sede por vez. A sede principal já está incluída, não precisa marcar. Só aparece para supervisor com sede específica: administrador e gerência já alcançam todas.",
          // Escopo por sede só existe para supervisor; com "Geral" a lista não
          // significaria nada, porque ele já alcança todas.
          mostrarSe: (f) => f.perfil === "supervisor" && f.sede_id !== "geral",
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
            const extras = (u.sedes_extra ?? "").split(",").filter(Boolean);
            return (
              <>
                {nomeSede(u.sede_id)}
                {extras.length > 0 && (
                  <span
                    className="selo selo-azul"
                    style={{ marginLeft: 6 }}
                    title={`Também opera: ${extras.map(nomeSede).join(", ")}`}
                  >
                    +{extras.length}
                  </span>
                )}
              </>
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
