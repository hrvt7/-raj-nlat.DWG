// ─── Project Memory & Custom Symbol Tests ─────────────────────────────────────
// Tests for:
//   1. Custom symbol store (save/load/delete/capture)
//   2. Project memory matching engine
//   3. Fallback detection path
//   4. Source tagging / review behavior in candidate adapter
//   5. Truth source boundary enforcement
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Custom Symbol Store ──────────────────────────────────────────────────────

import {
  saveCustomSymbol,
  getCustomSymbolsByProject,
  getCustomSymbol,
  deleteCustomSymbol,
  deleteCustomSymbolsByProject,
  clearAllCustomSymbols,
  captureFromDetection,
  generateCustomSymbolId,
  loadAllCustomSymbols,
} from '../data/customSymbolStore.js'

// ── Project Memory Engine ────────────────────────────────────────────────────

import { runProjectMemory } from '../services/pdfDetection/projectMemory.js'

// ── Candidate Adapter (extended) ─────────────────────────────────────────────

import {
  adaptCandidate,
  adaptCandidates,
  groupByBucket,
  batchAcceptGreen,
  toMarkerFields,
  DETECTION_SOURCE,
} from '../services/pdfDetection/candidateAdapter.js'

// ── Mock localStorage (same pattern as smoke.test.js) ────────────────────────

let _store = {}
beforeEach(() => {
  _store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v) },
    removeItem: (k) => { delete _store[k] },
    clear: () => { _store = {} },
  })
})


// ═════════════════════════════════════════════════════════════════════════════
//  1. Custom Symbol Store
// ═════════════════════════════════════════════════════════════════════════════

describe('customSymbolStore', () => {
  it('generates unique CSYM IDs', () => {
    const id1 = generateCustomSymbolId()
    const id2 = generateCustomSymbolId()
    expect(id1).toMatch(/^CSYM-/)
    expect(id2).toMatch(/^CSYM-/)
    expect(id1).not.toBe(id2)
  })

  it('saves and loads a custom symbol by project', () => {
    saveCustomSymbol({
      id: 'CSYM-test-1',
      projectId: 'PRJ-A',
      label: 'Érzékelő',
      category: 'fire_safety',
      textPatterns: ['érzékelő', 'detektor'],
      color: '#FF6B6B',
    })
    saveCustomSymbol({
      id: 'CSYM-test-2',
      projectId: 'PRJ-B',
      label: 'Mozgásérzékelő',
      category: 'low_voltage',
      textPatterns: ['mozgásérzékelő'],
    })

    const projA = getCustomSymbolsByProject('PRJ-A')
    expect(projA).toHaveLength(1)
    expect(projA[0].label).toBe('Érzékelő')
    expect(projA[0].textPatterns).toEqual(['érzékelő', 'detektor'])

    const projB = getCustomSymbolsByProject('PRJ-B')
    expect(projB).toHaveLength(1)
    expect(projB[0].label).toBe('Mozgásérzékelő')
  })

  it('updates an existing custom symbol', () => {
    saveCustomSymbol({ id: 'CSYM-u1', projectId: 'PRJ-A', label: 'V1', category: 'other' })
    saveCustomSymbol({ id: 'CSYM-u1', projectId: 'PRJ-A', label: 'V2', category: 'power' })
    const sym = getCustomSymbol('CSYM-u1')
    expect(sym.label).toBe('V2')
    expect(sym.category).toBe('power')
  })

  it('deletes a single custom symbol', () => {
    saveCustomSymbol({ id: 'CSYM-d1', projectId: 'PRJ-A', label: 'X', category: 'other' })
    saveCustomSymbol({ id: 'CSYM-d2', projectId: 'PRJ-A', label: 'Y', category: 'other' })
    deleteCustomSymbol('CSYM-d1')
    expect(getCustomSymbolsByProject('PRJ-A')).toHaveLength(1)
    expect(getCustomSymbol('CSYM-d1')).toBeUndefined()
  })

  it('deletes all custom symbols for a project', () => {
    saveCustomSymbol({ id: 'CSYM-p1', projectId: 'PRJ-A', label: 'A', category: 'other' })
    saveCustomSymbol({ id: 'CSYM-p2', projectId: 'PRJ-A', label: 'B', category: 'other' })
    saveCustomSymbol({ id: 'CSYM-p3', projectId: 'PRJ-B', label: 'C', category: 'other' })
    deleteCustomSymbolsByProject('PRJ-A')
    expect(getCustomSymbolsByProject('PRJ-A')).toHaveLength(0)
    expect(getCustomSymbolsByProject('PRJ-B')).toHaveLength(1)
  })

  it('clears all custom symbols', () => {
    saveCustomSymbol({ id: 'CSYM-c1', projectId: 'PRJ-A', label: 'X', category: 'other' })
    clearAllCustomSymbols()
    expect(loadAllCustomSymbols()).toHaveLength(0)
  })

  it('requires id, projectId, and label', () => {
    expect(() => saveCustomSymbol({ projectId: 'P', label: 'L' })).toThrow() // no id
    expect(() => saveCustomSymbol({ id: 'X', label: 'L' })).toThrow() // no projectId
    expect(() => saveCustomSymbol({ id: 'X', projectId: 'P' })).toThrow() // no label
  })
})

