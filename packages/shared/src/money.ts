/**
 * Money.
 *
 * RULE: every amount in this system is an INTEGER NUMBER OF HALALAS.
 * 1 SAR = 100 halalas. There are no floats anywhere in the money path.
 *
 * Why: binary floating point cannot represent 0.1 exactly, so `0.1 + 0.2`
 * evaluates to 0.30000000000000004. Accumulated over an order that produces a
 * receipt that does not add up. Integers make the arithmetic exact.
 *
 * A signed 53-bit safe integer holds ~90 trillion SAR, so overflow is not a
 * practical concern — but every input is still validated, because a NaN that
 * reaches the database is far worse than a thrown error.
 */

export const HALALAS_PER_SAR = 100

export class MoneyError extends Error {
  override readonly name = 'MoneyError'
}

/** Throws unless `value` is a safe, non-negative integer count of halalas. */
export function assertHalalas(value: number, label = 'amount'): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of halalas, received: ${value}`)
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative, received: ${value}`)
  }
}

/**
 * Commercial rounding: half away from zero.
 * `Math.round` alone rounds -0.5 to -0 and 2.5 to 3 but -2.5 to -2, which is
 * inconsistent for money. This is symmetric.
 */
export function roundToHalala(value: number): number {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`cannot round a non-finite value: ${value}`)
  }
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * Parse a human-entered SAR amount ("12.50", 12.5) into halalas.
 * Only for the boundary where a human types a price into the admin UI —
 * never inside a calculation.
 */
export function sarToHalalas(sar: number | string): number {
  const trimmed = typeof sar === 'string' ? sar.trim() : sar
  if (trimmed === '' || trimmed === null || trimmed === undefined) {
    throw new MoneyError('empty SAR amount')
  }
  const parsed = typeof trimmed === 'string' ? Number(trimmed) : trimmed
  if (!Number.isFinite(parsed)) {
    throw new MoneyError(`not a valid SAR amount: ${String(sar)}`)
  }
  // Scale first, then round, so 12.345 becomes 1235 rather than silently truncating.
  const halalas = roundToHalala(parsed * HALALAS_PER_SAR)
  assertHalalas(halalas, 'SAR amount')
  return halalas
}

/** Halalas back to a decimal SAR number. Display only — never feed this into arithmetic. */
export function halalasToSar(halalas: number): number {
  assertHalalas(halalas)
  return halalas / HALALAS_PER_SAR
}

/** "1,234.50" — digits only, no currency symbol. The UI adds "SAR"/"ر.س". */
export function formatHalalas(halalas: number, locale = 'en-US'): string {
  assertHalalas(halalas)
  return (halalas / HALALAS_PER_SAR).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function sumHalalas(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    assertHalalas(value)
    total += value
  }
  assertHalalas(total, 'sum')
  return total
}

export function multiplyHalalas(halalas: number, quantity: number): number {
  assertHalalas(halalas)
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new MoneyError(`quantity must be a non-negative integer, received: ${quantity}`)
  }
  const total = halalas * quantity
  assertHalalas(total, 'product')
  return total
}

function assertVatRate(ratePercent: number): void {
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new MoneyError(`VAT rate must be between 0 and 100, received: ${ratePercent}`)
  }
}

export interface VatBreakdown {
  /** Amount excluding VAT. */
  netHalalas: number
  /** The VAT portion. */
  vatHalalas: number
  /** Amount including VAT. Always exactly net + vat. */
  grossHalalas: number
  ratePercent: number
}

/**
 * Split a VAT-INCLUSIVE amount into net and VAT.
 * This is the KSA retail convention: the shelf price already contains VAT.
 *
 * net is rounded and VAT is taken as the remainder, so net + vat === gross
 * exactly. Rounding both independently can be off by one halala.
 */
export function splitVatInclusive(grossHalalas: number, ratePercent: number): VatBreakdown {
  assertHalalas(grossHalalas, 'gross')
  assertVatRate(ratePercent)
  const netHalalas = roundToHalala((grossHalalas * 100) / (100 + ratePercent))
  const vatHalalas = grossHalalas - netHalalas
  return { netHalalas, vatHalalas, grossHalalas, ratePercent }
}

/** Add VAT to a VAT-EXCLUSIVE amount. */
export function addVat(netHalalas: number, ratePercent: number): VatBreakdown {
  assertHalalas(netHalalas, 'net')
  assertVatRate(ratePercent)
  const vatHalalas = roundToHalala((netHalalas * ratePercent) / 100)
  return { netHalalas, vatHalalas, grossHalalas: netHalalas + vatHalalas, ratePercent }
}

/**
 * One entry point so no call site has to remember which convention a restaurant uses.
 * `pricesIncludeVat` comes from the restaurant's settings.
 */
export function vatBreakdown(
  amountHalalas: number,
  ratePercent: number,
  pricesIncludeVat: boolean,
): VatBreakdown {
  return pricesIncludeVat
    ? splitVatInclusive(amountHalalas, ratePercent)
    : addVat(amountHalalas, ratePercent)
}
