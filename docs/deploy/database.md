# Deploy Database — TimescaleDB + Redis lên Render.com

## Tổng quan

Database của project bao gồm **2 services** trên Render:

1. **PostgreSQL (TimescaleDB)** — lưu trữ market data (`candles`) + business data (`users`, `experiments`, `candidates`...)
2. **Redis** — message broker cho BullMQ queue (background jobs)

Cả hai đều được deploy như "single-file" services trên Render — không cần build process, chỉ cần một file `.render.yml`.

---

## Bước 1: Tạo PostgreSQL service trên Render

### Cách A — Tạo thủ công qua Dashboard (recommended cho lần đầu)

1. Truy cập [https://dashboard.render.com](https://dashboard.render.com)
2. Sign in với GitHub account của bạn
3. Click **"New +"** → chọn **"Web Service"**
4. Fill form:

   | Field | Giá trị |
   |-------|---------|
   | **Name** | `crypto-strategy-lab-db` (hoặc tên tùy ý) |
   | **Environment** | **PostgreSQL** |
   | **Root directory** | Để trống (Render tự động detect) |
   | **Build command** | Để trống |
   | **Start command** | Để trống |
   | **Branch** | `main` |
   | **Plan** | Free (750MB) hoặc Pro ($19/mo cho 3GB + backups) |

5. Click **"Create Web Service"**

### Cách B — Deploy tự động qua Git (.render.yml)

Tạo file `.render.yml` trong thư mục `database/`:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-db
    env: postgresql
    region: oregon
    plan: starter
    buildCommand: ""
    startCommand: ""
```

Sau đó commit file này vào GitHub. Render sẽ tự động deploy khi có push mới (nếu bạn đã liên kết repo với Render).

> ⚠️ Lưu ý: Khi tạo qua Dashboard, Render sẽ tạo một service PostgreSQL mặc định — không cần set environment variables hay build/start commands vì đây là single-file database.

---

## Bước 2: Tạo Redis service trên Render

Tương tự như trên, nhưng chọn **Redis** làm Environment:

1. Click **"New +"** → **"Web Service"**
2. Fill form:

   | Field | Giá trị |
   |-------|---------|
   | **Name** | `crypto-strategy-lab-redis` |
   | **Environment** | **Redis** |
   | **Root directory** | Để trống |
   | **Build command** | Để trống |
   | **Start command** | Để trống |
   | **Branch** | `main` |
   | **Plan** | Free (64MB) hoặc Pro ($7/mo cho 512MB) |

3. Click **"Create Web Service"**

---

## Bước 3: Lấy connection strings từ Render Dashboard

Sau khi cả hai services đã chạy (status: Running), vào từng service → tab **Connect** để lấy URL.

### PostgreSQL

Click **"Get Connection String"** và copy:

```
postgres://user:password@ep-xxxxxxxx.us-east-1.aws.render.com:5432/crypto_strategy_lab
```

→ Lưu ý Render thường đặt database name là tên project (hoặc `your_project_name`), không phải `crypto_strategy_lab`. Nếu muốn đổi, vào **Settings → Databases** để reconfigure.

### Redis

Click **"Get Connection String"** và copy:

```
redis://user:password@ep-xxxxxxxx.redis.render.com:6379
```

---

## Bước 4: Cấu hình environment variables cho NestJS backend

Trên Render dashboard, vào project của backend → tab **Settings** → subtab **Environment Variables**. Thêm các biến sau:

```env
DATABASE_URL=postgres://user:password@ep-xxxxxxxx.us-east-1.aws.render.com:5432/crypto_strategy_lab
REDIS_URL=redis://user:password@ep-xxxxxxxx.redis.render.com:6379
NODE_ENV=production
```

> ⚠️ Nếu bạn dùng `pg` driver với TimescaleDB extension, có thể cần thêm biến `PG_POOL_MAX=10` hoặc cấu hình connection pool riêng trong NestJS config.

---

## Bước 5: Chạy migrations sau khi database đã chạy

Render PostgreSQL service **không** tự động chạy migration script — bạn cần làm một trong hai cách:

### Cách A — Chạy qua pgAdmin (handy nhất cho MVP)

1. Vào tab **"Connect"** → click **"pgAdmin"**
2. Click **"Login"** → copy connection string vào trình duyệt
3. Trong pgAdmin, mở `psql` shell và chạy:

   ```sql
   \connect crypto_strategy_lab;
   
   -- Chạy file migration SQL trực tiếp
   -- (hoặc copy-paste từng statement từ database/migrations/*.sql)
   ```

### Cách B — Tự động hóa qua Docker Compose + Render build step

Tạo một bước build custom trong Render service config:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-db
    env: postgresql
    region: oregon
    plan: starter
    # Build step để chạy migrations tự động khi deploy
    buildCommand: |
      pip install psycopg2-binary timescaledb-postgresql-18
      python database/migrate.py
    startCommand: "pg_ctl -D /var/lib/postgresql/data start"
```

> ⚠️ Cách này phức tạp hơn và chỉ cần thiết nếu bạn muốn migrations tự động chạy mỗi khi code mới được push lên Render. Đối với MVP, cách A (pgAdmin) là đủ.

---

## Bước 6: Seed data (optional)

Để populate một vài strategies hệ thống vào database, có thể viết một script Python đơn giản gọi `database/seed.js` (hoặc `.py`) và chạy qua Render build step hoặc pgAdmin shell.

Ví dụ seed SQL cho bảng `strategies`:

```sql
INSERT INTO strategies (id, session_id, name, version, type, parameters) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-efghijklmnop', NULL, 'MA', 1, 'MA', '{"fast": {"period": 7}, "slow": {"period": 25}}'),
  ('a1b2c3d4-e5f6-7890-abcd-efghijklmnopq', NULL, 'RSI', 1, 'RSI', '{"period": 14, "overbought": 70, "oversold": 30}'),
  ('a1b2c3d4-e5f6-7890-abcd-efghijklmnopqr', NULL, 'BB', 1, 'BOLLINGER', '{"period": 20, "stdDev": 2.0}');
```

---

## Troubleshooting

### Lỗi `FATAL:  password authentication failed for user` khi kết nối

→ Render PostgreSQL **không** dùng `pg_hba.conf = trust`. Bạn phải set biến môi trường trong Render dashboard:

- Vào project → Settings → Environment Variables
- Thêm biến `POSTGRES_PASSWORD=your_password_here` (hoặc giữ nguyên default mà Render tự generate)

### Lỗi `relation "candles" does not exist` sau khi deploy backend

→ Chạy migration script qua pgAdmin hoặc render build step. Đảm bảo bạn đã commit file `database/migrations/*.sql` vào repo và chạy bước migrate trước khi deploy backend.

### Lỗi `could not connect to server: Connection timed out`

→ Render có firewall mặc định block outbound connections từ service khác nếu không được whitelist. Vào **Settings → Security** của database để enable **"Allow connections from anywhere"** hoặc set IP whitelist (nếu bạn deploy backend trên cùng cluster VPC).

---

## Summary checklist

- [ ] PostgreSQL service đã tạo và status = Running
- [ ] Redis service đã tạo và status = Running
- [ ] Connection strings đã lấy được từ tab "Connect"
- [ ] Environment variables (`DATABASE_URL`, `REDIS_URL`) đã set trong NestJS backend Render project
- [ ] Migration scripts đã chạy (qua pgAdmin hoặc build step)
- [ ] Seed data (optional) đã insert vào bảngs cần thiết

→ Khi hoàn tất checklist → database sẵn sàng cho production.
