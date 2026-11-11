(() => {
'use strict';
const K = { trips: 'travelCountdown.trips.v2', old: 'travel-countdowns/v1', theme: 'travelCountdown.theme', mode: 'travelCountdown.mode', set: 'travelCountdown.settings', seen: 'travelCountdown.seen' };
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }
};
const DEF = { theme: 'auto', accent: 'amber', datefmt: 'auto', time: 'auto', fx: true, haptics: true, notify: false };
const ACC = { amber: ['#ffb454', '#c2410c'], coral: ['#ff7a6b', '#c0392b'], teal: ['#4fd1c5', '#0b7a70'], lilac: ['#b79cff', '#6244c9'], mint: ['#7bdc8a', '#1a7a35'] };
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(store.get(K.set) || '{}') }; } catch { /* defaults */ }
if (!store.get(K.set) && ['dark', 'light'].includes(store.get(K.theme))) S.theme = store.get(K.theme);
const saveS = () => store.set(K.set, JSON.stringify(S));
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODES = ['full', 'days', 'hm'];
const MODE_LABEL = { full: 'Full', days: 'Days', hm: 'Hrs · Min' };
const UNITS = { full: ['mo', 'w', 'd', 'h', 'm', 's'], days: ['td'], hm: ['th', 'm', 's'] };
const LABEL = { mo: 'Months', w: 'Weeks', d: 'Days', h: 'Hours', m: 'Min', s: 'Sec', td: 'Days', th: 'Hours' };

let trips = [], editId = null, photo = null;
let mode = MODES.includes(store.get(K.mode)) ? store.get(K.mode) : 'full';
const refs = new Map();

