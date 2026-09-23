import { describe, expect, it } from 'vitest'
import { installPath, isInAppBrowser, isIos } from './install'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
const WHATSAPP_IOS = `${IPHONE_SAFARI} WhatsApp/24.18.77`
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36'

const base = { maxTouchPoints: 5, standalone: false, hasPrompt: false }

describe('isIos', () => {
  it('knows an iPhone', () => expect(isIos(IPHONE_SAFARI, 5)).toBe(true))
  it('knows an iPad asking for the desktop site by its touch screen', () =>
    expect(isIos(IPAD_DESKTOP_MODE, 5)).toBe(true))
  it('does not take a Mac for an iPad', () => expect(isIos(IPAD_DESKTOP_MODE, 0)).toBe(false))
  it('does not take Android for iOS', () => expect(isIos(ANDROID_CHROME, 5)).toBe(false))
})

describe('isInAppBrowser', () => {
  it('flags WhatsApp and an Android WebView', () => {
    expect(isInAppBrowser(WHATSAPP_IOS)).toBe(true)
    expect(isInAppBrowser(ANDROID_WEBVIEW)).toBe(true)
  })
  it('leaves Safari and Chrome alone', () => {
    expect(isInAppBrowser(IPHONE_SAFARI)).toBe(false)
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false)
  })
})

describe('installPath', () => {
  it('offers nothing once opened from the home screen', () =>
    expect(installPath({ ...base, userAgent: IPHONE_SAFARI, standalone: true, hasPrompt: true })).toBe(
      'installed',
    ))
  it('uses the real prompt when the browser handed one over', () =>
    expect(installPath({ ...base, userAgent: ANDROID_CHROME, hasPrompt: true })).toBe('prompt'))
  it('shows the Share steps on iOS', () =>
    expect(installPath({ ...base, userAgent: IPHONE_SAFARI })).toBe('ios'))
  it('sends an in-app browser, which cannot install, out to the real one', () => {
    expect(installPath({ ...base, userAgent: WHATSAPP_IOS })).toBe('in-app')
    expect(installPath({ ...base, userAgent: ANDROID_WEBVIEW })).toBe('in-app')
  })
  it('shows nothing on Android before (or without) a prompt', () =>
    expect(installPath({ ...base, userAgent: ANDROID_CHROME })).toBe('unsupported'))
})
