# Crypto Strategy Lab — Frontend (Vite + React + TypeScript)

Frontend được build bằng **Vite 8** với **React 19**, sử dụng **TypeScript** cho type safety.

## Local Development

```bash
cd web-platform
npm install
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`.

### Set API URL cho local dev

Nếu backend NestJS của bạn chạy trên port khác (ví dụ `3001`):

```bash
npm run set-api-url -- http://localhost:3001
# hoặc
echo "VITE_API_URL=http://localhost:3001" >> .env.local
```

Frontend sẽ tự động gọi tới backend qua proxy tại `/api/*`.

---

## Production Build

```bash
npm run build
npm run preview  # serve dist/ locally để test trước khi deploy
```

Build output nằm trong `dist/` — đây là folder static cần được upload lên hosting (Vercel, GitHub Pages, hoặc bất kỳ static host nào).

---

## Deploy lên Vercel

### Cách nhanh nhất: Drag & Drop qua Dashboard

1. Truy cập [vercel.com](https://vercel.com) → sign in với GitHub
2. Click **"New Project"** → drag folder `web-platform` vào, hoặc connect repo GitHub có chứa thư mục này
3. Điền form deployment:

   | Field | Giá trị |
   |-------|---------|
   | **Name** | `crypto-strategy-lab-frontend` |
   | **Root Directory** (nếu deploy từ root repo) → `web-platform` |
   | **Build Command** → `npm install && npm run build` |
   | **Output Directory** → `dist` |

4. Vào tab **Settings → Environment Variables**, thêm:
   ```
   VITE_API_URL=https://your-api-app.onrender.com/api
   NODE_ENV=production
   ```
5. Click **Deploy** — Vercel sẽ build và publish trong ~1-2 phút.

### Cách 2: Deploy tự động qua Git (CI/CD)

Thêm workflow vào `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend
on: [push, pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install & Build
        run: |
          cd web-platform
          npm ci
          npm install
          VITE_API_URL=${{ secrets.VITE_API_URL }} npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./web-platform/dist
```

---

## Kiến trúc frontend

```
src/
├── api/              # API client (Axios + types)
│   ├── client.ts     # Axios instance với base URL từ VITE_API_URL
│   └── types.ts      # TypeScript interfaces cho tất cả API responses
├── auth/             # JWT handling, refresh tokens
│   ├── AuthContext.tsx
│   └── jwt.ts        # decode/verify JWT helpers
├── components/       # Reusable UI components (CandleChart, DataTable...)
├── hooks/            # Custom React hooks dùng API client + Zustand stores
├── pages/            # Các trang của ứng dụng (Realtime, Strategy Engine...)
│   ├── RealtimePage.tsx    # Chart BTC multi-timeframe
│   ├── StrategyEnginePage.tsx
│   ├── AiStrategyPage.tsx  # AI prompt → strategy code
│   └── ...
├── state/            # Zustand stores (ExperimentContext, NewsCrawlContext...)
├── lib/              # Utility functions (datetime, marketScope)
├── workspace/        # Layout shell + nav rail config
└── styles/           # Global CSS + design tokens
```

---

## API Contract

Frontend gọi backend qua `/api/*` endpoints. Các endpoint chính:

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/market-data/candles` | GET | Lấy OHLCV data từ Binance (Binance client tự fetch, không gọi DB) |
| `/market-data/import` | POST | Upload file CSV JSONL vào DB `candles` |
| `/auth/login` | POST | Đăng nhập → trả về JWT + refresh token |
| `/auth/refresh` | POST | Refresh token (chuyển đổi refresh token cũ cho token mới) |
| `/strategies/list` | GET | Liệt kê strategies (`SYSTEM` / `USER`) |
| `/experiments/search` | POST | Kickoff search job → trả về job ID |
| `/experiments/:id/status` | GET | Check status của một search job (PENDING/RUNNING/COMPLETED) |
| `/candidates/list?experimentId=...` | GET | Liệt kê candidates từ một experiment |
| `/leaderboards/:id` | GET | Lấy leaderboard data cho một experiment |
| `/news/crawl` | POST | Kickoff crawl job (NestJS gọi worker Python subprocess) |

> ⚠️ **Quan trọng**: Backend NestJS API phải được deploy trước và chạy. Nếu backend chưa có, frontend sẽ lỗi khi gọi bất kỳ endpoint nào.

---

## Socket.IO Realtime Data

Frontend kết nối socket tới: `wss://your-api-app.onrender.com/socket.io`

Socket events:
- `candleUpdate` — stream candle data real-time từ Binance WebSocket (backend relay)
- `experimentStatusUpdated` — update status của một search job đang chạy
- `backtestProgress` — progress bar cho backtest run
- `newsCrawlCompleted` — thông báo crawl hoàn tất

---

## Troubleshooting

### Lỗi CORS khi gọi API từ browser

→ Backend NestJS phải set header:
```typescript
// Trong NestJS controller:
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // hoặc domain cụ thể
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return next();
});
```

Hoặc dùng Vercel proxy để forward `/api/*` tới backend Render.

### Lỗi `Cannot find module '@/components/...'`

→ Kiểm tra `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Lỗi `socket.io-client: Connection refused`

→ Đảm bảo backend đang chạy và socket endpoint `ws://your-api-url:3000/socket.io` có thể reachable từ browser (HTTPS hoặc localhost).

---

## License

MIT © Crypto Strategy Lab
