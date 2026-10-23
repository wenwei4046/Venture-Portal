import type { StagedRef } from '@/lib/storage/staging'

/**
 * `@/lib/storage/stage` for a page's test: a file "sent ahead" stays the File itself in the form, as every page sent
 * it before 2026-10-24 — the server reads both (lib/storage/staged.ts) — so the test checks what the page sends, not
 * the trip to R2 (which needs a signed-in browser). Use: `vi.mock('@/lib/storage/stage', () => import('@/test/stage-in-place'))`.
 */
export async function stageFile(file: File): Promise<StagedRef> {
  return { staged: '', name: file.name, type: file.type, size: file.size }
}

export async function stageInto(form: FormData, field: string, files: File | readonly File[] | null | undefined): Promise<void> {
  const list = files == null ? [] : Array.isArray(files) ? files : [files as File]
  for (const file of list) form.append(field, file)
}

export async function stageFiles(form: FormData): Promise<void> {
  void form
}

export function stagedOnce(): (file: File) => Promise<string> {
  // The File goes in the form where the page puts the line.
  return async (file: File) => file as unknown as string
}
