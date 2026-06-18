"use client";

/**
 * Conferir ficha (OCR/OMR) — o supervisor sobe/fotografa a ficha de papel; o
 * NAVEGADOR lê o QR e mede as caixas "Feito" (lib/omr.ts), casa com as rotinas
 * planejadas do dia e mostra o realizado para confirmar. Nada de serviço externo.
 */
import { useRef, useState } from "react";
import { lerFicha, parseQR, type LinhaOMR, type ResultadoOMR } from "@/lib/omr";
import { fetcher } from "@/lib/clientApi";
import { formatarDataBR } from "@/lib/dateUtils";
import type { Funcionario, Requisito, RotinaPlanejada, Sede, Tarefa } from "@/types";

const MAX_LARGURA = 1400;

/** Fileira de "selos" numerados: verde = marcado, cinza = vazio. */
function Chips({ itens, prefixo }: { itens: LinhaOMR[]; prefixo: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {itens.map((l) => (
        <span
          key={l.linha}
          className={`selo ${l.marcada ? "selo-verde" : "selo-cinza"}`}
          title={`${prefixo} ${l.linha} · ${(l.tinta * 100).toFixed(0)}%${l.confianca === "baixa" ? " · revisar" : ""}`}
          style={{ minWidth: 26, justifyContent: "center", outline: l.confianca === "baixa" ? "2px solid var(--amarelo)" : undefined }}
        >
          {l.marcada ? "✓" : "·"} {l.linha}
        </span>
      ))}
    </div>
  );
}

interface LinhaConferida {
  rotina?: RotinaPlanejada;
  nome: string;
  local: string;
  marcada: boolean;
  tinta: number;
  revisar: boolean;
}

