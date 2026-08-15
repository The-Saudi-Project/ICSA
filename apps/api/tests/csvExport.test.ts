/**
 * CSV field encoding for the table export.
 *
 * Pure, so it runs without a database — which matters, because this is the one
 * place a restaurant's own free text is written into a file another member of
 * staff opens in a spreadsheet.
 */

import { describe, expect, it } from 'vitest'
import { csvField } from '../src/modules/tables/table.service.js'

describe('csvField', () => {
  it('quotes ordinary values', () => {
    expect(csvField('Table 12')).toBe('"Table 12"')
    expect(csvField(3)).toBe('"3"')
  })

  it('keeps a value containing a comma in one column', () => {
    expect(csvField('Terrace, window')).toBe('"Terrace, window"')
  })

  it('doubles embedded quotes', () => {
    expect(csvField('Table "A"')).toBe('"Table ""A"""')
  })

  it('keeps a newline inside the quoted field', () => {
    expect(csvField('Table\r\n12')).toBe('"Table\r\n12"')
  })

  /**
   * The security case. A spreadsheet evaluates a cell beginning with any of
   * these as a formula, quotes and all — so `=HYPERLINK(...)` in a table label
   * would run when a manager opened the export. The leading apostrophe forces
   * the cell to be read as text and is not displayed.
   */
  it.each([
    ['=HYPERLINK("http://evil.test","click")', "'=HYPERLINK"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A9)', "'@SUM"],
    ['\tcmd', "'\tcmd"],
    ['\r=1', "'\r=1"],
  ])('neutralises the formula trigger in %j', (input, expectedStart) => {
    const encoded = csvField(input)
    expect(encoded.startsWith(`"${expectedStart}`)).toBe(true)
    // Still a single well-formed field.
    expect(encoded.startsWith('"')).toBe(true)
    expect(encoded.endsWith('"')).toBe(true)
  })

  it('leaves a value that merely contains a trigger alone', () => {
    // Only the first character decides. "Table=12" is not a formula.
    expect(csvField('Table=12')).toBe('"Table=12"')
  })

  it('does not disturb a table URL', () => {
    expect(csvField('https://app.test/t/abc-123')).toBe('"https://app.test/t/abc-123"')
  })
})
