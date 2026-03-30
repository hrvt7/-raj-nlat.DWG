/**
 * Post-build prerender script.
 *
 * After `vite build`, this script:
 * 1. Serves the dist/ folder on a local port
 * 2. Opens it with Playwright (chromium)
 * 3. Waits for React to render the landing page
 * 4. Extracts the full rendered HTML
 * 5. Saves it back to dist/index.html
 *
 * Result: crawlers (GPTBot, ClaudeBot, Googlebot) see the full landing
 * page content in static HTML — no JavaScript execution needed.
 * The React app still hydrates normally for interactive users.
 */

import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const DIST = join(process.cwd(), 'dist')
const PORT = 4399
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
}

// Simple static file server for dist/
function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let filePath = join(DIST, req.url === '/' ? 'index.html' : req.url)
      // SPA fallback: if file doesn't exist, serve index.html
      if (!existsSync(filePath)) filePath = join(DIST, 'index.html')
      try {
        const data = readFileSync(filePath)
        const ext = extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    server.listen(PORT, () => resolve(server))
  })
}

async function prerender() {
  console.log('[prerender] Starting static server on port', PORT)
  const server = await startServer()

  console.log('[prerender] Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  console.log('[prerender] Loading landing page...')
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // Wait for React to render — look for a known element
  await page.waitForSelector('h1', { timeout: 15000 })
  // Give animations/lazy content a moment to settle
  await page.waitForTimeout(2000)

  console.log('[prerender] Extracting rendered HTML...')
  // Use Playwright to get the innerHTML of #root directly — avoids regex issues
  const renderedContent = await page.evaluate(() => document.getElementById('root').innerHTML)

  await browser.close()
  server.close()

  if (!renderedContent || renderedContent.trim().length < 100) {
    console.error('[prerender] Rendered content too short — React may not have rendered. Skipping.')
    return
  }

  // Read the original index.html and inject pre-rendered content
  const originalHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')
  const prerenderedHtml = originalHtml.replace(
    '<div id="root"></div>',
    `<div id="root">${renderedContent}</div>`
  )

  writeFileSync(join(DIST, 'index.html'), prerenderedHtml, 'utf-8')

  const origSize = Buffer.byteLength(originalHtml, 'utf-8')
  const newSize = Buffer.byteLength(prerenderedHtml, 'utf-8')
  console.log(`[prerender] Done! ${(origSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (+${((newSize - origSize) / 1024).toFixed(1)}KB of pre-rendered content)`)
}

prerender().catch(err => {
  // Graceful skip — don't break the build if Playwright/chromium is unavailable (e.g. Vercel CI)
  console.warn('[prerender] Skipped:', err.message)
  console.warn('[prerender] The build output will use client-side rendering only.')
  console.warn('[prerender] To pre-render, run the build locally with Playwright installed.')
})
