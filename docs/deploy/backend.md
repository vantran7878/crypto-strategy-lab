# Deploy Backend (NestJS API) lên Render.com

## Tổng quan

Backend là một **NestJS TypeScript** server chạy trên Node.js, sử dụng PostgreSQL (TimescaleDB) cho database và Redis cho BullMQ queue.

Chúng ta sẽ deploy nó như một **single-file Docker container** — không cần build process phức tạp vì NestJS đã được compile sẵn từ `service/`.

---

## Cấu trúc folder backend

```
crypto-strategy-lab/
├── service/                ← Backend NestJS (đã build sẵn)
│   ├── src/
│   │   └── main.ts        ← Entry point duy nhất
│   ├── Dockerfile         ← Render sẽ build từ đây
│   └── package.json       ← Dependencies
├── database/               ← Migrations + seeds
│   ├── migrations/*.sql
│   └── seed.sql           ← Optional: initial data
├── workers/                ← Python subprocesses (không cần deploy riêng)
└── docs/deploy/backend.md
```

> ⚠️ Lưu ý: `service/dist/` đã chứa code TypeScript đã compile thành JavaScript. Render sẽ mount thư mục này vào container.

---

## Bước 1: Tạo Dockerfile cho backend

Tạo file `service/Dockerfile`:

```dockerfile
# ============================================================
# Crypto Strategy Lab — Backend API Service
# Build for Render.com (or any Docker host)
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files & install dependencies (production-only)
COPY service/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled TypeScript → JavaScript
COPY service/dist/ ./dist

# ============================================================
# Runtime image — minimal, non-root user for security
# ============================================================

FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user (security best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app && \
    chmod -R 755 /app

USER nodejs

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

---

## Bước 2: Cấu hình environment variables

Tạo file `service/.env.example`:

```bash
# service/.env.example
NODE_ENV=production
PORT=3000

DATABASE_URL=postgres://user:password@host:5432/crypto_strategy_lab
REDIS_URL=redis://host:6379

# Optional: Sentry DSN (nếu dùng error tracking)
SENTRY_DSN=

# Optional: OpenTelemetry / logging
LOG_LEVEL=info
```

Copy file này vào root repo, commit và thêm vào `.gitignore` nếu muốn.

---

## Bước 3: Tạo `.render.yml` cho backend

Tạo file `service/.render.yml`:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-api
    env: node
    region: oregon
    plan: starter
    buildCommand: "docker build --target runtime -t crypto-strategy-lab-api ."
    startCommand: "docker run -p 3000:3000 --env-file ./.env.prod crypto-strategy-lab-api"
```

> ⚠️ Lưu ý: Render **không** hỗ trợ chạy `docker run` trực tiếp từ `.render.yml`. Cách đúng là dùng `buildCommand` để build image, sau đó Render tự động pull và chạy container.

### Cách đơn giản hơn — Deploy như một static web service (recommended)

Vì NestJS đã được compile sẵn (`service/dist/main.js`), ta có thể deploy như một **static file** (không cần Docker):

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-api
    env: node
    region: oregon
    plan: starter
    buildCommand: ""
    startCommand: "node dist/main.js"
```

Render sẽ mount folder `service/` vào `/app/service`. Bạn cần copy file `.env.prod` (hoặc set qua dashboard) trước khi deploy.

---

## Bước 4: Deploy lên Render Dashboard

### Tạo service

1. Truy cập [dashboard.render.com](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Fill form:

   | Field | Giá trị |
   |-------|---------|
   | **Name** | `crypto-strategy-lab-api` |
   | **Environment** | **Node** |
   | **Root directory** | `service/` (hoặc để trống nếu muốn mount root vào `/app`) |
   | **Build Command** | Để trống (static file) HOẶC `docker build --target runtime -t csl-api .` |
   | **Start Command** | `node dist/main.js` (nếu dùng static deploy) |
   | **Branch** | `main` |
   | **Plan** | Starter ($7/mo cho 512MB RAM) hoặc Standard ($7-14/mo tùy config) |

### Set environment variables

Sau khi tạo service, vào tab **"Settings"** → subtab **"Environment Variables"**:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:pass@ep-xxxxx.us-east-1.aws.render.com:5432/crypto_strategy_lab
REDIS_URL=redis://user:pass@ep-xxxxx.redis.render.com:6379
```

