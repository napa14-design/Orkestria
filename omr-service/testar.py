# -*- coding: utf-8 -*-
"""
Teste local do leitor OMR contra um PDF (escaneado) ou uma imagem.

Uso:
  python testar.py "caminho/para/fichas.pdf"
  python testar.py "caminho/para/ficha.png"

Para PDF precisa do poppler (pdftoppm) no PATH.
"""
import sys, os, glob, subprocess, tempfile
import cv2

from reader import ler_ficha


def paginas_de(caminho: str):
    if caminho.lower().endswith(".pdf"):
        tmp = tempfile.mkdtemp(prefix="omr_")
        subprocess.run(["pdftoppm", "-png", "-r", "220", caminho, os.path.join(tmp, "p")], check=True)
        return sorted(glob.glob(os.path.join(tmp, "p*.png")))
    return [caminho]


def main():
    if len(sys.argv) < 2:
        print("uso: python testar.py <arquivo.pdf|imagem>")
        return
    for pg in paginas_de(sys.argv[1]):
        img = cv2.imread(pg)
        r = ler_ficha(img)  # modo autônomo (sem num_tarefas)
        if not r["ok"]:
            print(f"{os.path.basename(pg)}: FALHA - {r.get('erro')} (qr={r.get('qr')!r})")
            continue
        print(f"\n{os.path.basename(pg)}  QR={r['qr']}")
        print(f"  {len(r['tarefas'])} tarefas | feitas: {r['feitas']} | revisar: {r['revisar']}")
        for l in r["tarefas"]:
            flag = "X" if l["marcada"] else " "
            rev = "  <revisar>" if l["confianca"] == "baixa" else ""
            print(f"    [{flag}] linha {l['linha']:2d}  tinta={l['tinta']:.3f}{rev}")


if __name__ == "__main__":
    main()
