(() => {
'use strict';
const K = { trips: 'travelCountdown.trips.v2', old: 'travel-countdowns/v1', theme: 'travelCountdown.theme', mode: 'travelCountdown.mode', set: 'travelCountdown.settings', seen: 'travelCountdown.seen' };
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }
};
const DEF = { theme: 'auto', accent: 'amber', datefmt: 'auto', time: 'auto', fx: true, haptics: true, notify: false, units: 'c', home: 'EUR', live: true };
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
    tz: typeof t.tz === 'string' ? t.tz : '', notes: typeof t.notes === 'string' ? t.notes : '', place: typeof t.place === 'string' ? t.place : '',
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
      <div class="row"><span class="tag"></span><span class="wx" hidden></span><button class="edit" type="button">Edit</button></div>
      <h2></h2><p class="sub"></p>
      <div class="units"></div>
      <div class="bar"><i></i></div>
      <dl class="dates"><div><dt>Departs</dt><dd></dd></div><div class="rr"><dt>Returns</dt><dd></dd></div></dl></div>`;
    const units = el.querySelector('.units');
    units.classList.add('u-' + mode);
    for (const unit of UNITS[mode]) {
      const item = document.createElement('div');
      item.className = 'u';
      item.dataset.u = unit;
      const value = document.createElement('b');
      value.textContent = '00';
      const label = document.createElement('i');
      label.textContent = LABEL[unit];
      item.append(value, label);
      units.append(item);
    }
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
      tag: el.querySelector('.tag'), wx: el.querySelector('.wx'), sub: el.querySelector('.sub'), bar: el.querySelector('.bar i'),
      bs: [...el.querySelectorAll('.u')].map(u => [u.dataset.u, u.querySelector('b')])
    });
  });
  paintChips();
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
  $('photo').value = ''; $('ret').setCustomValidity(''); $('tz').value = t ? t.tz || '' : ''; $('place').value = t ? t.place || '' : ''; retAuto = false; syncDates();
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
  const dest = $('dest').value.trim(), dep = new Date($('dep').value), ret = $('ret').value && !retAuto ? new Date($('ret').value) : null;
  if (!dest || isNaN(dep)) return;
  if (ret && ret < dep) { $('ret').setCustomValidity('Return must be after departure'); $('ret').reportValidity(); return; }
  const tz = $('tz').value.trim();
  if (tz) { try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch { $('tz').setCustomValidity('Unknown time zone — pick one from the list'); $('tz').reportValidity(); return; } }
  let t = trips.find(x => x.id === editId), isNew = false;
  if (!t) { t = { id: uid(), createdAt: new Date().toISOString(), background: null, pack: [], notes: '' }; trips.push(t); isNew = true; }
  Object.assign(t, { destination: dest, departure: dep.toISOString(), returnDate: ret ? ret.toISOString() : null, tz, place: $('place').value.trim() });
  if (photo) t.background = photo;
  seed(t); delete chipTxt[t.id]; save(); sheet.close(); render();
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
  const el = $('toast'); el.textContent = msg;
  try { if (el.showPopover && !el.matches(':popover-open')) el.showPopover(); } catch { /* popover unsupported */ }
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(tt);
  tt = setTimeout(() => { el.classList.remove('on'); setTimeout(() => { try { el.hidePopover(); } catch { /* not open */ } }, 320); }, 2800);
}
const shareTrips = async list => {
  const data = list.map(t => ({ d: t.destination, s: t.departure, r: t.returnDate, z: t.tz, p: t.place }));
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
    const fresh = items.map(x => norm({ destination: x.d, departure: x.s, returnDate: x.r, tz: x.z, place: x.p }, 0)).filter(Boolean)
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

document.addEventListener('error', e => { if (e.target.classList && e.target.classList.contains('gflag')) e.target.remove(); }, true);

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
    else if (el.type === 'text') el.value = v;
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
  const el = e.target, k = el.dataset.k;
  if (k === 'home' && el.type === 'text') {
    const v = el.value.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(v)) { S.home = v; saveS(); } else { el.value = S.home; toast('Use a 3-letter code, e.g. EUR'); }
    return;
  }
  if (!k || el.type !== 'checkbox') return;
  if (k === 'notify' && el.checked) {
    if (!('Notification' in window)) { el.checked = false; return toast('Add the app to your home screen to enable alerts'); }
    if (await Notification.requestPermission() !== 'granted') { el.checked = false; return toast('Notifications are blocked in your browser settings'); }
  }
  S[k] = el.checked; saveS(); applyLook(); if (k === 'live') render();
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
  buildDU(); renderPack(t); det.showModal(); det.scrollTop = 0; paintDetail(Date.now()); loadDest(t);
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
  const zone = t.tz || tzAuto[t.id];
  if (zone) {
    try {
      const d = new Date(now), h12 = S.time === 'auto' ? undefined : S.time === '12';
      const f = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: h12 }).format(d);
      const df = Math.round((new Date(d.toLocaleString('en-US', { timeZone: zone })) - new Date(d.toLocaleString('en-US'))) / 18e5) / 2;
      const clock = document.createElement('b');
      clock.textContent = f;
      const label = document.createElement('span');
      const offset = df ? (df > 0 ? '+' : '') + df + 'h from here' : 'Same time as here';
      label.textContent = offset + ' · ' + zone.replace(/_/g, ' ');
      $('dClock').replaceChildren(clock, label);
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
det.addEventListener('close', () => { destTok++; clearTimeout(nt); const t = cur(); if (t && t.notes !== $('dNotes').value) { t.notes = $('dNotes').value; save(); } detId = null; });
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

/* ---------- destination: place lookup, weather, guide ---------- */
const CK = 'travelCountdown.cache', tzAuto = {}, chipTxt = {};
let cache; try { cache = JSON.parse(store.get(CK) || '{}'); } catch { cache = {}; }
let destTok = 0, chipBusy = false;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deg = c => Math.round(S.units === 'f' ? c * 9 / 5 + 32 : c) + '°';
const fmtN = n => n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 });
const avg = a => { const x = a.filter(v => v != null); return x.reduce((s, v) => s + v, 0) / (x.length || 1); };
const WX = c => c === 0 ? ['☀️', 'Clear'] : c <= 2 ? ['🌤️', 'Partly cloudy'] : c === 3 ? ['☁️', 'Overcast'] : c <= 48 ? ['🌫️', 'Fog'] : c <= 57 ? ['🌦️', 'Drizzle']
  : c <= 67 ? ['🌧️', 'Rain'] : c <= 77 ? ['🌨️', 'Snow'] : c <= 82 ? ['🌦️', 'Showers'] : c <= 86 ? ['🌨️', 'Snow showers'] : ['⛈️', 'Thunderstorm'];
async function jget(u) {
  const c = new AbortController(), to = setTimeout(() => c.abort(), 9000);
  try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(to); }
}
async function cached(key, ttl, fn) {
  const e = cache[key];
  if (e && Date.now() - e.t < ttl) return { v: e.v, stale: false };
  try {
    const v = await fn(); cache[key] = { t: Date.now(), v };
    const ks = Object.keys(cache);
    if (ks.length > 60) ks.sort((a, b) => cache[a].t - cache[b].t).slice(0, ks.length - 60).forEach(k => delete cache[k]);
    store.set(CK, JSON.stringify(cache)); return { v, stale: false };
  } catch (err) { if (e) return { v: e.v, stale: true }; throw err; }
}
const CD = `AF|Afghanistan|Kabul|34.5|69.2|AFN|93|ps,fa|
AL|Albania|Tirana|41.3|19.8|ALL|355|sq|
DZ|Algeria|Algiers|36.8|3.1|DZD|213|ar,fr|
AD|Andorra|Andorra la Vella|42.5|1.5|EUR|376|ca|
AO|Angola|Luanda|-8.8|13.2|AOA|244|pt|
AG|Antigua and Barbuda|Saint John's|17.1|-61.8|XCD|1268|en|L
AR|Argentina|Buenos Aires|-34.6|-58.4|ARS|54|es|
AM|Armenia|Yerevan|40.2|44.5|AMD|374|hy|
AU|Australia|Canberra|-35.3|149.1|AUD|61|en|L
AT|Austria|Vienna|48.2|16.4|EUR|43|de|
AZ|Azerbaijan|Baku|40.4|49.9|AZN|994|az|
BS|Bahamas|Nassau|25.0|-77.4|BSD|1242|en|L
BH|Bahrain|Manama|26.2|50.6|BHD|973|ar|
BD|Bangladesh|Dhaka|23.8|90.4|BDT|880|bn|L
BB|Barbados|Bridgetown|13.1|-59.6|BBD|1246|en|L
BY|Belarus|Minsk|53.9|27.6|BYN|375|be,ru|
BE|Belgium|Brussels|50.8|4.4|EUR|32|nl,fr,de|
BZ|Belize|Belmopan|17.3|-88.8|BZD|501|en|
BJ|Benin|Porto-Novo|6.5|2.6|XOF|229|fr|
BT|Bhutan|Thimphu|27.5|89.6|BTN|975|dz|L
BO|Bolivia|La Paz|-16.5|-68.1|BOB|591|es|
BA|Bosnia and Herzegovina|Sarajevo|43.9|18.4|BAM|387|bs,hr,sr|
BW|Botswana|Gaborone|-24.7|25.9|BWP|267|en|L
BR|Brazil|Brasília|-15.8|-47.9|BRL|55|pt|
BN|Brunei|Bandar Seri Begawan|4.9|114.9|BND|673|ms|L
BG|Bulgaria|Sofia|42.7|23.3|EUR|359|bg|
BF|Burkina Faso|Ouagadougou|12.4|-1.5|XOF|226|fr|
BI|Burundi|Gitega|-3.4|29.9|BIF|257|fr|
KH|Cambodia|Phnom Penh|11.6|104.9|KHR|855|km|
CM|Cameroon|Yaoundé|3.9|11.5|XAF|237|fr,en|
CA|Canada|Ottawa|45.4|-75.7|CAD|1|en,fr|
CV|Cape Verde|Praia|14.9|-23.5|CVE|238|pt|
CF|Central African Republic|Bangui|4.4|18.6|XAF|236|fr|
TD|Chad|N'Djamena|12.1|15.0|XAF|235|fr,ar|
CL|Chile|Santiago|-33.4|-70.7|CLP|56|es|
CN|China|Beijing|39.9|116.4|CNY|86|zh|
CO|Colombia|Bogotá|4.7|-74.1|COP|57|es|
KM|Comoros|Moroni|-11.7|43.3|KMF|269|ar,fr|
CG|Republic of the Congo|Brazzaville|-4.3|15.3|XAF|242|fr|
CD|DR Congo|Kinshasa|-4.3|15.3|CDF|243|fr|
CR|Costa Rica|San José|9.9|-84.1|CRC|506|es|
CI|Côte d'Ivoire|Yamoussoukro|6.8|-5.3|XOF|225|fr|
HR|Croatia|Zagreb|45.8|16.0|EUR|385|hr|
CU|Cuba|Havana|23.1|-82.4|CUP|53|es|
CY|Cyprus|Nicosia|35.2|33.4|EUR|357|el,tr|L
CZ|Czechia|Prague|50.1|14.4|CZK|420|cs|
DK|Denmark|Copenhagen|55.7|12.6|DKK|45|da|
DJ|Djibouti|Djibouti|11.6|43.1|DJF|253|fr,ar|
DM|Dominica|Roseau|15.3|-61.4|XCD|1767|en|L
DO|Dominican Republic|Santo Domingo|18.5|-69.9|DOP|1809|es|
EC|Ecuador|Quito|-0.2|-78.5|USD|593|es|
EG|Egypt|Cairo|30.0|31.2|EGP|20|ar|
SV|El Salvador|San Salvador|13.7|-89.2|USD|503|es|
GQ|Equatorial Guinea|Malabo|3.8|8.8|XAF|240|es,fr|
ER|Eritrea|Asmara|15.3|38.9|ERN|291|ti,ar|
EE|Estonia|Tallinn|59.4|24.8|EUR|372|et|
SZ|Eswatini|Mbabane|-26.3|31.1|SZL|268|en|L
ET|Ethiopia|Addis Ababa|9.0|38.7|ETB|251|am|
FJ|Fiji|Suva|-18.1|178.4|FJD|679|en|L
FI|Finland|Helsinki|60.2|24.9|EUR|358|fi,sv|
FR|France|Paris|48.9|2.4|EUR|33|fr|
GA|Gabon|Libreville|0.4|9.5|XAF|241|fr|
GM|Gambia|Banjul|13.5|-16.6|GMD|220|en|
GE|Georgia|Tbilisi|41.7|44.8|GEL|995|ka|
DE|Germany|Berlin|52.5|13.4|EUR|49|de|
GH|Ghana|Accra|5.6|-0.2|GHS|233|en|
GR|Greece|Athens|38.0|23.7|EUR|30|el|
GD|Grenada|St. George's|12.1|-61.7|XCD|1473|en|L
GT|Guatemala|Guatemala City|14.6|-90.5|GTQ|502|es|
GN|Guinea|Conakry|9.5|-13.7|GNF|224|fr|
GW|Guinea-Bissau|Bissau|11.9|-15.6|XOF|245|pt|
GY|Guyana|Georgetown|6.8|-58.2|GYD|592|en|L
HT|Haiti|Port-au-Prince|18.5|-72.3|HTG|509|fr,ht|
HN|Honduras|Tegucigalpa|14.1|-87.2|HNL|504|es|
HK|Hong Kong|Hong Kong|22.3|114.2|HKD|852|zh,en|L
HU|Hungary|Budapest|47.5|19.0|HUF|36|hu|
IS|Iceland|Reykjavik|64.1|-21.9|ISK|354|is|
IN|India|New Delhi|28.6|77.2|INR|91|hi,en|L
ID|Indonesia|Jakarta|-6.2|106.8|IDR|62|id|L
IR|Iran|Tehran|35.7|51.4|IRR|98|fa|
IQ|Iraq|Baghdad|33.3|44.4|IQD|964|ar,ku|
IE|Ireland|Dublin|53.3|-6.3|EUR|353|en,ga|L
IL|Israel|Jerusalem|31.8|35.2|ILS|972|he,ar|
IT|Italy|Rome|41.9|12.5|EUR|39|it|
JM|Jamaica|Kingston|18.0|-76.8|JMD|1876|en|L
JP|Japan|Tokyo|35.7|139.7|JPY|81|ja|L
JO|Jordan|Amman|31.9|35.9|JOD|962|ar|
KZ|Kazakhstan|Astana|51.2|71.4|KZT|7|kk,ru|
KE|Kenya|Nairobi|-1.3|36.8|KES|254|sw,en|L
KI|Kiribati|Tarawa|1.4|173.0|AUD|686|en|L
XK|Kosovo|Pristina|42.7|21.2|EUR|383|sq,sr|
KW|Kuwait|Kuwait City|29.4|48.0|KWD|965|ar|
KG|Kyrgyzstan|Bishkek|42.9|74.6|KGS|996|ky,ru|
LA|Laos|Vientiane|18.0|102.6|LAK|856|lo|
LV|Latvia|Riga|56.9|24.1|EUR|371|lv|
LB|Lebanon|Beirut|33.9|35.5|LBP|961|ar,fr|
LS|Lesotho|Maseru|-29.3|27.5|LSL|266|en,st|L
LR|Liberia|Monrovia|6.3|-10.8|LRD|231|en|
LY|Libya|Tripoli|32.9|13.2|LYD|218|ar|
LI|Liechtenstein|Vaduz|47.1|9.5|CHF|423|de|
LT|Lithuania|Vilnius|54.7|25.3|EUR|370|lt|
LU|Luxembourg|Luxembourg|49.6|6.1|EUR|352|lb,fr,de|
MO|Macao|Macao|22.2|113.5|MOP|853|zh,pt|L
MG|Madagascar|Antananarivo|-18.9|47.5|MGA|261|mg,fr|
MW|Malawi|Lilongwe|-14.0|33.8|MWK|265|en|L
MY|Malaysia|Kuala Lumpur|3.1|101.7|MYR|60|ms|L
MV|Maldives|Malé|4.2|73.5|MVR|960|dv|L
ML|Mali|Bamako|12.6|-8.0|XOF|223|fr|
MT|Malta|Valletta|35.9|14.5|EUR|356|mt,en|L
MH|Marshall Islands|Majuro|7.1|171.4|USD|692|en|
MR|Mauritania|Nouakchott|18.1|-15.9|MRU|222|ar|
MU|Mauritius|Port Louis|-20.2|57.5|MUR|230|en,fr|L
MX|Mexico|Mexico City|19.4|-99.1|MXN|52|es|
FM|Micronesia|Palikir|6.9|158.2|USD|691|en|
MD|Moldova|Chișinău|47.0|28.9|MDL|373|ro|
MC|Monaco|Monaco|43.7|7.4|EUR|377|fr|
MN|Mongolia|Ulaanbaatar|47.9|106.9|MNT|976|mn|
ME|Montenegro|Podgorica|42.4|19.3|EUR|382|sr|
MA|Morocco|Rabat|34.0|-6.8|MAD|212|ar,fr|
MZ|Mozambique|Maputo|-26.0|32.6|MZN|258|pt|L
MM|Myanmar|Naypyidaw|19.8|96.1|MMK|95|my|
NA|Namibia|Windhoek|-22.6|17.1|NAD|264|en|L
NR|Nauru|Yaren|-0.5|166.9|AUD|674|en|L
NP|Nepal|Kathmandu|27.7|85.3|NPR|977|ne|L
NL|Netherlands|Amsterdam|52.4|4.9|EUR|31|nl|
NZ|New Zealand|Wellington|-41.3|174.8|NZD|64|en,mi|L
NI|Nicaragua|Managua|12.1|-86.3|NIO|505|es|
NE|Niger|Niamey|13.5|2.1|XOF|227|fr|
NG|Nigeria|Abuja|9.1|7.5|NGN|234|en|
KP|North Korea|Pyongyang|39.0|125.8|KPW|850|ko|
MK|North Macedonia|Skopje|42.0|21.4|MKD|389|mk|
NO|Norway|Oslo|59.9|10.8|NOK|47|no|
OM|Oman|Muscat|23.6|58.6|OMR|968|ar|
PK|Pakistan|Islamabad|33.7|73.1|PKR|92|ur,en|L
PW|Palau|Ngerulmud|7.5|134.6|USD|680|en|
PS|Palestine|Ramallah|31.9|35.2|ILS|970|ar|
PA|Panama|Panama City|9.0|-79.5|PAB|507|es|
PG|Papua New Guinea|Port Moresby|-9.4|147.2|PGK|675|en|L
PY|Paraguay|Asunción|-25.3|-57.6|PYG|595|es,gn|
PE|Peru|Lima|-12.0|-77.0|PEN|51|es|
PH|Philippines|Manila|14.6|121.0|PHP|63|fil,en|
PL|Poland|Warsaw|52.2|21.0|PLN|48|pl|
PT|Portugal|Lisbon|38.7|-9.1|EUR|351|pt|
PR|Puerto Rico|San Juan|18.5|-66.1|USD|1787|es,en|
QA|Qatar|Doha|25.3|51.5|QAR|974|ar|
RO|Romania|Bucharest|44.4|26.1|RON|40|ro|
RU|Russia|Moscow|55.8|37.6|RUB|7|ru|
RW|Rwanda|Kigali|-1.9|30.1|RWF|250|rw,fr,en|
KN|Saint Kitts and Nevis|Basseterre|17.3|-62.7|XCD|1869|en|L
LC|Saint Lucia|Castries|14.0|-61.0|XCD|1758|en|L
VC|Saint Vincent and the Grenadines|Kingstown|13.2|-61.2|XCD|1784|en|L
WS|Samoa|Apia|-13.8|-171.8|WST|685|sm,en|L
SM|San Marino|San Marino|43.9|12.4|EUR|378|it|
ST|São Tomé and Príncipe|São Tomé|0.3|6.7|STN|239|pt|
SA|Saudi Arabia|Riyadh|24.7|46.7|SAR|966|ar|
SN|Senegal|Dakar|14.7|-17.5|XOF|221|fr|
RS|Serbia|Belgrade|44.8|20.5|RSD|381|sr|
SC|Seychelles|Victoria|-4.6|55.5|SCR|248|fr,en|L
SL|Sierra Leone|Freetown|8.5|-13.2|SLE|232|en|
SG|Singapore|Singapore|1.3|103.8|SGD|65|en,zh,ms,ta|L
SK|Slovakia|Bratislava|48.1|17.1|EUR|421|sk|
SI|Slovenia|Ljubljana|46.1|14.5|EUR|386|sl|
SB|Solomon Islands|Honiara|-9.4|160.0|SBD|677|en|L
SO|Somalia|Mogadishu|2.0|45.3|SOS|252|so,ar|
ZA|South Africa|Pretoria|-25.7|28.2|ZAR|27|zu,en,af|L
KR|South Korea|Seoul|37.6|127.0|KRW|82|ko|
SS|South Sudan|Juba|4.9|31.6|SSP|211|en|
ES|Spain|Madrid|40.4|-3.7|EUR|34|es|
LK|Sri Lanka|Colombo|6.9|79.9|LKR|94|si,ta|L
SD|Sudan|Khartoum|15.5|32.6|SDG|249|ar,en|
SR|Suriname|Paramaribo|5.9|-55.2|SRD|597|nl|L
SE|Sweden|Stockholm|59.3|18.1|SEK|46|sv|
CH|Switzerland|Bern|46.9|7.4|CHF|41|de,fr,it|
SY|Syria|Damascus|33.5|36.3|SYP|963|ar|
TW|Taiwan|Taipei|25.0|121.6|TWD|886|zh|
TJ|Tajikistan|Dushanbe|38.6|68.8|TJS|992|tg,ru|
TZ|Tanzania|Dodoma|-6.2|35.7|TZS|255|sw,en|L
TH|Thailand|Bangkok|13.8|100.5|THB|66|th|L
TL|Timor-Leste|Dili|-8.6|125.6|USD|670|pt|L
TG|Togo|Lomé|6.1|1.2|XOF|228|fr|
TO|Tonga|Nukuʻalofa|-21.1|-175.2|TOP|676|en|L
TT|Trinidad and Tobago|Port of Spain|10.7|-61.5|TTD|1868|en|L
TN|Tunisia|Tunis|36.8|10.2|TND|216|ar,fr|
TR|Türkiye|Ankara|39.9|32.9|TRY|90|tr|
TM|Turkmenistan|Ashgabat|37.9|58.4|TMT|993|tk|
TV|Tuvalu|Funafuti|-8.5|179.2|AUD|688|en|L
UG|Uganda|Kampala|0.3|32.6|UGX|256|en,sw|L
UA|Ukraine|Kyiv|50.5|30.5|UAH|380|uk|
AE|United Arab Emirates|Abu Dhabi|24.5|54.4|AED|971|ar|
GB|United Kingdom|London|51.5|-0.1|GBP|44|en|L
US|United States|Washington, D.C.|38.9|-77.0|USD|1|en|
UY|Uruguay|Montevideo|-34.9|-56.2|UYU|598|es|
UZ|Uzbekistan|Tashkent|41.3|69.3|UZS|998|uz|
VU|Vanuatu|Port Vila|-17.7|168.3|VUV|678|bi,fr,en|
VA|Vatican City|Vatican City|41.9|12.5|EUR|379|it|
VE|Venezuela|Caracas|10.5|-66.9|VES|58|es|
VN|Vietnam|Hanoi|21.0|105.8|VND|84|vi|
YE|Yemen|Sanaa|15.4|44.2|YER|967|ar|
ZM|Zambia|Lusaka|-15.4|28.3|ZMW|260|en|L
ZW|Zimbabwe|Harare|-17.8|31.0|ZWG|263|en|L`;
const COUNTRIES = {};
CD.trim().split('\n').forEach(l => { const [cc, name, cap, lat, lon, cur, call, langs, left] = l.split('|'); COUNTRIES[cc] = { cc, name, cap, lat: +lat, lon: +lon, cur, call, langs: langs ? langs.split(',') : [], left: left === 'L' }; });
const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const BYNAME = {};
Object.values(COUNTRIES).forEach(c => { BYNAME[fold(c.name)] = c; });
'usa:US,america:US,united states of america:US,uk:GB,britain:GB,great britain:GB,england:GB,scotland:GB,wales:GB,northern ireland:GB,uae:AE,emirates:AE,holland:NL,czech republic:CZ,turkey:TR,ivory coast:CI,cote d ivoire:CI,burma:MM,swaziland:SZ,east timor:TL,korea:KR,russian federation:RU,macedonia:MK,bosnia:BA,congo:CG,cabo verde:CV,vatican:VA,macau:MO,persia:IR'
  .split(',').forEach(a => { const [k, v] = a.split(':'); BYNAME[k] = COUNTRIES[v]; });
function findCountry(q, exact) {
  const w = fold(q).split(' ').filter(Boolean);
  if (BYNAME[w.join(' ')]) return BYNAME[w.join(' ')];
  if (exact) return null;
  for (let n = Math.min(3, w.length); n >= 1; n--) for (let i = 0; i + n <= w.length; i++) { const c = BYNAME[w.slice(i, i + n).join(' ')]; if (c) return c; }
  return null;
}
async function geo(q, minPop) {
  const g = await jget(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
  return (g.results || []).find(p => (p.population || 0) >= minPop) || null;
}
const asCity = p => ({ name: p.name + (p.admin1 && p.admin1 !== p.name ? ', ' + p.admin1 : ''), cc: p.country_code, lat: p.latitude, lon: p.longitude, tz: p.timezone, kind: 'city' });
const asCountry = c => ({ name: c.cap, cc: c.cc, lat: c.lat, lon: c.lon, kind: 'country' });
/* Order: exact country name → exact place → country mentioned in the title → a big city at the start of the title */
const resolve = q => cached('geo2:' + fold(q), 30 * 864e5, async () => {
  let c = findCountry(q, true); if (c) return asCountry(c);
  let p = await geo(q, 0); if (p) return asCity(p);
  c = findCountry(q, false); if (c) return asCountry(c);
  const w = q.trim().split(/\s+/);
  for (let n = Math.min(3, w.length - 1); n >= 1; n--) { p = await geo(w.slice(0, n).join(' '), 200000); if (p) return asCity(p); }
  throw new Error('not found');
});
const wxData = r => cached(`wx:${r.lat.toFixed(2)},${r.lon.toFixed(2)}`, 30 * 60e3, () => jget(`https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=16&timezone=auto`));
const histData = (r, a, b) => cached(`hx:${r.lat.toFixed(2)},${r.lon.toFixed(2)},${a},${b}`, 30 * 864e5, () => jget(`https://archive-api.open-meteo.com/v1/archive?latitude=${r.lat}&longitude=${r.lon}&start_date=${a}&end_date=${b}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`));
const rateData = () => cached('fx:' + S.home, 6 * 36e5, () => jget(`https://open.er-api.com/v6/latest/${S.home}`).then(j => { if (j.result !== 'success') throw new Error('fx'); return { rates: j.rates }; }));
const wikiData = name => cached('wk:' + name.toLowerCase(), 30 * 864e5, async () => {
  for (const h of ['en.wikivoyage.org', 'en.wikipedia.org']) {
    try {
      const j = await jget(`https://${h}/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}?redirect=true`);
      if (j.type === 'standard' && j.extract) return { h, ex: j.extract, img: (j.thumbnail && j.thumbnail.source) || '', url: j.content_urls.desktop.page };
    } catch { /* next source */ }
  }
  throw new Error('no article');
});