> ⚠️ Quan trọng: `DATABASE_URL` phải trỏ tới **Render PostgreSQL service** đã tạo ở [database.md](./database.md). Tương tự cho `REDIS_URL`.

---

## Bước 5: Kiểm tra deployment

Sau khi Render deploy xong (status: Running), mở URL của service và kiểm tra endpoint `/health`:

```bash
curl https://your-api-app-name.onrender.com/health
# Expected response: {"status":"ok"}
```

Hoặc gọi API test:

```bash
curl -X GET "https://your-api-app-name.onrender.com/api/market-data/candles?timeframe=1m&start=2026-08-01T00%3A00%3A00Z&end=2026-08-01T00%3A05%3A00Z"
```

→ Nếu thấy data JSON, backend hoạt động OK.

---

## Bước 6: Cấu hình CORS cho frontend (nếu cần)

Nếu frontend deploy lên domain khác (ví dụ `vercel.app`), NestJS backend phải set header CORS:

Trong `service/src/main.ts`, trước khi khởi động server:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for all origins (production: giới hạn domain frontend cụ thể)
  app.enableCors({
    origin: '*', // hoặc ['https://your-frontend.vercel.app']
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.listen(3000);
}
bootstrap();
```

---

## Tổng kết chi phí backend

| Component | Plan | Chi phí/tháng |
|-----------|------|--------------|
| Render PostgreSQL (TimescaleDB) | Free 750MB hoặc Pro $19/mo cho 3GB | $0–$19 |
| Render Redis (hoặc Redis Cloud) | Free 64MB hoặc Pro $7/mo | $0–$7 |
| NestJS API service | Starter $7/mo hoặc Standard $28/mo | $7–$28 |
| **Tổng** | — | **~$7–54/tháng** (hoặc ~$12-36 nếu dùng Pro DB) |

> 💡 Nếu traffic nhỏ (< 5k users/ngày), free tier đủ dùng. Nếu cần backups tự động, monitoring tốt hơn → upgrade lên Pro.

---

## So sánh Render vs Heroku vs Railway

| Platform | Backend cost (NestJS) | Database | Redis | Tổng tháng đầu |
|----------|-----------------------|----------|-------|---------------|
| **Render.com** | $7/mo (Starter) + DB ($0) + Redis ($0) = ~$7–19 | PostgreSQL built-in | Built-in hoặc Redis Cloud | ~$7–26 |
| Heroku | $7/mo (Hobby) | Postgres add-on (~$5-9) | Redis addon (~$7) | ~$19–24 |
| Railway | Free tier 10GB/s = ~10k req/hour | PostgreSQL free tier ($5-10) + Redis ($3-8) | — | ~$18–28 |

→ **Render.com** có chi phí thấp nhất cho MVP, đồng thời dễ tích hợp với GitHub Actions (auto-deploy).

---

## Troubleshooting

### Lỗi `Cannot find module 'dist/main.js'`

→ Đảm bảo bạn đã build project TypeScript trước khi deploy:

```bash
cd service
npm run build
git add . && git commit -m "chore: build backend" && git push
```

Render sẽ pull code mới → mount folder vào container.

### Lỗi `ECONNREFUSED 3000` hoặc `404 Not Found`

→ Render cần 1-2 phút để warm-up sau khi deploy. Kiểm tra tab **"Live Log"** trên dashboard để xem có lỗi gì không.

### Lỗi CORS từ browser

→ Xem phần [Bước 6](#bước-6-cấu-hình-cors-cho-front-end-nếu-cần) ở trên.

---

## Next steps

1. ✅ Backend đã deploy → lấy URL: `https://your-api-app-name.onrender.com`
2. → Deploy database (xem [`database.md`](./database.md))
3. → Deploy frontend lên Vercel (xem [`frontend.md`](./frontend.md)) — set `VITE_API_URL=https://your-api-app-name.onrender.com/api`

---

## Tài nguyên tham khảo

- [Render PostgreSQL docs](https://docs.render.com/postgres)
- [Render Redis docs](https://docs.render.com/redis)
- [NestJS Docker deployment guide](https://docs.nestjs.com/deployment/docker)
