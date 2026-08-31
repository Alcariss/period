import './styles/main.css';
import { APP_CONFIG, UI_CONFIG } from './config';
import { deleteEntry, fetchEntries, saveEntry } from './lib/api';
import { loadCache, saveCache } from './lib/cache';
import { cacheAgeText, escapeHtml, formatDate, todayLocalIsoDate } from './lib/format';
import { normalizeEntry } from './lib/entry-normalizer';
import { assignPeriodGroups, getCyclePhase, predictNextPeriod } from './lib/cycle-predictor';
import { getSymptomLabel, SYMPTOM_META, type SymptomField } from './lib/symptom-labels';
import { activeOptionalFields, availableFieldsToAdd } from './lib/symptom-fields';
import type { Diagnostics, Entry } from './types';

const REQUIRED_FIELD: SymptomField = 'krvaceni';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App mount node not found');
}

function requiredNode<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Required node not found: ${selector}`);
  }

  return node;
}

function symptomFormMarkup(idPrefix: string): string {
  return `
    <div id="${idPrefix}-krvaceni-host"></div>
    <div class="optional-symptoms" id="${idPrefix}-optional-host"></div>
    <div class="add-symptom-control">
      <button type="button" class="add-symptom-btn" id="${idPrefix}-add-btn" aria-label="Add symptom">+</button>
      <div class="add-symptom-menu hidden" id="${idPrefix}-add-menu"></div>
    </div>
  `;
}

app.innerHTML = `
  <main class="container">
    <header class="header">
      <h1>🌸 Period Tracker</h1>
    </header>

    <section id="prediction" class="prediction-card"></section>

    <section id="add-form-section" class="add-form">
      <form id="add-form">
        <input id="add-date" type="date" aria-label="Date" required />

        ${symptomFormMarkup('add')}

        <textarea id="notes" rows="3" aria-label="Notes" placeholder="Optional notes..."></textarea>

        <div class="form-actions">
          <button type="submit" id="add-submit">Save entry</button>
        </div>
        <p id="add-error" class="form-error hidden"></p>
      </form>
    </section>

    <section id="status"></section>
    <section id="entries"></section>
    <section id="debug" class="debug"></section>
  </main>
`;

const statusNode = requiredNode<HTMLElement>('#status');
const entriesNode = requiredNode<HTMLElement>('#entries');
const debugNode = requiredNode<HTMLElement>('#debug');
const predictionNode = requiredNode<HTMLElement>('#prediction');
const addForm = requiredNode<HTMLFormElement>('#add-form');
const addDate = requiredNode<HTMLInputElement>('#add-date');
const addSubmit = requiredNode<HTMLButtonElement>('#add-submit');
const addError = requiredNode<HTMLElement>('#add-error');

type SymptomFormValues = Record<SymptomField, string>;

type SymptomFormHosts = {
  krvaceniHost: HTMLElement;
  optionalHost: HTMLElement;
  addButton: HTMLButtonElement;
  addMenu: HTMLElement;
};

function buildSliderRow(idPrefix: string, field: SymptomField, value: string, removable: boolean): string {
  const meta = SYMPTOM_META[field];
  const removeButton = removable
    ? `<button type="button" class="symptom-remove-btn" id="${idPrefix}-remove-${field}" aria-label="Remove ${escapeHtml(meta.name)}">&times;</button>`
    : '';

  return `
    <div class="symptom-slider">
      <div class="symptom-slider-header">
        <label for="${idPrefix}-${field}">${meta.emoji} ${escapeHtml(meta.name)}</label>
        <div class="symptom-slider-header-end">
          <span class="symptom-slider-value" id="${idPrefix}-${field}-value">${escapeHtml(getSymptomLabel(field, value))}</span>
          ${removeButton}
        </div>
      </div>
      <input
        type="range"
        id="${idPrefix}-${field}"
        name="${field}"
        min="0"
        max="${meta.max}"
        step="1"
        value="${escapeHtml(value)}"
      />
    </div>
  `;
}

function wireSliderRow(idPrefix: string, field: SymptomField, onChange: (value: string) => void): void {
  const slider = requiredNode<HTMLInputElement>(`#${idPrefix}-${field}`);
  const valueLabel = requiredNode<HTMLElement>(`#${idPrefix}-${field}-value`);

  slider.addEventListener('input', () => {
    valueLabel.textContent = getSymptomLabel(field, slider.value);
    onChange(slider.value);
  });
}

