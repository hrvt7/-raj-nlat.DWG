// ─── OCR Text Extractor for Raster / Limited Mode Pages ──────────────────────
// Extracts text from PDF pages that the standard analysis pipeline missed
// (raster pages, scanned PDFs, etc.).
//
// Strategy:
//   1. Use pdf.js getTextContent() per page — many "raster" PDFs have a hidden
//      OCR text layer added by the scanner software.
//   2. If a page yields text → source: 'pdf_text_layer'
//   3. If a page is empty → source: 'no_text' (UI will show this)
//
// This module does NOT use Tesseract.js or any heavy OCR engine.  The interface
// is designed so a Tesseract.js fallback can be plugged in later without
// changing downstream consumers.
//
// Output shape:
//   OcrResult { pages: OcrPageResult[], hasAnyText: boolean, summary: string }
//   OcrPageResult { pageNumber, textBlocks: [{text,x,y,w,h}], source, titleBlockHints, legendHints }
//
// Integration:
//   - Called from detectSymbols() AFTER routing, BEFORE rule engine
//   - Enriches raster page textBlocks for the rule engine text evidence layer
//   - Extracts title block / legend text hints for metadata assist
//   - Reports OCR status for UI display
// ──────────────────────────────────────────────────────────────────────────────

import { isPageLimited } from './pdfTypeRouter.js'

// ── OCR source constants ────────────────────────────────────────────────────

export const OCR_SOURCE = /** @type {const} */ ({
  PDF_TEXT_LAYER: 'pdf_text_layer',
  NO_TEXT: 'no_text',
})

// ── Title block zone heuristic ──────────────────────────────────────────────
// Title blocks are typically in the bottom-right corner of a drawing page.
// We consider text in the bottom 20% and right 50% of the page as title block zone.

function isTitleBlockZone(x, y, w, h, pageWidth, pageHeight) {
  if (!pageWidth || !pageHeight) return false
  const relX = (x + w / 2) / pageWidth
  const relY = (y + h / 2) / pageHeight
  return relX > 0.50 && relY > 0.80
}

// ── Legend zone heuristic ───────────────────────────────────────────────────
// Legends are typically on the right side or in a dedicated legend page.
// We look for keyword-triggered blocks (jelmagyarázat, jelkulcs, legend).

const LEGEND_KEYWORDS = [
  'jelmagyarázat', 'jelmagyarazat', 'jelkulcs', 'legend',
  'jelölés', 'jeloles', 'jel:', 'szimbólum',
]

function isLegendRelated(text) {
  const lower = text.toLowerCase()
  return LEGEND_KEYWORDS.some(kw => lower.includes(kw))
}

// ── Symbol-related text hints ───────────────────────────────────────────────
// Quick check if text contains electrical symbol keywords

const SYMBOL_HINT_PATTERNS = [
  'dugalj', 'dugaszolóaljzat', 'kapcsoló', 'kapcsolo',
  'lámpa', 'lampa', 'világít', 'vilagit',
  'elosztó', 'eloszto', 'tábla', 'tabla',
  'kábel', 'kabel', 'vezeték', 'vezetek',
  'biztosíték', 'biztositek', 'megszakító', 'megszakito',
  'földelés', 'foldeles', 'érintvé', 'erintve',
  'csillár', 'csillar', 'fénycső', 'fenycso',
  'konnekt', 'csatlakozó', 'csatlakozo',
  'szünetment', 'szunetment', 'ups',
]

function hasSymbolHint(text) {
  const lower = text.toLowerCase()
  return SYMBOL_HINT_PATTERNS.some(pat => lower.includes(pat))
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OcrTextBlock
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} OcrPageResult
 * @property {number}          pageNumber
 * @property {OcrTextBlock[]}  textBlocks     — extracted text blocks
 * @property {string}          source         — 'pdf_text_layer' | 'no_text'
 * @property {string[]}        titleBlockHints — text found in title block zone
 * @property {string[]}        legendHints     — text related to legend/symbols
 * @property {string[]}        symbolTextHints — text containing symbol keywords
 * @property {number}          textBlockCount  — total text blocks found
 */

