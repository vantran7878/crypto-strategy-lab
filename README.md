# Crypto Strategy Lab — Full Stack Deployment Guide

> 📦 **Status**: Backend API (Render.com) ✅ | Database (Render PostgreSQL) ✅ | Frontend (Vercel/GitHub Pages) ✅
>
> 🎯 Mục tiêu: Nền tảng phân tích, kết hợp, backtest và xếp hạng chiến lược giao dịch BTC — đồ án **Kiến trúc phần mềm**.
>
> Kiến trúc: **modular monolith** (NestJS) + **worker tách tiến trình** (BullMQ/Redis) + **worker Python** (crawl news, chạy strategy do AI sinh) + React SPA.

---

## ☁️ Deploy lên Cloud (Production)

> Sau khi setup xong, hệ thống chạy trên:
>
> - **Backend API** → [Render.com](https://dashboard.render.com) (`crypto-strategy-lab-api`)
> - **Database** → Render PostgreSQL + Redis
> - **Frontend** → Vercel (hoặc GitHub Pages)
>
> Chi phí tháng 1: ~$7–26/tháng (tùy free/pro tier)
>
> Hướng dẫn chi tiết cho từng component:
>
> | Component | Tài liệu |
> |-----------|----------|
> | Backend API lên Render.com | [`docs/deploy/backend.md`](./deploy/backend.md) |
> | Database (PostgreSQL + Redis) | [`docs/deploy/database.md`](./deploy/database.md) |
> | Frontend (Vercel/GitHub Pages) | [`docs/deploy/frontend.md`](./deploy/frontend.md) |
> | Workers (subprocess hoặc Render service riêng) | [`docs/deploy/workers.md`](./deploy/workers.md) |

---

## 🏠 Chạy nhanh — Local Development Mode

Sau khi setup xong, hệ thống cần **4 tiến trình chạy song song**: Postgres, Redis, API, worker
(+ dev server frontend). Thiếu worker thì search sẽ nằm `PENDING` mãi không chạy.

Sau khi setup xong, hệ thống cần **4 tiến trình chạy song song**: Postgres, Redis, API, worker
(+ dev server frontend). Thiếu worker thì search sẽ nằm `PENDING` mãi không chạy.

```bash
# 1. Hạ tầng: Postgres (TimescaleDB) + Redis
docker compose up -d timescaledb redis
```

```bash
# 2. Tạo file cấu hình — CẢ HAI file, chỉ làm 1 lần
cp service/.env.example service/.env
cp database/.env.example database/.env
```

> `database/` chạy migration bằng script riêng và đọc `.env` của chính nó — thiếu file này thì
> `npm run db:migrate` báo lỗi kết nối.

```bash
# 3. Migrate + seed 4 strategy hệ thống (chỉ làm 1 lần)
cd database && npm install && npm run db:migrate && npm run db:seed
```

```bash
# 4. Nạp nến lịch sử từ Binance (chỉ làm 1 lần, ~13.000 nến)
cd service && npm install && npm run seed:candles
```

```bash
# 5. API (terminal 1)
cd service && npm run start:dev
```

```bash
# 6. Worker — BẮT BUỘC, không có thì search không chạy (terminal 2)
cd service && npm run start:worker:dev
```

```bash
# 7. Frontend (terminal 3)
cd web-platform && npm install && npm run dev
```

Mở URL Vite in ra terminal. Nếu cổng 5173 đã bị chiếm, Vite tự nhảy sang 5174 — **vẫn dùng bình
thường**, vì frontend gọi backend qua proxy `/api` của Vite chứ không gọi chéo cổng, nên không
vướng CORS.

### Kiểm tra mọi thứ đã lên

```bash
curl http://localhost:3000/health/ready && curl http://localhost:3000/queue/health
```

`/health/ready` phải trả `200` (Postgres + Redis đều sống), và `/queue/health` phải hiện `"workers": 1` cho **cả hai** queue `search` và `news-crawl`. Nếu `workers: 0` → bước 6 chưa chạy.

---

## Yêu cầu môi trường

| Thành phần | Phiên bản | Dùng cho |
|---|---|---|
| Node.js | **20+** (đã test Node 24) | API, worker, frontend |
| Docker | bất kỳ | Postgres + Redis |
| Python | **3.13+** | worker crawl news, chạy AI strategy |

Python < 3.10 sẽ **không chạy được** (code dùng cú pháp `str | bytes`).

### Cài Python worker (cho News & AI Strategy)

```bash
brew install python@3.13
cd workers/news && python3.13 -m venv .venv
.venv/bin/pip install feedparser beautifulsoup4 pydantic requests pyyaml psycopg2-binary torch transformers safetensors
```

Tải model FinBERT về local (~418MB, đã gitignore):

```bash
cd workers/news && .venv/bin/python -c "
from transformers import AutoModelForSequenceClassification, AutoTokenizer
t=AutoTokenizer.from_pretrained('ProsusAI/finbert'); m=AutoModelForSequenceClassification.from_pretrained('ProsusAI/finbert')
t.save_pretrained('models/finbert'); m.save_pretrained('models/finbert')"
```

Không có model thì crawl vẫn chạy, chỉ là bài báo lưu với `sentiment = NULL`.

### AI Strategy (tuỳ chọn)

Cần một endpoint LLM tương thích OpenAI. Thêm vào `service/.env`:

```
OPENAI_BASE_URL=https://models.inference.ai.azure.com
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=...
```

Không có key thì mọi thứ khác vẫn chạy; chỉ riêng nút *sinh strategy* báo lỗi rõ ràng.
`service/.env` đã được gitignore — **đừng commit key**.

---

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `service/` | NestJS modular monolith — 12 module nghiệp vụ, ~30 endpoint, Socket.IO `/market`, raw `pg` (không ORM) |
| `service/src/worker.ts` | Tiến trình worker tiêu thụ job BullMQ (search, crawl) |
| `web-platform/` | React 19 + Vite SPA — 8 màn hình theo `docs/ui-prototype/` |
| `workers/news/` | Python: crawl RSS/HTML/API + sentiment FinBERT, ghi thẳng Postgres |
| `workers/ai-strategy/` | Python: validate (AST allowlist) + chạy strategy do LLM sinh |
| `database/` | Migration SQL đánh số + seed + check |
| `artifacts/` | **Tài liệu thiết kế thực tế đã build** (tiếng Việt) — dùng cho vấn đáp |
| `docs/ui-prototype/` | UI đã duyệt (nguồn sự thật cho giao diện) |
| `docs/about-projects/` | Đề bài gốc |

---

## Tài liệu thiết kế (`artifacts/`)

| File | Nội dung |
|---|---|
| `architecture-c4-level-1.puml` → `.png` | C4 Level 1 — System Context |
| `architecture-c4-level-2.puml` → `.png` | C4 Level 2 — Container (**mở đầu vấn đáp**) |
| `architecture-c4-level-3.puml` → `.png` | C4 Level 3 — Component (class/file có thật) |
| `architecture-flow-search-backtest.puml` → `.png` | Sequence luồng Search → Backtest → Leaderboard |
| `decisions.md` | Nhật ký quyết định kiến trúc kèm lý do |
| `api-contract.md` | Hợp đồng API thật |
| `database.md` | Schema thật + giải thích 4 khái niệm Strategy/Experiment/Config/Candidate |
| `queue.md` | Vì sao dùng queue, topology, retry/cancel |
| `cache.md` | Cache gì, key, TTL, chiến lược invalidate |
| `observability.md` | Log có cấu trúc, correlation id xuyên tiến trình, metrics |
| `ai-strategy.md` | Provider LLM, contract code sinh ra, cổng validate và giới hạn của nó |

Sửa `.puml` rồi render lại (PNG cùng tên file, vd `architecture-c4-level-1.png`):

```bash
cd artifacts
# Cách 1 — PlantUML local
PLANTUML_LIMIT_SIZE=16384 plantuml -tpng -DPLANTUML_LIMIT_SIZE=16384 architecture-c4-level-*.puml architecture-flow-search-backtest.puml

# Cách 2 — Docker (không cần cài PlantUML)
docker run --rm -v "%cd%:/data" plantuml/plantuml -tpng /data/architecture-c4-level-*.puml /data/architecture-flow-search-backtest.puml
```

---

## Luồng demo

1. **Đăng ký / Đăng nhập** → vào workspace
2. **Realtime** — chọn tối đa 4 khung thời gian, nến đẩy qua WebSocket
3. **Strategy Engine** — 4 strategy hệ thống, chỉnh trọng số, xem tín hiệu tổng hợp
4. **Backtest** — cấu hình rồi chạy Search & Backtest thật
5. **Leaderboard** — Top-K tổ hợp, bấm vào xem chi tiết lệnh
6. **News & Sentiment** — bấm *Crawl tin tức*, xem bài thật + phân tích FinBERT

---

## Kiểm thử

```bash
cd service && npm test          # 40 suite / 230 test — không cần Redis hay mạng
cd web-platform && npm run build && npm run lint
cd workers/news && .venv/bin/python -m pytest
```

---

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Search mãi ở `PENDING` | Chưa chạy worker (bước 6) |
| Leaderboard rỗng, 0 trade | Chưa `npm run seed:candles` |
| `/health/ready` trả 503 | Postgres hoặc Redis chưa lên |
| Port 6381/6543 bị chiếm | Đổi port trong `docker-compose.yml` và `service/.env` |
| Crawl news lỗi | Chưa tạo venv Python 3.13 ở `workers/news/` |
| Nút sinh AI strategy báo lỗi | Chưa cấu hình `OPENAI_API_KEY` |