describe('captureFromDetection', () => {
  it('captures a detection with evidence text patterns', () => {
    const detection = {
      id: 'pdfdet-SYM-SOCKET-p1-abc-xyz',
      symbolId: 'SYM-SOCKET',
      pageNum: 1,
      label: 'Dugalj',
      category: 'socket',
      color: '#FF8C42',
      evidence: {
        text: { score: 0.6, matchedPatterns: ['dugalj', 'konnektor'], mentionCount: 3 },
        geometry: { score: 0.3, matchedShapes: ['rect'] },
        legacy: null,
      },
    }

    const result = captureFromDetection({
      projectId: 'PRJ-A',
      label: 'Speciális dugalj',
      category: 'socket',
      detection,
    })

    expect(result.id).toMatch(/^CSYM-/)
    expect(result.projectId).toBe('PRJ-A')
    expect(result.label).toBe('Speciális dugalj')
    expect(result.textPatterns).toContain('dugalj')
    expect(result.textPatterns).toContain('konnektor')
    expect(result.textPatterns).toContain('speciális dugalj') // label added
    expect(result.capturedFrom.symbolId).toBe('SYM-SOCKET')
    expect(result.capturedFrom.pageNumber).toBe(1)
    expect(result.geometryHints).toBeTruthy()
    expect(result.geometryHints.matchedShapes).toContain('rect')
  })

  it('captures even without evidence (bare label)', () => {
    const result = captureFromDetection({
      projectId: 'PRJ-A',
      label: 'Egyéni elem',
      category: 'other',
    })

    expect(result.textPatterns).toEqual(['egyéni elem'])
    expect(result.capturedFrom).toBeNull()
    expect(result.geometryHints).toBeNull()
  })

  it('persists the captured symbol to the store', () => {
    clearAllCustomSymbols()
    captureFromDetection({
      projectId: 'PRJ-X',
      label: 'Teszt szimbólum',
      category: 'power',
    })
    const stored = getCustomSymbolsByProject('PRJ-X')
    expect(stored).toHaveLength(1)
    expect(stored[0].label).toBe('Teszt szimbólum')
  })
})


// ═════════════════════════════════════════════════════════════════════════════
//  2. Project Memory Matching Engine
// ═════════════════════════════════════════════════════════════════════════════

