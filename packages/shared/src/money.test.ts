import { describe, expect, it } from 'vitest'
import {
  addVat,
  assertHalalas,
  formatHalalas,
  halalasToSar,
  MoneyError,
  multiplyHalalas,
  roundToHalala,
  sarToHalalas,
  splitVatInclusive,
  sumHalalas,
  vatBreakdown,
} from './money.js'

describe('sarToHalalas', () => {
  it('converts whole and decimal SAR', () => {
    expect(sarToHalalas(12)).toBe(1200)
    expect(sarToHalalas(12.5)).toBe(1250)
    expect(sarToHalalas('12.50')).toBe(1250)
    expect(sarToHalalas('0.05')).toBe(5)
    expect(sarToHalalas(0)).toBe(0)
  })

  it('rounds beyond two decimal places rather than truncating', () => {
    expect(sarToHalalas(12.345)).toBe(1235)
    expect(sarToHalalas(12.344)).toBe(1234)
  })

  it('survives the float representation problem', () => {
    // 19.99 * 100 is 1998.9999999999998 in binary floating point.
    expect(sarToHalalas(19.99)).toBe(1999)
    expect(sarToHalalas(1.005)).toBe(100) // 1.005*100 === 100.49999999999999
  })

  it('rejects rubbish', () => {
    expect(() => sarToHalalas('abc')).toThrow(MoneyError)
    expect(() => sarToHalalas('')).toThrow(MoneyError)
    expect(() => sarToHalalas(NaN)).toThrow(MoneyError)
    expect(() => sarToHalalas(Infinity)).toThrow(MoneyError)
    expect(() => sarToHalalas(-5)).toThrow(MoneyError)
  })
})

describe('assertHalalas', () => {
  it('rejects non-integers, negatives and NaN', () => {
    expect(() => assertHalalas(10.5)).toThrow(MoneyError)
    expect(() => assertHalalas(-1)).toThrow(MoneyError)
    expect(() => assertHalalas(NaN)).toThrow(MoneyError)
    expect(() => assertHalalas(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError)
  })

  it('accepts zero and positive integers', () => {
    expect(() => assertHalalas(0)).not.toThrow()
    expect(() => assertHalalas(999_999)).not.toThrow()
  })
})

describe('roundToHalala', () => {
  it('rounds half away from zero, symmetrically', () => {
    expect(roundToHalala(2.5)).toBe(3)
    expect(roundToHalala(-2.5)).toBe(-3) // Math.round(-2.5) would give -2
    expect(roundToHalala(2.4)).toBe(2)
  })
})

describe('sum and multiply', () => {
  it('adds without drift', () => {
    // The classic failure: 0.1 + 0.2 !== 0.3 in floats. In halalas it is exact.
    expect(sumHalalas([10, 20])).toBe(30)
    expect(sumHalalas([])).toBe(0)
    expect(sumHalalas([1999, 1999, 1999])).toBe(5997)
  })

  it('multiplies by quantity', () => {
    expect(multiplyHalalas(1999, 3)).toBe(5997)
    expect(multiplyHalalas(1999, 0)).toBe(0)
  })

  it('rejects a fractional or negative quantity', () => {
    expect(() => multiplyHalalas(100, 1.5)).toThrow(MoneyError)
    expect(() => multiplyHalalas(100, -1)).toThrow(MoneyError)
  })
})

describe('splitVatInclusive (KSA shelf-price convention)', () => {
  it('splits a 15% VAT-inclusive price', () => {
    // 115.00 SAR inclusive at 15% -> 100.00 net + 15.00 VAT
    expect(splitVatInclusive(11500, 15)).toMatchObject({
      netHalalas: 10000,
      vatHalalas: 1500,
      grossHalalas: 11500,
    })
  })

  it('always reconciles exactly, at every price point', () => {
    for (let gross = 0; gross <= 5000; gross++) {
      const b = splitVatInclusive(gross, 15)
      expect(b.netHalalas + b.vatHalalas).toBe(gross)
      expect(Number.isSafeInteger(b.netHalalas)).toBe(true)
      expect(Number.isSafeInteger(b.vatHalalas)).toBe(true)
    }
  })

  it('handles a 0% rate', () => {
    expect(splitVatInclusive(1000, 0)).toMatchObject({ netHalalas: 1000, vatHalalas: 0 })
  })

  it('rejects an impossible rate', () => {
    expect(() => splitVatInclusive(1000, -1)).toThrow(MoneyError)
    expect(() => splitVatInclusive(1000, 101)).toThrow(MoneyError)
  })
})

describe('addVat (VAT-exclusive convention)', () => {
  it('adds 15% VAT', () => {
    expect(addVat(10000, 15)).toMatchObject({
      netHalalas: 10000,
      vatHalalas: 1500,
      grossHalalas: 11500,
    })
  })

  it('keeps gross === net + vat', () => {
    for (let net = 0; net <= 5000; net++) {
      const b = addVat(net, 15)
      expect(b.grossHalalas).toBe(b.netHalalas + b.vatHalalas)
    }
  })
})

describe('vatBreakdown', () => {
  it('follows the restaurant setting', () => {
    expect(vatBreakdown(11500, 15, true).netHalalas).toBe(10000)
    expect(vatBreakdown(10000, 15, false).grossHalalas).toBe(11500)
  })
})

describe('display helpers', () => {
  it('formats to two decimals', () => {
    expect(formatHalalas(1999)).toBe('19.99')
    expect(formatHalalas(0)).toBe('0.00')
    expect(formatHalalas(123456)).toBe('1,234.56')
  })

  it('converts back to SAR for display', () => {
    expect(halalasToSar(1250)).toBe(12.5)
  })
})
