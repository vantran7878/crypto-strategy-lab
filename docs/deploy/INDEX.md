# Deployment Documentation Index — Crypto Strategy Lab

## Mục lục (Table of Contents)

1. [Tổng quan](./README.md) — Kiến trúc deployment, so sánh Render vs Supabase, timeline & chi phí
2. [Backend API (NestJS) lên Render.com](./backend.md) — Dockerfile, environment variables, health check
3. [Database: PostgreSQL + Redis trên Render](./database.md) — Setup TimescaleDB + Redis services
4. [Frontend (Vite React) lên Vercel hoặc GitHub Pages](./frontend.md) — Build & deploy config
5. [Workers (Python subprocesses)](./workers.md) — Subprocess trong container hoặc Render service riêng

---

## Quick reference: Deploy checklist

```bash
# ────────────────────────────────────────────────
# 1. DATABASE — Render PostgreSQL + Redis
# ────────────────────────────────────────────────
# • Tạo Render PostgreSQL service → lấy connection string
# • Tạo Render Redis service (hoặc dùng Redis Cloud)
# • Lấy connection strings từ tab "Connect"
# • Set env vars trong backend render project:
#     DATABASE_URL=postgres://...
#     REDIS_URL=redis://...

# ────────────────────────────────────────────────
# 2. BACKEND — NestJS API lên Render
# ────────────────────────────────────────────────
# • Copy `service/Dockerfile` (đã có trong repo)
# • Tạo file .render.yml trong thư mục service/
# • Deploy qua Render Dashboard hoặc Git push trigger
# • Set env vars: DATABASE_URL, REDIS_URL, NODE_ENV=production

# ────────────────────────────────────────────────
# 3. FRONTEND — Vercel hoặc GitHub Pages
# ────────────────────────────────────────────────
# • cd web-platform && npm install && npm run build
# • Upload folder `dist/` lên Vercel (drag & drop)
# • Set env var VITE_API_URL=https://your-api.onrender.com/api

# ────────────────────────────────────────────────
# 4. WORKERS — subprocess trong container backend
# ────────────────────────────────────────────────
# • Workers đã nằm cùng folder với service/Dockerfile
# • Dockerfile đã copy cả workers/* vào runtime image
# • Không cần deploy thêm service riêng (trừ khi cần scale)

# ────────────────────────────────────────────────
# 5. KIỂM TRA — Health check tổng thể
# ────────────────────────────────────────────────
curl https://your-api.onrender.com/health/ready     # → {"status":"ok"}
curl https://your-api.onrender.com/api/market-data/candles?timeframe=1m\&start=2026-08-01T00%3A00%3A00Z\&end=2026-08-01T00%3A05%3A00Z   # → JSON
curl https://your-frontend.vercel.app                # → React app load xong, không lỗi CORS
```

---

## Timeline dự kiến (production deployment)

| Bước | Thời gian | Ghi chú |
|------|-----------|---------|
| Render PostgreSQL setup + migration | ~2 phút | Free tier: instant; Pro: ~30s |
| Render Redis setup | ~1 phút | Free tier có thể cần 5-10 phút đầu tiên (cold start) |
| NestJS API deploy lên Render | 3–5 phút | Build image → pull → spin up |
| Frontend build + Vercel deploy | 1–2 phút | Auto-deploy khi push code mới |

**Tổng cộng: ~6–10 phút.**

---

## Chi phí (ước tính tháng đầu)

| Component | Free tier | Pro / Paid | Ghi chú |
|-----------|-----------|------------|---------|
| Render PostgreSQL (TimescaleDB, 750MB) | $0/mo | $19/mo (3GB + backups tự động) | Upgrade khi data > 500MB |
| Render Redis (64MB free tier) | $0/mo | $7/mo cho 512MB | Cần hơn nếu lưu session nhiều |
| Render API service (Node.js, 512MB RAM) | $7/mo | $28-35/mo tùy config CPU/RAM | Starter plan đủ cho MVP |
| Vercel Frontend | $0 (hobby tier: unlimited bandwidth) | — | 100 req/s free → upgrade Pro nếu > đó |
| **Tổng cộng** | ~$7/mo | ~$36–54/mo | |

> 💡 Nếu dự kiến traffic < 5k users/ngày, **free tier đủ dùng**. Nếu cần backups tự động, monitoring tốt hơn, hoặc data lớn (>1GB) → upgrade lên Pro.

---

## Troubleshooting nhanh

| Triệu chứng | Nguyên nhân khả năng cao | Giải pháp |
|-------------|-------------------------|-----------|
| `/health/ready` trả 503 | Postgres chưa ready (cold start) | Đợi 1-2 phút, hoặc set `DATABASE_URL` đúng |
| Lỗi CORS khi gọi API từ browser | Backend chưa set `Access-Control-Allow-Origin` header | Thêm middleware CORS trong NestJS (`app.enableCors(...)`) |
| Worker báo lỗi "Module not found: xxx" | Python dependencies thiếu | Kiểm tra `requirements.txt`, hoặc add vào Dockerfile build step |
| Frontend load được nhưng API calls fail (404/502) | Backend chưa deploy xong / Render đang warm-up | Đợi thêm 3-5 phút, hoặc kiểm tra Live Log trên Render dashboard |

---

## Liên kết hữu ích

- [Render.com Docs — PostgreSQL](https://docs.render.com/postgres)
- [Render.com Docs — Redis](https://docs.render.com/redis)
- [Vercel Deploy Guide (static + Node.js backend)](https://vercel.com/docs/deployments/deploying-to-vercel#deploying-a-nodejs-project)
- [NestJS Docker deployment reference](https://docs.nestjs.com/deployment/docker)
