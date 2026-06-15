# -*- coding: utf-8 -*-
"""
Gera o PDF "Orkestria — Contexto do Sistema" para a diretoria, com a
identidade visual do produto (vinho amaranto + evergreen sobre marfim).
Conteúdo fiel ao CONTEXTO-IA.md. Saída: Orkestria-Contexto.pdf na raiz.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import os
import sys
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    ListFlowable, ListItem, HRFlowable, KeepTogether, Image,
)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(BASE, "public", "logo-fundo-claro.png")
from reportlab.graphics.shapes import Drawing, Ellipse, Polygon, Circle
from reportlab.graphics import renderPDF

VINHO = colors.HexColor("#9C0D38")
EVERGREEN = colors.HexColor("#223127")
MARFIM = colors.HexColor("#F5F1E6")
MARFIM2 = colors.HexColor("#ECE6D4")
TINTA2 = colors.HexColor("#4A584E")
LINHA = colors.HexColor("#D9D2BC")

styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, parent=styles["Normal"], **kw)

st_corpo = S("corpo", fontName="Helvetica", fontSize=10, leading=15,
             textColor=EVERGREEN, spaceAfter=6)
st_h1 = S("h1", fontName="Helvetica-Bold", fontSize=15, leading=19,
          textColor=VINHO, spaceBefore=16, spaceAfter=7)
st_rotulo = S("rotulo", fontName="Helvetica-Bold", fontSize=8, leading=11,
              textColor=VINHO, spaceAfter=2)
st_titulo = S("titulo", fontName="Helvetica-Bold", fontSize=30, leading=33,
              textColor=EVERGREEN, alignment=TA_CENTER)
st_sub = S("sub", fontName="Helvetica", fontSize=11, leading=16,
           textColor=TINTA2, alignment=TA_CENTER)
st_cel = S("cel", fontName="Helvetica", fontSize=8.5, leading=12, textColor=EVERGREEN)
st_cab = S("cab", fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=MARFIM)
st_nota = S("nota", fontName="Helvetica-Oblique", fontSize=9, leading=13, textColor=TINTA2)


def simbolo(tam=70):
    """Desenha o símbolo da Orkestria (O + batuta) em vetor."""
    d = Drawing(tam, tam)
    cx, cy = tam * 0.46, tam * 0.5
    d.add(Ellipse(cx, cy, tam*0.30, tam*0.40, fillColor=VINHO, strokeColor=None))
    d.add(Ellipse(cx, cy, tam*0.155, tam*0.235, fillColor=colors.white, strokeColor=None))
    # barras de crescimento
    bw = tam*0.05
    for i, h in enumerate([0.12, 0.19, 0.26]):
        x = cx - tam*0.11 + i*tam*0.09
        d.add(Polygon([x, cy-tam*0.13, x+bw, cy-tam*0.13, x+bw, cy-tam*0.13+tam*h,
                       x, cy-tam*0.13+tam*h], fillColor=EVERGREEN, strokeColor=None))
    # batuta
    d.add(Polygon([tam*0.08, tam*0.86, tam*0.86, tam*0.30, tam*0.89, tam*0.345],
                  fillColor=VINHO, strokeColor=None))
    d.add(Circle(tam*0.90, tam*0.30, tam*0.05, fillColor=VINHO, strokeColor=None))
    return d


def fundo(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MARFIM)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    # rodapé
    canvas.setFillColor(TINTA2)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(20*mm, 12*mm, "Orkestria — Contexto do Sistema")
    canvas.drawRightString(A4[0]-20*mm, 12*mm, "Pág. %d" % doc.page)
    canvas.setStrokeColor(LINHA)
    canvas.setLineWidth(0.5)
    canvas.line(20*mm, 15*mm, A4[0]-20*mm, 15*mm)
    canvas.restoreState()


def h1(txt):
    return Paragraph(txt, st_h1)

def p(txt):
    return Paragraph(txt, st_corpo)

def bullets(itens):
    return ListFlowable(
        [ListItem(Paragraph(t, st_corpo), leftIndent=10, value="•") for t in itens],
        bulletType="bullet", start="•", leftIndent=12, bulletColor=VINHO,
    )

def tabela(linhas, larguras):
    dados = [[Paragraph(c, st_cab if i == 0 else st_cel) for c in linha]
             for i, linha in enumerate(linhas)]
    t = Table(dados, colWidths=larguras, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), EVERGREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), MARFIM),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, MARFIM2]),
        ("GRID", (0, 0), (-1, -1), 0.5, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t

def caixa(flow, cor=VINHO, fundo_cor=colors.white):
    t = Table([[flow]], colWidths=[170*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fundo_cor),
        ("LINEBEFORE", (0, 0), (0, -1), 3, cor),
        ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


SAIDA = sys.argv[1] if len(sys.argv) > 1 else "Orkestria-Contexto.pdf"
doc = BaseDocTemplate(
    SAIDA, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm,
    title="Orkestria — Contexto do Sistema", author="Orkestria",
)
frame = Frame(doc.leftMargin, doc.bottomMargin,
              A4[0]-doc.leftMargin-doc.rightMargin,
              A4[1]-doc.topMargin-doc.bottomMargin, id="f")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=fundo)])

E = []  # story

# ── Capa ──────────────────────────────────────────────────────────
E.append(Spacer(1, 30*mm))
logo = Image(LOGO, width=112*mm, height=112*mm)  # arte oficial (símbolo + nome + tagline)
logo.hAlign = "CENTER"
E.append(logo)
E.append(Spacer(1, 4*mm))
E.append(Paragraph("Contexto do Sistema", S("c2", fontName="Helvetica", fontSize=16,
                   alignment=TA_CENTER, textColor=TINTA2)))
E.append(Spacer(1, 4*mm))
E.append(Paragraph("Planejamento visual de rotinas operacionais para equipes de "
                   "serviços gerais (ASG)", st_sub))
E.append(Spacer(1, 24*mm))
E.append(Paragraph("Documento de apresentação · junho/2026", st_sub))

from reportlab.platypus import PageBreak
E.append(PageBreak())

# ── 1. Identificação ──────────────────────────────────────────────
E.append(h1("1 · Identificação"))
E.append(bullets([
    "<b>Nome:</b> Orkestria — \"porque ele orquestra as rotinas\".",
    "<b>O que é:</b> sistema web interno para gestão de rotinas operacionais "
    "de equipes de ASG/serviços gerais (limpeza e conservação) distribuídas em "
    "várias sedes.",
    "<b>Usuários:</b> supervisores e coordenadores (quem planeja) e gerência "
    "(quem analisa). Os ASGs não usam o sistema — recebem a rotina em fichas "
    "de papel impressas pelo próprio sistema.",
    "<b>Status:</b> em produção. Banco Firebase ativo com dados reais e sistema "
    "publicado na web (Vercel).",
]))

# ── 2. Problema ───────────────────────────────────────────────────
E.append(h1("2 · O problema que resolve"))
E.append(p("Supervisores distribuem tarefas de cabeça ou em planilhas soltas. "
           "Falta visibilidade de quem está com a rotina cheia ou vazia, quanto "
           "da jornada está realmente planejado, qual sede/local consome mais "
           "esforço e se os tempos estimados batem com a prática. O sistema "
           "responde: <i>Quem está sobrecarregado? Quanto tempo está ocioso? "
           "Precisamos de mais gente nesta sede? Qual tarefa está mal estimada?</i>"))
E.append(caixa(Paragraph(
    "<b>Diretriz central:</b> a ferramenta é de <b>planejamento e "
    "dimensionamento, não punitiva</b>. \"Ociosidade\" significa <i>tempo sem "
    "tarefa planejada</i> — um problema de planejamento a corrigir, não prova "
    "de que alguém ficou parado. O previsto × realizado serve para melhorar os "
    "tempos padrão, não para vigiar pessoas.", st_corpo)))

# ── 3. Conceitos ──────────────────────────────────────────────────
E.append(h1("3 · Conceitos do domínio"))
E.append(bullets([
    "<b>Hierarquia:</b> Sede › Local › Tarefa › Rotina Planejada › Execução "
    "Realizada. Cada local pertence a uma sede (a \"Recepção\" da Aldeota com "
    "80 m² é diferente da \"Recepção\" da DT com 45 m²). A tarefa herda a sede "
    "do local.",
    "<b>Jornada líquida</b> = saída - entrada - intervalo (ex.: 07:00-16:00 com "
    "1h de almoço = 8h).",
    "<b>Tempo previsto da tarefa:</b> fixo, por m² (× metragem), por unidade "
    "(× quantidade) ou manual.",
    "<b>Blocos:</b> a agenda é dividida em blocos de 30 min. Uma tarefa de 80 "
    "min ocupa 3 blocos.",
    "<b>Ocupação</b> = tempo planejado ÷ jornada × 100. Faixas: até 60% "
    "subutilizado · 61–85% adequado · 86–100% alta ocupação · acima de 100% "
    "sobrecarga.",
    "<b>Desvio</b> = tempo real - previsto; acima do limite (30%) exige "
    "justificativa do supervisor.",
]))

# ── 4. Funcionalidades ────────────────────────────────────────────
E.append(h1("4 · Funcionalidades por tela"))
E.append(tabela([
    ["Tela", "O que faz"],
    ["Rotina do dia\n(principal)",
     "Agenda visual: colunas por funcionário, linhas por bloco de 30 min. "
     "Arrastar tarefas para alocar, mover, redimensionar e remover. Intervalo "
     "bloqueado. Painel com jornada, ocupação, ociosidade e status de cada um. "
     "Salvamento automático. Visões Dia e Semana. Duplicar dia, modelos de "
     "rotina e impressão de fichas."],
    ["Painéis de apoio",
     "Cobertura de ausência (remaneja tarefas de quem faltou para colegas com "
     "folga) e \"Ficou de fora hoje\" (tarefas diárias/periódicas não alocadas)."],
    ["Acompanhamento",
     "Registrar o realizado: status, tempo real e desvio, com justificativa "
     "obrigatória em desvios grandes. Exportação para Excel."],
    ["Dashboard",
     "Indicadores (ocupação, ociosidade, sobrecarga, previsto × realizado), "
     "ranking de locais e sedes, e sugestão automática de ajuste de tempos "
     "padrão. Filtros por período e sede. Exportação."],
    ["Cadastros",
     "Sedes, funcionários, locais, tarefas, ausências, parâmetros e usuários."],
    ["Histórico",
     "Registro automático de toda criação/alteração/exclusão, com autor e "
     "horário."],
    ["Fichas (impressão)",
     "Ordem de serviço em papel por funcionário, com horários, locais, tempos "
     "e espaço para assinatura — para entregar ao ASG."],
], [38*mm, 132*mm]))

# ── 5. Regras essenciais ──────────────────────────────────────────
E.append(h1("5 · Regras de negócio essenciais"))
E.append(bullets([
    "Não existe local sem sede nem tarefa sem local; a tarefa herda a sede.",
    "A agenda <b>bloqueia</b>: sobreposição, intervalo, fora do expediente, "
    "funcionário ausente, tarefa sem tempo, e <b>restrição de gênero</b> "
    "(ex.: banheiro feminino só por ASG mulher). Intervalo e sobreposição "
    "podem ser autorizados manualmente; gênero é bloqueio rígido.",
    "Sobrecarga e local sem metragem alertam, mas não bloqueiam.",
    "Toda validação roda no navegador (imediata) e no servidor (definitiva).",
    "Justificativa obrigatória em desvio acima do limite ou tarefa não "
    "realizada/remanejada/cancelada.",
    "Exclusão de cadastro com histórico é bloqueada (orienta a inativar).",
    "Permissões: administrador (tudo), supervisor (própria sede), "
    "visualizador/gerência (só leitura). Tudo é auditado.",
]))

# ── 6. Arquitetura (resumo) ───────────────────────────────────────
E.append(h1("6 · Arquitetura (resumo não técnico)"))
E.append(p("Aplicação web moderna (Next.js/React) hospedada na nuvem, com o "
           "banco de dados no <b>Firebase</b> (Google). A camada de dados é "
           "desacoplada: o sistema já rodou em memória e em Google Sheets e "
           "passou para o Firebase <b>sem reescrever</b> nada — o que dá "
           "liberdade para escalar. Cálculos e validações são compartilhados "
           "entre navegador e servidor, garantindo que os números sejam sempre "
           "consistentes."))

# ── 7. Estado e roadmap ───────────────────────────────────────────
E.append(h1("7 · Estado atual e próximos passos"))
E.append(p("<b>Em produção e verificado:</b> tudo da seção 4, com banco "
           "Firebase ativo, publicação automática na web a cada atualização, "
           "layout responsivo (otimizado para notebook) e paginação de "
           "funcionários para sedes grandes (de 8 a 50+ ASGs)."))
E.append(p("<b>Próximos passos planejados (em ordem):</b>"))
E.append(bullets([
    "Login individual por usuário (senha própria) — principal item de "
    "segurança pendente.",
    "Regras de segurança do banco e reforço de HTTPS em produção.",
    "Testes automatizados dos cálculos.",
    "Consultas otimizadas e arquivamento do histórico conforme o volume cresce.",
    "Visão gerencial comparando sedes + relatório PDF para a diretoria.",
    "Fase futura (após meses de dados): aplicativo/QR Code/ponto — hoje fora "
    "do escopo.",
]))

# ── 8. Resumo final ───────────────────────────────────────────────
E.append(h1("8 · Em uma frase"))
E.append(caixa(Paragraph(
    "Sistema em que supervisores montam visualmente a rotina diária da equipe "
    "(arrastando tarefas em blocos de 30 min), enxergam na hora a ocupação, a "
    "ociosidade e a sobrecarga de cada funcionário, registram o que foi "
    "realizado e usam os desvios para calibrar os tempos padrão.",
    S("frase", fontName="Helvetica-Oblique", fontSize=11, leading=16,
      textColor=EVERGREEN)),
    fundo_cor=MARFIM2))
E.append(Spacer(1, 6*mm))
E.append(Paragraph("Sistema no ar: https://orkestria-christus.vercel.app", st_nota))

doc.build(E)
print("PDF gerado:", SAIDA)
