import { createClient } from "@/lib/supabase/client";
import type { TrainingApi } from "@/lib/rev-training/api";
import { libContentType, libFileRefusal, libPath } from "@/lib/rev-training/model";
import {
  addLibraryItem, deleteLibraryCategory, deleteLibraryItem, deleteTest, editLibraryItem, fetchAdminTest, fetchAdminTests, fetchLibrary,
  fetchTests, fetchTestScores, openLibraryItem, publishTest, saveLibraryCategory, saveTest, submitTest, takeTest,
} from "@/app/(member)/member/training-actions";

/**
 * The live Free test and Library (2026-11-16): the Server Actions, and a Library file put straight into the private
 * bucket `rev-library` from the browser (a video is bigger than a Server Action carries) — the bucket's policy asks
 * Free test & Library · Create of the uploader's own session, and `rev_lib_item_add` asks that the file really arrived.
 * While viewing as somebody the browser's client writes nothing and answers in its read-only words.
 */
export function liveTrainingApi(): TrainingApi {
  return {
    tests: fetchTests,
    take: takeTest,
    submit: submitTest,
    adminTests: fetchAdminTests,
    adminTest: fetchAdminTest,
    saveTest,
    publishTest,
    deleteTest,
    scores: fetchTestScores,
    library: fetchLibrary,
    open: openLibraryItem,
    saveCategory: saveLibraryCategory,
    deleteCategory: deleteLibraryCategory,
    async upload(file) {
      const refused = libFileRefusal(file);
      if (refused) return { ok: false, error: refused };
      const path = libPath(crypto.randomUUID(), file.name);
      const { error } = await createClient().storage.from("rev-library").upload(path, file, { contentType: libContentType(file.name) ?? undefined, upsert: false });
      if (error) {
        const msg = String((error as { message?: unknown }).message ?? "");
        return { ok: false, error: msg.startsWith("Read-only") ? msg : `The file could not be uploaded${msg ? `: ${msg}` : "."}` };
      }
      return { ok: true, data: path };
    },
    addItem: addLibraryItem,
    editItem: editLibraryItem,
    deleteItem: deleteLibraryItem,
  };
}
