/**
 * Safe formula evaluator — unit tests
 *
 * Proves:
 * 1. Valid formulas evaluate correctly (variables, arithmetic, parens, unary minus)
 * 2. Invalid/unsupported syntax returns null (rejects gracefully)
 * 3. Code execution is impossible (no eval, no Function)
 * 4. Edge cases handled (empty, null, division by zero, very long formulas)
 */
import { describe, it, expect } from 'vitest'
import { evalQtyFormula, getComponentQty } from '../data/workItemsDb.js'

// ── Valid formula evaluation ─────────────────────────────────────────────────

describe('evalQtyFormula — valid formulas', () => {
  it('evaluates a bare variable', () => {
    expect(evalQtyFormula('COUNT', { COUNT: 5 })).toBe(5)
    expect(evalQtyFormula('METER', { METER: 12.5 })).toBe(12.5)
    expect(evalQtyFormula('FLOOR', { FLOOR: 3 })).toBe(3)
  })

  it('evaluates a bare number', () => {
    expect(evalQtyFormula('42')).toBe(42)
    expect(evalQtyFormula('3.14')).toBeCloseTo(3.14)
  })

  it('evaluates simple arithmetic', () => {
    expect(evalQtyFormula('COUNT * 0.3 + 2', { COUNT: 10 })).toBeCloseTo(5)
    expect(evalQtyFormula('METER * 0.1', { METER: 100 })).toBeCloseTo(10)
    expect(evalQtyFormula('COUNT + METER', { COUNT: 3, METER: 7 })).toBe(10)
  })

  it('respects operator precedence (* / before + -)', () => {
    expect(evalQtyFormula('2 + 3 * 4')).toBe(14)       // not 20
    expect(evalQtyFormula('10 - 6 / 3')).toBeCloseTo(8) // not 1.33
  })

  it('respects parentheses', () => {
    expect(evalQtyFormula('(2 + 3) * 4')).toBe(20)
    expect(evalQtyFormula('(COUNT + 1) * 2', { COUNT: 4 })).toBe(10)
    expect(evalQtyFormula('COUNT * (METER + FLOOR)', { COUNT: 2, METER: 3, FLOOR: 4 })).toBe(14)
  })

  it('handles nested parentheses', () => {
    expect(evalQtyFormula('((2 + 3) * (4 - 1))')).toBe(15)
  })

  it('handles unary minus', () => {
    expect(evalQtyFormula('-COUNT', { COUNT: 5 })).toBe(-5)
    expect(evalQtyFormula('-3 + 5')).toBe(2)
    expect(evalQtyFormula('COUNT * -2', { COUNT: 3 })).toBe(-6)
    expect(evalQtyFormula('-(2 + 3)')).toBe(-5)
  })

  it('handles unary plus', () => {
    expect(evalQtyFormula('+5')).toBe(5)
    expect(evalQtyFormula('+COUNT', { COUNT: 3 })).toBe(3)
  })

  it('uses default variable values (COUNT=1, METER=0, FLOOR=1)', () => {
    expect(evalQtyFormula('COUNT')).toBe(1)
    expect(evalQtyFormula('METER')).toBe(0)
    expect(evalQtyFormula('FLOOR')).toBe(1)
    expect(evalQtyFormula('COUNT + METER + FLOOR')).toBe(2)
  })

  it('handles decimal-only numbers (.5)', () => {
    expect(evalQtyFormula('.5 * COUNT', { COUNT: 10 })).toBe(5)
  })

  it('handles whitespace variations', () => {
    expect(evalQtyFormula('  COUNT*2  ', { COUNT: 3 })).toBe(6)
    expect(evalQtyFormula('COUNT +   METER', { COUNT: 1, METER: 2 })).toBe(3)
  })

  it('handles real-world formula patterns', () => {
    // Cable per meter + fixed overhead
    expect(evalQtyFormula('METER * 1.15 + 2', { METER: 100 })).toBeCloseTo(117)
    // Devices per floor
    expect(evalQtyFormula('COUNT * FLOOR', { COUNT: 4, FLOOR: 3 })).toBe(12)
    // Complex with parens
    expect(evalQtyFormula('(COUNT + 1) * FLOOR * 0.5', { COUNT: 9, FLOOR: 2 })).toBe(10)
  })
})

// ── Invalid/unsupported syntax → null ────────────────────────────────────────

