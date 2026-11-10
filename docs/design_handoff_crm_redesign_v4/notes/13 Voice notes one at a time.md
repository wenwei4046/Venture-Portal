# 13 · Voice notes: only one plays at a time

Already true in production: `shared/one-audio.ts` (capture-phase `play` listener + `takeTurn`) is installed by `voice-note.tsx` and pauses any other `<audio>` when one starts — every chat (desktop/phone, Mine/Team) and the file viewer. Covered by `one-audio.test.ts`.

Keep it true when adding drag-to-scrub (`Voice Note Scrub.dc.html`):

1. **Release after drag or tap on the waveform starts playback** → it must go through the same path as the play button: `takeTurn(a); setStarted(true); void a.play()`. Don't call `a.play()` directly.
2. **Pressing down on note B's waveform while note A plays** does not stop A. A stops only when B starts playing on release.
3. **Dragging the note that is playing** pauses it while the finger is down, then resumes it on release. That is still the same note, so nothing else changes.
4. Add a test to `one-audio.test.ts`: A playing → scrub-release on B → A paused, `nowPlaying()` is B.

The prototype behaves the same way: play or release on one note pauses the other.
