import './styles/main.css';
import { APP_CONFIG, UI_CONFIG } from './config';
import { deleteEntry, fetchEntries, saveEntry } from './lib/api';
import { loadCache, saveCache } from './lib/cache';
import { cacheAgeText, escapeHtml, formatDate, todayLocalIsoDate } from './lib/format';
import { normalizeEntry } from './lib/entry-normalizer';
import { getCyclePhase, predictNextPeriod } from './lib/cycle-predictor';
import type { Diagnostics, Entry } from './types';

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

app.innerHTML = `
  <main class="container">
    <header class="header">
      <h1>🌸 Period Tracker</h1>
    </header>

    <section id="prediction" class="prediction-card"></section>

    <section id="add-form-section" class="add-form">
      <form id="add-form">
        <label for="add-date">Date</label>
        <input id="add-date" type="date" required />

        <div class="symptoms-grid">
          <div>
            <label>Bleeding</label>
            <div class="segmented">
              <label><input type="radio" name="krvaceni" value="0" checked />0</label>
              <label><input type="radio" name="krvaceni" value="1" />1</label>
              <label><input type="radio" name="krvaceni" value="2" />2</label>
              <label><input type="radio" name="krvaceni" value="3" />3</label>
              <label><input type="radio" name="krvaceni" value="4" />4</label>
              <label><input type="radio" name="krvaceni" value="5" />5</label>
            </div>
          </div>

          <div>
            <label>Mood</label>
            <div class="segmented">
              <label><input type="radio" name="nalady" value="0" checked />0</label>
              <label><input type="radio" name="nalady" value="1" />1</label>
              <label><input type="radio" name="nalady" value="2" />2</label>
              <label><input type="radio" name="nalady" value="3" />3</label>
            </div>
          </div>

          <div>
            <label>Abdominal pressure</label>
            <div class="segmented">
              <label><input type="radio" name="tlak" value="0" checked />0</label>
              <label><input type="radio" name="tlak" value="1" />1</label>
              <label><input type="radio" name="tlak" value="2" />2</label>
              <label><input type="radio" name="tlak" value="3" />3</label>
            </div>
          </div>

          <div>
            <label>Bloating</label>
            <div class="segmented">
              <label><input type="radio" name="nadymani" value="0" checked />0</label>
              <label><input type="radio" name="nadymani" value="1" />1</label>
              <label><input type="radio" name="nadymani" value="2" />2</label>
              <label><input type="radio" name="nadymani" value="3" />3</label>
            </div>
          </div>

          <div>
            <label>Energy</label>
            <div class="segmented">
              <label><input type="radio" name="energie" value="0" checked />0</label>
              <label><input type="radio" name="energie" value="1" />1</label>
              <label><input type="radio" name="energie" value="2" />2</label>
              <label><input type="radio" name="energie" value="3" />3</label>
            </div>
          </div>
        </div>

        <label for="notes">Notes</label>
        <textarea id="notes" rows="3" placeholder="Optional notes..."></textarea>

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

addDate.value = todayLocalIsoDate();

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  addError.classList.add('hidden');
  addSubmit.disabled = true;
  addSubmit.textContent = 'Saving...';

  try {
    const formData = new FormData(addForm);
    const entry = normalizeEntry({
      date: addDate.value,
      krvaceni: String(formData.get('krvaceni') ?? '0'),
      nalady: String(formData.get('nalady') ?? '0'),
      tlak: String(formData.get('tlak') ?? '0'),
      nadymani: String(formData.get('nadymani') ?? '0'),
      energie: String(formData.get('energie') ?? '0'),
      notes: String(formData.get('notes') ?? '')
    });

    await saveEntry(entry);
    addForm.reset();
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

  entriesNode.innerHTML = entries
    .map(
      (entry) => `
        <article class="entry-card">
          <div class="entry-header">
            <strong>${escapeHtml(formatDate(entry.date))}</strong>
            <button type="button" class="delete-btn" data-date="${escapeHtml(entry.date)}">Delete</button>
          </div>
          <ul class="entry-metrics">
            <li>Bleeding: ${escapeHtml(entry.krvaceni)}</li>
            <li>Mood: ${escapeHtml(entry.nalady)}</li>
            <li>Pressure: ${escapeHtml(entry.tlak)}</li>
            <li>Bloating: ${escapeHtml(entry.nadymani)}</li>
            <li>Energy: ${escapeHtml(entry.energie)}</li>
          </ul>
          ${entry.notes ? `<p class="notes">${escapeHtml(entry.notes)}</p>` : ''}
        </article>
      `
    )
    .join('');

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
    <h3>Cycle prediction</h3>
    ${prediction ? `
      <p class="prediction-headline">${escapeHtml(daysUntilText)}</p>
      <p class="prediction-detail">
        Expected ${escapeHtml(formatDate(prediction.predictedStartDate))}
        &middot; average cycle ${prediction.stats.averageCycleLengthDays} days
        (${prediction.stats.minCycleLengthDays}-${prediction.stats.maxCycleLengthDays})
      </p>
      ${reliabilityNote}
    ` : ''}
    ${phaseBlock}
    <p class="prediction-disclaimer">
      Educational estimate only, not medical advice. Individual cycles vary.
    </p>
  `;
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

async function bootstrap(): Promise<void> {
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