/* ---------- data ---------- */
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'trip-' + Date.now() + Math.random().toString(16).slice(2);
function iso(v) {
  if (!v) return null;
  const d = new Date(typeof v === 'string' && /^\d{8,}$/.test(v) ? +v : v);
  return isNaN(d) ? null : d.toISOString();
}
function norm(t, i) {
  if (!t || typeof t !== 'object') return null;
  const dep = iso(t.departure || t.departureDate || t.date || t.startDate || t.when);
  if (!dep) return null;
  const name = [t.destination, t.title, t.name].find(x => typeof x === 'string' && x.trim());
  return {
    id: t.id || uid(), destination: name ? name.trim() : 'Trip ' + (i + 1), departure: dep,
    returnDate: iso(t.returnDate || t.endDate || t.arrival),
    background: t.background || t.backgroundImage || t.image || t.photo || null,
    createdAt: iso(t.createdAt) || new Date().toISOString(),
    tz: typeof t.tz === 'string' ? t.tz : '', notes: typeof t.notes === 'string' ? t.notes : '',
    pack: Array.isArray(t.pack) ? t.pack.filter(p => p && p.t).map(p => ({ t: String(p.t), done: !!p.done })) : []
  };
}
function load() {
  let raw;
  try { raw = JSON.parse(store.get(K.trips) || store.get(K.old) || '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) raw = (raw && raw.trips) || [];
  trips = raw.map(norm).filter(Boolean);
}
function save() { if (!store.set(K.trips, JSON.stringify(trips))) toast('Storage is full — try a smaller photo'); }

/* ---------- time ---------- */
function stat(t, now = Date.now()) {
  const d = +new Date(t.departure), r = t.returnDate ? +new Date(t.returnDate) : 0;
  if (now < d) return { k: 'up', target: d, d, r };
  if (r && now < r) return { k: 'away', target: r, d, r };
  return { k: 'done', target: r || d, d, r };
}
function ordered() {
  const now = Date.now(), A = [], D = [];
  trips.forEach(t => { const s = stat(t, now); (s.k === 'done' ? D : A).push([t, s.target]); });
  return [...A.sort((a, b) => a[1] - b[1]), ...D.sort((a, b) => b[1] - a[1])].map(x => x[0]);
}
function addMonths(d, n) {
  const x = new Date(d), day = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
}
function parts(now, target) {
  const ms = Math.max(0, target - now), a = new Date(now), b = new Date(target);
  let mo = ms ? Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth()) : 0;
  while (mo > 0 && addMonths(a, mo) > b) mo--;
  let rest = ms ? Math.max(0, target - addMonths(a, mo)) : 0;
  const S = 1e3, M = 60 * S, H = 60 * M, D = 24 * H;
  const w = Math.floor(rest / (7 * D)); rest -= w * 7 * D;
  const d = Math.floor(rest / D); rest -= d * D;
  const h = Math.floor(rest / H); rest -= h * H;
  const m = Math.floor(rest / M); rest -= m * M;
  return { mo, w, d, h, m, s: Math.floor(rest / S), td: Math.floor(ms / D), th: Math.floor(ms / H) };
}
function rel(ms) {
  const s = Math.round(ms / 1000), a = Math.abs(s);
  return a >= 86400 ? rtf.format(Math.trunc(s / 86400), 'day') : a >= 3600 ? rtf.format(Math.trunc(s / 3600), 'hour')
    : a >= 60 ? rtf.format(Math.trunc(s / 60), 'minute') : rtf.format(s, 'second');
}
function grad(seed) {
  let h = 0;
  for (const c of seed) h = c.charCodeAt(0) + ((h << 5) - h);
  h = Math.abs(h) % 360;
  return `linear-gradient(135deg,hsl(${h} 55% 30%),hsl(${(h + 55) % 360} 60% 42%))`;
}

/* ---------- render ---------- */
function render() {
  const list = $('list');
  list.textContent = ''; refs.clear();
  $('empty').hidden = trips.length > 0;
  $('modeBtn').textContent = MODE_LABEL[mode];
  ordered().forEach((t, i) => {
    const s = stat(t), el = document.createElement('article');
    el.className = 'card' + (i === 0 && s.k !== 'done' ? ' feat' : '');
    el.dataset.k = s.k; el.style.setProperty('--i', i);
    el.style.setProperty('--img', t.background ? `url("${t.background}")` : grad(t.destination));
    el.innerHTML = `<div class="veil"></div><div class="body">
      <div class="row"><span class="tag"></span><button class="edit" type="button">Edit</button></div>
      <h2></h2><p class="sub"></p>
      <div class="units u-${mode}">${UNITS[mode].map(u => `<div class="u" data-u="${u}"><b>00</b><i>${LABEL[u]}</i></div>`).join('')}</div>
      <div class="bar"><i></i></div>
      <dl class="dates"><div><dt>Departs</dt><dd></dd></div><div class="rr"><dt>Returns</dt><dd></dd></div></dl></div>`;
    el.querySelector('h2').textContent = t.destination;
    el.querySelector('.edit').setAttribute('aria-label', 'Edit ' + t.destination);
    const dd = el.querySelectorAll('dd');
    dd[0].textContent = fd(t.departure);
    el.querySelector('.rr').hidden = !t.returnDate;
    if (t.returnDate) dd[1].textContent = fd(t.returnDate);
    el.querySelector('.edit').onclick = e => { e.stopPropagation(); openSheet(t.id); };
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.onclick = () => openDetail(t.id);
    el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) openDetail(t.id); };
    list.appendChild(el);
    refs.set(t.id, {
      t, k: s.k, feat: el.classList.contains('feat'), el,
      tag: el.querySelector('.tag'), sub: el.querySelector('.sub'), bar: el.querySelector('.bar i'),
      bs: [...el.querySelectorAll('.u')].map(u => [u.dataset.u, u.querySelector('b')])
    });
  });
  tick(true);
}
function setVal(b, v) {
  const s = String(v).padStart(2, '0');
  if (b.textContent === s) return;
  b.textContent = s;
  if (!reduce && b.animate) b.animate([{ transform: 'rotateX(-75deg)', opacity: .35 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
function tick(force) {
  if (document.hidden && !force) return;
  const now = Date.now();
  for (const r of refs.values()) {
    const s = stat(r.t, now);
    if (s.k !== r.k) { render(); return; }
    const p = parts(now, s.target);
    r.sub.textContent = s.k === 'up' ? 'Departs ' + rel(s.d - now)
      : s.k === 'away' ? 'On the road · back ' + rel(s.r - now)
      : (s.r ? 'Returned ' : 'Departed ') + rel(s.target - now);
    const sl = sleeps(now, s.target);
    r.tag.textContent = s.k === 'done' ? 'Completed' : s.k === 'away' ? 'On trip' : sl === 0 ? 'Today!' : sl === 1 ? 'Tomorrow' : r.feat ? 'Next up' : p.td <= 14 ? 'Soon' : 'Upcoming';
    r.el.classList.toggle('soon', s.k === 'up' && sl <= 1);
    r.bs.forEach(([u, b]) => setVal(b, p[u]));
    let f = 1;
    if (s.k === 'up') { const c = +new Date(r.t.createdAt); f = (now - c) / (s.d - c); }
    else if (s.k === 'away') f = (now - s.d) / (s.r - s.d);
    r.bar.style.transform = `scaleX(${Math.min(1, Math.max(.02, f || 0))})`;
  }
  paintDetail(now);
}

/* ---------- add / edit sheet ---------- */
const sheet = $('sheet');
const local = v => { if (!v) return ''; const d = new Date(v); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const setPrev = v => { $('prev').style.backgroundImage = v ? (v.startsWith('linear') ? v : `url("${v}")`) : ''; };
function openSheet(id) {
  const t = trips.find(x => x.id === id);
  editId = t ? t.id : null; photo = null;
  $('sheetTitle').textContent = t ? 'Edit trip' : 'New trip';
  $('dest').value = t ? t.destination : '';
  $('dep').value = t ? local(t.departure) : '';
  $('ret').value = t ? local(t.returnDate) : '';
  $('photo').value = ''; $('ret').setCustomValidity(''); $('tz').value = t ? t.tz || '' : '';
  $('del').hidden = !t;
  setPrev(t ? (t.background || grad(t.destination)) : '');
  sheet.showModal();
}
function shrink(file) {
  return new Promise(res => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .72));
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}
$('photo').onchange = async e => {
  const f = e.target.files[0];
  photo = f ? await shrink(f) : null;
  if (photo) setPrev(photo);
};
['dep', 'ret'].forEach(id => $(id).addEventListener('input', () => $('ret').setCustomValidity('')));
$('form').addEventListener('submit', e => {
  e.preventDefault();
  const dest = $('dest').value.trim(), dep = new Date($('dep').value), ret = $('ret').value ? new Date($('ret').value) : null;
  if (!dest || isNaN(dep)) return;
  if (ret && ret < dep) { $('ret').setCustomValidity('Return must be after departure'); $('ret').reportValidity(); return; }
  const tz = $('tz').value.trim();
  if (tz) { try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch { $('tz').setCustomValidity('Unknown time zone — pick one from the list'); $('tz').reportValidity(); return; } }
  let t = trips.find(x => x.id === editId), isNew = false;
  if (!t) { t = { id: uid(), createdAt: new Date().toISOString(), background: null, pack: [], notes: '' }; trips.push(t); isNew = true; }
  Object.assign(t, { destination: dest, departure: dep.toISOString(), returnDate: ret ? ret.toISOString() : null, tz });
  if (photo) t.background = photo;
  seed(t); save(); sheet.close(); render();
  if (isNew) { confetti(); toast('Trip added — let the countdown begin ✈️'); }
});
$('del').onclick = () => {
  const t = trips.find(x => x.id === editId);
  if (t && confirm(`Delete the trip to ${t.destination}?`)) { trips = trips.filter(x => x !== t); save(); sheet.close(); render(); }
};
$('cancel').onclick = () => sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openSheet());

/* ---------- toolbar: mode, theme, share ---------- */
$('modeBtn').onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; store.set(K.mode, mode); render(); };
let tt;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2800);
}
const shareTrips = async list => {
  const data = list.map(t => ({ d: t.destination, s: t.departure, r: t.returnDate, z: t.tz }));
  const url = location.origin + location.pathname + '#share=' + btoa(encodeURIComponent(JSON.stringify(data)));
  try {
    if (navigator.share) await navigator.share({ title: 'Travel Countdown', text: 'My trips', url });
    else { await navigator.clipboard.writeText(url); toast('Link copied — photos are not included'); }
  } catch { /* share cancelled */ }
};
$('shareBtn').onclick = () => trips.length ? shareTrips(trips) : toast('Add a trip first');
function importShared() {
  const m = location.hash.match(/^#share=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  try {
    const items = JSON.parse(decodeURIComponent(atob(m[1])));
    const fresh = items.map(x => norm({ destination: x.d, departure: x.s, returnDate: x.r, tz: x.z }, 0)).filter(Boolean)
      .filter(n => !trips.some(t => t.destination === n.destination && t.departure === n.departure));
    if (!fresh.length) return toast('Those trips are already here');
    if (confirm(`Add ${fresh.length} shared trip${fresh.length > 1 ? 's' : ''}?`)) { trips.push(...fresh); fresh.forEach(seed); save(); render(); }
  } catch { toast('That share link looks broken'); }
}
addEventListener('hashchange', importShared);

