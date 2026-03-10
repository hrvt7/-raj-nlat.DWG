// ─── DXF Units — Single Source of Truth ──────────────────────────────────────
// Canonical INSUNITS map, unit resolution, and auto-detection heuristics.
// All parsers (browser, worker, cableAgent) must use these constants/functions.
// No side effects, no DOM, no React — safe for Web Worker import.

// ── INSUNITS_MAP (DXF specification — all 21 codes) ─────────────────────────
// Key = $INSUNITS header value, Value = [human name, meters-per-unit factor]
// Factor is null when the unit code is 0 ("unspecified") → triggers auto-detect.
export const INSUNITS_MAP = {
  0:  ['unknown',     null],
  1:  ['inches',      0.0254],
  2:  ['feet',        0.3048],
  3:  ['miles',       1609.34],
  4:  ['mm',          0.001],
  5:  ['cm',          0.01],
  6:  ['m',           1.0],
  7:  ['km',          1000.0],
  8:  ['microinches', 2.54e-8],
  9:  ['mils',        2.54e-5],
  10: ['yards',       0.9144],
  11: ['angstroms',   1e-10],
  12: ['nanometers',  1e-9],
  13: ['microns',     1e-6],
  14: ['decimeters',  0.1],
  15: ['decameters',  10.0],
  16: ['hectometers', 100.0],
  17: ['gigameters',  1e9],
  18: ['AU',          1.496e11],
  19: ['light-years', 9.461e15],
  20: ['parsecs',     3.086e16],
}

// ── Auto-detect unit factor from geometry extents ───────────────────────────
// Consistent heuristic used by ALL parsers when $INSUNITS is 0 / missing.
//
// Strategy: use the larger of (max raw line/polyline length) and
// (bounding box diagonal span).  This catches both cases:
//   - files with geometry but few long segments (maxRaw helps)
//   - files with many short segments spread over a large area (span helps)
//
// Thresholds (widely tested against Hungarian electrical DXF exports):
//   > 10 000  → mm
//   >= 100    → cm
//   < 100     → m
//
// Returns: { name: string, factor: number }
export function guessUnitsFromGeometry(maxRawLength = 0, bboxSpan = 0) {
  const ref = Math.max(maxRawLength, bboxSpan)
  if (ref > 10000)  return { name: 'mm (guessed)', factor: 0.001 }
  if (ref >= 100)   return { name: 'cm (guessed)', factor: 0.01 }
  return { name: 'm (guessed)', factor: 1.0 }
}

// ── Resolve units from $INSUNITS + geometry fallback ────────────────────────
// Single entry point: returns { insunits, name, factor, isGuessed, confidence }
//
// @param {number} insunitsCode  — raw $INSUNITS integer from DXF header
// @param {number} maxRawLength  — longest raw geometry segment (drawing units)
// @param {number} bboxSpan      — max(width, height) of bounding box (drawing units)
// @returns {object}
export function resolveUnits(insunitsCode = 0, maxRawLength = 0, bboxSpan = 0) {
  const entry = INSUNITS_MAP[insunitsCode]

  if (entry && entry[1] !== null) {
    // Known unit code with valid factor
    return {
      insunits: insunitsCode,
      name: entry[0],
      factor: entry[1],
      isGuessed: false,
      confidence: 'high',
    }
  }

  // Unknown or unspecified → auto-detect
  const guessed = guessUnitsFromGeometry(maxRawLength, bboxSpan)
  return {
    insunits: insunitsCode,
    name: guessed.name,
    factor: guessed.factor,
    isGuessed: true,
    confidence: 'low',
  }
}
