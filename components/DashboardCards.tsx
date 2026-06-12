"use client";

/** Blocos de visualização do dashboard: cartões de KPI e listas de barras. */

export function CartaoKpi({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div className="painel" style={{ padding: "14px 16px" }}>
      <div className="rotulo">{rotulo}</div>
      <div
        className="num"
        style={{
          fontSize: 30,
          fontWeight: 700,
          fontFamily: "var(--fonte-display)",
          color: cor ?? "var(--tinta)",
          lineHeight: 1.1,
          marginTop: 4,
        }}
      >
        {valor}
      </div>
      {detalhe && (
        <div style={{ fontSize: 11, color: "var(--tinta-3)", marginTop: 2 }}>{detalhe}</div>
      )}
    </div>
  );
}

export interface ItemBarra {
  rotulo: string;
  valor: number;
  texto: string;
  cor?: string;
}

export function ListaBarras({
  titulo,
  itens,
  vazio = "Sem dados no período.",
}: {
  titulo: string;
  itens: ItemBarra[];
  vazio?: string;
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="painel">
      <div className="painel-cabecalho" style={{ padding: "10px 14px" }}>
        <span className="rotulo">{titulo}</span>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        {itens.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--tinta-3)" }}>{vazio}</span>
        )}
        {itens.map((item) => (
          <div key={item.rotulo}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                {item.rotulo}
              </span>
              <span className="num" style={{ fontWeight: 700, flexShrink: 0 }}>{item.texto}</span>
            </div>
            <div className="barra-trilho" style={{ height: 12 }}>
              <div
                className="barra-preenchimento"
                style={{
                  width: `${(item.valor / maximo) * 100}%`,
                  background: item.cor ?? "var(--azul)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