async function loadDest(t) {
  const tok = ++destTok;
  if (!S.live) { $('wxP').hidden = $('gdP').hidden = true; return; }
  $('wxP').hidden = $('gdP').hidden = false;
  $('gdPlace').textContent = 'Finding…'; $('wxBody').innerHTML = $('gdBody').innerHTML = '<div class="skel"></div>';
  const q = t.place || t.destination; let r;
  try { r = (await resolve(q)).v; } catch {
    if (tok !== destTok) return;
    const msg = navigator.onLine ? `Couldn’t find “${esc(q)}”. Tap Change and try a city or country name.` : 'You’re offline — connect to load weather and the guide.';
    $('gdPlace').textContent = ''; $('wxBody').innerHTML = $('gdBody').innerHTML = `<p class="muted">${msg}</p>`; return;
  }
  if (tok !== destTok) return;
  if (r.tz) { tzAuto[t.id] = r.tz; paintDetail(Date.now()); }
  renderWx(t, r, tok); renderGuide(t, r, tok);
}
async function renderWx(t, r, tok) {
  const body = $('wxBody'); let w;
  try { w = await wxData(r); } catch { if (tok === destTok) body.innerHTML = '<p class="muted">Weather is unavailable right now.</p>'; return; }
  if (tok !== destTok) return;
  const j = w.v, cu = j.current, d = j.daily, now = Date.now(), s = stat(t, now), [em, lb] = WX(cu.weather_code);
  const key = x => new Date(x).toLocaleDateString('sv-SE'), rows = []; let typ = null;
  if (j.timezone) tzAuto[t.id] = j.timezone;
  paintDetail(now);
  if (s.k !== 'done') {
    const from = Math.max(now, +new Date(t.departure)), a = key(from), b = key(t.returnDate ? +new Date(t.returnDate) : from + 6 * 864e5);
    d.time.forEach((day, i) => { if (day >= a && day <= b) rows.push({ day, c: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], p: Number.isFinite(d.precipitation_probability_max[i]) ? d.precipitation_probability_max[i] : 0 }); });
    if (!rows.length && s.k === 'up') {
      const dep = new Date(t.departure); dep.setFullYear(dep.getFullYear() - 1);
      const len = Math.min(10, t.returnDate ? Math.max(1, Math.round((+new Date(t.returnDate) - +new Date(t.departure)) / 864e5) + 1) : 7);
      try {
        const h = (await histData(r, key(dep), key(+dep + (len - 1) * 864e5))).v.daily;
        typ = { hi: avg(h.temperature_2m_max), lo: avg(h.temperature_2m_min), wet: h.precipitation_sum.filter(x => x >= 1).length, n: h.time.length };
      } catch { /* no climate data */ }
      if (tok !== destTok) return;
    }
  }
  const hi = rows.length ? Math.max(...rows.map(x => x.hi)) : typ && typ.hi, lo = rows.length ? Math.min(...rows.map(x => x.lo)) : typ && typ.lo;
  const wet = rows.length ? rows.filter(x => x.p >= 50).length : typ ? typ.wet : 0, tips = [];
  if (lo != null) { if (lo <= 8) tips.push('Warm jacket', 'Scarf'); else if (lo <= 14) tips.push('Light layers'); if (hi >= 27) tips.push('Sunscreen', 'Sunglasses', 'Water bottle'); if (wet >= (rows.length ? 1 : 2)) tips.push('Rain jacket'); }
  const miss = tips.filter(x => !t.pack.some(p => p.t === x));
  const spd = S.units === 'f' ? Math.round(cu.wind_speed_10m * .621) + ' mph' : Math.round(cu.wind_speed_10m) + ' km/h';
  body.innerHTML = `<div class="now"><span class="big">${em}</span><div><b>${deg(cu.temperature_2m)}</b><span>${lb} · feels ${deg(cu.apparent_temperature)} · wind ${spd}</span></div></div>`
    + (rows.length ? `<h4>${s.k === 'away' ? 'Rest of your trip' : 'During your trip'}</h4><div class="wxs">${rows.slice(0, 10).map(x => `<div class="wd"><span>${new Date(x.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span><em>${WX(x.c)[0]}</em><b>${deg(x.hi)}</b><i>${deg(x.lo)}</i><small>${x.p}%</small></div>`).join('')}</div>`
      : typ ? `<h4>Typical for your dates</h4><p class="typ"><b>${deg(typ.hi)}</b> / ${deg(typ.lo)} · ${typ.wet} wet day${typ.wet === 1 ? '' : 's'} of ${typ.n} <small>(same dates last year — the forecast opens 16 days ahead)</small></p>` : '')
    + (miss.length ? `<button class="link" id="wxTips" type="button">+ Add ${miss.length} weather-based item${miss.length > 1 ? 's' : ''} to packing</button>` : '')
    + (w.stale ? '<p class="muted">Offline — showing saved data</p>' : '') + `<p class="credit">Weather for ${esc(r.name)} · data by Open-Meteo.com</p>`;
  const tb = $('wxTips');
  if (tb) tb.onclick = () => { miss.forEach(x => { if (!t.pack.some(p => p.t === x)) t.pack.push({ t: x, done: false }); }); save(); renderPack(t); tb.remove(); toast('Added to your packing list 🧳'); };
}
const dn = (type, v) => { try { return new Intl.DisplayNames(undefined, { type }).of(v) || v; } catch { return v; } };
const sym = cur => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency').value; } catch { return cur; } };
function allowedGuideUrl(value, hosts) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hosts.includes(url.host) && !url.username && !url.password) return url.href;
  } catch { /* invalid URL */ }
  return '';
}

