# -*- coding: utf-8 -*-
"""
Leitor OMR das fichas Orkestria.

Não lê letra manuscrita: identifica a ficha pelo QR, endireita pela marca dos
4 cantos (fiduciais) e mede a tinta dentro de cada caixa "Feito" → marcada/vazia.

A geometria abaixo é a MESMA do gerador de fichas (em pontos PDF). Se a ficha
mudar de layout, ajuste apenas estas constantes.
"""
from __future__ import annotations
import cv2
import numpy as np

# ── Geometria da ficha (pontos PDF) ────────────────────────────────────────
FID_PDF = {"TL": (54, 788), "TR": (541, 788), "BR": (541, 264), "BL": (54, 264)}
CAIXA_X_PDF = 436          # x do centro da coluna "Feito"
LINHA0_PDF = 690           # y do centro da caixa: linha i → LINHA0 - DELTA*i
LINHA_DELTA = 21           # passo vertical entre linhas (pt)
CAIXA_LADO_PDF = 12        # lado da caixa (pt)
EPI_X_PDF = 76             # bloco de EPIs no rodapé (coluna fixa)
EPI_LINHA0_PDF = 382       # EPI i → y = EPI_LINHA0 - EPI_DELTA*i
EPI_DELTA = 18
S = 3.0                    # escala px/pt do canvas canônico

LIMIAR_MARCA = 0.12        # tinta no miolo acima disso = marcada
LIMIAR_BORDA = 0.18        # tinta na região 1.6× acima disso = existe caixa impressa
DARK = 110                 # pixel < DARK conta como tinta

CW = int((FID_PDF["TR"][0] - FID_PDF["TL"][0]) * S)
CH = int((FID_PDF["TL"][1] - FID_PDF["BL"][1]) * S)


def _to_canon(px: float, py: float) -> tuple[float, float]:
    return ((px - FID_PDF["TL"][0]) * S, (FID_PDF["TL"][1] - py) * S)


def achar_fiduciais(gray: np.ndarray):
    """Acha os 4 quadrados pretos sólidos dos cantos. Independe de resolução."""
    th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    cnts, _ = cv2.findContours(th, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    H, W = gray.shape
    # o fiducial tem ~2% da largura da página (12pt de ~595pt); faixa estreita
    # em torno disso evita confundir com padrões do QR ou texto.
    lo, hi = 0.013 * W, 0.038 * W
    cand = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if not (lo < w < hi and lo < h < hi):
            continue
        if not (0.7 < w / h < 1.4):
            continue
        if cv2.contourArea(c) / (w * h + 1e-6) < 0.7:   # sólido
            continue
        cand.append((x + w / 2.0, y + h / 2.0))
    if len(cand) < 4:
        return None
    cand = np.array(cand)
    cantos = {"TL": (0, 0), "TR": (W, 0), "BR": (W, H), "BL": (0, H)}
    pts, usados = {}, set()
    for k, (ax, ay) in cantos.items():
        d = np.hypot(cand[:, 0] - ax, cand[:, 1] - ay)
        i = int(np.argmin(d))
        pts[k] = cand[i]
        usados.add(i)
    if len(usados) < 4:        # mesma marca escolhida para 2 cantos → falhou
        return None
    return pts


def endireitar(gray: np.ndarray, pts) -> np.ndarray:
    src = np.float32([pts["TL"], pts["TR"], pts["BR"], pts["BL"]])
    dst = np.float32([[0, 0], [CW, 0], [CW, CH], [0, CH]])
    return cv2.warpPerspective(gray, cv2.getPerspectiveTransform(src, dst), (CW, CH))


def _tinta(canon: np.ndarray, cx: float, cy: float, lado_pt: float, frac: float) -> float:
    r = int(lado_pt * S * frac / 2)
    roi = canon[max(0, int(cy - r)):int(cy + r), max(0, int(cx - r)):int(cx + r)]
    if roi.size == 0:
        return 0.0
    return float((roi < DARK).sum()) / roi.size


def _confianca(fi: float) -> str:
    if fi >= 0.20 or fi <= 0.05:
        return "alta"
    return "baixa"   # marca fraca/ambígua → revisão humana


def ler_ficha(img_bgr: np.ndarray, num_tarefas: int | None = None, num_epis: int | None = None, max_linhas: int = 14) -> dict:
    """
    Lê uma ficha. Se `num_tarefas` for informado (produção, via QR→banco),
    mede exatamente essas linhas. Sem ele, tenta descobrir quantas há (modo
    autônomo de teste; pode contar uma linha a mais perto do rodapé).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    qr = cv2.QRCodeDetector().detectAndDecode(img_bgr)[0]
    pts = achar_fiduciais(gray)
    if pts is None:
        return {"ok": False, "erro": "fiduciais não encontrados", "qr": qr}
    canon = endireitar(gray, pts)
    cx, _ = _to_canon(CAIXA_X_PDF, 0)

    linhas, nao_box, comecou = [], 0, False
    total = num_tarefas if num_tarefas else max_linhas
    for i in range(1, total + 1):
        _, cy = _to_canon(CAIXA_X_PDF, LINHA0_PDF - LINHA_DELTA * i)
        fi = _tinta(canon, cx, cy, CAIXA_LADO_PDF, 0.55)
        if num_tarefas:
            linhas.append({"linha": i, "marcada": fi > LIMIAR_MARCA,
                           "tinta": round(fi, 3), "confianca": _confianca(fi)})
        else:
            fb = _tinta(canon, cx, cy, CAIXA_LADO_PDF * 1.6, 1.0)
            if fb > LIMIAR_BORDA:
                comecou, nao_box = True, 0
                linhas.append({"linha": len(linhas) + 1, "marcada": fi > LIMIAR_MARCA,
                               "tinta": round(fi, 3), "confianca": _confianca(fi)})
            elif comecou:
                nao_box += 1
                if nao_box >= 3:
                    break

    # EPIs no rodapé (coluna fixa) — lido igual às tarefas.
    epis, nao_e, comecou_e = [], 0, False
    cxe, _ = _to_canon(EPI_X_PDF, 0)
    total_e = num_epis if num_epis else 6
    for i in range(1, total_e + 1):
        _, cy = _to_canon(EPI_X_PDF, EPI_LINHA0_PDF - EPI_DELTA * i)
        fi = _tinta(canon, cxe, cy, CAIXA_LADO_PDF, 0.55)
        if num_epis:
            epis.append({"epi": i, "marcada": fi > LIMIAR_MARCA, "tinta": round(fi, 3), "confianca": _confianca(fi)})
        else:
            fb = _tinta(canon, cxe, cy, CAIXA_LADO_PDF * 1.6, 1.0)
            if fb > LIMIAR_BORDA:
                comecou_e, nao_e = True, 0
                epis.append({"epi": len(epis) + 1, "marcada": fi > LIMIAR_MARCA, "tinta": round(fi, 3), "confianca": _confianca(fi)})
            elif comecou_e:
                nao_e += 1
                if nao_e >= 2:
                    break

    return {
        "ok": True,
        "qr": qr,
        "tarefas": linhas,
        "epis": epis,
        "feitas": sum(1 for l in linhas if l["marcada"]),
        "revisar": sum(1 for l in (linhas + epis) if l["confianca"] == "baixa"),
    }
