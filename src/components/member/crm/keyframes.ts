/**
 * The design's motion, by the names its inline styles use (Claude Design
 * handoff): sheets slide up over 320ms cubic-bezier(.2,.8,.2,1), full pages
 * slide in from the right over 280ms, backdrops fade in over 200ms, popups pop,
 * and the sale's fireworks. Global names, as the prototype's <style> had them.
 */
export const KEYFRAMES = `@keyframes fw{0%{transform:rotate(var(--a)) translateY(0) scale(1);opacity:1}80%{opacity:1}100%{transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(.4);opacity:0}}
@keyframes fwPop{0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes popIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`;
