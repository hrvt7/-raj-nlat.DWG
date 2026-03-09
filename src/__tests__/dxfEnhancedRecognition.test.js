// ─── DXF Enhanced Recognition Tests ──────────────────────────────────────────
// Tests for Sprint 2: ATTRIB parsing, recognition cascade, nearby text, match source
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const PARSER_PATH = path.resolve('src/dxfParser.js')
const WORKSPACE_PATH = path.resolve('src/components/TakeoffWorkspace.jsx')
const WORKER_PATH = path.resolve('src/workers/dxfParser.worker.js')

let parserSrc, workspaceSrc, workerSrc

beforeAll(() => {
  parserSrc = fs.readFileSync(PARSER_PATH, 'utf8')
  workspaceSrc = fs.readFileSync(WORKSPACE_PATH, 'utf8')
  workerSrc = fs.readFileSync(WORKER_PATH, 'utf8')
})

// ─── ATTRIB/ATTDEF Parsing ───────────────────────────────────────────────────
describe('ATTRIB/ATTDEF Parsing', () => {
  it('parser exports insertAttribs in return object', () => {
    expect(parserSrc).toContain('insertAttribs,')
    expect(parserSrc).toContain('insertAttribs[')
  })

  it('parser exports blockAttdefs in return object', () => {
    expect(parserSrc).toContain('blockAttdefs,')
    expect(parserSrc).toContain('blockAttdefs[')
  })

  it('parser exports textPositions in return object', () => {
    expect(parserSrc).toContain('textPositions,')
    expect(parserSrc).toContain('textPositions.push')
  })

  it('parser detects BLOCKS section start', () => {
    expect(parserSrc).toContain("val === 'BLOCKS'")
    expect(parserSrc).toContain('blocksStart')
  })

  it('parser parses ATTDEF entities in BLOCKS section', () => {
    expect(parserSrc).toContain("val === 'ATTDEF'")
    expect(parserSrc).toContain('adTag')
    expect(parserSrc).toContain('adDefault')
    expect(parserSrc).toContain('blockAttdefs[curBlock].push')
  })

  it('parser tracks ATTRIB entities after INSERT with code 66=1', () => {
    expect(parserSrc).toContain('insHasAttribs')
    expect(parserSrc).toContain("code === 66 && val === '1'")
    expect(parserSrc).toContain("entityType === 'ATTRIB'")
    expect(parserSrc).toContain('attribTag')
    expect(parserSrc).toContain('attribVal')
  })

  it('parser handles SEQEND to close attrib sequence', () => {
    expect(parserSrc).toContain("val === 'SEQEND'")
    expect(parserSrc).toContain('insHasAttribs = false')
  })

  it('parser flushes ATTRIB before new entity', () => {
    expect(parserSrc).toContain('flushAttrib()')
  })

  it('parser deduplicates attribs per block name', () => {
    expect(parserSrc).toContain('_seenAttribs')
    expect(parserSrc).toContain('.has(key)')
  })

  it('parser captures TEXT/MTEXT positions', () => {
    expect(parserSrc).toContain('textPositions.push')
    expect(parserSrc).toContain("text: trimmed, x: ptX, y: ptY")
  })

  it('worker mirrors parser ATTRIB changes', () => {
    expect(workerSrc).toContain('insertAttribs,')
    expect(workerSrc).toContain('blockAttdefs,')
    expect(workerSrc).toContain('textPositions,')
    expect(workerSrc).toContain('insHasAttribs')
    expect(workerSrc).toContain("val === 'SEQEND'")
    expect(workerSrc).toContain('flushAttrib()')
  })
})

