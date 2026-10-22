import { describe, expect, it } from 'vitest'
import { contentTypeOf, inlineSafe, objectNameProblem, typeAllowed, uploadSize } from './names'

describe('a file’s name in a bucket', () => {
  it('takes the paths the portal writes', () => {
    for (const ok of ['documents/0b1e/handbook.pdf', 'guest/hv-ABCDEFGH/9f.pdf', 'punch/uid/2026-10-23_shot.jpg', 'a']) {
      expect(objectNameProblem(ok)).toBeNull()
    }
  })

  it('refuses what is not a path: empty, leading slash, empty / dot parts, control characters, too long', () => {
    for (const bad of ['', '/documents/x.pdf', 'documents//x.pdf', 'documents/../x.pdf', 'documents/./x.pdf', 'documents/x.pdf/', 'a\u0000b', 'a\nb', 'x'.repeat(1025)]) {
      expect(objectNameProblem(bad)).not.toBeNull()
    }
  })
})

describe('a file’s type', () => {
  it('is the one asked for, else the file’s own, as its bare lower-case name', () => {
    expect(contentTypeOf('Application/PDF; charset=binary')).toBe('application/pdf')
    expect(contentTypeOf(null, new Blob(['x'], { type: 'image/png' }))).toBe('image/png')
    expect(contentTypeOf(undefined, new Uint8Array([1]))).toBe('application/octet-stream')
    expect(contentTypeOf('not a type')).toBe('application/octet-stream')
  })

  it('shows in place only what a browser cannot run', () => {
    expect(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'audio/ogg', 'application/pdf', 'text/plain', 'text/csv'].every(inlineSafe)).toBe(true)
    expect(['text/html', 'image/svg+xml', 'application/javascript', 'application/xhtml+xml', 'application/octet-stream', '', null].some(inlineSafe)).toBe(false)
  })

  it('is taken by a bucket that lists it, a family of it, or lists nothing', () => {
    expect(typeAllowed(['image/png', 'application/pdf'], 'application/pdf')).toBe(true)
    expect(typeAllowed(['image/*'], 'image/heic')).toBe(true)
    expect(typeAllowed(['image/*'], 'video/mp4')).toBe(false)
    expect(typeAllowed(null, 'application/zip')).toBe(true)
    expect(typeAllowed([], 'application/zip')).toBe(true)
  })

  it('counts bytes of a blob and of a buffer', () => {
    expect(uploadSize(new Blob(['abc']))).toBe(3)
    expect(uploadSize(new Uint8Array(5))).toBe(5)
  })
})