/**
 * @typedef {Object} OcrResult
 * @property {OcrPageResult[]} pages
 * @property {boolean}         hasAnyText     — true if ANY page yielded text
 * @property {number}          pagesWithText  — count of pages that have text
 * @property {number}          pagesWithout   — count of pages with no text
 * @property {string}          summary        — human-readable summary
 */

/**
 * Extract text from raster/limited pages using pdf.js text layer.
 *
 * Only processes pages that are in limited mode (raster/unknown) according
 * to the routeResult.  Vector pages are skipped — they already have
 * textBlocks from the standard analysis pipeline.
 *
 * @param {ArrayBuffer|Uint8Array} pdfData — raw PDF bytes
 * @param {import('./pdfTypeRouter.js').RouteResult} routeResult
 * @returns {Promise<OcrResult>}
 */
export async function extractOcrText(pdfData, routeResult) {
  const emptyResult = {
    pages: [],
    hasAnyText: false,
    pagesWithText: 0,
    pagesWithout: 0,
    summary: 'Nincs raster oldal',
  }

  if (!routeResult || !routeResult.pageRoutes) return emptyResult

  // Only process limited (raster) pages
  const limitedPages = routeResult.pageRoutes.filter(pr => pr.mode === 'limited')
  if (limitedPages.length === 0) return emptyResult

  let pdfjsDoc = null
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsDoc = await pdfjsLib.getDocument({ data: pdfData }).promise
  } catch (err) {
    console.warn('[ocrTextExtractor] pdf.js load failed:', err.message)
    return {
      pages: limitedPages.map(pr => _emptyPageResult(pr.pageNumber)),
      hasAnyText: false,
      pagesWithText: 0,
      pagesWithout: limitedPages.length,
      summary: `OCR sikertelen: ${err.message}`,
    }
  }

  const pageResults = []
  let pagesWithText = 0

  try {
    for (const pageRoute of limitedPages) {
      const pageNum = pageRoute.pageNumber
      if (pageNum < 1 || pageNum > pdfjsDoc.numPages) {
        pageResults.push(_emptyPageResult(pageNum))
        continue
      }

      try {
        const page = await pdfjsDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const pageWidth = viewport.width
        const pageHeight = viewport.height
        const textContent = await page.getTextContent()

        const textBlocks = []
        const titleBlockHints = []
        const legendHints = []
        const symbolTextHints = []

        for (const item of textContent.items) {
          const str = (item.str || '').trim()
          if (str.length < 2) continue

          // Extract position from transform matrix
          // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
          const tx = item.transform?.[4] || 0
          const ty = item.transform?.[5] || 0
          const w = item.width || str.length * 5  // rough fallback
          const h = item.height || 12

          const block = { text: str, x: tx, y: ty, w, h }
          textBlocks.push(block)

          // Classify into zones
          if (isTitleBlockZone(tx, ty, w, h, pageWidth, pageHeight)) {
            titleBlockHints.push(str)
          }
          if (isLegendRelated(str)) {
            legendHints.push(str)
          }
          if (hasSymbolHint(str)) {
            symbolTextHints.push(str)
          }
        }

        const hasText = textBlocks.length > 0
        if (hasText) pagesWithText++

        pageResults.push({
          pageNumber: pageNum,
          textBlocks,
          source: hasText ? OCR_SOURCE.PDF_TEXT_LAYER : OCR_SOURCE.NO_TEXT,
          titleBlockHints,
          legendHints,
          symbolTextHints,
          textBlockCount: textBlocks.length,
        })
      } catch (pageErr) {
        console.warn(`[ocrTextExtractor] page ${pageNum} failed:`, pageErr.message)
        pageResults.push(_emptyPageResult(pageNum))
      }
    }
  } finally {
    try { pdfjsDoc.destroy() } catch { /* ignore cleanup errors */ }
  }

  const pagesWithout = pageResults.length - pagesWithText

  return {
    pages: pageResults,
    hasAnyText: pagesWithText > 0,
    pagesWithText,
    pagesWithout,
    summary: _buildSummary(pagesWithText, pagesWithout),
  }
}

