/* Travel Countdown App
   - Multiple countdowns with localStorage
   - Live updates each second
   - Display modes: full | days | hm
   - Proximity-based animations + background speed scaling
*/

const els = {
  form: document.getElementById('add-form'),
  destination: document.getElementById('destination'),
  date: document.getElementById('date'),
  cards: document.getElementById('cards'),
  empty: document.getElementById('empty-state'),
  mode: document.getElementById('mode'),
  template: document.getElementById('card-template'),
  root: document.documentElement,
};

// Set min date = today
(function setMinDate(){
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  els.date.min = `${yyyy}-${mm}-${dd}`;
})();

const STORAGE_KEY = 'travel-countdowns/v1';

let state = load() || [];
let tickTimer = null;

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return []; } }
function uid(){ return Math.random().toString(36).slice(2,9); }

function addCountdown(name, dateISO, bgDataUrl = null) {
  state.push({
    id: uid(),
    name: name.trim(),
    date: dateISO,
    background: bgDataUrl || null,
    returnDate: null,
    createdAt: new Date().toISOString(),
  });
  save();
  render();
}

function removeCountdown(id){
  state = state.filter(x => x.id !== id);
  save();
  render();
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.destination.value.trim();
  const dateISO = els.date.value;
  const bgFile = document.getElementById('bgUpload').files[0];
  if (!name || !dateISO) return;

  if (bgFile) {
    const reader = new FileReader();
    reader.onload = () => addCountdown(name, dateISO, reader.result);
    reader.readAsDataURL(bgFile);
  } else {
    addCountdown(name, dateISO, null);
  }

  els.form.reset();
  els.destination.focus();
});

els.mode.addEventListener('change', render);

function render(){
  // Empty state
  els.empty.style.display = state.length ? 'none' : 'block';
  els.cards.innerHTML = '';

  // Rebuild all cards
  for(const item of state){
    const node = document.importNode(els.template.content, true);
    const card = node.querySelector('.card');
    card.dataset.id = item.id;

    // Apply background image if present
    if (item.background) {
      card.style.backgroundImage = `url('${item.background}')`;
      card.style.backgroundSize = "cover";
      card.style.backgroundPosition = "center";
      card.style.color = "#fff";
      card.style.textShadow = "0 1px 3px rgba(0,0,0,0.6)";
    }

    // Title
    node.querySelector('.title').textContent = item.name;

    // Departure date
    const dateText = node.querySelector('.date-text');
    const t = new Date(item.date + 'T00:00:00');
    dateText.textContent = t.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' });

    // Optional return date line
    if (item.returnDate) {
      const returnLine = document.createElement('p');
      returnLine.className = 'return-line';
      const rt = new Date(item.returnDate);
      returnLine.textContent = `Returns on ${rt.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' })}`;
      returnLine.style.color = 'var(--muted)';
      card.querySelector('.date-row').after(returnLine);
    }

    // Delete handler
    node.querySelector('.delete').addEventListener('click', (ev) => {
      ev.stopPropagation();           // prevent opening modal when pressing delete
      removeCountdown(item.id);
    });

    // Initial numbers + mode
    updateCardDisplay(card, item);
    applyMode(card);

    els.cards.appendChild(node);
  }

  // Tick refresh
  if(tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);

  // Background speed based on nearest trip
  adjustBackgroundSpeed();
}

function applyMode(card){
  const mode = els.mode.value;
  card.classList.remove('mode-full','mode-days','mode-hm');
  card.classList.add(`mode-${mode}`);
}

function tick(){
  const cards = els.cards.querySelectorAll('.card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const item = state.find(x => x.id === id);
    if(item) updateCardDisplay(card, item);
    applyMode(card);
  });
  adjustBackgroundSpeed();
}

function adjustBackgroundSpeed(){
  let minSecs = Infinity;
  const now = new Date();
  for(const item of state){
    const target = new Date(item.date + 'T00:00:00');
    const diff = (target - now) / 1000;
    if(diff > 0 && diff < minSecs) minSecs = diff;
  }
  let speed = '35s';
  if(minSecs < 6*3600) speed = '12s';
  else if(minSecs < 24*3600) speed = '18s';
  else if(minSecs < 7*24*3600) speed = '26s';
  els.root.style.setProperty('--bg-speed', speed);
}

/* ====== Time math ====== */
function addMonths(date, count){
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  const monthDays = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  d.setDate(Math.min(day, monthDays));
  return d;
}

function diffBreakdown(now, target){
  if(target <= now){
    return { months:0, weeks:0, days:0, hours:0, minutes:0, seconds:0, ms:0, done:true };
  }
  let months = 0;
  let cursor = new Date(now);
  const approxMonths = Math.max(0, (target.getFullYear()-now.getFullYear())*12 + (target.getMonth()-now.getMonth()) - 1);
  if(approxMonths > 0){
    months = approxMonths;
    cursor = addMonths(cursor, approxMonths);
    if(cursor > target){ months = 0; cursor = new Date(now); }
  }
  let guard = 0;
  while(addMonths(cursor, 1) <= target && guard < 24){
    cursor = addMonths(cursor, 1); months++; guard++;
  }

  let remainder = target - cursor;
  const SEC = 1000, MIN = 60*SEC, HOUR = 60*MIN, DAY = 24*HOUR, WEEK = 7*DAY;

  const weeks   = Math.floor(remainder / WEEK);   remainder -= weeks * WEEK;
  const days    = Math.floor(remainder / DAY);    remainder -= days * DAY;
  const hours   = Math.floor(remainder / HOUR);   remainder -= hours * HOUR;
  const minutes = Math.floor(remainder / MIN);    remainder -= minutes * MIN;
  const seconds = Math.floor(remainder / SEC);    remainder -= seconds * SEC;

  return { months, weeks, days, hours, minutes, seconds, ms: remainder, done:false };
}

