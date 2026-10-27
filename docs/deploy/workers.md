# Deploy Workers lên Render.com (hoặc chạy như subprocess trong API container)

## Tổng quan

Workers của project là **Python subprocesses** được gọi bởi NestJS API backend khi nhận request:

- **`ai-strategy/run.py`** — thực thi chiến lược AI đã lưu, trả về signals cho một series candle
- **`news/main.py`** — crawl news + sentiment scoring, upsert vào DB `news` table

Cả hai đều là **background workers** (không có HTTP server riêng của chúng). Chúng được gọi bởi NestJS API thông qua subprocess call.

---

## Lựa chọn 1: Chạy như subprocess trong cùng container với Backend (recommended cho MVP)

### Ưu điểm

- ✅ Đơn giản nhất — không cần deploy thêm service nào
- ✅ Không tốn chi phí extra trên Render
- ✅ Share cùng environment variables, cùng timezone, cùng OS environment

### Nhược điểm

- ❌ Nếu một worker hang indefinitely, nó sẽ block API process (có thể cần watchdog hoặc timeout wrapper)
- ❌ Không scale ngang bằng số lượng như khi deploy riêng

### Cách implement trong NestJS backend

Trong `service/src/main.ts` (hoặc module tương ứng), tạo decorator/handler để gọi subprocess:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class WorkerManager implements OnModuleInit, OnModuleDestroy {
  private workerPids = new Map<string, NodeJS.ChildProcess>();

  async executeAiStrategy(payload: string): Promise<string> {
    const workerPath = process.env.WORKERS_PATH || '/app/workers/ai-strategy/run.py';
    
    // Validate payload before spawning
    if (!payload) throw new Error('No payload provided');

    return new Promise((resolve, reject) => {
      const child = spawn('python', [workerPath], {
        cwd: process.env.WORKERS_PATH || '/app/workers/ai-strategy',
        stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.env.WORKERS_PATH || '/app/workers/ai-strategy'),
        },
      });

      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { console.error(chunk); });

      child.on('error', (err) => reject(err));
      child.on('close', (code, signal) => {
        if (signal !== null) return reject(new Error(`Worker killed with signal: ${signal}`));
        if (code === 0) resolve(stdout);
        else reject(new Error(`Worker exited with code ${code}: ${stdout}`));
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }

  async executeNewsCrawl(): Promise<string> {
    const workerPath = path.join(process.env.WORKERS_PATH || '/app/workers', 'news', 'main.py');
    
    return new Promise((resolve, reject) => {
      const child = spawn('python', [workerPath], {
        cwd: process.env.WORKERS_PATH || '/app/workers/news',
        stdio: ['pipe', 'pipe', 'inherit'],
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.env.WORKERS_PATH || '/app/workers/news'),
          SENTIMENT_PROVIDER: process.env.SENTIMENT_PROVIDER || 'lexicon',
          POSTGRES_URL: process.env.DATABASE_URL, // hoặc biến riêng cho worker nếu cần
        },
      });

      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => console.error(chunk));

      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (signal !== null) return reject(new Error(`Worker killed with signal: ${signal}`));
        resolve(stdout.trim()); // hoặc parse JSON từ stdout
      });

      child.stdin.end(); // empty stdin for news worker — it runs its own main() loop
    });
  }

  onModuleDestroy() {
    for (const [_, pid] of this.workerPids) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
}
```

Trong controller NestJS:

```typescript
@Get('/strategies/:id/execute')
async executeStrategy(@Param('id') id: string) {
  const payload = JSON.stringify({ source: 'MA', candles: [...] }); // ví dụ
  return await this.workerManager.executeAiStrategy(payload);
}

@Post('/news/crawl')
async crawlNews() {
  return await this.workerManager.executeNewsCrawl();
}
```

### Deploy lên Render với cấu hình này

Tạo Dockerfile cho backend:

```dockerfile
FROM node:20-alpine AS builder
# ... build steps for NestJS app ...

FROM node:20-alpine AS runtime

WORKDIR /app

COPY service/dist/ ./dist
COPY service/package*.json ./

# Copy Python workers (đã có trong repo root)
COPY workers/ai-strategy/ ./workers/ai-strategy
COPY workers/news/ ./workers/news
COPY database/migrations/ ./database/migrations  # nếu muốn migrations chạy cùng nhau

# Install Python runtime dependencies cho workers
RUN pip install --no-cache-dir \
    beautifulsoup4 feedparser pydantic requests psycopg2-binary pyyaml

# Optional: cài torch+transformers nếu dùng FinBERT sentiment model
# RUN pip install --no-cache-dir torch transformers safetensors

COPY service/.env.prod .env

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

CMD ["node", "dist/main.js"]
```

Build và deploy lên Render như bình thường.

---

## Lựa chọn 2: Deploy riêng lên Render (cho scale cao)

Nếu traffic rất lớn, bạn có thể muốn tách worker thành một service riêng trên Render để scale ngang.

### Tạo Render service cho worker AI Strategy

Tạo file `workers/ai-strategy/.render.yml`:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-ai-worker
    env: python
    region: oregon
    plan: starter
    buildCommand: "pip install --no-cache-dir -r requirements.txt"
    startCommand: "python run.py"
```

