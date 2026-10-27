# Frequently Asked Questions — Deployment

## Q: Tại sao không dùng Supabase mà là Render PostgreSQL?

**A:** Hai lý do chính:

1. **TimescaleDB extension**: Schema của project có bảng `candles` sử dụng TimescaleDB hypertable (partitioned time-series). Render PostgreSQL hỗ trợ chạy extensions (TimescaleDB, PostGIS...). Supabase không cho phép dùng extensions ngoài trong free tier.
2. **Migration-friendly**: Render cho phép bạn chạy custom build command để chạy migration script (`database/migrate.js`). Supabase không có concept "run migration scripts" — mọi thứ phải được set qua DB console hoặc SQL migrations của chính họ.

→ Kết luận: Render PostgreSQL phù hợp hơn với kiến trúc hiện tại của project.

## Q: Tôi có thể dùng Vercel cho backend NestJS không?

**A:** Có, nhưng cần một chút config extra:

1. Bạn phải build NestJS app thành container Docker (hoặc compile `.ts` → `.js`).
2. Render hỗ trợ Node.js service đơn giản hơn — chỉ cần mount folder `service/dist/` và chạy `node dist/main.js`.
3. Nếu dùng Vercel, bạn sẽ có cold start lâu hơn vì mỗi request mới phải load module từ zero (khi không bật serverless function warming).

→ Khuyến nghị: Render cho backend, Vercel cho frontend.

## Q: Frontend cần không cần biết backend URL?

**A:** Có — thông qua biến môi trường `VITE_API_URL`. Khi build production, bạn phải set:

```env
VITE_API_URL=https://your-api.onrender.com/api
```

Nếu bỏ trống hoặc set thành `http://localhost:3000`, frontend sẽ không gọi được API khi deploy lên Vercel.

## Q: Worker Python chạy như subprocess — làm sao biết nó có dependencies không?

**A:** Dockerfile của backend đã bao gồm bước:

```dockerfile
RUN pip install --no-cache-dir \
    beautifulsoup4 feedparser pydantic requests psycopg2-binary pyyaml
```

Nếu muốn dùng FinBERT sentiment model, cần thêm `torch transformers safetensors` vào cùng bước. Model weights (~418MB) có thể download trong build step hoặc mount từ Render File System.

## Q: Làm sao debug khi deployment lên production không hoạt động?

**A:** Công cụ:

- **Render Dashboard → Logs**: xem real-time output của từng service (backend API, database, worker).
- **Vercel Deployment Logs**: xem build logs và runtime logs.
- **Health check endpoints**: `/api/health`, `/queue/health` — gọi qua curl để kiểm tra backend sống.

## Q: Có nên dùng Render Pro ($19/mo) cho PostgreSQL?

**A:** Chỉ cần khi:

- Database > 750MB data (free tier limit).
- Cần backup tự động hàng ngày + point-in-time recovery.
- Dự kiến traffic > ~2,000 requests/giờ liên tục trong hơn 1 giờ.

Nếu không, free tier hoàn toàn đủ cho MVP/demo.

## Q: Làm sao để rollback nếu deploy production làm lỗi?

**A:** Render hỗ trợ **deployment branches**:

1. Mỗi commit mới tạo một deployment branch mới → server roll lại (rollback) tự động nếu health check fail.
2. Nếu muốn rollback thủ công: vào dashboard → project settings → deployments → click "Rollback" chọn deployment trước đó.

## Q: Frontend có thể dùng GitHub Pages thay vì Vercel không?

**A:** Có, nhưng cần thêm workflow CI/CD để build frontend tự động và push lên branch `gh-pages`:

```yaml
# .github/workflows/deploy.yml (đã có trong hướng dẫn frontend.md)
name: Deploy Frontend to GitHub Pages
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Build
        run: |
          cd web-platform
          npm ci && npm install
          VITE_API_URL=${{ secrets.VITE_API_URL }} npm run build
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./web-platform/dist
```

Và set secret `VITE_API_URL` trong GitHub repo settings.

## Q: Có cần dùng Redis Cloud thay vì Render Redis không?

**A:** Không — Render Redis free tier (64MB) đủ cho BullMQ queue của MVP này. Nếu dự kiến lưu hàng triệu jobs hoặc cần persistence lâu dài → upgrade sang Pro ($7/mo).
