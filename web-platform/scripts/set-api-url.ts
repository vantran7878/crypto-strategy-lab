#!/usr/bin/env tsx
/**
 * Script để set VITE_API_URL trong file .env cho cả local dev và production.
 *
 * Cách dùng:
 *   npm run set-api-url -- local
 *   npm run set-api-url -- render
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')

const ENV_FILE = path.resolve(ROOT_DIR, '.env.local')

function main() {
  const args = process.argv.slice(2)
  const mode: 'local' | 'render' = args[0] || 'local'

  if (!fs.existsSync(ENV_FILE)) {
    fs.writeFileSync(ENV_FILE, `# Local development — change this for production\nVITE_API_URL=http://localhost:3000\n`)
  } else {
    let content = fs.readFileSync(ENV_FILE, 'utf8')
    content = content.replace(/^VITE_API_URL=.+$/m, (match) => {
      return `VITE_API_URL=${mode === 'local' ? 'http://localhost:3000' : 'https://your-api-app.onrender.com/api'}\n`
    })
    fs.writeFileSync(ENV_FILE, content)
  }

  console.log(`✅ Set VITE_API_URL = ${mode === 'local' ? 'http://localhost:3000' : 'https://your-api-app.onrender.com/api'} in .env.local`)
}

main()
