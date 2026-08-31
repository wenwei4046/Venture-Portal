import { describe, it, expect } from 'vitest'
import { parseProductPaste } from './product-paste'

describe('parseProductPaste', () => {
  it('reads a full tab-separated spreadsheet paste', () => {
    const { parsed } = parseProductPaste(
      'AK-GUARDIAN MATT (Q)\tAKEMI GUARDIAN MATTRESS\tAKEMI\tMATTRESS\t1800',
    )
    expect(parsed).toEqual([{
      itemCode: 'AK-GUARDIAN MATT (Q)',
      productName: 'AKEMI GUARDIAN MATTRESS',
      brandCode: 'AKEMI',
      itemGroup: 'MATTRESS',
      unitCost: 1800,
    }])
  })

  it('takes the cost from the last numeric cell, however few columns there are', () => {
    // Item code + cost only — the cost must not be read as a product name.
    const { parsed } = parseProductPaste('AK-CS AIRLOFT COMFY PIL\t42.50')
    expect(parsed[0]).toMatchObject({ itemCode: 'AK-CS AIRLOFT COMFY PIL', unitCost: 42.5 })
    expect(parsed[0].productName).toBeNull()
  })

  it('strips thousands separators and quotes', () => {
    const { parsed } = parseProductPaste('"HOK-2008(A) (K)","HOK TRION B/FRAME","1,250.75"')
    expect(parsed[0]).toMatchObject({ itemCode: 'HOK-2008(A) (K)', unitCost: 1250.75 })
  })

  it('keeps a blank cost as null — a known product with no cost keyed in yet', () => {
    const { parsed } = parseProductPaste('NTYR-MEM FM CT PIL\tMEMORY FOAM PILLOW\tNATURY\tACC\t')
    expect(parsed[0].unitCost).toBeNull()
    expect(parsed[0].brandCode).toBe('NATURY')
  })

  it('never confuses zero with missing', () => {
    const { parsed } = parseProductPaste('FREEBIE\tGift item\tAKEMI\tACC\t0')
    expect(parsed[0].unitCost).toBe(0)
  })

  it('upper-cases the brand and item group but leaves the item code alone', () => {
    const { parsed } = parseProductPaste('ak-x\tSomething\takemi\tmattress\t10')
    expect(parsed[0].itemCode).toBe('ak-x') // matched case-insensitively at write time
    expect(parsed[0].brandCode).toBe('AKEMI')
    expect(parsed[0].itemGroup).toBe('MATTRESS')
  })

  it('skips a header row and blank lines', () => {
    const { parsed, skipped } = parseProductPaste(
      'Item Code\tName\tBrand\tGroup\tCost\n\nAK-1\tA\tAKEMI\tMATTRESS\t100\n\n',
    )
    expect(parsed).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it('reports a duplicate instead of letting the last one quietly win', () => {
    const { parsed, skipped } = parseProductPaste('AK-1\tA\t100\nak-1\tB\t200')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].unitCost).toBe(100)
    expect(skipped[0]).toMatchObject({ line: 2, reason: 'Duplicate item code in this paste' })
  })

  it('rejects a negative cost rather than paying commission on it', () => {
    const { parsed, skipped } = parseProductPaste('AK-1\tA\t-50')
    expect(parsed).toEqual([])
    expect(skipped[0].reason).toBe('Negative cost')
  })

  it('handles comma-separated pastes too', () => {
    const { parsed } = parseProductPaste('AK-1,Guardian,AKEMI,MATTRESS,1800')
    expect(parsed[0]).toMatchObject({ itemCode: 'AK-1', brandCode: 'AKEMI', unitCost: 1800 })
  })
})
