(() => {
  const storageKey = 'travelCountdown.trips.v2';
  const themeKey = 'travelCountdown.theme';
  const modeKey = 'travelCountdown.mode';

  const elements = {
    form: document.getElementById('tripForm'),
    destination: document.getElementById('destinationInput'),
    departure: document.getElementById('departureInput'),
    returnDate: document.getElementById('returnInput'),
    background: document.getElementById('backgroundInput'),
    backgroundPreview: document.getElementById('backgroundPreview'),
    displayModeRadios: document.querySelectorAll('#displayModeControl input[name="displayMode"]'),
    addButton: document.getElementById('addTripBtn'),
    banner: document.getElementById('nextTripBanner'),
    bannerDestination: document.getElementById('bannerDestination'),
    bannerCountdown: document.getElementById('bannerCountdown'),
    bannerButton: document.getElementById('bannerButton'),
    emptyState: document.getElementById('emptyState'),
    cards: document.getElementById('cardCollection'),
    template: document.getElementById('tripCardTemplate'),
    themeToggle: document.getElementById('themeToggle'),
    floatingAdd: document.getElementById('floatingAddButton'),
    controlsPanel: document.getElementById('controlsPanel'),
    modal: document.getElementById('editModal'),
    editForm: document.getElementById('editForm'),
    editDestination: document.getElementById('editDestination'),
    editDeparture: document.getElementById('editDeparture'),
    editReturn: document.getElementById('editReturn'),
    editBackground: document.getElementById('editBackground'),
    editPreview: document.getElementById('editBackgroundPreview'),
    closeModal: document.getElementById('closeEditModal'),
    cancelEdit: document.getElementById('cancelEdit'),
    parallax: document.getElementById('parallaxBackdrop')
  };

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const state = {
    trips: [],
    displayMode: 'full',
    addBackground: null,
    editBackground: null,
    countdownRefs: new Map(),
    nextTripId: null,
    lastTick: 0
  };

  let activeEditId = null;

  function init() {
    loadTheme();
    loadDisplayMode();
    loadTrips();
    bindEvents();
    renderTrips();
    startTicker();
    initParallax();
  }

  function bindEvents() {
    elements.form.addEventListener('submit', handleAddTrip);
    elements.background.addEventListener('change', handleAddBackgroundChange);

    elements.displayModeRadios.forEach((radio) => {
      radio.addEventListener('change', (event) => {
        if (event.target.checked) {
          state.displayMode = event.target.value;
          localStorage.setItem(modeKey, state.displayMode);
          applyDisplayMode();
          refreshBannerCountdown();
        }
      });
    });

    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.floatingAdd.addEventListener('click', () => {
      elements.controlsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    elements.banner.addEventListener('click', scrollToNextTrip);
    elements.bannerButton.addEventListener('click', (event) => {
      event.stopPropagation();
      scrollToNextTrip();
    });

    elements.modal.addEventListener('click', (event) => {
      if (event.target === elements.modal) {
        closeEditModal();
      }
    });
    elements.closeModal.addEventListener('click', closeEditModal);
    elements.cancelEdit.addEventListener('click', closeEditModal);
    elements.editForm.addEventListener('submit', handleEditSubmit);
    elements.editBackground.addEventListener('change', handleEditBackgroundChange);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !elements.modal.classList.contains('hidden')) {
        closeEditModal();
      }
    });
  }

  function loadTheme() {
    const saved = localStorage.getItem(themeKey);
    const theme = saved === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
  }

  function toggleTheme() {
    const theme = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme !== 'dark');
    localStorage.setItem(themeKey, theme);
  }

  function loadDisplayMode() {
    const saved = localStorage.getItem(modeKey);
    if (saved && ['full', 'days', 'hm'].includes(saved)) {
      state.displayMode = saved;
      elements.displayModeRadios.forEach((radio) => {
        radio.checked = radio.value === saved;
      });
    }
  }

  function loadTrips() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(stored)) {
        state.trips = stored.map((trip) => ({
          ...trip,
          tint: trip.tint || generateGradient(trip.destination)
        }));
      }
    } catch (error) {
      console.error('Failed to parse saved trips', error);
      state.trips = [];
    }
  }

  function saveTrips() {
    localStorage.setItem(storageKey, JSON.stringify(state.trips));
  }

  function handleAddTrip(event) {
    event.preventDefault();
    const destination = elements.destination.value.trim();
    const departureValue = elements.departure.value;
    if (!destination || !departureValue) return;

    const departure = new Date(departureValue);
    if (Number.isNaN(departure.getTime())) return;

    const returnValue = elements.returnDate.value;
    const returnDate = returnValue ? new Date(returnValue) : null;
    if (returnDate && returnDate < departure) {
      return;
    }

    const trip = {
      id: createId(),
      destination,
      departure: departure.toISOString(),
      returnDate: returnDate ? returnDate.toISOString() : null,
      background: state.addBackground,
      tint: state.addBackground ? null : generateGradient(destination),
      createdAt: new Date().toISOString()
    };

    state.trips.push(trip);
    state.trips.sort((a, b) => new Date(a.departure) - new Date(b.departure));
    saveTrips();
    resetAddForm();
    renderTrips();
  }

  function handleAddBackgroundChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      state.addBackground = null;
      updatePreview(elements.backgroundPreview, null);
      return;
    }

    readFile(file, (dataUrl) => {
      state.addBackground = dataUrl;
      updatePreview(elements.backgroundPreview, dataUrl);
    });
  }

  function resetAddForm() {
    elements.form.reset();
    state.addBackground = null;
    updatePreview(elements.backgroundPreview, null);
  }

  function renderTrips() {
    elements.cards.innerHTML = '';
    state.countdownRefs.clear();

    if (!state.trips.length) {
      elements.emptyState.classList.add('active');
      elements.banner.classList.add('hidden');
      state.nextTripId = null;
      return;
    }

    elements.emptyState.classList.remove('active');

    const sorted = [...state.trips].sort((a, b) => new Date(a.departure) - new Date(b.departure));
    state.trips = sorted;

    sorted.forEach((trip) => {
      const card = buildTripCard(trip);
      elements.cards.appendChild(card.cardElement);
      state.countdownRefs.set(trip.id, {
        trip,
        card: card.cardElement,
        countdown: card.countdown,
        blocks: card.blocks,
        departureTs: new Date(trip.departure).getTime()
      });
    });

    applyDisplayMode();
    determineNextTrip();
    refreshBannerCountdown();
    updateCountdowns(true);
  }

  function buildTripCard(trip) {
    const clone = elements.template.content.firstElementChild.cloneNode(true);
    const card = clone;
    card.dataset.tripId = trip.id;
    card.id = `trip-card-${trip.id}`;

    const backgroundImage = trip.background || trip.tint || generateGradient(trip.destination);
    if (backgroundImage.startsWith('linear-gradient')) {
      card.style.setProperty('--card-image', backgroundImage);
    } else {
      card.style.setProperty('--card-image', `url(${backgroundImage})`);
    }

    card.querySelector('.card-title').textContent = trip.destination;
    const subtitle = card.querySelector('.card-subtitle');
    subtitle.textContent = formatDepartureSubtitle(new Date(trip.departure).getTime() - Date.now());

    const departEl = card.querySelector('.depart-date');
    departEl.textContent = formatDisplayDate(trip.departure);

    const returnEl = card.querySelector('.return-date');
    if (trip.returnDate) {
      returnEl.textContent = formatDisplayDate(trip.returnDate);
      card.dataset.hasReturn = 'true';
    } else {
      card.dataset.hasReturn = 'false';
    }

    const countdown = card.querySelector('.countdown-grid');
    const blocks = {
      months: countdown.querySelector('[data-unit="months"] .time-value'),
      weeks: countdown.querySelector('[data-unit="weeks"] .time-value'),
      days: countdown.querySelector('[data-unit="days"] .time-value'),
      hours: countdown.querySelector('[data-unit="hours"] .time-value'),
      minutes: countdown.querySelector('[data-unit="minutes"] .time-value'),
      seconds: countdown.querySelector('[data-unit="seconds"] .time-value')
    };

    const editBtn = card.querySelector('.icon-btn.edit');
    const deleteBtn = card.querySelector('.icon-btn.delete');
    editBtn.addEventListener('click', () => openEditModal(trip.id));
    deleteBtn.addEventListener('click', () => deleteTrip(trip.id));

    return { cardElement: card, countdown, blocks };
  }

  function applyDisplayMode() {
    state.countdownRefs.forEach((ref) => {
      ref.countdown.dataset.mode = state.displayMode;
    });
  }

  function determineNextTrip() {
    const now = Date.now();
    const upcoming = state.trips.filter((trip) => new Date(trip.departure).getTime() > now);
    if (!upcoming.length) {
      state.nextTripId = null;
      elements.banner.classList.add('hidden');
      return;
    }

    upcoming.sort((a, b) => new Date(a.departure) - new Date(b.departure));
    const next = upcoming[0];
    state.nextTripId = next.id;
    elements.bannerDestination.textContent = next.destination;
    elements.banner.classList.remove('hidden');
  }

  function refreshBannerCountdown() {
    if (!state.nextTripId) return;
    const trip = state.trips.find((item) => item.id === state.nextTripId);
    if (!trip) return;

    const diff = new Date(trip.departure).getTime() - Date.now();
    if (diff <= 0) {
      elements.bannerCountdown.textContent = 'Departing now';
      return;
    }
    const parts = calculateParts(diff);
    elements.bannerCountdown.textContent = formatBanner(parts);
  }

  function updateCountdowns(force = false) {
    const now = Date.now();
    if (!force && state.lastTick && now - state.lastTick < 900) {
      return;
    }
    state.lastTick = now;

    let needsNextTripUpdate = false;
    state.countdownRefs.forEach((ref) => {
      const diff = ref.departureTs - now;
      const parts = calculateParts(diff);
      const proximity = getProximity(diff);
      const status = diff <= 0 ? 'past' : 'upcoming';

      ref.card.dataset.proximity = proximity;
      ref.card.dataset.status = status;
      const subtitle = ref.card.querySelector('.card-subtitle');
      subtitle.textContent = formatDepartureSubtitle(diff);

      setTimeValue(ref.blocks.months, parts.months);
      setTimeValue(ref.blocks.weeks, parts.weeks);
      setTimeValue(ref.blocks.days, parts.days);
      setTimeValue(ref.blocks.hours, parts.hours);
      setTimeValue(ref.blocks.minutes, parts.minutes);
      setTimeValue(ref.blocks.seconds, parts.seconds);

      if (ref.card.dataset.tripId === state.nextTripId && diff > 0) {
        ref.card.setAttribute('data-badge', 'next');
      } else if (diff > 0 && parts.totalDays <= 14) {
        ref.card.setAttribute('data-badge', 'soon');
      } else {
        ref.card.removeAttribute('data-badge');
      }

      if (ref.card.dataset.tripId === state.nextTripId && diff <= 0) {
        needsNextTripUpdate = true;
      }
    });

    if (needsNextTripUpdate) {
      determineNextTrip();
    }

    refreshBannerCountdown();
  }

  function setTimeValue(element, value) {
    if (!element) return;
    const formatted = String(Math.max(0, value)).padStart(2, '0');
    if (element.dataset.value === formatted) return;
    element.dataset.value = formatted;
    element.textContent = formatted;
    element.classList.add('animate');
    setTimeout(() => element.classList.remove('animate'), 250);
  }

  function calculateParts(diffMs) {
    const clamped = Math.max(0, diffMs);
    const totalSeconds = Math.floor(clamped / 1000);
    let remainder = totalSeconds;

    const months = Math.floor(remainder / (30 * 24 * 3600));
    remainder -= months * 30 * 24 * 3600;
    const weeks = Math.floor(remainder / (7 * 24 * 3600));
    remainder -= weeks * 7 * 24 * 3600;
    const days = Math.floor(remainder / (24 * 3600));
    remainder -= days * 24 * 3600;
    const hours = Math.floor(remainder / 3600);
    remainder -= hours * 3600;
    const minutes = Math.floor(remainder / 60);
    remainder -= minutes * 60;
    const seconds = remainder;

    return {
      months,
      weeks,
      days,
      hours,
      minutes,
      seconds,
      totalDays: Math.floor(totalSeconds / (24 * 3600))
    };
  }

  function formatBanner(parts) {
    if (parts.months) {
      return `${parts.months} mo · ${parts.weeks} wk`;
    }
    if (parts.weeks) {
      return `${parts.weeks} wk · ${parts.days} d`;
    }
    if (parts.days) {
      return `${parts.days} d · ${parts.hours} h`;
    }
    if (parts.hours) {
      return `${parts.hours} h · ${parts.minutes} m`;
    }
    return `${Math.max(parts.minutes, 0)} m · ${parts.seconds} s`;
  }

  function formatDepartureSubtitle(diff) {
    if (diff <= -60000) {
      return `Departed ${formatRelativeTime(diff)}`;
    }
    if (diff < 60000 && diff > -60000) {
      return 'Departing now';
    }
    return `Leaves ${formatRelativeTime(diff)}`;
  }

  function formatRelativeTime(diff) {
    const seconds = Math.round(diff / 1000);
    const absSeconds = Math.abs(seconds);
    if (absSeconds >= 86400) {
      return rtf.format(Math.trunc(seconds / 86400), 'day');
    }
    if (absSeconds >= 3600) {
      return rtf.format(Math.trunc(seconds / 3600), 'hour');
    }
    if (absSeconds >= 60) {
      return rtf.format(Math.trunc(seconds / 60), 'minute');
    }
    return rtf.format(seconds, 'second');
  }

  function formatDisplayDate(value) {
    if (!value) return '—';
    try {
      return dateFormatter.format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function getProximity(diff) {
    if (diff <= 0) return 'past';
    const day = 24 * 3600 * 1000;
    if (diff <= day) return 'imminent';
    if (diff <= 3 * day) return 'urgent';
    if (diff <= 14 * day) return 'soon';
    return 'distant';
  }

  function deleteTrip(id) {
    const index = state.trips.findIndex((trip) => trip.id === id);
    if (index === -1) return;
    const confirmed = window.confirm('Delete this trip countdown?');
    if (!confirmed) return;
    state.trips.splice(index, 1);
    saveTrips();
    renderTrips();
  }

  function openEditModal(id) {
    const trip = state.trips.find((item) => item.id === id);
    if (!trip) return;
    activeEditId = id;
    elements.editDestination.value = trip.destination;
    elements.editDeparture.value = toLocalInputValue(trip.departure);
    elements.editReturn.value = toLocalInputValue(trip.returnDate);
    state.editBackground = null;
    updatePreview(elements.editPreview, trip.background || trip.tint);
    elements.modal.classList.remove('hidden');
  }

  function closeEditModal() {
    elements.modal.classList.add('hidden');
    elements.editForm.reset();
    updatePreview(elements.editPreview, null);
    state.editBackground = null;
    activeEditId = null;
  }

  function handleEditSubmit(event) {
    event.preventDefault();
    if (!activeEditId) return;
    const trip = state.trips.find((item) => item.id === activeEditId);
    if (!trip) return;

    const destination = elements.editDestination.value.trim();
    const departure = new Date(elements.editDeparture.value);
    if (!destination || Number.isNaN(departure.getTime())) {
      return;
    }

    const returnValue = elements.editReturn.value;
    const returnDate = returnValue ? new Date(returnValue) : null;
    if (returnDate && returnDate < departure) {
      return;
    }

    trip.destination = destination;
    trip.departure = departure.toISOString();
    trip.returnDate = returnDate ? returnDate.toISOString() : null;
    if (state.editBackground) {
      trip.background = state.editBackground;
      trip.tint = null;
    }
    if (!trip.background) {
      trip.tint = generateGradient(trip.destination);
    }

    saveTrips();
    closeEditModal();
    renderTrips();
  }

  function handleEditBackgroundChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      state.editBackground = null;
      updatePreview(elements.editPreview, null);
      return;
    }

    readFile(file, (dataUrl) => {
      state.editBackground = dataUrl;
      updatePreview(elements.editPreview, dataUrl);
    });
  }

  function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(reader.result);
    reader.readAsDataURL(file);
  }

  function updatePreview(element, image) {
    if (!element) return;
    if (!image) {
      element.style.backgroundImage = '';
      element.classList.remove('has-image');
      return;
    }
    if (image.startsWith('linear-gradient')) {
      element.style.backgroundImage = image;
    } else {
      element.style.backgroundImage = `url(${image})`;
    }
    element.classList.add('has-image');
  }

  function toLocalInputValue(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset();
    const localISO = new Date(date.getTime() - tzOffset * 60000).toISOString();
    return localISO.slice(0, 16);
  }

  function createId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function generateGradient(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue1 = Math.abs(hash) % 360;
    const hue2 = (hue1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${hue1} 70% 45%), hsl(${hue2} 70% 55%))`;
  }

  function startTicker() {
    function tick() {
      updateCountdowns();
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function scrollToNextTrip() {
    if (!state.nextTripId) return;
    const card = document.getElementById(`trip-card-${state.nextTripId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight');
      setTimeout(() => card.classList.remove('highlight'), 1200);
    }
  }

  function initParallax() {
    const orbs = elements.parallax?.querySelectorAll('.orb');
    if (!elements.parallax || !orbs?.length) return;

    document.addEventListener('pointermove', (event) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      orbs.forEach((orb, index) => {
        const intensity = (index + 1) * 16;
        orb.style.transform = `translate3d(${x * intensity}px, ${y * intensity}px, 0)`;
      });
    });

    window.addEventListener('scroll', () => {
      const offset = window.scrollY;
      elements.parallax.style.transform = `translateY(${offset * -0.05}px)`;
    });
  }

  init();
})();
