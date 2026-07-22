import Link from "next/link";

/**
 * "Da ata ao sistema" — painel de transparência para a direção: cada pedido
 * levantado nas reuniões de 16/06 e 17/07/2026, lado a lado com o que o
 * Orkestria faz em resposta. Conteúdo consolidado em docs/10 e docs/13.
 */

type Status = "entregue" | "parcial" | "decisao";

const STATUS: Record<Status, { rotulo: string; cor: string; icone: string }> = {
  entregue: { rotulo: "Entregue", cor: "var(--verde)", icone: "✓" },
  parcial: { rotulo: "Parcial", cor: "var(--laranja)", icone: "◐" },
  decisao: { rotulo: "Decisão / cautela", cor: "var(--acento)", icone: "⚖" },
};

type Item = { pediu: string; faz: string; status: Status; nota?: string };
type Bloco = { titulo: string; itens: Item[] };

const BLOCOS: Bloco[] = [
  {
    titulo: "Como o tempo é calculado",
    itens: [
      {
        pediu: "Tempo = atividade × espaço × tipo de limpeza, com base 1 m² ≈ 1 min.",
        faz: "O previsto de uma tarefa por m² = base × metragem × intensidade do local × tipo de serviço. A intensidade saiu da categoria e foi para o LOCAL (leve 0,8 · normal 1,0 · densa 1,5); a tarefa tem tipo de serviço (rotina 1,0 · pesada 1,5 · desincrustante 2,0). Tudo ajustável pela operação.",
        status: "entregue",
      },
      {
        pediu: "O tipo de uso do local deveria puxar o nível de limpeza (laboratório, clínica, pátio são mais pesados só por serem aquilo).",
        faz: "Feito (decisão fechada em 17/07): deixando o fator em branco no cadastro, ele sai do TIPO do local — banheiro e copa densos (1,5), área externa leve (0,8), demais normais. O fator da tarefa continua existindo e os dois multiplicam, com o local como prioritário. Quem digitar um valor sobrepõe o padrão.",
        status: "entregue",
      },
      {
        pediu: "Contar o tempo de deslocamento/transição entre ambientes.",
        faz: "Parâmetro por sede (minutos de deslocamento por tarefa) que entra na ocupação como tempo real.",
        status: "entregue",
      },
      {
        pediu: "Combater o bloco de 30 min — capturar ganhos de poucos minutos.",
        faz: "Os números sempre usam o tempo exato, não o bloco visual. A grade desceu de 30 → 15 min (evidência da planilha real da Aldeota, que trabalha em blocos de 15/10/5). O bloco continua só visual e ajustável.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Previsto, realizado e tempo de referência",
    itens: [
      {
        pediu: "Dois tempos: o previsto e o realizado.",
        faz: "Existe desde o início; o desvio é calculado por tarefa e por dia (previsto × realizado).",
        status: "entregue",
      },
      {
        pediu: "Tempo padrão por pessoa numa atividade — para planejar, sem virar avaliação.",
        faz: "Cada pessoa pode ter um tempo próprio numa tarefa, usado só ao montar a agenda. Não alimenta avaliação/premiação sem decisão explícita.",
        status: "entregue",
      },
      {
        pediu: "Atividades que não devem cobrar desvio (montagem de palco, plantão, presença).",
        faz: "Flag “tempo é referência” e flag de presença/plantão não geram alerta de desvio. O plantão tem a duração informada no dia (varia por designação).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Criticidade e periodicidade",
    itens: [
      {
        pediu: "Circuito essencial: tarefas críticas que não podem ficar descobertas.",
        faz: "A tarefa pode ser marcada como crítica; se ficar sem cobertura, o painel destaca em vermelho “circuito essencial descoberto”, separado das demais pendências.",
        status: "entregue",
      },
      {
        pediu: "Tarefa não-crítica de quem faltou pode esperar um ou dois dias.",
        faz: "A cobertura usa a criticidade — não força realocar o que não é crítico.",
        status: "entregue",
      },
      {
        pediu: "Periodicidade em dias fixos e janela de horário por tarefa.",
        faz: "Tarefa programável em dias da semana escolhidos e com janela de horário (só pode cair entre o início e o fim definidos).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Faltas e remanejo",
    itens: [
      {
        pediu: "Falta → serviços abertos → substituir, inclusive entre sedes.",
        faz: "A tela de remanejo mostra as tarefas dos ausentes de todas as sedes e passa a um colega com folga (mesmo de outra sede, com aviso de deslocamento), validando jornada, conflito e conformidade. Tem também “distribuir automaticamente (sugestão)”.",
        status: "entregue",
      },
      {
        pediu: "Avisar automaticamente quem assumiu a tarefa.",
        faz: "Depende de um canal direto com o ASG — mesmo bloco da confirmação pelo funcionário.",
        status: "decisao",
      },
    ],
  },
  {
    titulo: "Serviços eventuais (o segundo eixo)",
    itens: [
      {
        pediu: "Trabalho não-rotineiro: café, montagem de evento, descarga de caminhão, imprevistos.",
        faz: "Modo próprio de serviço eventual/imprevisto, registrado após o fato. Os imprevistos alimentam o buffer de folga de cada sede.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Ociosidade como buffer por sede",
    itens: [
      {
        pediu: "Ociosidade-alvo por tipo de sede (ex.: educação infantil ~20%), calibrada por dados reais.",
        faz: "Folga mínima por sede; os imprevistos registrados sugerem a folga de cada uma. A sede ganhou tipo e grupo (ex.: “Sul”) para comparar unidades parecidas.",
        status: "entregue",
      },
      {
        pediu: "Visão agregada de ociosidade por grupo (Sul 1/2/3).",
        faz: "Pronto no painel “Panorama de sedes”: soma ocupação e ociosidade de todas as sedes por grupo ou por tipo, com ocupação média, sobrecarga e uma dica de remanejo (sede com mais folga × mais cheia).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Conformidade, aptidão e EPI",
    itens: [
      {
        pediu: "Aptidão/restrição médica e treinamento (com validade) como pré-requisito.",
        faz: "Catálogo de aptidões/treinamentos/EPIs; o sistema bloqueia alocar quem não tem o requisito ou está com o treinamento vencido.",
        status: "entregue",
      },
      {
        pediu: "EPI por atividade e confirmação de que o EPI foi usado.",
        faz: "A tarefa declara o EPI exigido; a ficha de confirmação lista os EPIs e, ao ler a ficha, o sistema marca os EPIs confirmados no realizado.",
        status: "entregue",
      },
      {
        pediu: "Restrições por sexo (banheiro feminino) e limitações físicas (peso máximo).",
        faz: "Gênero é restrição operacional do local, não fator de produtividade. Limitações físicas entram como aptidão/treinamento — restrição por habilitação, não por sexo.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Confirmação do executado (ficha de papel + leitura)",
    itens: [
      {
        pediu: "O ASG não usa celular: confirmar o feito numa ficha de papel e depois inserir no sistema.",
        faz: "Ficha imprimível por funcionário/dia (checklist por ambiente + EPIs + assinatura), com QR e marcadores de canto. A leitura é por OMR (detecta o X marcado, como um gabarito) dentro do próprio sistema — sem serviço externo — e grava o realizado casando com a rotina planejada. Validado em scan real (foto de celular): 12 tarefas + 10 EPIs lidos corretamente.",
        status: "entregue",
      },
      {
        pediu: "Reconhecimento facial (API “Edison”) para o “ok” presencial.",
        faz: "Avaliação futura, depois da ingestão por ficha estar consolidada.",
        status: "decisao",
      },
    ],
  },
  {
    titulo: "Calendário acadêmico",
    itens: [
      {
        pediu: "Período letivo: não cobrar limpeza de sala em férias/recesso.",
        faz: "Calendário acadêmico por sede (intervalo + dias com aula). Tarefas letivas só são cobradas no período; fora dele somem do “Ficou de fora hoje”. Sem calendário cadastrado, a agenda avisa.",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Produtividade, pessoas e relatórios",
    itens: [
      {
        pediu: "Score de produtividade por funcionário (apoia o processo de premiação).",
        faz: "Tela de produtividade com a aderência previsto × realizado por pessoa e exportação em planilha.",
        status: "entregue",
      },
      {
        pediu: "Usar idade e sexo na correlação de produtividade.",
        faz: "Fora do sistema, por salvaguarda da própria direção: não entram no motor de produtividade, alocação ou premiação até uma decisão formal (jurídico — Davi Rocha).",
        status: "decisao",
      },
      {
        pediu: "Relatório mensal por funcionário para o cliente assinar e login individual.",
        faz: "Relatório mensal pronto. Login com senha por usuário e “Entrar com Google” (só e-mails já cadastrados).",
        status: "entregue",
      },
    ],
  },
  {
    titulo: "Demonstração às sedes (17/07)",
    itens: [
      {
        pediu: "Eventos desmontam a rotina — e no dia do evento não há tempo de montar a programação.",
        faz: "Cadastro de rotina por TIPO DE EVENTO: monte o 1º evento na agenda, salve como “modelo de evento” e nos próximos aplique com antecedência (na sexta, para o fim de semana). No dia, gere a rota padrão e aplique o evento por cima — o que conflita de horário é pulado e informado.",
        status: "entregue",
      },
      {
        pediu: "Direcionar a pessoa mais habilitada para a atividade do evento (ex.: montagem de palco).",
        faz: "A qualificação ganhou um nível (apto · experiente · referência) e a lista de tarefas sugere quem chamar primeiro. É degrau de HABILITAÇÃO, não avaliação de desempenho: quem tem a qualificação válida executa, seja qual for o nível.",
        status: "entregue",
      },
      {
        pediu: "Na ficha, o funcionário não deve escolher item a item — deve declarar que usou os EPIs corretos.",
        faz: "A ficha traz uma declaração única, com os EPIs listados nominalmente ao lado (o registro precisa dizer o que foi usado, porque a ficha assinada tem valor probatório). Fichas já impressas no formato antigo continuam sendo lidas.",
        status: "entregue",
      },
      {
        pediu: "Fixar também a coluna da esquerda ao rolar a agenda para o lado.",
        faz: "A régua de horários (visão diária) e a coluna de nomes (visão semanal) ficam fixas na rolagem horizontal.",
        status: "entregue",
      },
      {
        pediu: "Substituir o cadastro por idade por “aptidão”, para evitar etarismo.",
        faz: "O cadastro de funcionário nunca teve idade — a habilitação sempre foi modelada por qualificação/treinamento, que é exatamente o critério pedido. Nada a remover.",
        status: "entregue",
      },
      {
        pediu: "Remanejar automaticamente as tarefas de quem for deslocado para o evento.",
        faz: "Confirmado no escopo do projeto, para uma etapa seguinte. Hoje a falta já aparece no painel de cobertura com sugestão de remanejo.",
        status: "decisao",
      },
      {
        pediu: "Formalizar a origem dos fatores de intensidade (0,8 · 1,0 · 1,5).",
        faz: "Os números são arbitrados e ajustáveis no sistema — a formalização metodológica é decisão da direção com a operação, não de desenvolvimento.",
        status: "decisao",
      },
    ],
  },
];

function Selo({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        color: s.cor,
        border: `1.5px solid ${s.cor}`,
        borderRadius: 999,
        padding: "2px 9px",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{s.icone}</span>
      {s.rotulo}
    </span>
  );
}

export default function PaginaDaAta() {
  const itens = BLOCOS.flatMap((b) => b.itens);
  const conta = (s: Status) => itens.filter((i) => i.status === s).length;

  return (
    <div className="entra" style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div className="rotulo" style={{ color: "var(--acento)" }}>
        Reuniões de alinhamento · 16/06 e 17/07/2026
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 2 }}>Da ata ao sistema</h1>
      <p style={{ color: "var(--tinta-2)", marginTop: 6, marginBottom: 18, maxWidth: 720 }}>
        Cada ponto levantado pela direção, lado a lado com o que o Orkestria faz em resposta.
        Sem maquiagem: o que já está no ar, o que está pela metade e o que espera uma decisão.
      </p>

      {/* placar por status */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        {(Object.keys(STATUS) as Status[]).map((s) => (
          <div
            key={s}
            className="painel"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}
          >
            <span
              className="num"
              style={{ fontSize: 24, fontWeight: 800, color: STATUS[s].cor, lineHeight: 1 }}
            >
              {conta(s)}
            </span>
            <span style={{ fontSize: 12, color: "var(--tinta-2)" }}>
              {STATUS[s].rotulo}
            </span>
          </div>
        ))}
        <div
          className="painel"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}
        >
          <span className="num" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>
            {itens.length}
          </span>
          <span style={{ fontSize: 12, color: "var(--tinta-2)" }}>pontos no total</span>
        </div>
      </div>

      {/* blocos de pedido × resposta */}
      <div style={{ display: "grid", gap: 22 }}>
        {BLOCOS.map((b) => (
          <section key={b.titulo}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 800,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: "2px solid var(--tinta)",
              }}
            >
              {b.titulo}
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {b.itens.map((it, i) => (
                <div key={i} className="painel" style={{ padding: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div className="rotulo" style={{ color: "var(--tinta-3)" }}>
                      A ata pediu
                    </div>
                    <Selo status={it.status} />
                  </div>
                  <p style={{ fontSize: 14, marginBottom: 12 }}>{it.pediu}</p>

                  <div
                    style={{
                      borderLeft: "3px solid var(--acento)",
                      paddingLeft: 12,
                    }}
                  >
                    <div className="rotulo" style={{ color: "var(--acento)", marginBottom: 3 }}>
                      O sistema faz
                    </div>
                    <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.5 }}>{it.faz}</p>
                    {it.nota && (
                      <p style={{ fontSize: 12, color: "var(--tinta-3)", marginTop: 6, fontStyle: "italic" }}>
                        ⚠ {it.nota}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        style={{
          marginTop: 26,
          paddingTop: 16,
          borderTop: "1px solid var(--linha)",
          fontSize: 12,
          color: "var(--tinta-3)",
        }}
      >
        Compromissos que atravessam tudo: planejamento, não punição · planejar ≠ avaliar ·
        idade e sexo fora do motor de produtividade · números sempre ajustáveis pela operação,
        nunca inventados pelo sistema · toda alteração registrada no histórico. Detalhe técnico em{" "}
        <code>docs/10</code> e <code>docs/13</code>.{" "}
        <Link href="/inicio" style={{ color: "var(--acento)" }}>
          ← voltar ao início
        </Link>
      </div>
    </div>
  );
}
