// The Team side's words for handing a customer on AT ONCE (2026-10-23 — the owner agreed that "Move" should only ever mean
// asking one's direct superior to take a customer, as Mine's ⋮ Move and the desktop's): the Assignment page's and Awaiting
// reply's round button and the sheet it opens say Assign — they hand the customer to anyone straight away (crm_send_to,
// CRM · Manage, 30 s to undo). Run by gen-panel-1011.cjs after the panel's patches; every swap counted, so a prototype
// that changed stops the generator instead of leaving a Move behind.
const SWAPS = [
  ['title="Move to someone else"', 'title="Assign to someone else"', 2],
  [">Move {v.ol.mvName} to</h2>", ">Assign {v.ol.mvName} to</h2>", 1],
];

module.exports = function assignWords(body) {
  for (const [from, to, n] of SWAPS) {
    const found = body.split(from).length - 1;
    if (found !== n) throw new Error(`assign-words: ${from} is there ${found} times, not ${n}`);
    body = body.split(from).join(to);
  }
  return body;
};
