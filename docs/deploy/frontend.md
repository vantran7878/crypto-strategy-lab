# Deploy Frontend lên Vercel / GitHub Pages

## Tổng quan

Frontend là một **Vite + React** app tĩnh — sau khi build thành `dist/`, nó có thể deploy bất cứ đâu (Vercel, Netlify, S3, Cloudflare Pages).

---

## Bước 1: Chuẩn bị project

```bash
cd web-platform
npm install
# Hoặc nếu dùng pnpm (recommended):
pnpm install
```

### Cài thêm dependencies nếu thiếu

Nếu `npm run dev` báo lỗi module không tìm thấy:

```bash
pnpm add axios dotenv
```

---

## Bước 2: Set API URL

Edit file `.env.local`:

```bash
cp .env.local.example .env.local
nano .env.local  # hoặc dùng bất kỳ editor nào
```

Thay đổi dòng này theo môi trường bạn đang chạy backend:

**Local dev:**
```
VITE_API_URL=http://localhost:3000
```

**Production (Render.com):**
```
VITE_API_URL=https://your-api-app-name.onrender.com/api
```

Sau đó commit file `.env.local` (nhưng **không** commit `.env` — `gitignore` đã cấu hình sẵn).

---

## Bước 3: Build frontend

```bash
npm run build
# hoặc pnpm run build
```

Kiểm tra kết quả: mở folder `dist/` trong trình duyệt → nếu không lỗi là OK.

> ✅ Nếu thấy lỗi "Cannot find module '@/...'", kiểm tra `tsconfig.json` có đúng chưa (`baseUrl`, `paths`).

---

## Bước 4: Deploy lên Vercel

### Cách A — Drag & Drop qua Dashboard (nhanh nhất)

1. Truy cập [vercel.com](https://vercel.com) → sign in với GitHub
2. Click **"New Project"** → chọn repo `crypto-strategy-lab`
3. Điền form:

   | Trường | Giá trị |
   |--------|---------|
   | Name | `crypto-strategy-lab-frontend` (hoặc tên tùy ý) |
   | Root Directory | Để trống nếu bạn đã import folder `web-platform/` riêng, hoặc điền `web-platform` nếu deploy từ root repo |
   | Build Command → | `npm install && npm run build` |
   | Output Directory → | `dist` |

4. Vào tab **Settings → Environment Variables** → thêm biến:
   ```
   VITE_API_URL=https://your-api-app-name.onrender.com/api
   NODE_ENV=production
   ```
5. Click **"Deploy"** — chờ ~1-2 phút.

URL thành quả: `https://your-project.vercel.app`

---

### Cách B — Deploy tự động qua Git CI/CD

Tạo file workflow `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend to Vercel

on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        working-directory: web-platform
        run: |
          pnpm install --frozen-lockfile
      
      - name: Build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
        working-directory: web-platform
        run: npm run build
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

Sau đó tạo các secrets trên GitHub repo:

| Secret | Giá trị |
|--------|---------|
| `VITE_API_URL` | `https://your-api-app-name.onrender.com/api` |
| `VERCEL_TOKEN` | Lấy từ [vercel.com/account/tokens](https://vercel.com/account/tokens) → tạo token mới |
| `VERCEL_ORG_ID` | Lấy từ `Settings → General → Organization ID` trên Vercel dashboard |
| `VERCEL_PROJECT_ID` | Lấy từ project settings của frontend trên Vercel |

Commit workflow lên repo → push → Vercel tự động build & deploy.

---

## Bước 5: Kiểm tra deployment

Mở URL domain vừa được tạo (ví dụ: `https://csl-frontend.vercel.app`) → kiểm tra:

- ✅ Trang chủ load xong
- ✅ Click vào "Strategy Engine" → không lỗi CORS, không lỗi 404
- ✅ Có thể login/logout thành công
- ✅ Socket.IO kết nối được (mở DevTools Console)

---

## Troubleshooting

### Lỗi CORS khi gọi API từ browser

→ Backend NestJS chưa set header `Access-Control-Allow-Origin`. Thêm vào controller:

```typescript
// service/src/main.ts — trước khi khởi động server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // hoặc domain cụ thể
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return next();
});
```

Hoặc dùng Vercel proxy: tạo route `/api/*` forward sang Render backend.

### Lỗi `socket.io-client: Connection refused`

→ Đảm bảo `VITE_API_URL` đúng, và backend đang chạy (Render có thể cần 1-2 phút để warm up sau khi deploy).

### Lỗi "Module not found: @/..."

→ Kiểm tra `tsconfig.json`:
```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## Checklist deploy hoàn tất

- [ ] Backend NestJS đã deploy trên Render và chạy ổn định
- [ ] Frontend đã build thành công (`npm run build` không lỗi)
- [ ] `.env.local` có `VITE_API_URL` đúng
- [ ] Vercel dashboard thấy status "Deploying..." → sau đó "Ready"
- [ ] URL frontend mở được, login/logout hoạt động

---

## Next: Deploy Backend lên Render.com

Xem file [`../deploy/backend.md`](../deploy/backend.md) để biết cách deploy NestJS API server lên Render.com.