/* ---------- install hint + service worker ---------- */
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let deferred;
function hint(text, act) {
  $('hintText').textContent = text; $('hintAct').hidden = !act; $('hint').hidden = false;
}
$('hintX').onclick = () => { $('hint').hidden = true; store.set('travelCountdown.hintOff', '1'); };
$('hintAct').onclick = async () => { if (deferred) { deferred.prompt(); deferred = null; $('hint').hidden = true; } };
if (!standalone && !store.get('travelCountdown.hintOff')) {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; hint('Install this app on your home screen.', true); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) hint('To install: tap Share, then “Add to Home Screen”.');
}
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ---------- boot ---------- */
/* ---------- settings & look ---------- */
function applyLook() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const r = document.documentElement, a = ACC[S.accent] || ACC.amber;
  r.dataset.theme = dark ? 'dark' : 'light'; r.dataset.fx = S.fx ? 'on' : 'off';
  r.style.setProperty('--accent', a[dark ? 0 : 1]); r.style.setProperty('--on-accent', dark ? '#1a1206' : '#fff');
  document.querySelector('meta[name=theme-color]').content = dark ? '#0b1226' : '#fbeedd';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);
function syncSettings() {
  document.querySelectorAll('#settings [data-k]').forEach(el => {
    const k = el.dataset.k, v = k === 'mode' ? mode : S[k];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
  });
}
const settings = $('settings');
$('setBtn').onclick = () => { syncSettings(); settings.showModal(); };
$('sDone').onclick = () => settings.close();
settings.addEventListener('click', e => {
  const b = e.target.closest('.seg button'); if (!b) return;
  const k = b.parentElement.dataset.k;
  if (k === 'mode') { mode = b.dataset.v; store.set(K.mode, mode); } else { S[k] = b.dataset.v; saveS(); }
  applyLook(); syncSettings(); render();
});
settings.addEventListener('change', async e => {
  const el = e.target, k = el.dataset.k; if (!k || el.type !== 'checkbox') return;
  if (k === 'notify' && el.checked) {
    if (!('Notification' in window)) { el.checked = false; return toast('Add the app to your home screen to enable alerts'); }
    if (await Notification.requestPermission() !== 'granted') { el.checked = false; return toast('Notifications are blocked in your browser settings'); }
  }
  S[k] = el.checked; saveS(); applyLook();
});
$('nTest').onclick = () => alertUser('Travel Countdown', 'Alerts are working 🎉', true);
$('bkExport').onclick = () => download(new Blob([JSON.stringify({ app: 'travel-countdown', trips, settings: S }, null, 1)], { type: 'application/json' }), 'travel-countdown-backup.json');
$('bkImport').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), inc = (j.trips || []).map(norm).filter(Boolean);
    inc.forEach(x => { const i = trips.findIndex(t => t.id === x.id); if (i < 0) trips.push(x); else trips[i] = x; seed(x); });
    if (j.settings) S = { ...S, ...j.settings };
    saveS(); save(); applyLook(); syncSettings(); render(); toast(`Imported ${inc.length} trip${inc.length === 1 ? '' : 's'}`);
  } catch { toast('That file is not a valid backup'); }
  e.target.value = '';
};
$('bkReset').onclick = () => {
  if (!confirm('Delete all trips and reset settings? This cannot be undone.')) return;
  trips = []; save(); S = { ...DEF }; saveS(); applyLook(); syncSettings(); render(); settings.close();
};
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const buzz = p => { if (S.haptics && navigator.vibrate) navigator.vibrate(p); };
document.addEventListener('click', e => { if (e.target.closest('button,.card')) buzz(8); });
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('tz').addEventListener('input', () => $('tz').setCustomValidity(''));
(Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []).forEach(z => { const o = document.createElement('option'); o.value = z; $('tzs').appendChild(o); });