describe('evalQtyFormula — rejects invalid syntax', () => {
  it('returns null for null/undefined/empty', () => {
    expect(evalQtyFormula(null)).toBeNull()
    expect(evalQtyFormula(undefined)).toBeNull()
    expect(evalQtyFormula('')).toBeNull()
    expect(evalQtyFormula('   ')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(evalQtyFormula(42)).toBeNull()
    expect(evalQtyFormula({})).toBeNull()
    expect(evalQtyFormula([])).toBeNull()
  })

  it('rejects unknown variables', () => {
    expect(evalQtyFormula('PRICE * 2')).toBeNull()
    expect(evalQtyFormula('X + Y')).toBeNull()
    expect(evalQtyFormula('COUNT + FOO')).toBeNull()
  })

  it('rejects lowercase variables', () => {
    expect(evalQtyFormula('count * 2')).toBeNull()
    expect(evalQtyFormula('meter + floor')).toBeNull()
  })

  it('rejects function calls', () => {
    expect(evalQtyFormula('Math.max(1, 2)')).toBeNull()
    expect(evalQtyFormula('parseInt("5")')).toBeNull()
  })

  it('rejects string literals', () => {
    expect(evalQtyFormula('"hello"')).toBeNull()
    expect(evalQtyFormula("'test'")).toBeNull()
  })

  it('rejects assignment operators', () => {
    expect(evalQtyFormula('COUNT = 5')).toBeNull()
    expect(evalQtyFormula('x = 1')).toBeNull()
  })

  it('rejects comparison operators', () => {
    expect(evalQtyFormula('COUNT > 0')).toBeNull()
    expect(evalQtyFormula('1 < 2')).toBeNull()
    expect(evalQtyFormula('COUNT == 1')).toBeNull()
  })

  it('rejects semicolons and multiple statements', () => {
    expect(evalQtyFormula('1; 2')).toBeNull()
    expect(evalQtyFormula('COUNT; alert(1)')).toBeNull()
  })

  it('rejects mismatched parentheses', () => {
    expect(evalQtyFormula('(COUNT + 1')).toBeNull()
    expect(evalQtyFormula('COUNT + 1)')).toBeNull()
    expect(evalQtyFormula('((COUNT)')).toBeNull()
  })

  it('rejects double decimals', () => {
    expect(evalQtyFormula('1.2.3')).toBeNull()
  })

  it('rejects trailing operators', () => {
    expect(evalQtyFormula('COUNT +')).toBeNull()
    expect(evalQtyFormula('* 2')).toBeNull()
  })

  it('returns null on division by zero', () => {
    expect(evalQtyFormula('COUNT / 0', { COUNT: 5 })).toBeNull()
    expect(evalQtyFormula('10 / (COUNT - COUNT)', { COUNT: 3 })).toBeNull()
  })
})

// ── Code execution prevention ────────────────────────────────────────────────

describe('evalQtyFormula — code execution impossible', () => {
  it('rejects constructor access', () => {
    expect(evalQtyFormula('constructor')).toBeNull()
  })

  it('rejects __proto__ access', () => {
    expect(evalQtyFormula('__proto__')).toBeNull()
  })

  it('rejects alert/eval attempts', () => {
    expect(evalQtyFormula('alert(1)')).toBeNull()
    expect(evalQtyFormula('eval("1+1")')).toBeNull()
  })

  it('rejects template literals', () => {
    expect(evalQtyFormula('`${1+1}`')).toBeNull()
  })

  it('rejects comma operator (multi-expression)', () => {
    expect(evalQtyFormula('1, 2')).toBeNull()
  })

  it('rejects object/array literals', () => {
    expect(evalQtyFormula('[1,2,3]')).toBeNull()
    expect(evalQtyFormula('{a: 1}')).toBeNull()
  })

  it('rejects exponentiation operator', () => {
    expect(evalQtyFormula('2 ** 3')).toBeNull()
  })

  it('rejects bitwise operators', () => {
    expect(evalQtyFormula('1 | 2')).toBeNull()
    expect(evalQtyFormula('3 & 1')).toBeNull()
    expect(evalQtyFormula('~0')).toBeNull()
  })

  it('rejects crafted payloads that bypass regex strip', () => {
    // These would have survived the old regex [^0-9.+\-*/()\s] strip
    // but executed via Function() — now they are rejected outright
    expect(evalQtyFormula('1+1;process')).toBeNull()
    expect(evalQtyFormula('(function(){return 1})()')).toBeNull()
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('evalQtyFormula — edge cases', () => {
  it('handles very long formula gracefully', () => {
    const longFormula = Array(500).fill('COUNT').join(' + ')
    // Should not crash — either evaluates or returns null
    const result = evalQtyFormula(longFormula, { COUNT: 1 })
    expect(result === 500 || result === null).toBe(true)
  })

  it('returns null for Infinity results', () => {
    // Infinity is not isFinite → null
    expect(evalQtyFormula('9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999 * 9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999')).toBeNull()
  })

  it('handles zero correctly', () => {
    expect(evalQtyFormula('0')).toBe(0)
    expect(evalQtyFormula('COUNT * 0', { COUNT: 100 })).toBe(0)
    expect(evalQtyFormula('0 + 0')).toBe(0)
  })

  it('handles negative results', () => {
    expect(evalQtyFormula('1 - 5')).toBe(-4)
    expect(evalQtyFormula('COUNT - METER', { COUNT: 2, METER: 10 })).toBe(-8)
  })
})

// ── getComponentQty integration ──────────────────────────────────────────────

describe('getComponentQty', () => {
  it('uses qty_formula when present and valid', () => {
    const comp = { qty_formula: 'COUNT * 2', qty: 99 }
    expect(getComponentQty(comp, { COUNT: 5 })).toBe(10)
  })

  it('falls back to qty when formula is null/absent', () => {
    expect(getComponentQty({ qty: 3 })).toBe(3)
    expect(getComponentQty({ qty: 3, qty_formula: null })).toBe(3)
  })

  it('falls back to qty when formula is invalid', () => {
    expect(getComponentQty({ qty: 3, qty_formula: 'INVALID * 2' })).toBe(3)
  })

  it('falls back to 0 when both formula and qty are missing', () => {
    expect(getComponentQty({})).toBe(0)
  })

  it('formula takes priority over fixed qty', () => {
    const comp = { qty_formula: 'METER * 0.1', qty: 50 }
    expect(getComponentQty(comp, { METER: 200 })).toBe(20)
  })
})