function createSymptomForm(
  idPrefix: string,
  hosts: SymptomFormHosts,
  initialValues: Partial<SymptomFormValues>
): { readValues: () => SymptomFormValues } {
  const state: SymptomFormValues = {
    krvaceni: initialValues.krvaceni ?? '0',
    nalady: (initialValues.nalady ?? '').trim(),
    tlak: (initialValues.tlak ?? '').trim(),
    nadymani: (initialValues.nadymani ?? '').trim(),
    energie: (initialValues.energie ?? '').trim()
  };

  function render(): void {
    hosts.krvaceniHost.innerHTML = buildSliderRow(idPrefix, REQUIRED_FIELD, state[REQUIRED_FIELD], false);
    wireSliderRow(idPrefix, REQUIRED_FIELD, (value) => {
      state[REQUIRED_FIELD] = value;
    });

    const active = activeOptionalFields(state);
    hosts.optionalHost.innerHTML = active.map((field) => buildSliderRow(idPrefix, field, state[field], true)).join('');
    active.forEach((field) => {
      wireSliderRow(idPrefix, field, (value) => {
        state[field] = value;
      });

      const removeButton = requiredNode<HTMLButtonElement>(`#${idPrefix}-remove-${field}`);
      removeButton.addEventListener('click', () => {
        state[field] = '';
        render();
      });
    });

    const available = availableFieldsToAdd(active);
    hosts.addMenu.innerHTML = available
      .map((field) => {
        const meta = SYMPTOM_META[field];
        return `<button type="button" class="add-symptom-option" id="${idPrefix}-option-${field}">${meta.emoji} ${escapeHtml(meta.name)}</button>`;
      })
      .join('');
    available.forEach((field) => {
      const optionButton = requiredNode<HTMLButtonElement>(`#${idPrefix}-option-${field}`);
      optionButton.addEventListener('click', () => {
        state[field] = '0';
        hosts.addMenu.classList.add('hidden');
        render();
      });
    });

    hosts.addButton.disabled = available.length === 0;
    if (available.length === 0) {
      hosts.addMenu.classList.add('hidden');
    }
  }

  render();

  return {
    readValues: () => ({ ...state })
  };
}

function wireAddMenuToggle(hosts: SymptomFormHosts): void {
  hosts.addButton.addEventListener('click', () => {
    hosts.addMenu.classList.toggle('hidden');
  });
}

function symptomFormHosts(idPrefix: string): SymptomFormHosts {
  return {
    krvaceniHost: requiredNode<HTMLElement>(`#${idPrefix}-krvaceni-host`),
    optionalHost: requiredNode<HTMLElement>(`#${idPrefix}-optional-host`),
    addButton: requiredNode<HTMLButtonElement>(`#${idPrefix}-add-btn`),
    addMenu: requiredNode<HTMLElement>(`#${idPrefix}-add-menu`)
  };
}

const addFormHosts = symptomFormHosts('add');
wireAddMenuToggle(addFormHosts);
let addSymptomForm = createSymptomForm('add', addFormHosts, {});

addDate.value = todayLocalIsoDate();

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  addError.classList.add('hidden');
  addSubmit.disabled = true;
  addSubmit.textContent = 'Saving...';

  try {
    const formData = new FormData(addForm);
    const symptomValues = addSymptomForm.readValues();
    const entry = normalizeEntry({
      date: addDate.value,
      krvaceni: symptomValues.krvaceni,
      nalady: symptomValues.nalady,
      tlak: symptomValues.tlak,
      nadymani: symptomValues.nadymani,
      energie: symptomValues.energie,
      notes: String(formData.get('notes') ?? '')
    });

    await saveEntry(entry);
    addForm.reset();
    addSymptomForm = createSymptomForm('add', addFormHosts, {});
    addDate.value = todayLocalIsoDate();
    await refreshEntries();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addError.textContent = message;
    addError.classList.remove('hidden');
  } finally {
    addSubmit.disabled = false;
    addSubmit.textContent = 'Save entry';
  }
});

let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function setStatus(message: string, kind: 'info' | 'error' | 'success'): void {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusNode.className = `status ${kind}`;
  statusNode.textContent = message;

  if (kind === 'success') {
    statusTimeout = setTimeout(() => {
      statusNode.textContent = '';
      statusNode.className = '';
    }, 3000);
  }
}