async function renderGuide(t, r, tok) {
  const body = $('gdBody'), c = COUNTRIES[r.cc], code = c && c.cur;
  const wname = c && r.kind === 'country' ? c.name : r.name.split(',')[0];
  const [rt, wk] = await Promise.allSettled([code ? rateData() : Promise.reject(new Error('no currency')), wikiData(wname)]);
  if (tok !== destTok) return;
  $('gdPlace').textContent = r.kind === 'country' ? 'Weather is for the capital, ' + r.name : r.name + (c ? ' · ' + c.name : '');
  const w = wk.status === 'fulfilled' ? wk.value.v : null;
  const guideUrl = allowedGuideUrl(w?.url, ['en.wikivoyage.org', 'en.wikipedia.org']);
  const imageUrl = allowedGuideUrl(w?.img, ['upload.wikimedia.org']);
  const pic = imageUrl && !/map|locator|flag|coat|emblem|seal|location/i.test(imageUrl) ? imageUrl : '';
  const rawRate = rt.status === 'fulfilled' && code && code !== S.home ? rt.value.v.rates?.[code] : 0;
  const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;
  const stale = (wk.status === 'fulfilled' && wk.value.stale) || (rate && rt.value.stale);

  const content = document.createDocumentFragment();
  if (c) {
    const heading = document.createElement('div');
    heading.className = 'gh';
    heading.innerHTML = '<img class="gflag" alt="" width="44" height="30"><div><b></b><span></span></div>';
    heading.querySelector('img').src = 'https://flagcdn.com/w80/' + c.cc.toLowerCase() + '.png';
    heading.querySelector('b').textContent = c.name;
    const city = r.kind === 'city' ? r.name.split(',')[0] + ' · ' : '';
    heading.querySelector('span').textContent = city + 'Capital: ' + c.cap;
    content.append(heading);
  }
  if (pic) {
    const image = document.createElement('img');
    image.className = 'gdimg';
    image.src = pic;
    image.alt = '';
    image.loading = 'lazy';
    content.append(image);
  }
  if (typeof w?.ex === 'string') {
    const summary = document.createElement('p');
    summary.className = 'about';
    const cutoff = w.ex.lastIndexOf(' ', 320);
    summary.textContent = w.ex.length > 320 ? w.ex.slice(0, cutoff > 0 ? cutoff : 320) + '…' : w.ex;
    content.append(summary);
  }
  if (c) {
    const facts = document.createElement('div');
    facts.className = 'gf';
    const entries = [['Currency', `${dn('currency', code)} (${sym(code)})`], ['Languages', c.langs.map(l => dn('language', l)).join(', ') || '—'], ['Calling code', '+' + c.call], ['Drives on', c.left ? 'Left' : 'Right']];
    for (const [key, value] of entries) {
      const fact = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = key;
      const text = document.createElement('b');
      text.textContent = value;
      fact.append(label, text);
      facts.append(fact);
    }
    content.append(facts);
  }
  if (rate) {
    const converter = document.createElement('template');
    converter.innerHTML = `<h4>Quick convert</h4><div class="conv"><div class="cin"><input id="cvIn" inputmode="decimal" placeholder="Amount" aria-label="Amount"><span id="cvFrom"></span></div><button class="icon sm" id="cvSwap" type="button" aria-label="Swap direction">⇄</button><div class="cout"><b id="cvOut">—</b><span id="cvTo"></span></div></div><p class="muted"></p>`;
    converter.content.querySelector('p').textContent = rate >= 1 ? `1 ${S.home} ≈ ${fmtN(rate)} ${code}` : `1 ${code} ≈ ${fmtN(1 / rate)} ${S.home}`;
    content.append(converter.content);
  }

  const links = document.createElement('p');
  links.className = 'links';
  const addLink = (label, url) => {
    const link = document.createElement('a');
    link.textContent = label;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    links.append(link);
  };
  if (guideUrl) addLink('Full guide ↗', guideUrl);
  addLink('Open in Maps ↗', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.name + (c ? ', ' + c.name : '')));
  content.append(links);

  if (pic) {
    const button = document.createElement('button');
    button.className = 'link';
    button.id = 'gdPhoto';
    button.type = 'button';
    button.textContent = '📸 Use this photo as the trip background';
    content.append(button);
  }
  if (stale) {
    const notice = document.createElement('p');
    notice.className = 'muted';
    notice.textContent = 'Offline — showing saved data';
    content.append(notice);
  }
  const credit = document.createElement('p');
  credit.className = 'credit';
  const attribution = w ? `Text from ${w.h === 'en.wikivoyage.org' ? 'Wikivoyage' : 'Wikipedia'} (CC BY-SA) · ` : '';
  credit.textContent = attribution + 'Rates: open.er-api.com · Flags: flagcdn.com';
  content.append(credit);
  body.replaceChildren(content);

  if (rate) {
    let rev = false;
    const upd = () => { const v = parseFloat($('cvIn').value.replace(',', '.')); $('cvFrom').textContent = rev ? S.home : code; $('cvTo').textContent = rev ? code : S.home; $('cvOut').textContent = isFinite(v) ? fmtN(rev ? v * rate : v / rate) : '—'; };
    $('cvIn').oninput = upd; $('cvSwap').onclick = () => { rev = !rev; upd(); }; upd();
  }
  const pb = $('gdPhoto');
  if (pb) pb.onclick = async () => {
    pb.disabled = true;
    for (const u of [pic.replace(/\/\d+px-/, '/960px-'), pic]) {
      try { const d = await shrink(await (await fetch(u)).blob()); if (!d) continue; t.background = d; save(); $('dHero').style.setProperty('--img', `url("${d}")`); render(); toast('Background updated 📸'); return; } catch { /* try smaller */ }
    }
    pb.disabled = false; toast('Couldn’t load that photo');
  };
}
$('gdChange').onclick = () => {
  const t = cur(), v = t && prompt('Search for a city or country', t.place || t.destination);
  if (!v) return;
  t.place = v.trim() === t.destination ? '' : v.trim(); save(); delete chipTxt[t.id]; loadDest(t); paintChips();
};
$('wxRef').onclick = () => { const t = cur(); if (!t) return; Object.keys(cache).forEach(k => { if (k.startsWith('wx:')) delete cache[k]; }); loadDest(t); };