/**
 * Enrich an analysis result's raster pages with OCR text.
 * Returns a SHALLOW COPY with enriched page textBlocks — does NOT mutate the original.
 *
 * @param {import('../pdfAnalysis/types.js').PdfAnalysisResult} analysisResult
 * @param {OcrResult} ocrResult
 * @returns {import('../pdfAnalysis/types.js').PdfAnalysisResult} enriched copy
 */
export function enrichAnalysisWithOcr(analysisResult, ocrResult) {
  if (!ocrResult || !ocrResult.hasAnyText || !ocrResult.pages.length) {
    return analysisResult
  }

  // Build lookup: pageNumber → OcrPageResult
  const ocrByPage = new Map()
  for (const pr of ocrResult.pages) {
    if (pr.source === OCR_SOURCE.PDF_TEXT_LAYER && pr.textBlocks.length > 0) {
      ocrByPage.set(pr.pageNumber, pr)
    }
  }

  if (ocrByPage.size === 0) return analysisResult

  // Shallow copy analysis with enriched pages
  const enrichedPages = analysisResult.pages.map(page => {
    const ocrPage = ocrByPage.get(page.pageNumber)
    if (!ocrPage) return page

    // Merge OCR textBlocks with existing (if any)
    const existingTexts = new Set((page.textBlocks || []).map(tb => tb.text?.toLowerCase()))
    const newBlocks = ocrPage.textBlocks.filter(tb => !existingTexts.has(tb.text?.toLowerCase()))

    if (newBlocks.length === 0) return page

    return {
      ...page,
      textBlocks: [...(page.textBlocks || []), ...newBlocks],
      _ocrEnriched: true,
      _ocrSource: ocrPage.source,
      _ocrBlockCount: newBlocks.length,
    }
  })

  return {
    ...analysisResult,
    pages: enrichedPages,
  }
}

/**
 * Extract metadata hints from OCR results for title block assist.
 *
 * @param {OcrResult} ocrResult
 * @returns {{ titleBlockTexts: string[], legendTexts: string[], symbolHints: string[], allTexts: string[] }}
 */
export function extractOcrHints(ocrResult) {
  const result = {
    titleBlockTexts: [],
    legendTexts: [],
    symbolHints: [],
    allTexts: [],
  }

  if (!ocrResult || !ocrResult.pages) return result

  for (const page of ocrResult.pages) {
    if (page.titleBlockHints?.length) {
      result.titleBlockTexts.push(...page.titleBlockHints)
    }
    if (page.legendHints?.length) {
      result.legendTexts.push(...page.legendHints)
    }
    if (page.symbolTextHints?.length) {
      result.symbolHints.push(...page.symbolTextHints)
    }
    if (page.textBlocks?.length) {
      result.allTexts.push(...page.textBlocks.map(tb => tb.text))
    }
  }

  return result
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _emptyPageResult(pageNumber) {
  return {
    pageNumber,
    textBlocks: [],
    source: OCR_SOURCE.NO_TEXT,
    titleBlockHints: [],
    legendHints: [],
    symbolTextHints: [],
    textBlockCount: 0,
  }
}

function _buildSummary(withText, without) {
  if (withText === 0 && without === 0) return 'Nincs raster oldal'
  if (withText === 0) return `${without} raster oldal szöveg nélkül`
  if (without === 0) return `${withText} raster oldal OCR szöveggel`
  return `${withText} oldal OCR szöveggel, ${without} szöveg nélkül`
}
