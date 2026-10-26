import { describe, expect, it } from 'vitest'
import { adBatches, adLabel, adLinkOf, adsManagerLink, adsRequestUrl, graphRefusal, parseAds } from './ads'

describe('asking Ads Manager', () => {
  it('reads ads in batches of 50, digits only, each once', () => {
    const ids = Array.from({ length: 120 }, (_, i) => String(1200000 + i))
    expect(adBatches([...ids, ids[0], 'bad', '12']).map(b => b.length)).toEqual([50, 50, 20])
  })
  it('asks for the name, campaign, ad set, status and post', () => {
    const url = adsRequestUrl(['120210000000001', '120210000000002'])
    expect(url).toContain('?ids=120210000000001,120210000000002')
    expect(decodeURIComponent(url)).toContain('campaign{name},adset{name}')
  })
})

describe('reading the answer', () => {
  it('keeps what Meta said of each ad, and leaves out what it did not answer', () => {
    const rows = parseAds({
      '120210000000001': { name: 'Oct Sofa Week · Video', account_id: '1234567', effective_status: 'ACTIVE', campaign: { name: 'Oct Sofa' }, adset: { name: 'KL 25-45' },
        creative: { effective_object_story_id: '111_222' } },
      '120210000000002': { name: 'IG Reel', creative: { instagram_permalink_url: 'https://www.instagram.com/p/abc/' } },
      '120210000000003': { error: 'x' },
    })
    expect(rows).toEqual([
      { adId: '120210000000001', name: 'Oct Sofa Week · Video', campaign: 'Oct Sofa', adset: 'KL 25-45', accountId: '1234567', status: 'ACTIVE', link: 'https://www.facebook.com/111_222' },
      { adId: '120210000000002', name: 'IG Reel', campaign: '', adset: '', accountId: '', status: '', link: 'https://www.instagram.com/p/abc/' },
    ])
  })
  it('links the post only when it is one', () => {
    expect(adLinkOf({ effective_object_story_id: 'javascript:alert(1)' })).toBe('')
    expect(adLinkOf(undefined)).toBe('')
  })
  it('says why Meta refused', () => {
    expect(graphRefusal({ code: 100, error_subcode: 33 })).toMatch(/ads_read/)
    expect(graphRefusal({ code: 190 })).toMatch(/expired/)
    expect(graphRefusal({ code: 1 })).toMatch(/refused/)
  })
})

describe('what the screens show', () => {
  it('names an ad by its name, else its headline, else its id', () => {
    expect(adLabel({ adName: 'Oct Sofa', sourceAd: 'Chat with us', adId: '1' })).toBe('Oct Sofa')
    expect(adLabel({ adName: '', sourceAd: 'Chat with us', adId: '1' })).toBe('Chat with us')
    expect(adLabel({ adName: '', sourceAd: '', adId: '120210000000001' })).toBe('Ad 120210000000001')
    expect(adLabel({ sourceAd: '' })).toBe('')
  })
  it('opens Ads Manager on the ad when its account is known', () => {
    expect(adsManagerLink('1234567', '99999')).toBe('https://adsmanager.facebook.com/adsmanager/manage/ads?act=1234567&selected_ad_ids=99999')
    expect(adsManagerLink('', '99999')).toBe('')
  })
})
