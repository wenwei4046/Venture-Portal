import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { sharedFromRow } from '@/lib/marketing/share'

// 2026-10-23 — ⑥-3: a Library share link's page — closed, a folder's files, one file, view only.

vi.mock('@/components/mkt/fonts', () => ({ nunito: { variable: 'n' }, playfair: { variable: 'p' }, dmSerif: { variable: 'd' }, grotesk: { variable: 'g' } }))

import SharedPage from './SharedPage'

const CODE = '0123456789abcdef0123456789abcdef'
const A = '30000000-0000-4000-8000-000000000001'
const B = '30000000-0000-4000-8000-000000000002'
const row = (over: Record<string, unknown> = {}) => sharedFromRow({
  kind: 'folder', name: 'Brandbook', folder: 'Brandbook', download: true, expires: '2026-10-31T02:22:00Z',
  sub: { name: 'Carres', code: 'CAR', emoji: '🛋️', dot: 'x', client: false, profile: { font: 'Playfair', name: 'Carres Living', caption: 'Sofa & living', banner: 'rgb(40 34 30)' } },
  files: [
    { id: A, name: 'Showroom', ext: 'JPG', size: 1153434, mime: 'image/jpeg' },
    { id: B, name: 'Logo pack', ext: 'ZIP', size: 20971520, mime: 'application/zip' },
  ],
  ...over,
})

describe('a share link’s page', () => {
  it('says only that a closed link is closed', () => {
    render(<SharedPage code={CODE} page={null} />)
    expect(screen.getByRole('heading', { name: 'This link is closed' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('wears the brand, lists a folder’s files — each shown through the link, saved when allowed', () => {
    render(<SharedPage code={CODE} page={row()} />)
    expect(screen.getByText('Carres Living')).toBeTruthy()
    expect(document.querySelector('header[data-dark]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Brandbook' })).toBeTruthy()
    expect(screen.getByText('Expires Sat 31 Oct, 10:22')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Showroom' }).getAttribute('src')).toBe(`/l/${CODE}/f/${A}`)
    expect(screen.getByRole('link', { name: 'Download Logo pack' }).getAttribute('href')).toBe(`/l/${CODE}/f/${B}?download=1`)
    expect(screen.getByText('ZIP')).toBeTruthy()
  })

  it('without Allow download: View only, nothing to save', () => {
    render(<SharedPage code={CODE} page={row({ download: false })} />)
    expect(screen.getByText('View only')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull()
  })

  it('one file: shown large, with its Download', () => {
    render(<SharedPage code={CODE} page={row({ kind: 'file', name: 'Showroom', files: [{ id: A, name: 'Showroom', ext: 'JPG', size: 1153434, mime: 'image/jpeg' }] })} />)
    expect(screen.getByRole('heading', { name: 'Showroom' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(`/l/${CODE}/f/${A}?download=1`)
    expect(screen.getByText('JPG · 1.1 MB')).toBeTruthy()
  })
})
