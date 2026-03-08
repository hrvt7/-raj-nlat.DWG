// ─── Legacy Provider ──────────────────────────────────────────────────────────
// Wraps the existing pdfTakeoff.js + planMetaInference.js pipeline into the
// parser-agnostic PdfAnalysisResult contract.
//
// This provider delegates to the server APIs (/api/parse-pdf, /api/parse-pdf-vectors)
// and the local metadata inference engine.  It does NOT modify any of the
// original pipeline logic — it only maps the output to the new contract.
//
// When a better local provider is ready, consumers can switch seamlessly
// because the contract stays the same.
// ──────────────────────────────────────────────────────────────────────────────

import {
  createAnalysisResult,
  createPageAnalysis,
  ANALYSIS_VERSION,
} from './types.js'

import {
  runPdfTakeoff,
  computeOverallConfidence,
} from '../../pdfTakeoff.js'

import {
  inferPlanMeta,
  inferMetaFromText,
  mergeMeta,
  extractPdfText,
} from '../../utils/planMetaInference.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map legacy pipeline source string → contract sourceType. */
function mapSourceType(pipelineSource) {
  switch (pipelineSource) {
    case 'vector': return 'vector'
    case 'vision': return 'raster'
    case 'mixed':  return 'mixed'
    default:       return 'unknown'
  }
}

/** Map legacy cable estimate → contract cableEstimate shape. */
function mapCableEstimate(legacyCable) {
  if (!legacyCable) return { totalMeters: 0, byType: {}, topology: null, source: null }
  return {
    totalMeters: legacyCable.cable_total_m || 0,
    byType: legacyCable.cable_by_system || {},
    topology: null,  // legacy doesn't expose aggregate topology
    source: legacyCable._source === 'pdf_takeoff'
      ? (legacyCable.method?.includes('MST') ? 'mst' : 'per_device')
      : null,
  }
}

/** Map legacy recognizedItems → contract DetectedSymbol[]. */
function mapSymbols(recognizedItems) {
  if (!recognizedItems?.length) return { totalCount: 0, byType: {}, items: [] }

  const byType = {}
  const items = recognizedItems.map(ri => {
    const symbolType = ri._pdfType || 'egyeb'
    byType[symbolType] = (byType[symbolType] || 0) + ri.qty

    return {
      symbolType,
      x: 0, y: 0, w: 0, h: 0,  // legacy API rarely provides positions
      confidence: ri.confidence || 0,
      matchTier: ri.confidence >= 0.6 ? 'exact'
               : ri.confidence >= 0.3 ? 'probable'
               : 'uncertain',
      label: ri._pdfName || ri.blockName,
      asmId: ri.asmId || null,
      cableType: ri._pdfCableType || 'power',
    }
  })

  return {
    totalCount: recognizedItems.reduce((s, ri) => s + ri.qty, 0),
    byType,
    items,
  }
}

// ── Main analyze function ───────────────────────────────────────────────────

/**
 * Analyze a PDF using the legacy server-API pipeline and return a
 * PdfAnalysisResult conforming to the contract in types.js.
 *
 * @param {File} file — PDF File object
 * @param {{ onProgress?: function, skipCables?: boolean, skipMeta?: boolean }} [options]
 * @returns {Promise<import('./types.js').PdfAnalysisResult>}
 */
export async function analyze(file, options = {}) {
  const result = createAnalysisResult('legacy')

  // Source file info
  result.sourceFile = {
    name: file.name || 'unknown.pdf',
    sizeBytes: file.size || 0,
    mimeType: file.type || 'application/pdf',
  }

  // ── Step 1: Run legacy PDF takeoff pipeline ─────────────────────────────
  let legacyResult = null
  try {
    legacyResult = await runPdfTakeoff(file, options.onProgress || (() => {}))
  } catch (err) {
    result.warnings.push({
      code: 'LEGACY_PIPELINE_ERROR',
      message: `Legacy pipeline failed: ${err.message}`,
      severity: 'error',
    })
    result.unsupportedReasons.push(`Pipeline error: ${err.message}`)
    return result
  }

  // ── Step 2: Map pipeline source → contract sourceType ─────────────────
  result.sourceType = mapSourceType(legacyResult.pipelineSource)

  // ── Step 3: Map symbols / recognizedItems ─────────────────────────────
  result.symbols = mapSymbols(legacyResult.recognizedItems)

  // ── Step 4: Map cable estimate ────────────────────────────────────────
  if (!options.skipCables) {
    result.cableEstimate = mapCableEstimate(legacyResult.cableEstimate)
  }

  // ── Step 5: Metadata inference ────────────────────────────────────────
  if (!options.skipMeta) {
    try {
      // Layer 1: filename
      const layer1 = inferPlanMeta(file.name || '')

      // Layer 2: text from first page (if possible)
      let layer2 = {}
      try {
        const arrayBuf = await file.arrayBuffer()
        const textLines = await extractPdfText(new Uint8Array(arrayBuf))
        if (textLines?.length) {
          layer2 = inferMetaFromText(textLines) || {}
        }
      } catch {
        // Text extraction is best-effort
      }

      const merged = mergeMeta(layer1, layer2)

      result.metadata = {
        floor: merged.floor || null,
        floorLabel: merged.floorLabel || null,
        systemType: merged.systemType || null,
        docType: merged.docType || null,
        drawingNumber: merged.drawingNumber || null,
        revision: merged.revision || null,
        projectName: merged.projectName || null,
        designer: merged.designer || null,
        confidence: merged.metaConfidence || 0,
      }
    } catch (err) {
      result.warnings.push({
        code: 'META_INFERENCE_ERROR',
        message: `Metadata inference failed: ${err.message}`,
        severity: 'warn',
      })
    }
  }

  // ── Step 6: Synthetic page data ───────────────────────────────────────
  // Legacy pipeline doesn't expose per-page data, but we can create a
  // single-page placeholder from parsedDxf summary.
  const page = createPageAnalysis(1)
  page.sourceType = result.sourceType
  page.detectedSymbols = result.symbols.items
  if (legacyResult.warnings?.length) {
    page.warnings = legacyResult.warnings.map(w => ({
      code: 'LEGACY_WARNING',
      message: typeof w === 'string' ? w : (w.message || String(w)),
      severity: 'warn',
    }))
  }
  result.pages = [page]
  result.pageCount = 1  // legacy pipeline only processes first page

  // ── Step 7: Confidence hints ──────────────────────────────────────────
  result.confidenceHints = {
    overall: legacyResult.confidence || 0,
    metadata: result.metadata.confidence || 0,
    symbols: result.symbols.items.length
      ? result.symbols.items.reduce((s, i) => s + i.confidence, 0) / result.symbols.items.length
      : 0,
    cables: result.cableEstimate.totalMeters > 0 ? 0.65 : 0,
  }

  // ── Step 8: Propagate warnings ────────────────────────────────────────
  if (legacyResult.warnings?.length) {
    for (const w of legacyResult.warnings) {
      result.warnings.push({
        code: 'LEGACY',
        message: typeof w === 'string' ? w : (w.message || String(w)),
        severity: 'info',
      })
    }
  }

  return result
}