/* ---------- formatting helpers ---------- */
function fd(v) {
  const d = new Date(v), f = S.datefmt, loc = f === 'dmy' ? 'en-GB' : f === 'mdy' ? 'en-US' : undefined;
  const base = { day: 'numeric', month: 'short', year: 'numeric' };
  const date = f === 'iso' ? d.toLocaleDateString('sv-SE') : d.toLocaleDateString(loc, f === 'auto' ? { weekday: 'short', ...base } : base);
  return date + ' · ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: S.time === 'auto' ? undefined : S.time === '12' });
}
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const sleeps = (now, t) => Math.max(0, Math.round((sod(t) - sod(now)) / 864e5));
function hype(k, sl) {
  if (k === 'away') return 'Soak it all in ✨';
  if (k === 'done') return 'What a trip. Where next?';
  return sl === 0 ? 'Today’s the day — safe travels! ✈️' : sl === 1 ? 'Tomorrow! Passport check 🛂' : sl <= 3 ? 'Almost time — start packing 🧳'
    : sl <= 7 ? 'Less than a week. Feel that? 🌍' : sl <= 30 ? 'Under a month to go' : sl <= 100 ? 'Under 100 days — time to plan the fun parts' : 'Plenty of time to daydream';
}

/* ---------- trip detail ---------- */
const det = $('detail'), ESS = ['Passport / ID', 'Tickets & bookings', 'Phone charger', 'Power bank', 'Travel adapter', 'Medication', 'Wallet & cards', 'Toiletries', 'Sunglasses', 'Comfortable shoes'];
let detId = null, dBs = [], lastFacts = '', nt;
const cur = () => trips.find(x => x.id === detId);
function buildDU() {
  const u = $('dUnits'); u.className = 'units u-' + mode;
  u.innerHTML = UNITS[mode].map(x => `<div class="u" data-u="${x}"><b>00</b><i>${LABEL[x]}</i></div>`).join('');
  dBs = [...u.querySelectorAll('.u')].map(e => [e.dataset.u, e.querySelector('b')]);
}
function openDetail(id) {
  const t = trips.find(x => x.id === id); if (!t) return;
  detId = id; lastFacts = '';
  $('dHero').style.setProperty('--img', t.background ? `url("${t.background}")` : grad(t.destination));
  $('dTitle').textContent = t.destination; $('dNotes').value = t.notes || '';
  buildDU(); renderPack(t); det.showModal(); det.scrollTop = 0; paintDetail(Date.now());
}
function paintDetail(now) {
  if (!det.open) return;
  const t = cur(); if (!t) return;
  const s = stat(t, now), p = parts(now, s.target), sl = sleeps(now, s.target), done = s.k === 'done';
  dBs.forEach(([u, b]) => setVal(b, p[u]));
  $('dUnits').hidden = done;
  $('dTag').textContent = s.k === 'up' ? 'Departs ' + fd(t.departure) : s.k === 'away' ? 'On the road · back ' + fd(t.returnDate) : 'Trip complete';
  $('dHype').textContent = hype(s.k, sl);
  const c = +new Date(t.createdAt), pct = s.k === 'up' ? Math.min(100, Math.max(0, Math.round(100 * (now - c) / (s.d - c)))) : 100;
  const nights = t.returnDate ? Math.round((+new Date(t.returnDate) - +new Date(t.departure)) / 864e5) : null;
  const facts = [[s.k === 'away' ? 'Sleeps till home' : 'Sleeps to go', done ? '—' : sl], ['Hours to go', done ? '—' : p.th.toLocaleString()],
    ['Trip length', nights === null ? '—' : nights + (nights === 1 ? ' night' : ' nights')], ['Wait complete', pct + '%']];
  const html = facts.map(([l, v]) => `<div class="fact"><b>${v}</b><span>${l}</span></div>`).join('');
  if (html !== lastFacts) { $('dFacts').innerHTML = html; lastFacts = html; }
  let ok = false;
  if (t.tz) {
    try {
      const d = new Date(now), h12 = S.time === 'auto' ? undefined : S.time === '12';
      const f = new Intl.DateTimeFormat(undefined, { timeZone: t.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: h12 }).format(d);
      const df = Math.round((new Date(d.toLocaleString('en-US', { timeZone: t.tz })) - new Date(d.toLocaleString('en-US'))) / 18e5) / 2;
      $('dClock').innerHTML = `<b>${f}</b><span>${df ? (df > 0 ? '+' : '') + df + 'h from here' : 'Same time as here'} · ${t.tz.replace(/_/g, ' ')}</span>`;
      ok = true;
    } catch { /* invalid zone */ }
  }
  $('dClockP').hidden = !ok;
}
function renderPack(t) {
  const L = $('pList'); L.textContent = '';
  t.pack.forEach((it, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<label><input type="checkbox"><span></span></label><button type="button" aria-label="Remove item">×</button>';
    const c = li.querySelector('input'); c.checked = it.done; li.querySelector('span').textContent = it.t; li.classList.toggle('done', it.done);
    c.onchange = () => { it.done = c.checked; save(); renderPack(t); if (c.checked && t.pack.every(x => x.done)) { confetti(); toast('All packed! 🧳'); } };
    li.querySelector('button').onclick = () => { t.pack.splice(i, 1); save(); renderPack(t); };
    L.appendChild(li);
  });
  const n = t.pack.length, d = t.pack.filter(x => x.done).length;
  $('pCount').textContent = n ? `${d} / ${n} packed` : 'Empty'; $('pBar').style.transform = `scaleX(${n ? d / n : 0})`;
}
$('pForm').onsubmit = e => {
  e.preventDefault(); const v = $('pIn').value.trim(), t = cur(); if (!v || !t) return;
  t.pack.push({ t: v, done: false }); $('pIn').value = ''; save(); renderPack(t);
};
$('pSeed').onclick = () => { const t = cur(); ESS.forEach(x => { if (!t.pack.some(p => p.t === x)) t.pack.push({ t: x, done: false }); }); save(); renderPack(t); };
$('dNotes').oninput = () => { clearTimeout(nt); nt = setTimeout(() => { const t = cur(); if (t) { t.notes = $('dNotes').value; save(); } }, 400); };
det.addEventListener('close', () => { clearTimeout(nt); const t = cur(); if (t && t.notes !== $('dNotes').value) { t.notes = $('dNotes').value; save(); } detId = null; });
$('dClose').onclick = () => det.close();
$('dEdit').onclick = () => { const id = detId; det.close(); openSheet(id); };
$('dShare').onclick = () => shareTrips([cur()]);
$('dUnits').onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; store.set(K.mode, mode); buildDU(); render(); paintDetail(Date.now()); };
$('dIcs').onclick = () => {
  const t = cur(), z = v => new Date(v).toISOString().replace(/[-:]|\.\d{3}/g, ''), s = +new Date(t.departure), e = t.returnDate ? +new Date(t.returnDate) : s + 36e5;
  const esc = x => x.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travel Countdown//EN', 'BEGIN:VEVENT', 'UID:' + t.id + '@travel-countdown', 'DTSTAMP:' + z(Date.now()),
    'DTSTART:' + z(s), 'DTEND:' + z(e), 'SUMMARY:' + esc('✈ Trip to ' + t.destination), t.notes ? 'DESCRIPTION:' + esc(t.notes) : '',
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Tomorrow: trip to ' + esc(t.destination), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  download(new Blob([ics], { type: 'text/calendar' }), t.destination.replace(/\W+/g, '-') + '.ics');
};