describe('runProjectMemory', () => {
  const makeAnalysisResult = (textBlocks = []) => ({
    pages: [{ pageNumber: 1, textBlocks: textBlocks.map(t => ({ text: t })), drawings: [] }],
    symbols: { items: [] },
  })

  it('returns empty when no custom symbols', () => {
    const result = runProjectMemory([], makeAnalysisResult(['dugalj konnektor']))
    expect(result.candidates).toHaveLength(0)
    expect(result.matchedSymbolIds).toHaveLength(0)
  })

  it('matches a custom symbol by text pattern', () => {
    clearAllCustomSymbols()
    const syms = [{
      id: 'CSYM-1', projectId: 'P', label: 'Hőérzékelő',
      category: 'fire_safety', textPatterns: ['hőérzékelő', 'heat detector'],
      color: '#FF6B6B',
    }]

    const result = runProjectMemory(syms, makeAnalysisResult(['A tervben hőérzékelő van jelölve']))
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].symbolId).toBe('CSYM-1')
    expect(result.candidates[0].source).toBe('project_memory')
    expect(result.candidates[0].requiresReview).toBe(true)
    expect(result.matchedSymbolIds).toContain('CSYM-1')
  })

  it('respects confidence cap (never reaches HIGH threshold)', () => {
    const syms = [{
      id: 'CSYM-2', projectId: 'P', label: 'Termosztát',
      category: 'low_voltage',
      textPatterns: ['termosztát', 'hőmérséklet', 'szoba hőm', 'climate', 'thermostat'],
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult([
        'termosztát hőmérséklet szoba hőm climate thermostat termosztát termosztát termosztát termosztát',
      ]),
    )

    expect(result.candidates).toHaveLength(1)
    // Confidence should be capped at 0.65 (below HIGH threshold of 0.7)
    expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.65)
    expect(result.candidates[0].confidenceBucket).not.toBe('high')
  })

  it('does not duplicate when standard library already detected same category on page', () => {
    const syms = [{
      id: 'CSYM-3', projectId: 'P', label: 'Kapcsoló (custom)',
      category: 'switch', textPatterns: ['kapcsoló'],
    }]

    // Standard candidate already has SYM-SWITCH on page 1
    const standardCandidates = [{
      symbolId: 'SYM-SWITCH',
      pageNumber: 1,
      confidence: 0.8,
      confidenceBucket: 'high',
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['kapcsoló csillárkapcsoló']),
      standardCandidates,
    )

    // Should be skipped because standard library already covers 'switch' on page 1
    expect(result.candidates).toHaveLength(0)
  })

  it('does match when standard library covers different category', () => {
    const syms = [{
      id: 'CSYM-4', projectId: 'P', label: 'Mozgásérzékelő',
      category: 'low_voltage', textPatterns: ['mozgásérzékelő'],
    }]

    // Standard candidate has SYM-SOCKET (category: socket) on page 1
    const standardCandidates = [{
      symbolId: 'SYM-SOCKET',
      pageNumber: 1,
      confidence: 0.8,
      confidenceBucket: 'high',
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['mozgásérzékelő a folyosón']),
      standardCandidates,
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].symbolId).toBe('CSYM-4')
  })

  it('returns nothing for no text match', () => {
    const syms = [{
      id: 'CSYM-5', projectId: 'P', label: 'Szirénás',
      category: 'fire_safety', textPatterns: ['szirénás', 'siren'],
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['dugalj konnektor lámpa']),
    )

    expect(result.candidates).toHaveLength(0)
  })

  it('always sets requiresReview to true', () => {
    const syms = [{
      id: 'CSYM-6', projectId: 'P', label: 'Test',
      category: 'other', textPatterns: ['test'],
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['test test test test test test test']),
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].requiresReview).toBe(true)
  })

  it('includes project memory evidence in evidence object', () => {
    const syms = [{
      id: 'CSYM-7', projectId: 'PRJ-Z', label: 'Speciális',
      category: 'other', textPatterns: ['speciális'],
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['speciális elem a tervben']),
    )

    const c = result.candidates[0]
    expect(c.evidence.projectMemory).toBeTruthy()
    expect(c.evidence.projectMemory.customSymbolId).toBe('CSYM-7')
    expect(c.evidence.projectMemory.projectId).toBe('PRJ-Z')
  })

  it('skips custom symbols with no textPatterns', () => {
    const syms = [{
      id: 'CSYM-8', projectId: 'P', label: 'Empty',
      category: 'other', textPatterns: [],
    }]

    const result = runProjectMemory(
      syms,
      makeAnalysisResult(['anything here']),
    )

    expect(result.candidates).toHaveLength(0)
  })
})


