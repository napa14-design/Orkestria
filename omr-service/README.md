# Orkestria OMR — leitor das fichas (Python/OpenCV)

Serviço que **lê as fichas de rotina escaneadas** e devolve o que foi feito.
Roda **fora do Vercel** (worker Python); o app chama por HTTP.

Não lê letra manuscrita: identifica a ficha pelo **QR**, endireita pelos
**4 cantos pretos** (fiduciais) e mede a **tinta dentro de cada caixa "Feito"**
→ marcada / vazia. Como só mede tinta, funciona com qualquer estilo de marca
(X, tique, risco, ponto, preenchido).

## Arquivos
- `reader.py` — núcleo (QR, fiduciais, endireitar, medir caixas). A geometria
  (em pontos PDF) é a mesma do gerador de fichas; mudou o layout, ajuste lá.
- `app.py` — serviço HTTP (FastAPI): `POST /ler`.
- `testar.py` — teste local contra um PDF/imagem.
- `requirements.txt`.

## Rodar
```bash
cd omr-service
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --port 8001
```

Testar contra um PDF escaneado (precisa de poppler/pdftoppm no PATH):
```bash
python testar.py "C:/.../fichas-escaneadas.pdf"
```

Chamar o serviço:
```bash
curl -F "imagem=@ficha.png" "http://localhost:8001/ler?num_tarefas=6"
```

## Resposta
```json
{
  "ok": true,
  "qr": "ORK1|sede_aldeota|2026-06-18|F001",
  "tarefas": [{"linha":1,"marcada":false,"tinta":0.0,"confianca":"alta"}, ...],
  "feitas": 6,
  "revisar": 1
}
```

## Integração (próximos passos)
1. O app decodifica o QR → busca as `rotinas_planejadas` daquele
   funcionário/data (ordenadas) e passa `num_tarefas` (evita "linha fantasma").
2. Casa cada linha → rotina → grava `execucoes_realizadas` (feito/não feito).
3. Linhas com `confianca: "baixa"` entram numa fila de **revisão humana**.

## Observação de precisão
- `num_tarefas` (vindo do banco) torna a leitura determinística — sem adivinhar
  quantas linhas a ficha tem.
- Para máxima robustez, a ficha impressa deve vir de um gerador de **geometria
  fixa** (a mesma conhecida por `reader.py`).