/* ---------- milestones, alerts, confetti ---------- */
const MS = [['m100', '100 days to go! 🌟', 100 * 864e5], ['m30', '30 days to go — it’s getting real ✨', 30 * 864e5], ['m7', 'One week to go! 🧳', 7 * 864e5], ['m1', 'Tomorrow’s the day! 🛂', 864e5]];
let seen; try { seen = JSON.parse(store.get(K.seen) || '{}'); } catch { seen = {}; }
function due(t, now) {
  const d = +new Date(t.departure), r = t.returnDate ? +new Date(t.returnDate) : 0, o = [];
  if (now < d) MS.forEach(([k, m, ms]) => { if (d - now <= ms) o.push([k, m]); });
  else o.push(['dep', 'Bon voyage! ✈️ Your trip begins']);
  if (r && now >= r) o.push(['ret', 'Welcome home 🏡']);
  return o;
}
function seed(t) { due(t, Date.now()).forEach(([k]) => { seen[t.id + k] = 1; }); store.set(K.seen, JSON.stringify(seen)); }
function checkMilestones() {
  const now = Date.now(); let last = null, changed = false;
  trips.forEach(t => {
    const s = stat(t, now), recent = s.k !== 'done' || now - s.target < 864e5;
    due(t, now).forEach(([k, m]) => { const key = t.id + k; if (seen[key]) return; seen[key] = 1; changed = true; if (recent) last = [t.destination, m, k]; });
  });
  if (!changed) return;
  store.set(K.seen, JSON.stringify(seen));
  if (last) { alertUser(last[0], last[1], document.hidden); if (!document.hidden && /dep|m1|m7/.test(last[2])) confetti(); }
}
async function alertUser(title, body, sys) {
  buzz([30, 50, 30]);
  if (!document.hidden) toast(title + ' · ' + body);
  if (sys && S.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const o = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title + body };
      const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (r) r.showNotification(title, o); else new Notification(title, o);
    } catch { /* ignore */ }
  }
}
function confetti() {
  if (!S.fx || reduce) return;
  const c = $('fx'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight; c.hidden = false;
  const P = Array.from({ length: 110 }, () => ({ x: innerWidth / 2, y: innerHeight * .62, vx: (Math.random() - .5) * 15, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 4, c: `hsl(${Math.random() * 360} 90% 62%)`, a: Math.random() * 6 }));
  let n = 0;
  (function f() {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); x.restore(); });
    if (++n < 130) requestAnimationFrame(f); else { x.clearRect(0, 0, c.width, c.height); c.hidden = true; }
  })();
}

applyLook();
load();
render();
importShared();
(function loop() { tick(); checkMilestones(); setTimeout(loop, 1005 - Date.now() % 1000); })();
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(true); });
})();
