# Hướng dẫn Deploy Crypto Strategy Lab — Full Stack

## Tổng quan kiến trúc deploy

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (Vite + React)                                  │
│      ↓ build → dist/                                      │
│     ┌─────────────────────┬────────────────────────────┐ │
│     │    Vercel           │   GitHub Pages             │ │
│     │   (recommended)      │  (alternative — free tier) │ │
│     └─────────────────────┴────────────────────────────┘ │
│                                                             │
│       ↕ HTTP API calls via /api/* proxy                    │
│                                                             │
┌──────────────────────────────────────────────────────────┐
│  Backend (NestJS TypeScript) — Render.com PostgreSQL       │
│      ┌─────────────────┬──────────────┬─────────────────┐ │
│      │   TimescaleDB   │    Redis     │  Worker Python   │ │
│      │  (candles +     │  (BullMQ)    │  (subprocesses) │ │
│      │   business data) │              │                 │ │
│      └─────────────────┴──────────────┴─────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Các bước deploy

### 1. Backend — NestJS API lên Render.com

**File cấu hình**: `database/.render.yml` + `service/Dockerfile` + `database/migrate.js`

→ Xem hướng dẫn chi tiết: [./backend.md](./backend.md)

> ✅ Sau khi backend đã chạy, bạn sẽ có URL:
> ```
> https://your-api-app-name.onrender.com/api
> ```

### 2. Frontend — Vite React lên Vercel / GitHub Pages

**File cấu hình**: `web-platform/.vercelignore` + `web-platform/README_VERCEL_DEPLOY.md`

→ Xem hướng dẫn chi tiết: [./frontend.md](./frontend.md)

### 3. Workers — Python subprocess (không cần container riêng)

Workers là **subprocesses** được gọi bởi NestJS API khi nhận request, nên không cần deploy lên Render như một service riêng biệt. Chúng chạy trong cùng environment với backend API.

- `workers/ai-strategy/run.py` → được gọi bởi `/api/strategies/:id/execute`
- `workers/news/main.py` → được gọi bởi `/api/news/crawl`

→ Xem hướng dẫn chi tiết: [./workers.md](./workers.md)

### 4. Database — TimescaleDB + Redis trên Render

Backend sử dụng PostgreSQL (TimescaleDB extension) và Redis cho BullMQ queue. Cả hai đều được deploy như **Render Services** riêng biệt, kết nối qua Docker Compose khi chạy local.

→ Xem hướng dẫn chi tiết: [./database.md](./database.md)

---

## Environment variables cần set

### Backend (NestJS — Render)

| Biến | Giá trị |
|------|---------|
| `DATABASE_URL` | `postgres://user:pass@timescaledb.render.com:5432/crypto_strategy_lab` |
| `REDIS_URL` | `redis://host:port` hoặc Redis Cloud connection string |
| `NODE_ENV=production` | — |

### Frontend (Vercel)

| Biến | Giá trị |
|------|---------|
| `VITE_API_URL` | `https://your-api-app-name.onrender.com/api` |
| `NODE_ENV=production` | — |

---

## Timeline deploy dự kiến

| Bước | Thời gian | Ghi chú |
|------|-----------|---------|
| 1. Setup DB (TimescaleDB) trên Render | ~30s | Free tier → có thể cần upgrade Pro ($7/mo cho 512MB RAM) nếu data > 500MB |
| 2. Deploy NestJS API lên Render | 3-5 phút | Build container + pull image + spin up process |
| 3. Deploy Frontend lên Vercel | 1-2 phút | Auto-deploy khi commit code |

**Tổng cộng: ~5-10 phút** (bao gồm cả thời gian render database và warm-up).

---

## Tổng kết chi phí (free tier)

| Component | Plan | Chi phí/tháng |
|-----------|------|--------------|
| Render PostgreSQL (TimescaleDB) | Free (750MB) | $0 — hoặc Pro $19/mo cho 3GB + backups |
| Render Redis (hoặc Redis Cloud) | Free (64MB) → Pro ($7/mo) | ~$7-12/mo nếu cần > 100MB RAM |
| Vercel Frontend | Hobby tier | $0 (unlimited bandwidth, 100 req/s) |
| **Tổng cộng** | — | **~$7-30/tháng** (hoặc $0 nếu dùng free tier và data nhỏ) |

> 💡 Nếu dự kiến traffic > 5k users/ngày hoặc cần backups tự động → upgrade lên Render Pro ($19/mo cho database riêng).

---

## Checklist deploy hoàn tất

- [ ] Database PostgreSQL đã tạo trên Render + chạy (status: Running)
- [ ] Redis instance đã tạo trên Render/Redis Cloud + đang chạy
- [ ] Backend NestJS API đã deploy → trả về `200 OK` khi gọi `/api/market-data/candles`
- [ ] Frontend đã build thành công (`npm run build`)
- [ ] Vercel đã auto-deploy sau commit mới nhất
- [ ] URL frontend mở được → có thể login/logout qua backend

---

## Tài liệu liên quan

| File | Mục đích |
|------|----------|
| `docs/deploy/backend.md` | Hướng dẫn chi tiết deploy NestJS lên Render |
| `docs/deploy/frontend.md` | Hướng dẫn chi tiết deploy frontend lên Vercel/GitHub Pages |
| `docs/deploy/database.md` | Hướng dẫn setup TimescaleDB + Redis trên Render |
| `docs/deploy/workers.md` | Hướng dẫn cấu hình Python workers (subprocess) |

---

## Liên hệ / Hỏi đáp

Nếu gặp lỗi khi deploy, hãy xem file [`artifacts/decisions.md`](../decisions.md) để biết các design decisions và trade-offs đã thảo luận.