Tạo file `workers/ai-strategy/requirements.txt`:

```text
beautifulsoup4>=4.12
feedparser>=6.0
pydantic>=2.0
requests>=2.31
psycopg2-binary>=2.9
pyyaml>=6.0
torch>=2.0
transformers>=4.40
safetensors>=0.4
```

### Tạo Render service cho worker News Crawler

Tạo file `workers/news/.render.yml`:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-news-worker
    env: python
    region: oregon
    plan: starter
    buildCommand: "pip install --no-cache-dir -r requirements.txt"
    startCommand: "python main.py"
```

Tạo file `workers/news/requirements.txt`:

```text
beautifulsoup4>=4.12
feedparser>=6.0
pydantic>=2.0
requests>=2.31
pyyaml>=6.0
psycopg2-binary>=2.9
torch>=2.0
transformers>=4.40
safetensors>=0.4
```

### Cập nhật NestJS API để gọi Render worker qua HTTP

Thay vì `spawn` subprocess, hãy gọi qua REST API:

```typescript
@Get('/strategies/:id/execute')
async executeStrategy(@Param('id') id: string) {
  const payload = JSON.stringify({ source: 'MA', candles: [...] });
  
  // Gọi Render worker qua HTTP (Render tự động HTTPS)
  return await fetch(`https://crypto-strategy-lab-ai-worker.onrender.com/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).then(r => r.text());
}

@Post('/news/crawl')
async crawlNews() {
  return await fetch('https://crypto-strategy-lab-news-worker.onrender.com/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then(r => r.text());
}
```

### Ưu/nhược điểm của cách này

| | Subprocess (Option 1) | Render service riêng (Option 2) |
|--|----------------------|---------------------------------|
| Chi phí | $0 (share với API container) | +$7/mo mỗi worker (Starter plan) |
| Scalability | Limited (số lượng child processes của NodeJS có giới hạn) | Unlimited (Render auto-scale theo traffic) |
| Complexity | Low — chỉ `spawn` | Medium — cần API contract giữa API và worker |
| Cold start latency | ~10ms (fork process) | ~2-5s (Render khởi động container mới) |

→ **Cho MVP: dùng Option 1 (subprocess).** Nếu traffic tăng cao, migrate sang Option 2.

---

## Lưu ý về deployment cho workers

### 1. Không commit `.env` hoặc model files nặng

Trong `workers/news/.gitignore`:

```
# Local Python virtual environment (không cần commit)
.venv/

# FinBERT model weights (~400MB) — download khi build, không commit vào git
models/finbert/

# Cache / build artifacts
__pycache__/
*.pyc
.pytest_cache/
```

### 2. Download model files trong build step của Render

Render có thể mount volume hoặc bạn cần download model vào container ở bước `buildCommand`:

```yaml
services:
  - type: web service
    name: crypto-strategy-lab-news-worker
    env: python
    region: oregon
    plan: starter
    buildCommand: |
      # Mount thư mục models từ Render File System (nếu có) hoặc download trực tiếp
      pip install --no-cache-dir -r requirements.txt
      python setup.py download-finetuned-model  # custom script để download model vào /app/models/
```

Hoặc dùng **Render Files**: tạo file trong Render dashboard → render sẽ mount vào `/render_files` → bạn copy model vào thư mục đó từ build command.

### 3. Timeout handling

Worker subprocess có thể chạy lâu (crawl + sentiment scoring). NestJS API không nên block forever — hãy set timeout:

```typescript
import { setTimeout } from 'timers/promises';

async function executeWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = setTimeout(ms);
  try {
    return await promise;
  } catch (error) {
    if (!timer.isPending) throw error; // timeout expired, rethrow
    throw error;
  }
}

// Trong worker manager:
const result = await executeWithTimeout(this.workerManager.executeNewsCrawl(), 120_000); // 2 phút timeout
```

---

## Tổng kết deployment workers

| Worker | Deploy strategy | Chi phí/tháng |
|--------|-----------------|---------------|
| `ai-strategy/run.py` | Subprocess trong API container (Option 1) | $0 |
| `news/main.py` | Render service riêng (Option 2) — chỉ khi cần scale | +$7/mo |

**Khuyến nghị cho MVP:** Dùng **Option 1** cho cả hai workers → tổng chi phí vẫn là ~$7–19/tháng. Sau này nếu traffic tăng, mới cân nhắc Option 2.

---

## Checklist deploy workers

- [ ] File `workers/ai-strategy/run.py` đã commit vào repo
- [ ] File `workers/news/main.py` đã commit vào repo
- [ ] Dockerfile của backend đã copy cả hai folder `workers/*` vào container
- [ ] Dependencies Python (`requirements.txt`) đã thêm vào `service/Dockerfile` hoặc build step
- [ ] Model files (nếu dùng FinBERT) có được download tự động trong build step
- [ ] Timeout logic đã implement cho mỗi worker call

---

## Tài nguyên tham khảo

- [Render Python services](https://docs.render.com/python)
- [NestJS child process examples](https://docs.nestjs.com/recipes/exec#executing-a-command-with-child-processes)
- [How to handle long-running jobs in Node.js](https://docs.nestjs.com/recipes/cron)
