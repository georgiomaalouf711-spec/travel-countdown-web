(() => {
  const storageKey = 'travelCountdown.trips.v2';
  const legacyStorageKey = 'travel-countdowns/v1';
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
  const averageMonthMs = 1000 * 60 * 60 * 24 * 30.4375;

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
    setupFloatingLabels();
    refreshFloatingLabels();
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
          updateCountdowns(true);
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
    if (saved && ['full', 'months', 'days', 'hm'].includes(saved)) {
      state.displayMode = saved;
      elements.displayModeRadios.forEach((radio) => {
        radio.checked = radio.value === saved;
      });
    }
  }

  function loadTrips() {
    state.trips = [];
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(stored) && stored.length) {
        const normalized = stored.map((trip, index) => normalizeTrip(trip, index)).filter(Boolean);
        if (normalized.length) {
          state.trips = normalized;
          return;
        }
      }
    } catch (error) {
      console.error('Failed to parse saved trips', error);
      state.trips = [];
    }

    const migrated = migrateLegacyTrips();
    if (migrated.length) {
      state.trips = migrated;
      saveTrips();
      localStorage.removeItem(legacyStorageKey);
    }
  }

  function normalizeTrip(trip, index = 0) {
    const destination =
      (typeof trip.destination === 'string' && trip.destination.trim())
        ? trip.destination.trim()
        : extractDestination(trip, index);

    const departure =
      parseDateValue(trip.departure) ||
      parseDateValue(trip.departureDate) ||
      parseDateValue(trip.date) ||
      parseDateValue(trip.startDate) ||
      parseDateValue(trip.when);

    if (!departure) {
      return null;
    }

    const returnDate =
      parseDateValue(trip.returnDate) ||
      parseDateValue(trip.returnDateValue) ||
      parseDateValue(trip.endDate) ||
      parseDateValue(trip.arrival);

    const background = trip.background || trip.backgroundImage || trip.image || null;

    const createdAt = parseDateValue(trip.createdAt) || new Date().toISOString();

    return {
      ...trip,
      id: trip.id || createId(),
      destination,
      departure,
      returnDate,
      background,
      tint: background ? null : trip.tint || generateGradient(destination),
      createdAt
    };
  }

  function migrateLegacyTrips() {
    try {
      const raw = localStorage.getItem(legacyStorageKey);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      const legacyTrips = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.trips)
        ? parsed.trips
        : [];

      const migrated = legacyTrips
        .map((trip, index) => {
          const destination = extractDestination(trip, index);
          const departure =
            parseDateValue(trip.departure) ||
            parseDateValue(trip.departureDate) ||
            parseDateValue(trip.date) ||
            parseDateValue(trip.startDate) ||
            parseDateValue(trip.when);

          if (!departure) {
            return null;
          }

          const returnDate =
            parseDateValue(trip.returnDate) ||
            parseDateValue(trip.endDate) ||
            parseDateValue(trip.arrival);

          const background =
            trip.background || trip.backgroundImage || trip.image || trip.photo || null;

          const seeded = {
            ...trip,
            id: trip.id,
            destination,
            departure,
            returnDate,
            background,
            tint: background ? null : trip.tint,
            createdAt: parseDateValue(trip.createdAt) || new Date().toISOString()
          };

          return normalizeTrip(seeded, index);
        })
        .filter(Boolean);

      return migrated;
    } catch (error) {
      console.error('Failed to migrate legacy trips', error);
      return [];
    }
  }

  function extractDestination(trip, index) {
    const fallback = `Trip ${index + 1}`;
    if (typeof trip?.destination === 'string' && trip.destination.trim()) {
      return trip.destination.trim();
    }
    if (typeof trip?.title === 'string' && trip.title.trim()) {
      return trip.title.trim();
    }
    if (typeof trip?.name === 'string' && trip.name.trim()) {
      return trip.name.trim();
    }
    return fallback;
  }

  function parseDateValue(value) {
    if (!value) return null;

    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric) && /^\d+$/.test(trimmed) && trimmed.length >= 8) {
        const date = new Date(numeric);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return null;
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
    refreshFloatingLabels(elements.form);
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
        blocks: {},
        mode: null,
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

    const editBtn = card.querySelector('.icon-btn.edit');
    const deleteBtn = card.querySelector('.icon-btn.delete');
    editBtn.addEventListener('click', () => openEditModal(trip.id));
    deleteBtn.addEventListener('click', () => deleteTrip(trip.id));

    return { cardElement: card, countdown };
  }

  function applyDisplayMode() {
    state.countdownRefs.forEach((ref) => {
      ref.countdown.dataset.mode = state.displayMode;
      ref.mode = null;
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
    elements.bannerCountdown.textContent = formatBanner(parts, state.displayMode);
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
      ensureCountdownStructure(ref);
      renderCountdown(ref, parts);

      const proximity = getProximity(diff);
      const status = diff <= 0 ? 'past' : 'upcoming';

      ref.card.dataset.proximity = proximity;
      ref.card.dataset.status = status;
      const subtitle = ref.card.querySelector('.card-subtitle');
      subtitle.textContent = formatDepartureSubtitle(diff);

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

  function updateNumericValue(element, value, { pad = false } = {}) {
    if (!element) return;
    const normalized = Math.max(0, value);
    const text = pad ? String(normalized).padStart(2, '0') : String(normalized);
    if (element.dataset.value === text) return;
    element.dataset.value = text;
    element.textContent = text;
    element.classList.add('animate');
    setTimeout(() => element.classList.remove('animate'), 250);
  }

  function ensureCountdownStructure(ref) {
    if (!ref) return;
    const mode = state.displayMode;
    if (ref.mode === mode) return;

    ref.mode = mode;
    ref.blocks = {};
    const countdown = ref.countdown;
    countdown.dataset.mode = mode;
    countdown.innerHTML = '';

    if (mode === 'full') {
      const units = [
        ['months', 'Months'],
        ['weeks', 'Weeks'],
        ['days', 'Days'],
        ['hours', 'Hours'],
        ['minutes', 'Minutes'],
        ['seconds', 'Seconds']
      ];
      units.forEach(([unit, label]) => {
        const block = createCountdownBlock(unit, label);
        countdown.appendChild(block.element);
        ref.blocks[unit] = block.value;
      });
    } else if (mode === 'months') {
      const block = createCountdownBlock('months-total', 'Months');
      countdown.appendChild(block.element);
      ref.blocks.monthsOnly = block.value;
    } else if (mode === 'days') {
      const block = createCountdownBlock('days-total', 'Days');
      countdown.appendChild(block.element);
      ref.blocks.daysOnly = block.value;
    } else if (mode === 'hm') {
      const hoursBlock = createCountdownBlock('hours-total', 'Hours');
      const minutesBlock = createCountdownBlock('minutes-remaining', 'Minutes');
      countdown.append(hoursBlock.element, minutesBlock.element);
      ref.blocks.hours = hoursBlock.value;
      ref.blocks.minutes = minutesBlock.value;
    }
  }

  function createCountdownBlock(unit, label) {
    const block = document.createElement('div');
    block.className = 'time-block';
    block.dataset.unit = unit;
    const value = document.createElement('span');
    value.className = 'time-value';
    value.textContent = '00';
    const labelEl = document.createElement('span');
    labelEl.className = 'time-label';
    labelEl.textContent = label;
    block.append(value, labelEl);
    return { element: block, value };
  }

  function renderCountdown(ref, parts) {
    const mode = state.displayMode;
    if (mode === 'full') {
      updateNumericValue(ref.blocks.months, parts.months, { pad: true });
      updateNumericValue(ref.blocks.weeks, parts.weeks, { pad: true });
      updateNumericValue(ref.blocks.days, parts.days, { pad: true });
      updateNumericValue(ref.blocks.hours, parts.hours, { pad: true });
      updateNumericValue(ref.blocks.minutes, parts.minutes, { pad: true });
      updateNumericValue(ref.blocks.seconds, parts.seconds, { pad: true });
    } else if (mode === 'months') {
      updateNumericValue(ref.blocks.monthsOnly, parts.totalMonths);
    } else if (mode === 'days') {
      updateNumericValue(ref.blocks.daysOnly, parts.totalDays);
    } else if (mode === 'hm') {
      updateNumericValue(ref.blocks.hours, parts.totalHours);
      updateNumericValue(ref.blocks.minutes, parts.remainingMinutes, { pad: true });
    }
  }

  function calculateParts(diffMs) {
    const clamped = Math.max(0, diffMs);
    const dayMs = 1000 * 60 * 60 * 24;
    const hourMs = 1000 * 60 * 60;
    const minuteMs = 1000 * 60;
    const secondMs = 1000;
    const weekMs = dayMs * 7;
    const monthMs = averageMonthMs;

    let remainderMs = clamped;

    const months = Math.floor(remainderMs / monthMs);
    remainderMs -= months * monthMs;

    const weeks = Math.floor(remainderMs / weekMs);
    remainderMs -= weeks * weekMs;

    const days = Math.floor(remainderMs / dayMs);
    remainderMs -= days * dayMs;

    const hours = Math.floor(remainderMs / hourMs);
    remainderMs -= hours * hourMs;

    const minutes = Math.floor(remainderMs / minuteMs);
    remainderMs -= minutes * minuteMs;

    const seconds = Math.floor(remainderMs / secondMs);

    const totalMonths = Math.floor(clamped / monthMs);
    const totalDays = Math.floor(clamped / dayMs);
    const totalHours = Math.floor(clamped / hourMs);
    const remainingMinutes = Math.floor((clamped % hourMs) / minuteMs);

    return {
      months,
      weeks,
      days,
      hours,
      minutes,
      seconds,
      totalMonths,
      totalDays,
      totalHours,
      remainingMinutes
    };
  }

  function formatBanner(parts, mode) {
    switch (mode) {
      case 'months': {
        const value = parts.totalMonths;
        return value === 1 ? '1 month remaining' : `${value} months remaining`;
      }
      case 'days': {
        const value = parts.totalDays;
        return value === 1 ? '1 day remaining' : `${value} days remaining`;
      }
      case 'hm': {
        const minutes = String(parts.remainingMinutes).padStart(2, '0');
        return `${parts.totalHours} h · ${minutes} m`;
      }
      default: {
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
    }
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
    refreshFloatingLabels(elements.modal);
    elements.modal.classList.remove('hidden');
  }

  function closeEditModal() {
    elements.modal.classList.add('hidden');
    elements.editForm.reset();
    updatePreview(elements.editPreview, null);
    state.editBackground = null;
    activeEditId = null;
    refreshFloatingLabels(elements.modal);
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

  function setupFloatingLabels() {
    document.querySelectorAll('.floating-field input').forEach((input) => {
      if (input.dataset.floatingBound) return;
      const update = () => {
        const shell = input.closest('.floating-field');
        if (shell) {
          shell.classList.toggle('has-value', Boolean(input.value));
        }
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
      input.dataset.floatingBound = 'true';
      update();
    });
  }

  function refreshFloatingLabels(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('.floating-field input').forEach((input) => {
      const shell = input.closest('.floating-field');
      if (shell) {
        shell.classList.toggle('has-value', Boolean(input.value));
      }
    });
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
