/**
 * A message's photo, video, voice note or document inside a chat bubble — the salesperson's chat (gen-sales.cjs), the
 * panel's (panel-1011-patches.cjs) and the desktop's (desk-patches.cjs) draw the same markup, bound to
 * `shared/chat-media.ts` › mediaOf (2026-10-14): the box is its final size before the file loads (m.mh — the chat no
 * longer jumps while it opens), a tap opens the in-app viewer (m.view: pull down to close, left / right for the chat's
 * other photos and videos), a video shows its first frame with a play button and plays full screen in the viewer.
 * Later the same day: four or more photos / videos sent together are one album (MediaAlbum), a PDF shows its first page
 * (PdfCard), a voice note is WhatsApp's voice bubble (VoiceNote) — shared/chat-media-parts.tsx, imported by the generators.
 * And a photo / video is ChatImg / ChatVideo: drawn from the phone's kept copy when there is one (shared/media-cache.ts).
 */
module.exports =
  '{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}' +
  '{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(63,43,34,.08)", cursor: "zoom-in" }} />)}' +
  '{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}>' +
    '<ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />' +
    '<span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}' +
  '{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}' +
  '{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}' +
  '{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "#FBF7F3", cursor: "pointer" }}>' +
    '<span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "#C8402A", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span>' +
    '<span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "#3F2B22", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong>' +
    '<small style={{ fontSize: "12px", color: "#806B60" }}>{m.docType}</small></span></span>)}';
