// 프론트엔드 dev 서버가 실행 중일 때, 지정한 경로들을 headless 브라우저로 띄워서
// 스크린샷을 찍고 콘솔 에러를 모아서 보여준다.
//
// 사용법:
//   node scripts/verify-app.mjs [path1] [path2] ...
//   (경로를 안 주면 기본값: / /login /minecraft)
//
// 환경변수:
//   BASE_URL   프론트 dev 서버 주소 (기본 http://localhost:5173)
//
// 스크린샷은 scripts/screenshots/ 에 저장된다.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

const paths = process.argv.slice(2)
const targets = paths.length > 0 ? paths : ['/', '/login', '/minecraft']

mkdirSync(SCREENSHOT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push({ url: page.url(), text: msg.text() })
  }
})
page.on('pageerror', (err) => {
  consoleErrors.push({ url: page.url(), text: `pageerror: ${err.message}` })
})

const results = []
for (const target of targets) {
  const url = new URL(target, BASE_URL).toString()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  const fileName = (target === '/' ? 'root' : target.replace(/^\//, '').replace(/\//g, '_')) + '.png'
  const screenshotPath = path.join(SCREENSHOT_DIR, fileName)
  await page.screenshot({ path: screenshotPath })

  results.push({ target, url, screenshot: screenshotPath })
}

await browser.close()

console.log(JSON.stringify({ results, consoleErrors }, null, 2))

if (consoleErrors.length > 0) {
  process.exitCode = 1
}
