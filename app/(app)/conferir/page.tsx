"use client";

/**
 * Conferir ficha (OCR/OMR) — o supervisor sobe/fotografa a ficha de papel; o
 * NAVEGADOR lê o QR e mede as caixas "Feito" (lib/omr.ts), casa com as rotinas
 * planejadas do dia e mostra o realizado para confirmar. Nada de serviço externo.
 */
import { useRef, useState } from "react";
import { lerFicha, parseQR, type LinhaOMR, type ResultadoOMR } from "@/lib/omr";
import { codigoLinha } from "@/lib/fichaGeometria";
import { apiPost, ErroApi, fetcher } from "@/lib/clientApi";
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
  /** ORK2: linha impressa cuja tarefa saiu da agenda depois — não é salva. */
  removida?: boolean;
}

export default function PaginaConferir() {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [bruto, setBruto] = useState<ResultadoOMR | null>(null);
  const [qrInfo, setQrInfo] = useState<{ sede: string; data: string; funcionario: string } | null>(null);
  const [funcNome, setFuncNome] = useState<string>("");
  const [linhas, setLinhas] = useState<LinhaConferida[]>([]);
  const [epiLinhas, setEpiLinhas] = useState<{ nome: string; marcada: boolean; tinta: number; revisar: boolean }[]>([]);
  /** ORK3/ORK4: a ficha traz UMA declaração, não uma caixa por EPI. */
  const [epiDeclaracao, setEpiDeclaracao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState("");
  const [aviso, setAviso] = useState("");
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
    setEpiDeclaracao(false);
    setSalvo("");
    setAviso("");
    setQrInfo(null);
    setFuncNome("");
    try {
      const avisos: string[] = [];
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
      const episAtuais: string[] = [];
      const vistos = new Set<string>();
      for (const r of doFunc) {
        const t = tPorId.get(r.tarefa_id);
        for (const id of (t?.requisitos ?? "").split(",").filter(Boolean)) {
          const req = reqPorId.get(id);
          if (req?.tipo === "epi" && !vistos.has(req.nome)) {
            vistos.add(req.nome);
            episAtuais.push(req.nome);
          }
        }
      }
      // ORK4 grava o que estava impresso. ORK1/2/3 mantêm o comportamento
      // histórico e reconstroem a lista a partir do catálogo atual.
      const episNomes = info.versao >= 4 ? info.episImpressos ?? [] : episAtuais;
      if (info.versao >= 4 && JSON.stringify(episNomes) !== JSON.stringify(episAtuais)) {
        avisos.push(
          "Os requisitos de EPI mudaram desde a impressão; o registro usará a lista impressa preservada no QR.",
        );
      }

      // 2ª passada determinística. No ORK2 usamos o nº IMPRESSO de tarefas (vem
      // no QR) — a geometria fica fiel à ficha mesmo que a rotina tenha mudado
      // depois. No ORK1, o total atual (comportamento antigo, casa por posição).
      const nTarefas = info.versao >= 2 ? info.n ?? 0 : doFunc.length;
      // ORK3/ORK4: o bloco de EPI é UMA declaração ("usei os EPIs listados").
      const declaracao = info.versao >= 3;
      const def = nTarefas
        ? lerFicha(img, {
            numTarefas: nTarefas,
            ...(declaracao ? { declaracaoEpi: true } : { numEpis: episNomes.length }),
          })
        : prelim;

      setEpiLinhas(
        declaracao
          ? // Uma linha só: a declaração vale por todos os EPIs do dia.
            episNomes.map((nome) => ({
              nome,
              marcada: def.epis[0]?.marcada ?? false,
              tinta: def.epis[0]?.tinta ?? 0,
              revisar: def.epis[0]?.confianca === "baixa",
            }))
          : episNomes.map((nome, i) => ({
              nome,
              marcada: def.epis[i]?.marcada ?? false,
              tinta: def.epis[i]?.tinta ?? 0,
              revisar: def.epis[i]?.confianca === "baixa",
            })),
      );
      setEpiDeclaracao(declaracao);

      const linhaDe = (r: RotinaPlanejada | undefined, l: LinhaOMR | undefined): LinhaConferida => ({
        rotina: r,
        nome: r ? tPorId.get(r.tarefa_id)?.nome_tarefa ?? "Tarefa" : "(tarefa saiu da agenda após a impressão)",
        local: r ? `${r.inicio_planejado}–${r.fim_planejado}` : "—",
        marcada: l?.marcada ?? false,
        tinta: l?.tinta ?? 0,
        revisar: l?.confianca === "baixa",
        removida: !r,
      });

      let conferidas: LinhaConferida[];
      // >= 2: ORK2/ORK3/ORK4 trazem os códigos no QR e casam por CÓDIGO. Só o ORK1
      // (fichas antigas) casa por posição.
      if (info.versao >= 2) {
        // Casa cada linha IMPRESSA (código no QR) com a rotina atual de mesmo código.
        const cod = (r: RotinaPlanejada) => codigoLinha(r.funcionario_id, r.tarefa_id, r.inicio_planejado);
        const porCodigo = new Map(doFunc.map((r) => [cod(r), r]));
        const codigos = info.codigos ?? [];
        conferidas = codigos.map((c, i) => linhaDe(porCodigo.get(c), def.tarefas[i]));
        const usados = new Set(codigos);
        const novas = doFunc.filter((r) => !usados.has(cod(r)));
        const saidas = conferidas.filter((c) => c.removida).length;
        if (saidas || novas.length) {
          avisos.push(
            `A rotina mudou desde a impressão da ficha: ${saidas} tarefa(s) saíram da agenda (não serão salvas) e ${novas.length} nova(s) não estão na ficha (marque na agenda). O restante casa certo pelo código.`,
          );
        }
      } else {
        // ORK1 (ficha antiga): casa por POSIÇÃO — pode desalinhar se a rotina mudou.
        conferidas = doFunc.map((r, i) => linhaDe(r, def.tarefas[i]));
        if (doFunc.length) {
          avisos.push("Ficha em formato antigo (casada por posição): se a rotina mudou depois de imprimir, confira cada linha antes de salvar.");
        }
      }
      setAviso(avisos.join(" "));
      setLinhas(conferidas);
      if (conferidas.length === 0) {
        setErro(
          `Ficha lida (funcionário ${info.funcionario}), mas não há rotinas para ${formatarDataBR(info.data)} nesta sede — mostrando só a leitura bruta.`,
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

  /** Grava o realizado: uma execução por rotina (feito × não feito). */
  async function salvar() {
    if (!qrInfo || linhas.length === 0) return;
    setSalvando(true);
    setErro("");
    setSalvo("");
    const episConfirmados = epiLinhas.filter((e) => e.marcada).map((e) => e.nome).join(", ");
    try {
      let n = 0;
      for (const l of linhas) {
        if (!l.rotina) continue;
        const feito = l.marcada;
        await apiPost("/api/execucoes", {
          rotina_id: l.rotina.id,
          data_execucao: qrInfo.data,
          status_realizado: feito ? "conforme_planejado" : "nao_realizada",
          inicio_real: feito ? l.rotina.inicio_planejado : "",
          fim_real: feito ? l.rotina.fim_planejado : "",
          tempo_real_min: feito ? l.rotina.tempo_previsto_min : 0,
          justificativa: feito ? "" : "Não confirmada na ficha (leitura OMR).",
          epis_confirmados: episConfirmados,
          observacao: "[Confirmado via ficha/OMR]",
        });
        n++;
      }
      setSalvo(`Realizado gravado: ${n} tarefa(s) registrada(s).`);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Erro ao gravar o realizado.");
    } finally {
      setSalvando(false);
    }
  }


  const feitas = linhas.filter((l) => l.marcada).length;

  return (
    <div className="entra" style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Conferir ficha</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 2, marginBottom: 16 }}>
        Suba a foto ou o scan da ficha de papel. O navegador lê o QR e as marcações
        de “Feito”, casa com a rotina do dia e, ao <strong>salvar</strong>, <strong>registra
        o realizado</strong>: as tarefas marcadas ficam como <strong>feitas</strong> (verdes)
        na agenda; as não marcadas, como não realizadas.
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

          {aviso && (
            <div className="alerta alerta-aviso" style={{ marginBottom: 12, fontSize: 13 }}>⚠ {aviso}</div>
          )}

          {linhas.length > 0 ? (
            <>
              <div className="tabela-rolavel">
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
                    <tr
                      key={i}
                      style={{
                        ...(l.revisar ? { background: "var(--papel-2)" } : {}),
                        ...(l.removida ? { opacity: 0.5 } : {}),
                      }}
                    >
                      <td className="num">{l.local}</td>
                      <td style={{ fontWeight: 600 }}>
                        {l.nome}
                        {l.removida && (
                          <span className="selo selo-vermelho" style={{ marginLeft: 8 }} title="Saiu da agenda depois da impressão — não será salva">
                            fora da agenda
                          </span>
                        )}
                        {l.revisar && !l.removida && (
                          <span className="selo selo-amarelo" style={{ marginLeft: 8 }} title={`Leitura fraca (${(l.tinta * 100).toFixed(0)}%) — confira`}>
                            revisar
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: l.removida ? "not-allowed" : "pointer" }}>
                          <input
                            type="checkbox"
                            checked={l.marcada}
                            disabled={l.removida}
                            onChange={(e) =>
                              setLinhas((arr) =>
                                arr.map((x, j) => (j === i ? { ...x, marcada: e.target.checked } : x)),
                              )
                            }
                          />
                          <span style={{ fontSize: 12, color: l.removida ? "var(--tinta-3)" : l.marcada ? "var(--verde)" : "var(--tinta-3)" }}>
                            {l.removida ? "—" : l.marcada ? "feito" : "não"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {epiLinhas.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="rotulo" style={{ color: "var(--acento)", marginBottom: 6 }}>
                    {epiDeclaracao ? "Declaração de EPIs" : "EPIs utilizados"}
                  </div>
                  {epiDeclaracao ? (
                    // ORK3/ORK4: uma marcação só, que vale por todos os EPIs do dia.
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={epiLinhas[0]?.marcada ?? false}
                        onChange={(ev) =>
                          setEpiLinhas((arr) => arr.map((x) => ({ ...x, marcada: ev.target.checked })))
                        }
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        O funcionário <strong>declarou</strong> que utilizou os EPIs das atividades
                        de hoje: <em>{epiLinhas.map((e) => e.nome).join(", ")}</em>.
                        {epiLinhas[0]?.revisar && (
                          <span className="selo selo-amarelo" style={{ marginLeft: 6 }}>revisar</span>
                        )}
                      </span>
                    </label>
                  ) : (
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
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <strong>{feitas}</strong> de {linhas.length} tarefas feitas
                {epiLinhas.length > 0 &&
                  (epiDeclaracao ? (
                    <> · EPIs {epiLinhas[0]?.marcada ? "declarados" : "NÃO declarados"}</>
                  ) : (
                    <> · {epiLinhas.filter((e) => e.marcada).length}/{epiLinhas.length} EPIs</>
                  ))}
                .
                <button
                  className="btn btn-primario"
                  onClick={salvar}
                  disabled={salvando || !!salvo}
                  title="Grava o realizado e marca as tarefas feitas (verdes) na agenda do dia"
                >
                  {salvando ? "Gravando…" : salvo ? "Gravado ✓" : "Salvar realizado"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 6 }}>
                Ao salvar, as tarefas feitas são marcadas como <strong>realizadas</strong> na agenda
                (reenviar a mesma ficha atualiza, não duplica).
              </p>
              {salvo && <div className="alerta alerta-ok" style={{ marginTop: 10 }}>{salvo}</div>}
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