export default function PaginaConferir() {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [bruto, setBruto] = useState<ResultadoOMR | null>(null);
  const [qrInfo, setQrInfo] = useState<{ sede: string; data: string; funcionario: string } | null>(null);
  const [funcNome, setFuncNome] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaConferida[]>([]);
  const [epiLinhas, setEpiLinhas] = useState<{ nome: string; marcada: boolean; tinta: number; revisar: boolean }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function imagemParaRGBA(bitmap: ImageBitmap) {
    const escala = Math.min(1, MAX_LARGURA / bitmap.width);
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  async function processar(fonte: Blob) {
    setProcessando(true);
    setErro("");
    setBruto(null);
    setLinhas([]);
    setEpiLinhas([]);
    setQrInfo(null);
    setFuncNome("");
    try {
      const bitmap = await createImageBitmap(fonte);
      const img = await imagemParaRGBA(bitmap);

      // 1ª passada (autônoma): pega o QR e uma leitura preliminar
      const prelim = lerFicha(img);
      setBruto(prelim);
      if (!prelim.ok) {
        setErro(prelim.erro ?? "Não foi possível ler a ficha.");
        return;
      }
      const info = parseQR(prelim.qr);
      setQrInfo(info);
      if (!info) {
        setErro("QR não reconhecido — confira se é uma ficha do Orkestria.");
        return;
      }

      // busca as rotinas planejadas daquele funcionário/data/sede
      const [rotinas, tarefas, requisitos, funcionarios] = await Promise.all([
        fetcher(`/api/rotinas?data=${info.data}&sede=${info.sede}`) as Promise<RotinaPlanejada[]>,
        fetcher(`/api/tarefas?sede=${info.sede}`) as Promise<Tarefa[]>,
        fetcher("/api/requisitos").catch(() => []) as Promise<Requisito[]>,
        fetcher("/api/funcionarios") as Promise<Funcionario[]>,
      ]);
      setFuncNome(funcionarios.find((f) => f.id === info.funcionario)?.nome ?? info.funcionario);
      const tPorId = new Map(tarefas.map((t) => [t.id, t]));
      const reqPorId = new Map(requisitos.map((r) => [r.id, r]));
      const doFunc = rotinas
        .filter((r) => r.funcionario_id === info.funcionario && r.status !== "cancelada")
        .sort((a, b) => a.inicio_planejado.localeCompare(b.inicio_planejado));

      // EPIs do dia: união (em ordem) dos requisitos tipo "epi" das tarefas
      const episNomes: string[] = [];
      const vistos = new Set<string>();
      for (const r of doFunc) {
        const t = tPorId.get(r.tarefa_id);
        for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
          const req = reqPorId.get(id);
          if (req?.tipo === "epi" && !vistos.has(req.nome)) {
            vistos.add(req.nome);
            episNomes.push(req.nome);
          }
        }
      }

      // 2ª passada determinística: mede exatamente o nº de tarefas e de EPIs
      const def = doFunc.length
        ? lerFicha(img, { numTarefas: doFunc.length, numEpis: episNomes.length })
        : prelim;

      setEpiLinhas(
        episNomes.map((nome, i) => ({
          nome,
          marcada: def.epis[i]?.marcada ?? false,
          tinta: def.epis[i]?.tinta ?? 0,
          revisar: def.epis[i]?.confianca === "baixa",
        })),
      );

      const conferidas: LinhaConferida[] = (doFunc.length ? doFunc : []).map((r, i) => {
        const l = def.tarefas[i];
        const t = tPorId.get(r.tarefa_id);
        return {
          rotina: r,
          nome: t?.nome_tarefa ?? "Tarefa",
          local: r.inicio_planejado + "–" + r.fim_planejado,
          marcada: l?.marcada ?? false,
          tinta: l?.tinta ?? 0,
          revisar: l?.confianca === "baixa",
        };
      });
      setLinhas(conferidas);
      if (!doFunc.length) {
        setErro(
          `Ficha lida (funcionário ${info.funcionario}), mas não há rotinas planejadas para ${formatarDataBR(info.data)} nesta sede — mostrando só a leitura bruta.`,
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar a imagem.");
    } finally {
      setProcessando(false);
    }
  }

  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void processar(f);
  }


  const feitas = linhas.filter((l) => l.marcada).length;

  return (
    <div className="entra" style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Conferir ficha</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 2, marginBottom: 16 }}>
        Suba a foto ou o scan da ficha de papel. O navegador lê o QR e as marcações
        de “Feito” e casa com a rotina do dia — você confere e salva.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={aoEscolher}
          style={{ display: "none" }}
        />
        <button className="btn btn-primario" onClick={() => inputRef.current?.click()} disabled={processando}>
          {processando ? "Lendo…" : "📷 Subir / fotografar ficha"}
        </button>
        {bruto?.qr && (
          <span className="num" style={{ fontSize: 12, color: "var(--tinta-3)" }}>
            QR: {bruto.qr}
          </span>
        )}
      </div>

      {erro && <div className="alerta alerta-aviso" style={{ marginBottom: 14 }}>{erro}</div>}

      {bruto?.ok && (
        <div className="painel" style={{ padding: 14, marginBottom: 14 }}>
          <div className="rotulo" style={{ marginBottom: 8 }}>
            Leitura {qrInfo ? `· ${funcNome || qrInfo.funcionario} · ${formatarDataBR(qrInfo.data)}` : ""}
          </div>

          {linhas.length > 0 ? (
            <>
              <table className="tabela" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Horário</th>
                    <th>Tarefa</th>
                    <th style={{ width: 130, textAlign: "center" }}>Feito?</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} style={l.revisar ? { background: "var(--papel-2)" } : undefined}>
                      <td className="num">{l.local}</td>
                      <td style={{ fontWeight: 600 }}>
                        {l.nome}
                        {l.revisar && (
                          <span className="selo selo-amarelo" style={{ marginLeft: 8 }} title={`Leitura fraca (${(l.tinta * 100).toFixed(0)}%) — confira`}>
                            revisar
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={l.marcada}
                            onChange={(e) =>
                              setLinhas((arr) =>
                                arr.map((x, j) => (j === i ? { ...x, marcada: e.target.checked } : x)),
                              )
                            }
                          />
                          <span style={{ fontSize: 12, color: l.marcada ? "var(--verde)" : "var(--tinta-3)" }}>
                            {l.marcada ? "feito" : "não"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {epiLinhas.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="rotulo" style={{ color: "var(--acento)", marginBottom: 6 }}>EPIs utilizados</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {epiLinhas.map((e, i) => (
                      <label key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={e.marcada}
                          onChange={(ev) =>
                            setEpiLinhas((arr) => arr.map((x, j) => (j === i ? { ...x, marcada: ev.target.checked } : x)))
                          }
                        />
                        {e.nome}
                        {e.revisar && <span className="selo selo-amarelo">revisar</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <strong>{feitas}</strong> de {linhas.length} tarefas feitas
                {epiLinhas.length > 0 && <> · {epiLinhas.filter((e) => e.marcada).length}/{epiLinhas.length} EPIs</>}.
                <button className="btn btn-primario" disabled title="Gravação do realizado — próxima etapa">
                  Salvar realizado (em breve)
                </button>
              </div>
            </>
          ) : (
            // sem casamento com rotinas (ex.: ficha de exemplo): leitura resumida
            <div style={{ fontSize: 13 }}>
              <p style={{ color: "var(--tinta-3)", fontSize: 12, marginBottom: 10 }}>
                Esta ficha não tem rotinas no sistema para casar com os nomes —
                mostrando o que foi lido (passe o mouse para ver a intensidade).
              </p>
              <div style={{ marginBottom: 4 }}>
                Tarefas feitas: <strong>{bruto.feitas}</strong> de {bruto.tarefas.length}
              </div>
              <Chips itens={bruto.tarefas} prefixo="Tarefa" />
              {bruto.epis.length > 0 && (
                <>
                  <div style={{ margin: "12px 0 4px" }}>
                    EPIs usados: <strong>{bruto.epis.filter((e) => e.marcada).length}</strong> de {bruto.epis.length}
                  </div>
                  <Chips itens={bruto.epis} prefixo="EPI" />
                </>
              )}
              {bruto.revisar > 0 && (
                <p style={{ marginTop: 10, fontSize: 12 }}>
                  <span className="selo selo-amarelo">{bruto.revisar} a revisar</span>{" "}
                  <span style={{ color: "var(--tinta-3)" }}>marca(s) fraca(s) — confira no original.</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
