import type { AdminTest, DraftTest, LibraryCategory, TestResult, TestScoreRow, TestSummary, TestToTake } from './model'

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * What the Free test and Library pages ask (2026-11-16): the live app hands the Server Actions
 * (`(member)/member/training-actions.ts`) and the browser's upload; the design preview hands `fixtureTrainingApi`, the
 * same shapes from memory — so both run the very same pages.
 */
export interface TrainingApi {
  tests(): Promise<Outcome<TestSummary[]>>
  take(id: string): Promise<Outcome<TestToTake>>
  submit(id: string, answers: Record<string, number[]>): Promise<Outcome<TestResult>>
  adminTests(): Promise<Outcome<AdminTest[]>>
  adminTest(id: string): Promise<Outcome<DraftTest>>
  saveTest(test: DraftTest): Promise<Outcome<string>>
  publishTest(id: string, on: boolean): Promise<Outcome<true>>
  deleteTest(id: string): Promise<Outcome<true>>
  scores(id: string): Promise<Outcome<TestScoreRow[]>>
  library(): Promise<Outcome<LibraryCategory[]>>
  open(id: string): Promise<Outcome<{ href: string; kind: 'file' | 'link' }>>
  saveCategory(id: string | null, name: string): Promise<Outcome<string>>
  deleteCategory(id: string): Promise<Outcome<true>>
  /** Put a file in the bucket under library/ — answers its path, for addItem. */
  upload(file: File): Promise<Outcome<string>>
  addItem(input: { categoryId: string; title: string; kind: 'file' | 'link'; path?: string; url?: string; note?: string }): Promise<Outcome<string>>
  editItem(input: { id: string; categoryId: string; title: string; url?: string; note?: string }): Promise<Outcome<true>>
  deleteItem(id: string): Promise<Outcome<true>>
}

/** What the writer may do, from the account's Free test & Library cells. */
export interface TrainingRights {
  view: boolean
  create: boolean
  edit: boolean
}

export const NO_RIGHTS: TrainingRights = { view: false, create: false, edit: false }