/* weather chip on each card */
async function chip(t) {
  if (!S.live || stat(t).k === 'done') return;
  try {
    const r = (await resolve(t.place || t.destination)).v, w = (await wxData(r)).v.current;
    chipTxt[t.id] = { em: WX(w.weather_code)[0], c: w.temperature_2m };
    const el = refs.get(t.id); if (el) paintChip(el, t.id);
  } catch { /* chip stays hidden */ }
}
function paintChip(r, id) { const x = chipTxt[id]; if (x && S.live) { r.wx.textContent = x.em + ' ' + deg(x.c); r.wx.hidden = false; } else r.wx.hidden = true; }
function paintChips() {
  refs.forEach((r, id) => paintChip(r, id));
  if (!S.live || chipBusy) return;
  chipBusy = true;
  (async () => { for (const t of ordered().slice(0, 6)) await chip(t); chipBusy = false; })();
}

/* ---------- date picker: opens on the departure month, quick durations, live night count ---------- */
let retAuto = false;
function syncDates() {
  const dep = $('dep').value, ret = $('ret').value;
  $('ret').min = dep || '';
  const n = dep && ret && !retAuto ? Math.round((new Date(ret) - new Date(dep)) / 864e5) : null;
  $('durHint').textContent = n === null ? '' : n < 0 ? '⚠ The return is before the departure' : n === 0 ? 'Same-day trip' : `${n} night${n === 1 ? '' : 's'} away`;
}
$('dep').addEventListener('input', () => { if (retAuto) { $('ret').value = ''; retAuto = false; } syncDates(); });
$('ret').addEventListener('focus', () => { if (!$('ret').value && $('dep').value) { $('ret').value = $('dep').value; retAuto = true; } });
$('ret').addEventListener('input', () => { retAuto = false; syncDates(); });
$('ret').addEventListener('blur', () => { if (retAuto) { $('ret').value = ''; retAuto = false; syncDates(); } });
$('qk').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const n = +b.dataset.n;
  if (!n) { $('ret').value = ''; retAuto = false; return syncDates(); }
  if (!$('dep').value) return toast('Pick a departure first');
  const d = new Date($('dep').value); d.setDate(d.getDate() + n);
  $('ret').value = local(d); retAuto = false; syncDates();
});

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
  const c = $('fx'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight; try { c.showPopover(); } catch { /* unsupported */ }
  const P = Array.from({ length: 110 }, () => ({ x: innerWidth / 2, y: innerHeight * .62, vx: (Math.random() - .5) * 15, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 4, c: `hsl(${Math.random() * 360} 90% 62%)`, a: Math.random() * 6 }));
  let n = 0;
  (function f() {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); x.restore(); });
    if (++n < 130) requestAnimationFrame(f); else { x.clearRect(0, 0, c.width, c.height); try { c.hidePopover(); } catch { /* not open */ } }
  })();
}

applyLook();
load();
render();
importShared();
(function loop() { tick(); checkMilestones(); setTimeout(loop, 1005 - Date.now() % 1000); })();
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(true); });
})();
