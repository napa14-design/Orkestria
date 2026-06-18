# -*- coding: utf-8 -*-
"""
Serviço HTTP do leitor OMR (FastAPI). Roda FORA do Vercel (worker Python).

POST /ler
  multipart: imagem=<arquivo PNG/JPG de UMA ficha>
  query opcional: num_tarefas=<int>  (em produção vem do QR→banco)
  → { ok, qr, tarefas:[{linha, marcada, tinta, confianca}], feitas, revisar }

GET /saude → {ok: true}
"""
from fastapi import FastAPI, UploadFile, File, Query
import numpy as np
import cv2

from reader import ler_ficha

app = FastAPI(title="Orkestria OMR", version="0.1.0")


@app.get("/saude")
def saude():
    return {"ok": True}


@app.post("/ler")
async def ler(imagem: UploadFile = File(...), num_tarefas: int | None = Query(default=None)):
    conteudo = await imagem.read()
    arr = np.frombuffer(conteudo, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return {"ok": False, "erro": "imagem inválida"}
    return ler_ficha(img, num_tarefas=num_tarefas)
