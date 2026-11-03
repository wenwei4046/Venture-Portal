(function () {
  const KEY = 'houzs-basic-v1';
  const SHOP_FIELDS = [['address','Address','map-pin','Street, postcode, city'],['hours','Opening hours','clock','e.g. 10am – 10pm daily'],['phone','Phone','phone','03-0000 0000'],['maps','Google Maps','map','https://maps.app.goo.gl/…'],['waze','Waze','navigation','https://waze.com/ul/…']];
  const CATS = [
    { id:'showroom', label:'Showrooms', icon:'store', fixed:true },
    { id:'payment', label:'Payment methods', icon:'credit-card' },
    { id:'delivery', label:'Delivery', icon:'truck' },
    { id:'warranty', label:'Warranty and returns', icon:'shield-check' }];
  let n = 0; const fid = () => 'x' + Date.now().toString(36) + (n++).toString(36);
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const SR = o => ({ id:fid(), cat:'showroom', until:'', ai:'on', uses:[], ...o, fields: SHOP_FIELDS.map(([k, label, icon, ph]) => ({ id:fid(), key:k, label, icon, ph, value:(o.v || {})[k] || '' })) });
  const CU = o => ({ id:fid(), until:'', ai:'on', uses:[], ...o, fields:(o.rows || [['','']]).map(([label, value]) => ({ id:fid(), label, value })) });
  const seed = () => ({ cats: CATS.map(c => ({...c})), cards: [
    SR({ brand:'2990s', name:'KL showroom', code:'kl', uses:['AI Agent · 2990s','Template “Quick pick, then AI” · step 2'], v:{ address:'Jalan Klang Lama, 58000 Kuala Lumpur', hours:'10am – 10pm daily', phone:'03-0000 0001', maps:'https://maps.app.goo.gl/2990s-kl', waze:'https://waze.com/ul/2990s-kl' } }),
    SR({ brand:'2990s', name:'PJ showroom', code:'pj', uses:['AI Agent · 2990s'], v:{ address:'Jalan SS 2, 47300 Petaling Jaya', hours:'10am – 9pm daily', phone:'03-0000 0002', maps:'https://maps.app.goo.gl/2990s-pj', waze:'https://waze.com/ul/2990s-pj' } }),
    SR({ brand:'2990s', name:'KL showroom · Deepavali hours', code:'kl-deepavali', untilOn:true, from:'2026-11-08', until:'2026-11-09', uses:['AI Agent · 2990s'], v:{ address:'Jalan Klang Lama, 58000 Kuala Lumpur', hours:'Closed on 8 Nov, open 12pm – 8pm on 9 Nov', phone:'03-0000 0001' } }),
    SR({ brand:'2990s', name:'PJ showroom · Merdeka hours', code:'pj-merdeka', untilOn:true, from:'2026-08-31', until:'2026-08-31', v:{ address:'Jalan SS 2, 47300 Petaling Jaya', hours:'Closed on 31 Aug' } }),
    SR({ brand:'Carress', name:'Puchong showroom', code:'puchong', uses:['AI Agent · Carress','Inbox · CS replies'], v:{ address:'Jalan Puchong, 47100 Puchong, Selangor', hours:'11am – 9pm, closed Tuesday', phone:'03-0000 0003', maps:'https://maps.app.goo.gl/carress-puchong', waze:'https://waze.com/ul/carress-puchong' } }),
    SR({ brand:'Carress', name:'Setia Alam pop-up', code:'setia', ai:'off', v:{ address:'Setia City Mall, 40170 Shah Alam', hours:'10am – 10pm daily' } }),
    SR({ brand:'Carress', name:'Mid Valley roadshow', code:'midvalley', untilOn:true, from:'2026-10-12', until:'2026-10-26', v:{ address:'Mid Valley Megamall, Concourse', hours:'10am – 10pm daily' } }),
    CU({ cat:'payment', brand:'All brands', name:'Instalment', code:'instal', uses:['AI Agent · 2990s','AI Agent · Carress','Inbox · CS replies'], rows:[['Banks','Maybank, CIMB, Public Bank credit cards'],['Plan','0% for 12 months'],['Minimum','RM 1,000 per order']] }),
    CU({ cat:'payment', brand:'All brands', name:'Other payment', code:'pay', rows:[['Accepted','Cash, debit card, DuitNow QR, bank transfer'],['Deposit','30% to confirm the order']] }),
    CU({ cat:'delivery', brand:'2990s', name:'Delivery and installation', code:'delivery', uses:['AI Agent · 2990s','Template “Sofa enquiry” · step 5'], rows:[['Delivery area','Klang Valley, Seremban, Melaka'],['Delivery time','7 to 14 working days'],['Free delivery','Orders above RM 1,500'],['Installation','Free for beds and wardrobes']] }),
    CU({ cat:'delivery', brand:'Carress', name:'Mattress delivery', code:'carress-delivery', uses:['AI Agent · Carress'], rows:[['Delivery area','Peninsular Malaysia'],['Delivery time','3 to 7 working days'],['Old mattress','We take it away for RM 50']] }),
    CU({ cat:'warranty', brand:'Carress', name:'100-night trial', code:'trial', uses:['AI Agent · Carress'], rows:[['What it is','Sleep on it for 100 nights, exchange once for free'],['Conditions','Mattress protector used, no stains']] }),
    CU({ cat:'delivery', brand:'2990s', name:'Year-end delivery cut-off', code:'yearend', ai:'draft', note:'Orders after 10 Dec deliver in January. Confirm the date with the warehouse before publishing.', rows:[['Last order date','10 Dec 2026'],['Deliveries resume','5 Jan 2027']] }),
    CU({ cat:'warranty', brand:'2990s', name:'Sofa warranty', code:'sofa-warranty', rows:[['Frame','5 years'],['Fabric and foam','1 year']] })] });
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.cards) return s; } catch (e) {} return seed(); };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } };
  const tokenOf = (card, f) => '{' + (card.code || slug(card.name)) + '.' + (f.key || slug(f.label)) + '}';
  const live = (c, today) => c.ai !== 'off' && c.ai !== 'paused' && c.ai !== 'draft' && !(c.until && c.until < today) && !(c.from && c.from > today);
  const entries = (d, brand, today) => (d || load()).cards.filter(c => (!brand || brand === 'All' || c.brand === brand || c.brand === 'All brands') && live(c, today || '2026-10-18'))
    .map(c => ({ card:c, cat:(d || load()).cats.find(x => x.id === c.cat) || {label:'Other', icon:'file-text'}, fields: [...c.fields, ...(c.note ? [{ key:'notes', label:'Notes', value:c.note }] : [])].filter(f => f.value).map(f => ({ label:f.label, value:f.value, token:tokenOf(c, f) })), images: c.images || [] })).filter(e => e.fields.length);
  const resolve = (text, d) => { const all = (d || load()).cards; return String(text || '').replace(/\{([a-z0-9-]+)\.([a-z0-9-]+)\}/g, (m, code, k) => { const c = all.find(x => (x.code || slug(x.name)) === code); const f = c && (k === 'notes' ? (c.note ? { value:c.note } : null) : c.fields.find(y => (y.key || slug(y.label)) === k)); return f ? f.value : m; }); };
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('houzs-basic-img', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const putImg = (id, src) => db().then(d => new Promise((res, rej) => { const t = d.transaction('img', 'readwrite'); t.objectStore('img').put(src, id); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); }));
  const getImg = id => db().then(d => new Promise(res => { const q = d.transaction('img').objectStore('img').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null);
  const delImg = id => db().then(d => { d.transaction('img', 'readwrite').objectStore('img').delete(id); }).catch(() => {});
  window.HZBasic = { putImg, getImg, delImg, KEY, SHOP_FIELDS, load, save, seed, SR, CU, fid, slug, tokenOf, entries, resolve };
})();