// ═════════════════════════════════════════════════════════════════════════════
//  3. Candidate Adapter — project_memory source handling
// ═════════════════════════════════════════════════════════════════════════════

describe('candidateAdapter — project_memory source', () => {
  const makeProjectMemoryCandidate = (overrides = {}) => ({
    symbolId: 'CSYM-1',
    symbolType: 'Hőérzékelő',
    pageNumber: 1,
    bbox: { x: 100, y: 200, w: 10, h: 10 },
    confidence: 0.55,
    confidenceBucket: 'review',
    evidence: { text: { score: 0.55, matchedPatterns: ['hőérzékelő'], mentionCount: 2 }, geometry: null, legacy: null, projectMemory: { customSymbolId: 'CSYM-1', projectId: 'P' } },
    source: 'project_memory',
    requiresReview: true,
    qty: 2,
    asmId: null,
    legacyType: null,
    customCategory: 'fire_safety',
    customColor: '#FF6B6B',
    ...overrides,
  })

  it('adapts project_memory candidate with detectionSource tag', () => {
    const adapted = adaptCandidate(makeProjectMemoryCandidate(), 'PLN-1')
    expect(adapted.detectionSource).toBe(DETECTION_SOURCE.PROJECT_MEMORY)
    expect(adapted.category).toBe('fire_safety')
    expect(adapted.color).toBe('#FF6B6B')
    expect(adapted.symbolId).toBe('CSYM-1')
  })

  it('adapts standard candidate with detectionSource = standard', () => {
    const standardCandidate = {
      symbolId: 'SYM-SOCKET',
      symbolType: 'Dugalj',
      pageNumber: 1,
      bbox: { x: 50, y: 60, w: 10, h: 10 },
      confidence: 0.8,
      confidenceBucket: 'high',
      evidence: { text: { score: 0.8, matchedPatterns: ['dugalj'], mentionCount: 3 }, geometry: null, legacy: null },
      source: 'text',
      requiresReview: false,
      qty: 3,
      asmId: 'ASM-001',
    }
    const adapted = adaptCandidate(standardCandidate, 'PLN-1')
    expect(adapted.detectionSource).toBe(DETECTION_SOURCE.STANDARD)
    expect(adapted.category).toBe('socket')
  })

  it('project_memory candidate NEVER auto-accepts even in HIGH bucket', () => {
    // Force a project memory candidate into HIGH bucket (shouldn't happen due to cap, but belt & suspenders)
    const adapted = adaptCandidate(makeProjectMemoryCandidate({
      confidence: 0.9,
      confidenceBucket: 'high',
    }), 'PLN-1')
    expect(adapted.accepted).toBe(false)
  })

  it('batchAcceptGreen skips project_memory detections', () => {
    const detections = [
      adaptCandidate({
        symbolId: 'SYM-SOCKET', symbolType: 'Dugalj', pageNumber: 1,
        bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 0.8, confidenceBucket: 'high',
        evidence: { text: { score: 0.8, matchedPatterns: ['dugalj'], mentionCount: 1 }, geometry: null, legacy: null },
        source: 'text', requiresReview: false, qty: 1, asmId: 'ASM-001',
      }, 'PLN-1'),
      adaptCandidate(makeProjectMemoryCandidate({
        confidence: 0.8, confidenceBucket: 'high',
      }), 'PLN-1'),
    ]

    const result = batchAcceptGreen(detections)
    // Standard HIGH → accepted
    expect(result[0].accepted).toBe(true)
    // Project memory HIGH → still NOT accepted
    expect(result[1].accepted).toBe(false)
  })

  it('groupByBucket correctly groups project_memory detections', () => {
    const detections = [
      adaptCandidate(makeProjectMemoryCandidate({ confidenceBucket: 'review', confidence: 0.5 }), 'P'),
      adaptCandidate(makeProjectMemoryCandidate({ symbolId: 'CSYM-2', confidenceBucket: 'low', confidence: 0.3 }), 'P'),
    ]
    const groups = groupByBucket(detections)
    expect(groups.green).toHaveLength(0)
    expect(groups.yellow).toHaveLength(1)
    expect(groups.red).toHaveLength(1)
    expect(groups.total).toBe(2)
  })

  it('toMarkerFields works for project_memory adapted detections', () => {
    const adapted = adaptCandidate(makeProjectMemoryCandidate(), 'PLN-1')
    adapted.accepted = true // user explicitly accepted
    const fields = toMarkerFields(adapted)
    expect(fields.source).toBe('detection')
    expect(fields.category).toBe('fire_safety')
    expect(fields.color).toBe('#FF6B6B')
    expect(fields.confidence).toBe(0.55)
    expect(fields.label).toBe('Hőérzékelő')
  })
})


