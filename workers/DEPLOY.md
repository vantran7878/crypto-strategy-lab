# Deploy Workers lên Render.com (Background Worker)

## Tổng quan

Hai worker Python được thiết kế để chạy như **background workers** trên Render.com:

| Worker | Mô tả | Render Service Type |
|--------|-------|---------------------|
| `ai-strategy` | Chạy chiến lược AI đã lưu trên dữ liệu candle (subprocess của Nest API) | Web service (startCommand) |
| `news` | Crawl news + sentiment scoring, upsert vào DB | Web service (startCommand) |

> ⚠️ **Lưu ý**: Render chỉ hỗ trợ chạy một process khi `startCommand` được gọi. Cả hai worker đều được thiết kế để chạy như subprocess độc lập — không phải long-running server.

---

## Worker 1: AI Strategy Execution (`workers/ai-strategy`)

### Cấu hình Render

Tạo service mới trên [Render dashboard](https://dashboard.render.com):

```
- Name: crypto-strategy-lab-ai-strategy-worker
- Environment: Web Service
- Region: Oregon (hoặc bất kỳ)
- Build Command: Không cần (single-file script)
- Start Command: `python run.py`
- Environment Variables (optional, để debug/logging):
    - PYTHONUNBUFFERED=1
```

### Cách hoạt động

Khi Nest API nhận request `POST /strategies/execute`, nó sẽ:

1. Parse & validate strategy code → lưu vào DB
2. Chạy subprocess: `python workers/ai-strategy/run.py` (streaming input/output)

→ Worker này **không cần chạy liên tục**, chỉ cần sẵn sàng ở trạng thái "stopped" để Render tự restart khi có traffic.

### Directory structure

```
workers/ai-strategy/
├── run.py              # Entry point (khi gọi lệnh startCommand trên Render)
│                        # Và là subprocess handler cho Nest API
├── sandbox.py          # Restricted globals + timeout wrapper
└── validate.py         # Safety checks (không cần deploy lên Render, giữ ở repo chính)
```

---

## Worker 2: News Crawler (`workers/news`)

### Cấu hình Render

Tạo service mới:

```
- Name: crypto-strategy-lab-news-worker
- Environment: Web Service
- Region: Oregon
- Build Command: `pip install -r requirements.txt`
- Start Command: `python main.py`
- Environment Variables (optional):
    - SENTIMENT_PROVIDER=finbert   # hoặc lexicon
```

### Cách hoạt động

Khi Nest API nhận request `POST /news/crawl`, nó sẽ subprocess `workers/news/main.py`. Worker này:

1. Load config (`config/*_sources.yml`)
2. Crawl mỗi source (RSS/HTML/API) → dedupe bằng `id`
3. Sentiment scoring qua provider đã cấu hình
4. Upsert vào Postgres bảng `news`

### Cấu trúc project

```
workers/news/
├── main.py                 # Entry point (Render + Nest API subprocess)
├── pyproject.toml         # Dependencies + [tool.render] metadata
├── README.md              # Hướng dẫn chạy locally
├── .render.yml            # Render config (tự động apply khi deploy qua git)
├── requirements.txt       # Đã thêm torch/transformers cho sentiment
├── src/                   # Module structure
│   └── core/
│       ├── crawler/       # Crawler logic + parser factory
│       ├── db/            # NewsRepository (Postgres upserts)
│       └── sentiment/    # FinBERT / Lexicon providers
├── config/                # source configs (RSS, HTML, API sources)
├── models/                # Phỏng kiến: finbert model files (.bin/.safetensors)
└── test/                  # Unit tests
```

---

## Deployment Checklist

### Trước khi deploy lên Render

- [ ] Kiểm tra `.render.yml` đã có ở root của mỗi worker folder
- [ ] `requirements.txt` đầy đủ dependencies (bao gồm sentiment nếu dùng FinBERT)
- [ ] Postgres container sẵn sàng (TimescaleDB qua docker-compose hoặc Render Database)
- [ ] Environment variables được set trên Render dashboard

### Deploy từng bước

#### Worker: ai-strategy

1. Vào Dashboard → New → Web Service
2. Fill form:
   - **Name**: `crypto-strategy-lab-ai-strategy-worker`
   - **Branch**: `main` (hoặc branch có commit mới nhất)
   - **Root Directory**: `workers/ai-strategy`
   - **Environment**: Python
   - **Build Command**: (để trống, single-file script)
   - **Start Command**: `python run.py`
3. Chọn plan: `Starter` (free tier đủ dùng cho dev/demo)
4. Deploy → chờ Render build & restart

#### Worker: news

1. Tạo service mới tương tự, nhưng thêm:
   - **Build Command**: `pip install -r requirements.txt`
2. Environment Variables:
   ```
   POSTGRES_URL=postgres://user:pass@host:5432/crypto_ml
   SENTIMENT_PROVIDER=finbert   # hoặc "lexicon" để chạy không cần model file
   RSS_SOURCES=rss1,rss2        # từ config/rss_sources.yml
   HTML_SOURCES=url1,url2       # từ config/html_sources.yml
   API_SOURCES={...}            # từ config/api_sources.yml
   ```

3. Deploy → chờ build (torch + transformers sẽ tốn ~5-10 phút)

---

## Observability & Monitoring

Render cung cấp:

- **Logs**: Vào "Live Log" tab trên dashboard để xem stderr/stdout của worker
- **Health check**: Có thể thêm endpoint `/health` nếu cần auto-restart logic phức tạp hơn

### Best practices

- Không dùng `while True: pass` trong `startCommand` — chỉ gọi script và exit. Render sẽ tự restart khi có request tới.
- Nếu worker cần chạy continuously (ví dụ: crawl schedule mỗi 5 phút), hãy tạo **Cron Job** trên Render thay vì giữ process sống mãi.
- Sử dụng `.render.yml` để quản lý environment variables một cách declarative — thay vì set thủ công qua dashboard.

---

## Troubleshooting

### Worker không thể kết nối DB

→ Kiểm tra `POSTGRES_URL` trong Environment Variables, hoặc tạo **Render Database** riêng và set `DATABASE_URL`.

### Sentiment scoring chạy rất chậm (FinBERT)

→ Dùng model file đã download sẵn lên Render File System (`workers/news/models/`) và đặt môi trường `SENTIMENT_PROVIDER=finbert` cùng với biến `FINBERT_MODEL_PATH=/app/models/...`.

### Worker crash ngay khi start

→ Xem "Live Log" — thường do thiếu dependency hoặc DB connection failed. Render sẽ retry tự động, nhưng hãy fix lỗi đầu tiên để tránh infinite restart loop.