function renderEntries(entries: Entry[]): void {
  if (entries.length === 0) {
    entriesNode.innerHTML = '<p class="empty">No entries yet.</p>';
    return;
  }

  const periodGroups = assignPeriodGroups(entries);
  const editSymptomForms = new Map<string, { readValues: () => SymptomFormValues }>();

  entriesNode.innerHTML = entries
    .map((entry, index) => {
      const groupId = periodGroups[entry.date];
      const inPeriod = groupId !== undefined;
      const prevGroupId = index > 0 ? periodGroups[entries[index - 1]?.date ?? ''] : undefined;
      const nextGroupId = index < entries.length - 1 ? periodGroups[entries[index + 1]?.date ?? ''] : undefined;
      const connectsAbove = inPeriod && prevGroupId === groupId;
      const connectsBelow = inPeriod && nextGroupId === groupId;
      const railClasses = [
        'period-rail',
        inPeriod ? 'in-period' : '',
        connectsAbove ? 'connects-above' : '',
        connectsBelow ? 'connects-below' : ''
      ].filter(Boolean).join(' ');

      const activeMetrics = activeOptionalFields(entry);
      const metricsMarkup = [REQUIRED_FIELD, ...activeMetrics]
        .map((field) => `<li>${SYMPTOM_META[field].name}: ${escapeHtml(getSymptomLabel(field, entry[field]))}</li>`)
        .join('');

      return `
        <div class="entry-row">
          <div class="${railClasses}">${inPeriod ? '<span class="period-dot"></span>' : ''}</div>
          <article class="entry-card" data-date="${escapeHtml(entry.date)}">
          <div class="entry-view">
            <div class="entry-header">
              <strong>${escapeHtml(formatDate(entry.date))}</strong>
              <div class="entry-actions">
                <button type="button" class="edit-btn" data-date="${escapeHtml(entry.date)}">Upravit</button>
                <button type="button" class="delete-btn" data-date="${escapeHtml(entry.date)}">Smazat</button>
              </div>
            </div>
            <ul class="entry-metrics">${metricsMarkup}</ul>
            ${entry.notes ? `<p class="notes">${escapeHtml(entry.notes)}</p>` : ''}
          </div>
          <div class="entry-edit hidden">
            <input type="date" id="edit-${escapeHtml(entry.date)}-date" value="${escapeHtml(entry.date)}" aria-label="Date" required />
            ${symptomFormMarkup(`edit-${escapeHtml(entry.date)}`)}
            <textarea id="edit-${escapeHtml(entry.date)}-notes" rows="3" aria-label="Notes">${escapeHtml(entry.notes)}</textarea>
            <div class="form-actions">
              <button type="button" class="btn-save" data-date="${escapeHtml(entry.date)}">Uložit</button>
              <button type="button" class="btn-cancel" data-date="${escapeHtml(entry.date)}">Zrušit</button>
            </div>
            <p class="edit-error hidden"></p>
          </div>
          </article>
        </div>
      `;
    })
    .join('');

  entries.forEach((entry) => {
    wireAddMenuToggle(symptomFormHosts(`edit-${entry.date}`));
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const date = button.dataset.date ?? '';
      if (!date) return;

      try {
        await deleteEntry(date);
        await refreshEntries();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, 'error');
      }
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const date = button.dataset.date ?? '';
      const card = entriesNode.querySelector<HTMLElement>(`.entry-card[data-date="${date}"]`);
      if (!card) return;

      const entry = entries.find((item) => item.date === date);
      if (!entry) return;

      const idPrefix = `edit-${date}`;
      editSymptomForms.set(date, createSymptomForm(idPrefix, symptomFormHosts(idPrefix), {
        krvaceni: entry.krvaceni,
        nalady: entry.nalady,
        tlak: entry.tlak,
        nadymani: entry.nadymani,
        energie: entry.energie
      }));

      card.querySelector('.entry-view')?.classList.add('hidden');
      card.querySelector('.entry-edit')?.classList.remove('hidden');
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.btn-cancel').forEach((button) => {
    button.addEventListener('click', () => {
      const date = button.dataset.date ?? '';
      const card = entriesNode.querySelector<HTMLElement>(`.entry-card[data-date="${date}"]`);
      if (!card) return;

      card.querySelector('.entry-view')?.classList.remove('hidden');
      card.querySelector('.entry-edit')?.classList.add('hidden');
      card.querySelector('.edit-error')?.classList.add('hidden');
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.btn-save').forEach((button) => {
    button.addEventListener('click', async () => {
      const originalDate = button.dataset.date ?? '';
      if (!originalDate) return;

      const symptomForm = editSymptomForms.get(originalDate);
      const errorEl = requiredNode<HTMLElement>(`#edit-${originalDate}-krvaceni-host`).closest('.entry-edit')
        ?.querySelector<HTMLElement>('.edit-error');
      const dateField = requiredNode<HTMLInputElement>(`#edit-${originalDate}-date`);
      const notesField = requiredNode<HTMLTextAreaElement>(`#edit-${originalDate}-notes`);

      button.disabled = true;
      button.textContent = 'Ukládám...';
      errorEl?.classList.add('hidden');

      try {
        if (!symptomForm) {
          throw new Error('Symptom form not initialized');
        }

        const symptomValues = symptomForm.readValues();
        const entry = normalizeEntry({
          date: dateField.value,
          krvaceni: symptomValues.krvaceni,
          nalady: symptomValues.nalady,
          tlak: symptomValues.tlak,
          nadymani: symptomValues.nadymani,
          energie: symptomValues.energie,
          notes: notesField.value
        });

        if (entry.date !== originalDate) {
          await deleteEntry(originalDate);
        }
        await saveEntry(entry);
        await refreshEntries();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (errorEl) {
          errorEl.textContent = message;
          errorEl.classList.remove('hidden');
        }
        button.disabled = false;
        button.textContent = 'Uložit';
      }
    });
  });
}

function renderDebug(diagnostics: Diagnostics): void {
  if (!UI_CONFIG.showDebug) {
    debugNode.innerHTML = '';
    return;
  }

  debugNode.innerHTML = `
    <h2>Debug</h2>
    <dl>
      <dt>Endpoint</dt><dd>${escapeHtml(diagnostics.endpoint)}</dd>
      <dt>Source</dt><dd>${escapeHtml(diagnostics.source)}</dd>
      <dt>Fetched</dt><dd>${escapeHtml(diagnostics.fetchedAt)}</dd>
      <dt>Cache age</dt><dd>${diagnostics.cacheAgeSeconds ?? 'n/a'}</dd>
      <dt>Error</dt><dd>${escapeHtml(diagnostics.error ?? 'none')}</dd>
      <dt>Cache TTL</dt><dd>${Math.floor(APP_CONFIG.cacheTtlMs / 1000)} sec</dd>
    </dl>
  `;
}

const PHASE_LABELS: Record<string, string> = {
  menstrual: 'Menstrual phase',
  follicular: 'Follicular phase',
  ovulation: 'Ovulation',
  luteal: 'Luteal phase'
};

function renderPrediction(entries: Entry[]): void {
  const now = new Date();
  const prediction = predictNextPeriod(entries, now);
  const phaseInfo = getCyclePhase(entries, now);

  if (!prediction && !phaseInfo) {
    predictionNode.innerHTML = `
      <h3>Cycle prediction</h3>
      <p class="empty">Log at least two periods to see predictions and cycle phase.</p>
    `;
    return;
  }

  const daysUntilText = (() => {
    if (!prediction) return '';
    if (prediction.daysUntil > 0) return `${prediction.daysUntil} days until next period`;
    if (prediction.daysUntil === 0) return 'Period expected today';
    return `${Math.abs(prediction.daysUntil)} days overdue`;
  })();

  const reliabilityNote = prediction && !prediction.stats.isRegular
    ? '<p class="prediction-warning">Cycle length varies by 8+ days, so this prediction is less reliable.</p>'
    : '';

  const phaseBlock = phaseInfo
    ? `
      <div class="phase-block">
        <p class="phase-label">${escapeHtml(PHASE_LABELS[phaseInfo.phase] ?? phaseInfo.phase)} (cycle day ${phaseInfo.cycleDay})</p>
        <p class="phase-hormones">${escapeHtml(phaseInfo.hormonalState)}</p>
        <ul class="phase-experiences">
          ${phaseInfo.commonExperiences.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  predictionNode.innerHTML = `
    <div class="prediction-card-header">
      <h3>Cycle prediction</h3>
      <button type="button" class="info-btn" id="prediction-info-btn" aria-label="How is this calculated?">ⓘ</button>
    </div>
    <div class="info-panel hidden" id="prediction-info-panel">
      <p>The calculation only needs two dates per period: the first day you log
      bleeding (Intenzita &gt; 0) and the last day before it stops. Everything else
      is derived from those start/end dates, so log at least those two days each
      period, and at least two full periods before a prediction appears.</p>
      <p>Next period is estimated from the average length of your last logged cycles.
      Ovulation is estimated 14 days before that date, not from the midpoint of the cycle,
      because the luteal phase (after ovulation) stays fairly constant per person, while the
      follicular phase (before ovulation) is what actually varies.</p>
    </div>
    ${prediction ? `
      <p class="prediction-headline">${escapeHtml(daysUntilText)}</p>
      <p class="prediction-detail">
        Expected ${escapeHtml(formatDate(prediction.predictedStartDate))}
        &middot; average cycle ${prediction.stats.averageCycleLengthDays} days
        (${prediction.stats.minCycleLengthDays}-${prediction.stats.maxCycleLengthDays})
        &middot; based on ${prediction.stats.cycleCount} cycle${prediction.stats.cycleCount === 1 ? '' : 's'}
      </p>
      ${reliabilityNote}
    ` : ''}
    ${phaseBlock}
    <p class="prediction-disclaimer">
      Educational estimate only, not medical advice. Individual cycles vary.
    </p>
  `;

  const infoButton = requiredNode<HTMLButtonElement>('#prediction-info-btn');
  const infoPanel = requiredNode<HTMLElement>('#prediction-info-panel');
  infoButton.addEventListener('click', () => {
    infoPanel.classList.toggle('hidden');
  });
}

async function refreshEntries(): Promise<void> {
  try {
    const { entries, diagnostics } = await fetchEntries();
    saveCache(entries);
    renderEntries(entries);
    renderPrediction(entries);
    setStatus('Entries loaded.', 'success');
    renderDebug(diagnostics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cached = loadCache();

    if (cached && cached.entries.length > 0) {
      setStatus('Offline mode. Showing cached entries.', 'error');
      renderEntries(cached.entries);
      renderPrediction(cached.entries);
      renderDebug({
        endpoint: APP_CONFIG.apiUrlPrimary,
        source: 'cache',
        fetchedAt: new Date().toISOString(),
        cacheAgeSeconds: Math.floor(cached.ageMs / 1000),
        error: message
      });
      return;
    }

    setStatus('Unable to load entries.', 'error');
    entriesNode.innerHTML = '<button id="retry" type="button">Retry</button>';
    renderDebug({
      endpoint: APP_CONFIG.apiUrlPrimary,
      source: 'primary',
      fetchedAt: new Date().toISOString(),
      cacheAgeSeconds: null,
      error: message
    });

    const retry = document.querySelector<HTMLButtonElement>('#retry');
    retry?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

const SPLASH_MIN_VISIBLE_MS = 900;
const SPLASH_FADE_MS = 600;

function hideSplash(): void {
  const splash = document.querySelector<HTMLElement>('#splash');
  if (!splash) {
    return;
  }

  splash.classList.add('splash-hide');
  setTimeout(() => splash.remove(), SPLASH_FADE_MS);
}

async function bootstrap(): Promise<void> {
  const splashStartedAt = Date.now();
  const cached = loadCache();
  if (cached && cached.entries.length > 0) {
    renderEntries(cached.entries);
    renderPrediction(cached.entries);
    setStatus(`Showing cached data (${cacheAgeText(cached.ageMs)}), refreshing...`, 'info');
    renderDebug({
      endpoint: APP_CONFIG.apiUrlPrimary,
      source: 'cache',
      fetchedAt: new Date(Date.now() - cached.ageMs).toISOString(),
      cacheAgeSeconds: Math.floor(cached.ageMs / 1000),
      error: null
    });
  } else {
    setStatus('Loading entries...', 'info');
  }

  await refreshEntries();

  const elapsedMs = Date.now() - splashStartedAt;
  const remainingMs = SPLASH_MIN_VISIBLE_MS - elapsedMs;
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
  hideSplash();
}

function setupUpdatePrompt(): void {
  const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

  if (!('serviceWorker' in navigator)) {
    return;
  }

  let registration: ServiceWorkerRegistration | null = null;

  navigator.serviceWorker.ready.then((reg) => {
    registration = reg;
  });

  // iOS home-screen PWAs stay in one long-lived session, so nudge checks on interval + resume.
  setInterval(() => {
    registration?.update();
  }, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      registration?.update();
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;

    let updateBanner: HTMLElement | null = null;

    const showPrompt = () => {
      if (updateBanner) return;
      updateBanner = document.createElement('div');
      updateBanner.className = 'update-banner';
      updateBanner.innerHTML = '<span>New version available.</span><button type="button">Update</button>';
      document.body.prepend(updateBanner);

      updateBanner.querySelector('button')?.addEventListener('click', () => {
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      });
    };

    if (reg.waiting) {
      showPrompt();
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showPrompt();
        }
      });
    });
  });
}

setupUpdatePrompt();
bootstrap();