// ═════════════════════════════════════════════════════════════════════════════
//  4. Truth source boundary enforcement
// ═════════════════════════════════════════════════════════════════════════════

describe('truth source boundary', () => {
  it('project memory candidates have same shape as standard candidates', () => {
    const syms = [{
      id: 'CSYM-T1', projectId: 'P', label: 'Custom',
      category: 'other', textPatterns: ['custom'],
    }]

    const result = runProjectMemory(
      syms,
      { pages: [{ pageNumber: 1, textBlocks: [{ text: 'custom element' }], drawings: [] }] },
    )

    const c = result.candidates[0]
    // Must have all fields that standard DetectionCandidate has
    expect(c).toHaveProperty('symbolId')
    expect(c).toHaveProperty('symbolType')
    expect(c).toHaveProperty('pageNumber')
    expect(c).toHaveProperty('bbox')
    expect(c).toHaveProperty('confidence')
    expect(c).toHaveProperty('confidenceBucket')
    expect(c).toHaveProperty('evidence')
    expect(c).toHaveProperty('source')
    expect(c).toHaveProperty('requiresReview')
    expect(c).toHaveProperty('qty')
    expect(c).toHaveProperty('asmId')
    expect(c).toHaveProperty('legacyType')
  })

  it('adapted detection from project memory flows through adaptCandidates', () => {
    const syms = [{
      id: 'CSYM-T2', projectId: 'P', label: 'Custom2',
      category: 'low_voltage', textPatterns: ['custom2'], color: '#06B6D4',
    }]

    const { candidates } = runProjectMemory(
      syms,
      { pages: [{ pageNumber: 1, textBlocks: [{ text: 'custom2 device' }], drawings: [] }] },
    )

    const adapted = adaptCandidates(candidates, 'PLN-99')
    expect(adapted).toHaveLength(1)
    expect(adapted[0].planId).toBe('PLN-99')
    expect(adapted[0].detectionSource).toBe(DETECTION_SOURCE.PROJECT_MEMORY)
    expect(adapted[0].category).toBe('low_voltage')
  })

  it('project memory candidates dedup by symbolId:page', () => {
    // Same custom symbol appears on two patterns both matching on page 1
    const syms = [{
      id: 'CSYM-T3', projectId: 'P', label: 'Dup',
      category: 'other', textPatterns: ['dup'],
    }]

    const result = runProjectMemory(
      syms,
      {
        pages: [
          { pageNumber: 1, textBlocks: [{ text: 'dup dup dup' }], drawings: [] },
          { pageNumber: 2, textBlocks: [{ text: 'dup here too' }], drawings: [] },
        ],
      },
    )

    // One per page (deduped within each page)
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].pageNumber).toBe(1)
    expect(result.candidates[1].pageNumber).toBe(2)
  })

  it('DETECTION_SOURCE constants are correct', () => {
    expect(DETECTION_SOURCE.STANDARD).toBe('standard')
    expect(DETECTION_SOURCE.PROJECT_MEMORY).toBe('project_memory')
    expect(DETECTION_SOURCE.MANUAL).toBe('manual')
  })
})
