/**
 * Only one voice note plays at a time (docs/design_handoff_crm/fixes/voice-and-dates.md §1): every note and the file
 * viewer's player has an <audio> of its own and nothing stopped the others. One capture-phase `play` listener on the
 * document pauses whichever other audio is playing — every chat (desktop and phone, Mine and Team) and the viewer alike,
 * with no player having to know the others. `playing` is the one playing now.
 */
let playing: HTMLAudioElement | null = null;
let installed = false;

/** Pause the one playing if it is another element; this one is the one playing now. */
export function takeTurn(a: HTMLAudioElement) {
  if (playing && playing !== a && !playing.paused) playing.pause();
  playing = a;
}

export function onlyOneAudio() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("play", e => {
    const a = e.target;
    if (!(a instanceof HTMLAudioElement)) return;
    takeTurn(a);
    // A player started some other way (the viewer's own controls) still stops the rest.
    document.querySelectorAll("audio").forEach(o => { if (o !== a && !o.paused) o.pause(); });
  }, true);
  const clear = (e: Event) => { if (e.target === playing) playing = null; };
  document.addEventListener("pause", clear, true);
  document.addEventListener("ended", clear, true);
}

/** For the tests. */
export const nowPlaying = () => playing;
