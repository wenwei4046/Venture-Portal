/** A reply without WhatsApp's *bold* / _italic_ marks — for Messenger, which has no formatting (2026-10-29). */
export const plainWa = (text: string) => text.replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, "$1$2");
