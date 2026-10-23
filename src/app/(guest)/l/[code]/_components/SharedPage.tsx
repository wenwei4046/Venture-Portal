import { dmSerif, grotesk, nunito, playfair } from '@/components/mkt/fonts'
import { brandFace, brandLook, fileKind, shareEnds, sizeLabel } from '@/lib/marketing/library'
import { sharedBrandHref, sharedFileHref, type SharedPage as Page } from '@/lib/marketing/share'
import { inlineSafe } from '@/lib/storage/names'
import s from './shared.module.css'

// A Library share link's page, /l/<code> (⑥-3): the brand (its cover or colour, its logo or letter or emoji, its name
// in its font), what was shared — a file, or a folder's files — each shown in place where a browser can, and saved
// when the link allows. The handoff draws only the dialog that makes the link; this page is the portal's.

const FACES = `${nunito.variable} ${playfair.variable} ${dmSerif.variable} ${grotesk.variable}`

export default function SharedPage({ code, page }: { code: string; page: Page | null }) {
  if (!page) {
    return (
      <div className={`mkt-pic ${s.root}`}>
        <main className={s.main}>
          <div className={s.closed}>
            <div className={s.closedIcon} aria-hidden="true">🔒</div>
            <h1 className={s.title}>This link is closed</h1>
          </div>
        </main>
      </div>
    )
  }

  const look = brandLook(page.sub)
  const banner = look.banner.img ? { backgroundImage: `url("${sharedBrandHref(code, 'banner')}")` } : look.banner.bg ? { background: look.banner.bg } : undefined
  const one = page.kind === 'file' ? page.files[0] ?? null : null

  return (
    <div className={`mkt-pic ${s.root} ${FACES}`}>
      <main className={s.main}>
        <header className={s.banner} style={banner} data-dark={look.banner.dark ? '' : undefined}>
          <span className={`${s.avatar}${look.avatar.bg ? ` ${s.avatarColour}` : ''}`} style={look.avatar.bg ? { background: look.avatar.bg } : undefined} aria-hidden="true">
            {look.avatar.img ? <img src={sharedBrandHref(code, 'avatar')} alt="" /> : look.avatar.text}
          </span>
          <div className={s.ellipsis}>
            <div className={`${s.brandName}${look.font ? ` ${s.inFont}` : ''}`} style={brandFace(look.font)}>{look.name}</div>
            <div className={s.caption}>{look.caption}</div>
          </div>
        </header>

        <div className={s.head}>
          <span aria-hidden="true">{page.kind === 'folder' ? '📁' : '📄'}</span>
          <h1 className={`${s.title} ${s.ellipsis}`}>{page.name}</h1>
        </div>
        <div className={s.meta}>
          {page.kind === 'folder' ? <span>{page.files.length} file{page.files.length === 1 ? '' : 's'}</span> : <span>{page.folder}</span>}
          <span aria-hidden="true">·</span>
          <span>{shareEnds(page.expires)}</span>
          {!page.download ? <span className={s.chip}>View only</span> : null}
        </div>

        {one ? (
          <section className={s.single}>
            <Preview code={code} id={one.id} mime={one.mime} name={one.name} ext={one.ext} large download={page.download} />
            <div className={s.singleFoot}>
              <span className={s.mono}>{one.ext} · {sizeLabel(one.size)}</span>
              <span className={s.grow} />
              {page.download ? <a className={s.primary} href={sharedFileHref(code, one.id, true)}>Download</a> : null}
            </div>
          </section>
        ) : page.files.length ? (
          <section className={s.grid}>
            {page.files.map(f => (
              <div key={f.id} className={s.tile}>
                <Preview code={code} id={f.id} mime={f.mime} name={f.name} ext={f.ext} download={page.download} />
                <div className={s.tileBody}>
                  <div className={`${s.tileName} ${s.ellipsis}`} title={f.name}>{f.name}</div>
                  <div className={s.tileFoot}>
                    <span className={s.mono}>{sizeLabel(f.size)}</span>
                    <span className={s.grow} />
                    {page.download ? <a className={s.link} href={sharedFileHref(code, f.id, true)} aria-label={`Download ${f.name}`}>Download</a> : null}
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <div className={s.empty}>Nothing here yet</div>
        )}
        <footer className={s.foot}>HOUZS Marketing</footer>
      </main>
    </div>
  )
}

/** A file shown in place where a browser can — a picture, a video, a PDF opened — else its kind boxed. */
function Preview({ code, id, mime, name, ext, large, download }: { code: string; id: string; mime: string; name: string; ext: string; large?: boolean; download: boolean }) {
  const kind = fileKind({ mime })
  const src = sharedFileHref(code, id)
  const cls = `${s.thumb}${large ? ` ${s.thumbLarge}` : ''}`
  if (kind === 'image') return <a className={cls} href={src} target="_blank" rel="noreferrer"><img src={src} alt={name} loading="lazy" /></a>
  if (kind === 'video') return <div className={`${cls} ${s.thumbVideo}`}><video src={src} controls preload="metadata" controlsList={download ? undefined : 'nodownload'} /></div>
  // A PDF (or plain text) opens in place; anything else is only ever saved.
  if (inlineSafe(mime)) return <a className={cls} href={src} target="_blank" rel="noreferrer"><span className={s.ext}>{ext}</span></a>
  return <div className={cls}><span className={s.ext}>{ext}</span></div>
}