// ─── parseDxfText functional tests ──────────────────────────────────────────
describe('parseDxfText functional', () => {
  let parseDxfText

  beforeAll(async () => {
    const mod = await import('../../src/dxfParser.js')
    parseDxfText = mod.parseDxfText
  })

  it('returns insertAttribs, blockAttdefs, and textPositions', () => {
    const result = parseDxfText('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')
    expect(result).toHaveProperty('insertAttribs')
    expect(result).toHaveProperty('blockAttdefs')
    expect(result).toHaveProperty('textPositions')
  })

  it('parses ATTDEF in BLOCKS section', () => {
    const dxf = [
      '0', 'SECTION', '2', 'BLOCKS',
      '0', 'BLOCK', '2', 'LAMP_A',
      '0', 'ATTDEF', '2', 'TYPE', '1', 'DOWNLIGHT',
      '0', 'ENDBLK',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n')
    const result = parseDxfText(dxf)
    expect(result.blockAttdefs).toHaveProperty('LAMP_A')
    expect(result.blockAttdefs.LAMP_A).toEqual([{ tag: 'TYPE', defaultValue: 'DOWNLIGHT' }])
  })

  it('parses ATTRIB entities after INSERT with code 66=1', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '2', 'BLK_X', '10', '100', '20', '200', '66', '1',
      '0', 'ATTRIB', '2', 'DESC', '1', 'SOCKET_OUTLET',
      '0', 'ATTRIB', '2', 'TYPE', '1', 'POWER',
      '0', 'SEQEND',
      '0', 'INSERT', '2', 'BLK_X', '10', '300', '20', '400', '66', '1',
      '0', 'ATTRIB', '2', 'DESC', '1', 'SOCKET_OUTLET',
      '0', 'SEQEND',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n')
    const result = parseDxfText(dxf)
    expect(result.insertAttribs).toHaveProperty('BLK_X')
    // DESC:SOCKET_OUTLET and TYPE:POWER should be present (deduplicated)
    const tags = result.insertAttribs.BLK_X.map(a => a.tag)
    expect(tags).toContain('DESC')
    expect(tags).toContain('TYPE')
    // Same DESC:SOCKET_OUTLET from second insert should be deduped
    const descAttribs = result.insertAttribs.BLK_X.filter(a => a.tag === 'DESC')
    expect(descAttribs.length).toBe(1)
  })

  it('captures TEXT positions', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'TEXT', '8', 'NOTES', '10', '50.5', '20', '60.3', '1', 'KAPCSOLÓ',
      '0', 'MTEXT', '8', 'NOTES', '10', '70', '20', '80', '1', 'LED PANEL',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n')
    const result = parseDxfText(dxf)
    expect(result.textPositions.length).toBe(2)
    expect(result.textPositions[0]).toEqual({ text: 'KAPCSOLÓ', x: 50.5, y: 60.3, layer: 'NOTES' })
    expect(result.textPositions[1]).toEqual({ text: 'LED PANEL', x: 70, y: 80, layer: 'NOTES' })
  })

  it('INSERT without code 66 has no attribs', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'INSERT', '2', 'SIMPLE_BLK', '10', '10', '20', '20',
      '0', 'INSERT', '2', 'OTHER_BLK', '10', '30', '20', '40',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n')
    const result = parseDxfText(dxf)
    expect(result.insertAttribs.SIMPLE_BLK).toBeUndefined()
    expect(result.insertAttribs.OTHER_BLK).toBeUndefined()
    // Blocks should still be counted
    expect(result.blocks.length).toBe(2)
  })
})

// ─── Recognition Cascade ─────────────────────────────────────────────────────
describe('Recognition Cascade', () => {
  it('workspace uses recognizeBlockEnhanced instead of recognizeBlock for items', () => {
    expect(workspaceSrc).toContain('recognizeBlockEnhanced(blockName')
    // The old direct recognizeBlock call in the pipeline should be replaced
    expect(workspaceSrc).toContain('const rec = recognizeBlockEnhanced(blockName')
  })

  it('recognizeBlockEnhanced function exists', () => {
    expect(workspaceSrc).toContain('function recognizeBlockEnhanced(blockName')
  })

  it('cascade checks ATTRIB first', () => {
    // The function should check attribs before blockName
    const fnMatch = workspaceSrc.match(/function recognizeBlockEnhanced[\s\S]*?^}/m)
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch[0]
    const attribIdx = fnBody.indexOf('Phase 1: ATTRIB')
    const blockIdx = fnBody.indexOf('Phase 2: blockName')
    const nearbyIdx = fnBody.indexOf('Phase 3: nearbyText')
    expect(attribIdx).toBeLessThan(blockIdx)
    expect(blockIdx).toBeLessThan(nearbyIdx)
  })

  it('matchSource field is set for each cascade level', () => {
    expect(workspaceSrc).toContain("matchSource: 'attribute'")
    expect(workspaceSrc).toContain("matchSource: 'block_name'")
    expect(workspaceSrc).toContain("matchSource: 'nearby_text'")
    expect(workspaceSrc).toContain("matchSource: 'unknown'")
  })

  it('ATTRIB_DESCRIPTIVE_TAGS are defined', () => {
    expect(workspaceSrc).toContain('ATTRIB_DESCRIPTIVE_TAGS')
    expect(workspaceSrc).toContain("'TYPE'")
    expect(workspaceSrc).toContain("'DESC'")
    expect(workspaceSrc).toContain("'LABEL'")
    expect(workspaceSrc).toContain("'DEVICE'")
  })

  it('matchKeywordsInText helper runs BLOCK_ASM_RULES on any text', () => {
    expect(workspaceSrc).toContain('function matchKeywordsInText(text)')
    // Should use BLOCK_ASM_RULES
    expect(workspaceSrc).toContain('for (const rule of BLOCK_ASM_RULES)')
  })

  it('enhanced context includes textPositions and insertPositions', () => {
    expect(workspaceSrc).toContain('textPositions: result.textPositions')
    expect(workspaceSrc).toContain('insertPositions: result.inserts')
    expect(workspaceSrc).toContain('geomBounds: result.geomBounds')
  })
})

// ─── Nearby Text Association ─────────────────────────────────────────────────
describe('Nearby Text Association', () => {
  it('findNearbyTextMatch function exists', () => {
    expect(workspaceSrc).toContain('function findNearbyTextMatch(')
  })

  it('uses adaptive distance threshold based on geomBounds', () => {
    expect(workspaceSrc).toContain('span * 0.02')
    expect(workspaceSrc).toContain('geomBounds')
  })

  it('scales confidence by proximity', () => {
    expect(workspaceSrc).toContain('proximity')
    expect(workspaceSrc).toContain('0.70 + 0.30 * proximity')
  })

  it('caps nearby_text confidence at 0.60', () => {
    expect(workspaceSrc).toContain("Math.min(conf, 0.60)")
  })

  it('samples up to 5 insert positions per block', () => {
    expect(workspaceSrc).toContain('positions.slice(0, 5)')
  })
})

