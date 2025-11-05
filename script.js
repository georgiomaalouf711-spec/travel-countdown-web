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

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch{ return []; }
}

function uid(){
  return Math.random().toString(36).slice(2,9);
}

function addCountdown(name, dateISO, bgDataUrl = null) {
  state.push({
    id: uid(),
    name: name.trim(),
    date: dateISO,
    background: bgDataUrl, // save background
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
    reader.onload = () => {
      addCountdown(name, dateISO, reader.result);
    };
    reader.readAsDataURL(bgFile);
  } else {
    addCountdown(name, dateISO, null);
  }

  els.form.reset();
  els.destination.focus();
});


els.mode.addEventListener('change', () => {
  render(); // reapply mode classes
});

function render(){
  // Empty state
  els.empty.style.display = state.length ? 'none' : 'block';
  els.cards.innerHTML = '';

  // Rebuild all cards
  for(const item of state){
    const node = document.importNode(els.template.content, true);
    const card = node.querySelector('.card');
     if (item.background) {
        card.style.backgroundImage = `url('${item.background}')`;
        card.style.backgroundSize = "cover";
        card.style.backgroundPosition = "center";
        card.style.color = "#fff"; // make text readable
        card.style.textShadow = "0 1px 3px rgba(0,0,0,0.6)";
                           }

    card.dataset.id = item.id;

    const title = node.querySelector('.title');
    title.textContent = item.name;

    const dateText = node.querySelector('.date-text');
    const t = new Date(item.date + 'T00:00:00');
    dateText.textContent = t.toLocaleDateString(undefined, {
      weekday:'short', year:'numeric', month:'short', day:'numeric'
    });

    // Hook up delete
    node.querySelector('.delete').addEventListener('click', () => removeCountdown(item.id));

    // Initial numbers
    updateCardDisplay(card, item);

    // Mode class
    applyMode(card);

    els.cards.appendChild(node);
  }

  // Restart ticking
  if(tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);

  // Scale background speed depending on nearest trip
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
  // Find nearest positive remaining seconds
  let minSecs = Infinity;
  const now = new Date();
  for(const item of state){
    const target = new Date(item.date + 'T00:00:00');
    const diff = (target - now) / 1000;
    if(diff > 0 && diff < minSecs) minSecs = diff;
  }
  // Map remaining time to speed (closer = faster)
  // >30 days => 35s, ~7 days => 26s, ~1 day => 18s, <6 hours => 12s
  let speed = '35s';
  if(minSecs < 6*3600) speed = '12s';
  else if(minSecs < 24*3600) speed = '18s';
  else if(minSecs < 7*24*3600) speed = '26s';
  els.root.style.setProperty('--bg-speed', speed);
}

/* ====== Time math ====== */

/** Add months safely (handles month length) */
function addMonths(date, count){
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  // restore day (clamped to month length)
  const monthDays = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  d.setDate(Math.min(day, monthDays));
  return d;
}

/** Get a precise breakdown: months, weeks, days, hours, minutes, seconds (non-negative) */
function diffBreakdown(now, target){
  if(target <= now){
    return { months:0, weeks:0, days:0, hours:0, minutes:0, seconds:0, ms:0, done:true };
  }

  // 1) Count whole months by stepping forward (fast enough for timers)
  let months = 0;
  let cursor = new Date(now);
  // Step by big chunks first (rough months) to reduce loops
  const approxMonths = Math.max(0,
    (target.getFullYear()-now.getFullYear())*12 + (target.getMonth()-now.getMonth()) - 1
  );
  if(approxMonths > 0){
    months = approxMonths;
    cursor = addMonths(cursor, approxMonths);
    if(cursor > target){ // safety
      months = 0;
      cursor = new Date(now);
    }
  }
  // Step month by month until exceeding target
  let guard = 0;
  while(addMonths(cursor, 1) <= target && guard < 24){ // <= 2 years fine-tune
    cursor = addMonths(cursor, 1);
    months++;
    guard++;
  }

  // Remaining milliseconds after removing whole months
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
    // Convert everything to days (ceil so it feels accurate in UI)
    const totalDays = b.months*30 + b.weeks*7 + b.days + (b.hours || b.minutes || b.seconds ? 1 : 0);
    return [
      {label:'d', value: Math.max(totalDays, 0), key:'days'}
    ];
  }
  if(mode === 'hm'){
    // Convert everything to hours/minutes
    const hours = b.months*30*24 + b.weeks*7*24 + b.days*24 + b.hours;
    return [
      {label:'h', value: Math.max(hours,0), key:'hours'},
      {label:'m', value: Math.max(b.minutes,0), key:'minutes'},
    ];
  }
  // full
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

  // Set numbers based on current mode
  const mode = els.mode.value;
  const map = formatForMode(breakdown, mode);

  // First reset all to 0 and hide/show per mode with CSS classes
  ['months','weeks','days','hours','minutes','seconds'].forEach(key => {
    const seg = card.querySelector(`.segment.${key} .num`);
    if(seg) seg.textContent = '0';
  });

  // Apply values
  for(const part of map){
    const el = card.querySelector(`.segment.${part.key} .num`);
    if(el) el.textContent = String(part.value);
  }

  // Status text + proximity classes
  const status = card.querySelector('.status');
  card.classList.remove('soon','urgent','imminent','done');
  if(breakdown.done){
    status.textContent = 'Bon voyage! 🎉';
    card.classList.add('done');
  }else{
    const secsLeft = Math.floor((target - now)/1000);
    status.textContent = humanEta(secsLeft);

    // Proximity thresholds
    if(secsLeft <= 6*3600)       card.classList.add('imminent');   // < 6 hours
    else if(secsLeft <= 24*3600) card.classList.add('urgent');     // < 1 day
    else if(secsLeft <= 30*24*3600) card.classList.add('soon');    // < 30 days
  }
}

/** Short human ETA, e.g., "in 3d 4h" */
function humanEta(secs){
  if(secs <= 0) return 'now';
  const units = [
    ['y', 365*24*3600],
    ['mo', 30*24*3600],
    ['w', 7*24*3600],
    ['d', 24*3600],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  let remain = secs;
  const parts = [];
  for(const [lbl, size] of units){
    const v = Math.floor(remain / size);
    if(v > 0){
      parts.push(`${v}${lbl}`);
      remain -= v*size;
    }
    if(parts.length >= 2) break;
  }
  return 'in ' + (parts.join(' ') || '0s');
}

/* Initial render */
render();

/* --- UX niceties: move sheen on mouse --- */
document.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  document.querySelectorAll('.card').forEach(card => {
    card.style.setProperty('--sx', `${x}%`);
    card.style.setProperty('--sy', `${y}%`);
  });
});

// === Theme toggle ===
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  // Save preference
  localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
});

// Apply saved preference on load
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-mode');
}

// === Drag & Drop Sorting ===
document.addEventListener("DOMContentLoaded", () => {
  const cardsContainer = document.getElementById("cards");

  // Enable drag & drop sorting
  Sortable.create(cardsContainer, {
    animation: 150,
    ghostClass: "drag-ghost",
    onEnd: () => {
      // Reorder the internal state array to match the new visual order
      const newOrder = Array.from(cardsContainer.children).map(c => c.dataset.id);
      state.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      save();
    },
  });
});
