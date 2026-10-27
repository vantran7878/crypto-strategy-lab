# Deploy Frontend lên Vercel (hoặc GitHub Pages)

## Tổng quan

Frontend được build bằng **Vite + React** với TypeScript. Sau khi `npm run build`, bạn sẽ có một folder `dist/` chứa HTML, JS, CSS đã được bundle sẵn — hoàn toàn tĩnh, không cần server Node.js để serve.

---

## Lựa chọn 1: Deploy lên Vercel (recommended)

### Cách 1a: Deploy tự động qua Git (recommended)

#### Bước 1: Commit frontend vào repo chính

```bash
cd web-platform
git add .
git commit -m "chore: setup vercel deployment config"
git push origin main
```

#### Bước 2: Tạo project mới trên Vercel

1. Truy cập [vercel.com](https://vercel.com) → sign in với GitHub
2. Click **"New Project"** → chọn repo `crypto-strategy-lab` từ GitHub
3. Điền form deployment:

   | Field | Giá trị |
   |-------|---------|
   | **Name** | `crypto-strategy-lab-frontend` (hoặc tên tùy bạn) |
   | **Framework Preset** → chọn **Other** (vì project này dùng Vite, không phải Next.js/Remix) |
   | **Root Directory** → để trống hoặc điền `web-platform` nếu muốn deploy từ thư mục con của repo chính |
   | **Build Command** → `npm install && npm run build` |
   | **Output Directory** → `dist` |
   | **Install command** → `npm install` |

4. Click **"Deploy"**

#### Bước 2b: Cấu hình Environment Variables trên Vercel Dashboard

Sau khi tạo project, vào tab **Settings → Environment Variables**:

```
VITE_API_URL=https://your-api-app-name.onrender.com/api
NODE_ENV=production
```

> ⚠️ Quan trọng: `VITE_API_URL` phải trỏ tới **NestJS API backend** đã deploy trên Render. Nếu không có giá trị này, frontend sẽ lỗi khi gọi `/api/*`.

#### Bước 3: Deploy

Sau khi commit config mới lên GitHub → Vercel tự động build và deploy (khoảng 1-2 phút).

URL cuối cùng: `https://your-project.vercel.app`

---

### Cách 1b: Deploy thủ công qua CLI (nếu muốn test nhanh)

```bash
npm install -g vercel
cd web-platform
vercel
# → Follow prompts, set VITE_API_URL manually khi hỏi
```

---

## Lựa chọn 2: GitHub Pages (alternative — free tier)

### Setup GitHub Pages cho repo `crypto-strategy-lab`

1. Vào repo trên GitHub → Settings → Pages
2. Source → chọn branch `gh-pages` hoặc `main` → Folder `/root`
3. Commit file `.github/workflows/deploy.yml` (xem bên dưới) để CI tự động build & push lên `gh-pages`.

### Tạo workflow CI/CD: `.github/workflows/deploy.yml`

```yaml
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        working-directory: web-platform
        run: |
          npm ci
          echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc
          npm install

      - name: Build
        working-directory: web-platform
        run: |
          VITE_API_URL=${{ secrets.VITE_API_URL || 'http://localhost:3000' }} npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./web-platform/dist
```

> ⚠️ Lưu ý: Nếu dùng cách này, bạn cần tạo **GitHub Secret** `VITE_API_URL` trong repo settings để CI có thể inject biến môi trường vào build process. Hoặc set giá trị mặc định là `http://localhost:3000` cho local dev và đổi thành production URL khi deploy thật.

---

## So sánh Vercel vs GitHub Pages

| Tiêu chí | **Vercel** ✅ | **GitHub Pages** |
|----------|--------------|------------------|
| **Tốc độ** | CDN toàn cầu, edge network → rất nhanh | CDN của GitHub (cũng khá tốt) |
| **SSL/TLS** | Auto HTTPS | Auto HTTPS |
| **Preview deployments** | ✅ Mỗi PR có preview URL riêng | ⚠️ Cần cấu hình thêm hoặc chỉ deploy trên main branch |
| **CI/CD tự động** | ✅ Khi push code lên repo liên kết | ✅ Qua GitHub Actions |
| **Free tier** | ✅ Unlimited bandwidth, 100 req/s | ✅ Unlimited (nhưng có giới hạn số lượng build) |
| **Setup complexity** | Low — drag-and-drop hoặc connect Git | Medium — cần workflow + secrets |
| **Recommended cho MVP** | ✅ Đơn giản hơn, ít config | OK nếu muốn host hoàn toàn miễn phí trên GitHub |

---

## Local dev sau khi setup production config

Để test frontend với backend local (NestJS chạy trên `localhost:3000`):

```bash
cd web-platform
# Copy .env.example → .env và sửa VITE_API_URL=http://localhost:3000
cp .env.example .env
nano .env  # hoặc bất kỳ editor nào để set giá trị

npm run dev
```

Để test frontend với backend production (Render):

```bash
cd web-platform
cp .env.example .env
# Sửa: VITE_API_URL=https://your-api-app.onrender.com/api
nano .env
npm run build
npm run preview  # server static local để debug
```

---

## Troubleshooting

### Lỗi CORS khi gọi backend từ browser

Nếu bạn thấy lỗi `CORS policy blocked` trong console browser:

1. Backend NestJS phải set header `Access-Control-Allow-Origin: *` hoặc giới hạn domain frontend của bạn.
2. Hoặc dùng Vercel proxy: tạo endpoint `/api/*` trên Vercel để forward lại tới Render API (xem [Vercel proxy](https://vercel.com/docs/deployments/creating-a-proxy)).

### Lỗi `Cannot find module '@/...'` sau khi build

→ Đảm bảo `tsconfig.json` có `baseUrl` và `paths` đúng:

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

### Lỗi socket.io kết nối failed

→ Kiểm tra `VITE_API_URL` có đúng không. Socket.IO client sẽ gọi `ws://your-api-url:3000/socket.io`. Nếu bạn set `VITE_API_URL=https://...`, frontend vẫn phải connect tới port 443 (HTTPS) — nhưng NestJS server trên Render chỉ accept kết nối trên port 443, nên socket vẫn hoạt động.

---

## Checklist deploy production

- [ ] `web-platform/.vercelignore` đã có
- [ ] `web-platform/README_VERCEL_DEPLOY.md` đã commit vào repo
- [ ] Backend NestJS API URL đã được set trong `.env.example` hoặc Vercel dashboard
- [ ] Test build local: `npm run build` → không error
- [ ] Commit & push lên GitHub
- [ ] Vercel auto-deploy thành công