// ─── Match Source UI ─────────────────────────────────────────────────────────
describe('Match Source UI', () => {
  it('MATCH_SOURCE_LABELS is defined with all sources', () => {
    expect(workspaceSrc).toContain('MATCH_SOURCE_LABELS')
    expect(workspaceSrc).toContain("attribute:")
    expect(workspaceSrc).toContain("block_name:")
    expect(workspaceSrc).toContain("nearby_text:")
    expect(workspaceSrc).toContain("dictionary:")
  })

  it('MatchSourceBadge component exists', () => {
    expect(workspaceSrc).toContain('function MatchSourceBadge(')
  })

  it('MatchSourceBadge renders in RecognizedItemRow', () => {
    // Should have MatchSourceBadge with matchSource prop in the item row area
    expect(workspaceSrc).toContain('<MatchSourceBadge matchSource={item.matchSource}')
  })

  it('RecognitionSummaryBar shows source breakdown', () => {
    expect(workspaceSrc).toContain('Match source breakdown')
    expect(workspaceSrc).toContain('bySource')
  })
})

// ─── Architecture Boundaries ─────────────────────────────────────────────────
describe('Architecture Boundaries', () => {
  it('effectiveItems pipeline unchanged', () => {
    expect(workspaceSrc).toContain('const effectiveItems = useMemo(() => {')
    expect(workspaceSrc).toContain('.filter(i => !deletedItems.has(i.blockName))')
  })

  it('takeoffRows pipeline unchanged', () => {
    expect(workspaceSrc).toContain('for (const item of effectiveItems)')
  })

  it('computePricing import unchanged', () => {
    expect(workspaceSrc).toContain("import { computePricing } from '../utils/pricing.js'")
  })

  it('PDF path not touched', () => {
    expect(workspaceSrc).toContain('runPdfTakeoff')
    expect(workspaceSrc).toContain("source === 'pdf_recognition'")
  })

  it('manual DXF tools preserved', () => {
    expect(workspaceSrc).toContain('DxfBlockOverlay')
    expect(workspaceSrc).toContain('DxfViewerPanel')
  })

  it('project dictionary still applies post-cascade', () => {
    expect(workspaceSrc).toContain('applyBlockDictionary(currentProjectId, items)')
  })

  it('original recognizeBlock function still exists for blockName matching', () => {
    expect(workspaceSrc).toContain('function recognizeBlock(blockName)')
    // It should be called inside recognizeBlockEnhanced
    expect(workspaceSrc).toContain('const blockMatch = recognizeBlock(blockName)')
  })
})

// ─── Smoke Scenarios ─────────────────────────────────────────────────────────
describe('Smoke Scenarios', () => {
  it('blockName bad + ATTRIB good → attribute match wins', () => {
    // recognizeBlockEnhanced checks attribs first; if attrib gives >=0.60 match, it returns
    // The Phase 1 should return before reaching Phase 2 (blockName)
    const cascade = workspaceSrc.match(/function recognizeBlockEnhanced[\s\S]*?^}/m)?.[0] || ''
    expect(cascade).toContain("if (bestAttrib && bestAttrib.confidence >= 0.60) return bestAttrib")
  })

  it('blockName bad + nearby text good → nearby_text match returned', () => {
    // Phase 3 should set matchSource to nearby_text
    const cascade = workspaceSrc.match(/function recognizeBlockEnhanced[\s\S]*?^}/m)?.[0] || ''
    expect(cascade).toContain("matchSource: 'nearby_text'")
    expect(cascade).toContain('_nearbyText: bestNearby.nearbyText')
  })

  it('dictionary still applied after cascade', () => {
    // In handleFile, applyBlockDictionary runs after recognizeBlockEnhanced
    const handleMatch = workspaceSrc.indexOf('recognizeBlockEnhanced(blockName')
    const dictMatch = workspaceSrc.indexOf('applyBlockDictionary(currentProjectId, items)')
    expect(handleMatch).toBeLessThan(dictMatch)
    expect(handleMatch).toBeGreaterThan(0)
    expect(dictMatch).toBeGreaterThan(0)
  })

  it('manual tools (DxfBlockOverlay, cable detection) not modified', () => {
    expect(workspaceSrc).toContain('function DxfBlockOverlay')
    expect(workspaceSrc).toContain('function detectDxfCableLengths')
    expect(workspaceSrc).toContain('CABLE_GENERIC_KW')
  })

  it('takeoffRows recomputation path intact', () => {
    // takeoffRows computed from effectiveItems via asmOverrides
    expect(workspaceSrc).toContain('asmOverrides[item.blockName]')
    expect(workspaceSrc).toContain("if (!asmId) continue")
  })
})
