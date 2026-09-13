import { describe, expect, it } from 'vitest'
import { DEFAULT_ERP_BASE_URL, erpHostLabel, keyHint, normaliseErpBaseUrl } from './url'

describe('normaliseErpBaseUrl', () => {
  it('accepts the production address as typed', () => {
    expect(normaliseErpBaseUrl('https://erp.houzscentury.com')).toBe(DEFAULT_ERP_BASE_URL)
  })

  it('adds https when the scheme is missing', () => {
    expect(normaliseErpBaseUrl('erp.houzscentury.com')).toBe('https://erp.houzscentury.com')
    expect(normaliseErpBaseUrl('  erp.houzscentury.com/  ')).toBe('https://erp.houzscentury.com')
  })

  it('drops a trailing slash, /api, the query and the hash', () => {
    expect(normaliseErpBaseUrl('https://erp.houzscentury.com/')).toBe('https://erp.houzscentury.com')
    expect(normaliseErpBaseUrl('https://erp.houzscentury.com/api')).toBe('https://erp.houzscentury.com')
    expect(normaliseErpBaseUrl('https://erp.houzscentury.com/api/')).toBe('https://erp.houzscentury.com')
    expect(normaliseErpBaseUrl('https://erp.houzscentury.com/?x=1#y')).toBe('https://erp.houzscentury.com')
  })

  it('keeps the workers.dev address and a path prefix', () => {
    expect(normaliseErpBaseUrl('https://autocount-sync-api.houzs-erp.workers.dev')).toBe(
      'https://autocount-sync-api.houzs-erp.workers.dev',
    )
    expect(normaliseErpBaseUrl('https://example.com/erp/')).toBe('https://example.com/erp')
  })

  it('allows plain http only for a local development server', () => {
    expect(normaliseErpBaseUrl('http://localhost:4555')).toBe('http://localhost:4555')
    expect(normaliseErpBaseUrl('http://127.0.0.1:4555/api')).toBe('http://127.0.0.1:4555')
    expect(() => normaliseErpBaseUrl('http://erp.houzscentury.com')).toThrow(/https/)
  })

  it('refuses nothing, nonsense and embedded logins', () => {
    expect(() => normaliseErpBaseUrl('')).toThrow(/Enter/)
    expect(() => normaliseErpBaseUrl('   ')).toThrow(/Enter/)
    expect(() => normaliseErpBaseUrl('not a url at all')).toThrow(/not a web address/)
    expect(() => normaliseErpBaseUrl('https://user:pw@erp.houzscentury.com')).toThrow(/login/)
  })
})

describe('erpHostLabel', () => {
  it('is the host', () => {
    expect(erpHostLabel('https://erp.houzscentury.com')).toBe('erp.houzscentury.com')
    expect(erpHostLabel('http://localhost:4555')).toBe('localhost:4555')
  })
})

describe('keyHint', () => {
  it('shows only the last four characters', () => {
    expect(keyHint('abcdefghijklmnopqrstuvwxyz')).toBe('····wxyz')
    expect(keyHint('  abcdefghijklmnop  ')).toBe('····mnop')
  })

  it('hides a short key entirely', () => {
    expect(keyHint('short')).toBe('····')
    expect(keyHint('')).toBe('····')
  })
})