function formatForMode(b, mode){
  if(mode === 'days'){
    const totalDays = b.months*30 + b.weeks*7 + b.days + (b.hours || b.minutes || b.seconds ? 1 : 0);
    return [{label:'d', value: Math.max(totalDays, 0), key:'days'}];
  }
  if(mode === 'hm'){
    const hours = b.months*30*24 + b.weeks*7*24 + b.days*24 + b.hours;
    return [
      {label:'h', value: Math.max(hours,0), key:'hours'},
      {label:'m', value: Math.max(b.minutes,0), key:'minutes'},
    ];
  }
  return [
    {label:'mo', value:b.months, key:'months'},
    {label:'wk', value:b.weeks, key:'weeks'},
    {label:'d',  value:b.days, key:'days'},
    {label:'h',  value:b.hours, key:'hours'},
    {label:'m',  value:b.minutes, key:'minutes'},
    {label:'s',  value:b.seconds, key:'seconds'},
  ];
}

/* Update a single card’s numbers and styles */
function updateCardDisplay(card, item){
  const now = new Date();
  const target = new Date(item.date + 'T00:00:00');
  const breakdown = diffBreakdown(now, target);

  const mode = els.mode.value;
  const map = formatForMode(breakdown, mode);

  ['months','weeks','days','hours','minutes','seconds'].forEach(key => {
    const seg = card.querySelector(`.segment.${key} .num`);
    if(seg) seg.textContent = '0';
  });

  for(const part of map){
    const el = card.querySelector(`.segment.${part.key} .num`);
    if(el) el.textContent = String(part.value);
  }

  const status = card.querySelector('.status');
  card.classList.remove('soon','urgent','imminent','done');
  if(breakdown.done){
    status.textContent = 'Bon voyage! 🎉';
    card.classList.add('done');
  }else{
    const secsLeft = Math.floor((target - now)/1000);
    status.textContent = humanEta(secsLeft);
    if(secsLeft <= 6*3600) card.classList.add('imminent');
    else if(secsLeft <= 24*3600) card.classList.add('urgent');
    else if(secsLeft <= 30*24*3600) card.classList.add('soon');
  }
}

function humanEta(secs){
  if(secs <= 0) return 'now';
  const units = [['y',31536000],['mo',2592000],['w',604800],['d',86400],['h',3600],['m',60],['s',1]];
  let remain = secs; const parts = [];
  for(const [lbl, size] of units){
    const v = Math.floor(remain / size);
    if(v > 0){ parts.push(`${v}${lbl}`); remain -= v*size; }
    if(parts.length >= 2) break;
  }
  return 'in ' + (parts.join(' ') || '0s');
}

/* Initial render */
render();

/* Sheen follows mouse */
document.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  document.querySelectorAll('.card').forEach(card => {
    card.style.setProperty('--sx', `${x}%`);
    card.style.setProperty('--sy', `${y}%`);
  });
});

/* Theme toggle */
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
});
if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');

/* Drag & Drop Sorting */
document.addEventListener("DOMContentLoaded", () => {
  const cardsContainer = document.getElementById("cards");
  Sortable.create(cardsContainer, {
    animation: 150,
    ghostClass: "drag-ghost",
    onEnd: () => {
      const newOrder = Array.from(cardsContainer.children).map(c => c.dataset.id);
      state.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      save();
    },
  });
});

/* Card Editing Modal */
const modal = document.getElementById('editModal');
const saveEditBtn = document.getElementById('saveEdit');
const cancelEditBtn = document.getElementById('cancelEdit');
let editingId = null;

// Open modal when clicking on a card (ignore delete clicks)
els.cards.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.delete');
  if (deleteBtn) return;

  const card = e.target.closest('.card');
  if (!card) return;

  const id = card.dataset.id;
  const item = state.find(x => x.id === id);
  if (!item) return;

  editingId = id;
  document.getElementById('editName').value = item.name;
  document.getElementById('editDate').value = item.date;
  document.getElementById('editReturn').value = item.returnDate || '';
  document.getElementById('editBg').value = '';
  modal.classList.remove('hidden');
});

// Save changes
saveEditBtn.addEventListener('click', () => {
  if (!editingId) return;
  const item = state.find(x => x.id === editingId);
  if (!item) return;

  item.name = document.getElementById('editName').value.trim();
  item.date = document.getElementById('editDate').value;
  item.returnDate = document.getElementById('editReturn').value || null;

  const newBgFile = document.getElementById('editBg').files[0];
  if (newBgFile) {
    const reader = new FileReader();
    reader.onload = () => {
      item.background = reader.result;
      save(); render(); modal.classList.add('hidden');
    };
    reader.readAsDataURL(newBgFile);
  } else {
    save(); render(); modal.classList.add('hidden');
  }
});

// Cancel edit or click outside
cancelEditBtn.addEventListener('click', () => { modal.classList.add('hidden'); editingId = null; });
modal.addEventListener('click', (e) => {
  if (e.target === modal) { modal.classList.add('hidden'); editingId = null; }
});
