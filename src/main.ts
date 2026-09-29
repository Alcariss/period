import './styles/main.css';
import { APP_CONFIG, UI_CONFIG } from './config';
import { deleteEntry, fetchEntries, saveEntry } from './lib/api';
import { loadCache, saveCache } from './lib/cache';
import { cacheAgeText, escapeHtml, formatDate, todayLocalIsoDate } from './lib/format';
import { normalizeEntry } from './lib/entry-normalizer';
import { getCyclePhase, getPeriodSpanWarnings, listPeriodSpans, predictNextPeriod, summarizeEventsByPhase, summarizeEventsByMoonPhase } from './lib/cycle-predictor';
import type { EventMoonSummary, EventPhaseSummary } from './lib/cycle-predictor';
import { findOpenPeriod, hasNonPeriodData, isPeriodRecord, rangesOverlap, toPeriodClearedEntry, toPeriodEntry } from './lib/period-records';
import { CYCLE_EVENT_TYPES, hasEvent, toggleEvent } from './lib/cycle-events';
import type { CycleEventType } from './lib/cycle-events';
import { computeMoonPhase, moonPhaseMeta } from './lib/moon-phase';
import type { CyclePhaseName } from './lib/cycle-types';
import type { PeriodSpan } from './lib/cycle-types';
import type { Diagnostics, Entry, NewEntry } from './types';

const PERIOD_START_PHRASES = [
  'Be gentle with yourself these next few days. 💕',
  "You've got this — one day at a time.",
  'Rest when you need to, you deserve it.',
  'Comfort first. The rest can wait.',
  'Your body is doing important work — take it easy.',
  'A warm drink and a slow morning sound good right now.'
];

const PERIOD_END_PHRASES = [
  'Nice work — you made it through! 🌸',
  "Here's to feeling lighter and brighter.",
  'You showed up for yourself this cycle.',
  'Onward, with a little more energy each day.',
  'Well done taking care of yourself.',
  'Hope the next stretch feels easier.'
];

function randomPhrase(phrases: readonly string[]): string {
  const index = Math.floor(Math.random() * phrases.length);
  return phrases[index] ?? phrases[0] ?? '';
}

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
      <p id="period-status" class="period-status"></p>
      <label class="date-field">
        Date
        <input id="action-date" type="date" required />
      </label>
      <div class="period-actions">
        <button type="button" id="start-period">Start period</button>
        <button type="button" id="end-period" class="btn-end">End period</button>
      </div>
      <label id="period-notes-field" class="period-notes-field hidden">
        How did this period feel? (optional)
        <textarea id="period-notes" maxlength="200" rows="2"></textarea>
      </label>
      <div class="event-log">
        <p class="event-log-label">Log an event for this date</p>
        <div id="event-actions" class="event-actions"></div>
      </div>
      <p id="add-error" class="form-error hidden"></p>
    </section>

    <section id="event-analytics" class="prediction-card event-analytics hidden"></section>
    <section id="data-warnings" class="data-warnings hidden"></section>
    <section id="status"></section>
    <section id="entries"></section>
    <section id="debug" class="debug"></section>
  </main>
`;

const dataWarningsNode = requiredNode<HTMLElement>('#data-warnings');
const statusNode = requiredNode<HTMLElement>('#status');
const entriesNode = requiredNode<HTMLElement>('#entries');
const debugNode = requiredNode<HTMLElement>('#debug');
const predictionNode = requiredNode<HTMLElement>('#prediction');
const periodStatus = requiredNode<HTMLElement>('#period-status');
const actionDate = requiredNode<HTMLInputElement>('#action-date');
const startButton = requiredNode<HTMLButtonElement>('#start-period');
const endButton = requiredNode<HTMLButtonElement>('#end-period');
const periodNotesField = requiredNode<HTMLElement>('#period-notes-field');
const periodNotesInput = requiredNode<HTMLTextAreaElement>('#period-notes');
const eventActions = requiredNode<HTMLElement>('#event-actions');
const eventAnalyticsNode = requiredNode<HTMLElement>('#event-analytics');
const addError = requiredNode<HTMLElement>('#add-error');

actionDate.value = todayLocalIsoDate();

let latestEntries: Entry[] = [];

function showFormError(message: string): void {
  addError.textContent = message;
  addError.classList.remove('hidden');
}

function clearFormError(): void {
  addError.textContent = '';
  addError.classList.add('hidden');
}

function effectiveEnd(period: PeriodSpan): string {
  return period.endDate ?? period.startDate;
}

function assertNoOverlap(startDate: string, endDate: string, ignoreStart?: string): void {
  const overlapping = listPeriodSpans(latestEntries).find((period) => {
    if (ignoreStart && period.startDate === ignoreStart) {
      return false;
    }
    return rangesOverlap(startDate, endDate, period.startDate, effectiveEnd(period));
  });

  if (overlapping) {
    throw new Error('That date range overlaps another logged period.');
  }
}

async function persistPeriod(startDate: string, endDate: string | null, summary = ''): Promise<void> {
  const existing = entryForDate(startDate);
  const entry = normalizeEntry(toPeriodEntry(startDate, endDate, summary, existing));
  if (!entry.date) {
    throw new Error('A valid date is required.');
  }
  await saveEntry(entry);
}

// Removing a period must never drop unrelated data logged on those dates, so
// rows that still hold events, notes, or symptoms are cleared instead of deleted.
async function clearOrDeleteRow(entry: Entry): Promise<void> {
  if (hasNonPeriodData(entry)) {
    await saveEntry(normalizeEntry(toPeriodClearedEntry(entry)));
    return;
  }
  await deleteEntry(entry.date);
}

async function removePeriodRows(period: PeriodSpan): Promise<void> {
  const record = latestEntries.find((entry) => entry.date === period.startDate && isPeriodRecord(entry));
  if (record) {
    await clearOrDeleteRow(record);
    return;
  }

  const end = effectiveEnd(period);
  const bleedingRows = latestEntries
    .filter((entry) => entry.date >= period.startDate && entry.date <= end && Number.parseInt(entry.krvaceni, 10) > 0);

  for (const entry of bleedingRows) {
    await clearOrDeleteRow(entry);
  }
}

const MAX_BLEEDING_DAY_DOTS = 10;

function periodDayCount(period: PeriodSpan): number {
  const end = period.endDate ?? todayLocalIsoDate();
  const start = new Date(`${period.startDate}T00:00:00`);
  const finish = new Date(`${end}T00:00:00`);
  const days = Math.round((finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(days, 1);
}

function bleedingDayDotsHtml(dayCount: number): string {
  const visibleCount = Math.min(dayCount, MAX_BLEEDING_DAY_DOTS);
  const dots = Array.from({ length: visibleCount }, () => '<span class="bleeding-dot"></span>').join('');
  const overflow =
    dayCount > MAX_BLEEDING_DAY_DOTS ? `<span class="bleeding-dot-overflow">+${dayCount - MAX_BLEEDING_DAY_DOTS}</span>` : '';
  return `<span class="bleeding-dots" aria-label="${dayCount} day${dayCount === 1 ? '' : 's'} of bleeding">${dots}${overflow}</span>`;
}

function updateActionPanel(entries: Entry[]): void {
  const open = findOpenPeriod(listPeriodSpans(entries));
  startButton.disabled = Boolean(open);
  endButton.disabled = !open;
  periodNotesField.classList.toggle('hidden', !open);

  if (open) {
    const dayCount = periodDayCount(open);
    periodStatus.innerHTML = `Period in progress since ${escapeHtml(formatDate(open.startDate))}. ${bleedingDayDotsHtml(dayCount)}`;
  } else {
    periodStatus.textContent = 'No period in progress.';
    periodNotesInput.value = '';
  }
}

function entryForDate(date: string): Entry | undefined {
  return latestEntries.find((entry) => entry.date === date);
}

function isEmptyEntry(entry: Entry): boolean {
  return entry.krvaceni === '0'
    && entry.nalady === ''
    && entry.tlak === ''
    && entry.nadymani === ''
    && entry.energie === ''
    && entry.notes === ''
    && entry.periodStart === ''
    && entry.periodEnd === ''
    && entry.periodNotes === ''
    && entry.events === '';
}

function renderEventToggles(): void {
  const date = actionDate.value;
  const currentEvents = date ? (entryForDate(date)?.events ?? '') : '';

  eventActions.innerHTML = CYCLE_EVENT_TYPES.map((meta) => {
    const active = hasEvent(currentEvents, meta.id);
    const activeClass = active ? ' active' : '';
    return `<button type="button" class="event-toggle${activeClass}" data-event="${meta.id}"`
      + ` aria-pressed="${active}">${meta.emoji} ${escapeHtml(meta.label)}</button>`;
  }).join('');

  eventActions.querySelectorAll<HTMLButtonElement>('.event-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.event as CycleEventType | undefined;
      if (type) {
        void toggleEventForDate(type);
      }
    });
  });
}

async function toggleEventForDate(type: CycleEventType): Promise<void> {
  clearFormError();
  const date = actionDate.value;
  if (!date) {
    showFormError('A valid date is required.');
    return;
  }

  const existing = entryForDate(date);
  const nextEvents = toggleEvent(existing?.events ?? '', type);
  const base: NewEntry = existing ? { ...existing } : { date };
  const merged = normalizeEntry({ ...base, date, events: nextEvents });

  try {
    if (isEmptyEntry(merged)) {
      await deleteEntry(date);
    } else {
      await saveEntry(merged);
    }
    await refreshEntries();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'error');
  }
}

actionDate.addEventListener('change', renderEventToggles);

startButton.addEventListener('click', async () => {
  clearFormError();
  startButton.disabled = true;
  startButton.textContent = 'Saving...';

  try {
    const open = findOpenPeriod(listPeriodSpans(latestEntries));
    if (open) {
      throw new Error('End the current period before starting a new one.');
    }

    const startDate = actionDate.value;
    if (!startDate) {
      throw new Error('A valid date is required.');
    }

    assertNoOverlap(startDate, startDate);
    await persistPeriod(startDate, null);
    await refreshEntries();
    setStatus(randomPhrase(PERIOD_START_PHRASES), 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showFormError(message);
    updateActionPanel(latestEntries);
  } finally {
    startButton.textContent = 'Start period';
  }
});

endButton.addEventListener('click', async () => {
  clearFormError();
  endButton.disabled = true;
  endButton.textContent = 'Saving...';

  try {
    const open = findOpenPeriod(listPeriodSpans(latestEntries));
    if (!open) {
      throw new Error('No period is in progress.');
    }

    const endDate = actionDate.value;
    if (!endDate) {
      throw new Error('A valid date is required.');
    }

    if (endDate < open.startDate) {
      throw new Error('End date cannot be before the start date.');
    }

    assertNoOverlap(open.startDate, endDate, open.startDate);
    await persistPeriod(open.startDate, endDate, periodNotesInput.value.trim());
    actionDate.value = todayLocalIsoDate();
    periodNotesInput.value = '';
    await refreshEntries();
    setStatus(randomPhrase(PERIOD_END_PHRASES), 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showFormError(message);
    updateActionPanel(latestEntries);
  } finally {
    endButton.textContent = 'End period';
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

function durationText(period: PeriodSpan): string {
  const days = periodDayCount(period);
  const label = days === 1 ? '1 day' : `${days} days`;

  if (period.open) {
    return `${label} so far`;
  }

  if (period.endDateConfidence === 'inferred') {
    return `Started ${formatDate(period.startDate)}, last recorded ${formatDate(period.endDate ?? period.startDate)} (stop date not recorded)`;
  }

  return label;
}

function renderDataWarnings(entries: Entry[]): void {
  const warnings = getPeriodSpanWarnings(entries);
  if (warnings.length === 0) {
    dataWarningsNode.innerHTML = '';
    dataWarningsNode.classList.add('hidden');
    return;
  }

  dataWarningsNode.classList.remove('hidden');
  dataWarningsNode.innerHTML = warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join('');
}

function renderPeriods(entries: Entry[]): void {
  latestEntries = entries;
  updateActionPanel(entries);
  renderEventToggles();

  const periods = listPeriodSpans(entries).slice().reverse();
  if (periods.length === 0) {
    entriesNode.innerHTML = '<p class="empty">No periods yet. Tap Start period to log one.</p>';
    return;
  }

  entriesNode.innerHTML = periods
    .map((period) => {
      const range = period.open
        ? `${escapeHtml(formatDate(period.startDate))} – now`
        : `${escapeHtml(formatDate(period.startDate))} – ${escapeHtml(formatDate(period.endDate ?? period.startDate))}`;
      const openBadge = period.open ? '<span class="open-badge">In progress</span>' : '';

      return `
        <article class="entry-card" data-start="${escapeHtml(period.startDate)}">
          <div class="entry-view">
            <div class="entry-header">
              <strong>${range}</strong>
              <div class="entry-actions">
                <button type="button" class="edit-btn" data-start="${escapeHtml(period.startDate)}">Edit</button>
                <button type="button" class="delete-btn" data-start="${escapeHtml(period.startDate)}">Delete</button>
              </div>
            </div>
            <p class="period-range">${escapeHtml(durationText(period))} ${openBadge}</p>
            ${period.summary ? `<p class="period-summary">${escapeHtml(period.summary)}</p>` : ''}
          </div>
          <div class="entry-edit hidden">
            <label>
              Start
              <input type="date" class="edit-start" value="${escapeHtml(period.startDate)}" required />
            </label>
            <label>
              End
              <input type="date" class="edit-end" value="${escapeHtml(period.endDate ?? '')}" ${period.open ? '' : 'required'} />
            </label>
            <label>
              How did it feel? (optional)
              <textarea class="edit-summary" maxlength="200" rows="2">${escapeHtml(period.summary)}</textarea>
            </label>
            <div class="form-actions">
              <button type="button" class="btn-save" data-start="${escapeHtml(period.startDate)}">Save</button>
              <button type="button" class="btn-cancel" data-start="${escapeHtml(period.startDate)}">Cancel</button>
            </div>
            <p class="edit-error hidden"></p>
          </div>
        </article>
      `;
    })
    .join('');

  entriesNode.querySelectorAll<HTMLButtonElement>('.delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const start = button.dataset.start ?? '';
      const period = listPeriodSpans(latestEntries).find((item) => item.startDate === start);
      if (!period) return;

      try {
        await removePeriodRows(period);
        await refreshEntries();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, 'error');
      }
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.entry-card');
      card?.querySelector('.entry-view')?.classList.add('hidden');
      card?.querySelector('.entry-edit')?.classList.remove('hidden');
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.btn-cancel').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.entry-card');
      card?.querySelector('.entry-view')?.classList.remove('hidden');
      card?.querySelector('.entry-edit')?.classList.add('hidden');
      card?.querySelector('.edit-error')?.classList.add('hidden');
    });
  });

  entriesNode.querySelectorAll<HTMLButtonElement>('.btn-save').forEach((button) => {
    button.addEventListener('click', async () => {
      const originalStart = button.dataset.start ?? '';
      const card = button.closest('.entry-card');
      if (!originalStart || !card) return;

      const errorEl = card.querySelector<HTMLElement>('.edit-error');
      const startField = card.querySelector<HTMLInputElement>('.edit-start');
      const endField = card.querySelector<HTMLInputElement>('.edit-end');
      const summaryField = card.querySelector<HTMLTextAreaElement>('.edit-summary');
      if (!startField || !endField || !summaryField) return;

      button.disabled = true;
      button.textContent = 'Saving...';
      errorEl?.classList.add('hidden');

      try {
        const nextStart = startField.value;
        const nextEnd = endField.value.trim() === '' ? null : endField.value;
        const nextSummary = summaryField.value.trim();

        if (!nextStart) {
          throw new Error('A valid start date is required.');
        }

        if (nextEnd && nextEnd < nextStart) {
          throw new Error('End date cannot be before the start date.');
        }

        assertNoOverlap(nextStart, nextEnd ?? nextStart, originalStart);

        const original = listPeriodSpans(latestEntries).find((item) => item.startDate === originalStart);
        if (original) {
          await removePeriodRows(original);
        } else {
          const originalEntry = entryForDate(originalStart);
          if (originalEntry) {
            await clearOrDeleteRow(originalEntry);
          }
        }
        await persistPeriod(nextStart, nextEnd, nextSummary);
        await refreshEntries();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (errorEl) {
          errorEl.textContent = message;
          errorEl.classList.remove('hidden');
        }
        button.disabled = false;
        button.textContent = 'Save';
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

const PHASE_DISPLAY_ORDER: readonly CyclePhaseName[] = [
  'menstrual',
  'follicular',
  'ovulation',
  'luteal'
];

function renderEventSummary(summary: EventPhaseSummary, moonSummary?: EventMoonSummary): string {
  const meta = CYCLE_EVENT_TYPES.find((item) => item.id === summary.eventType);
  const label = meta ? `${meta.emoji} ${escapeHtml(meta.label)}` : escapeHtml(summary.eventType);
  const maxCount = Math.max(
    ...PHASE_DISPLAY_ORDER.map((phase) => summary.countsByPhase[phase]),
    1
  );

  const rows = PHASE_DISPLAY_ORDER.map((phase) => {
    const count = summary.countsByPhase[phase];
    const width = Math.round((count / maxCount) * 100);
    const topClass = phase === summary.topPhase && count > 0 ? ' top' : '';
    const phaseLabel = PHASE_LABELS[phase] ?? phase;
    return `
      <div class="event-phase-row${topClass}">
        <span class="event-phase-name">${escapeHtml(phaseLabel)}</span>
        <span class="event-phase-bar"><span class="event-phase-fill" style="width:${width}%"></span></span>
        <span class="event-phase-count">${count}</span>
      </div>
    `;
  }).join('');

  const topLabel = summary.topPhase ? PHASE_LABELS[summary.topPhase] ?? summary.topPhase : '';
  const headline = summary.topPhase
    ? `Most often during <strong>${escapeHtml(topLabel)}</strong>`
    : 'No clear pattern yet';

  const unknownLine = summary.unknownPhase > 0
    ? `<p class="event-unknown-line">${summary.unknownPhase} logged before your first recorded period,`
      + ' so no cycle phase is known.</p>'
    : '';

  const moonLine = moonSummary && moonSummary.topMoonPhase
    ? (() => {
        const moonMeta = moonPhaseMeta(moonSummary.topMoonPhase);
        return `<p class="event-moon-line">${moonMeta.emoji} Most on `
          + `<strong>${escapeHtml(moonMeta.label)}</strong> (${moonSummary.topCount})</p>`;
      })()
    : '';

  return `
    <article class="event-summary">
      <div class="event-summary-header">
        <span class="event-summary-label">${label}</span>
        <span class="event-summary-total">${summary.total} logged</span>
      </div>
      <p class="event-summary-headline">${headline}</p>
      ${moonLine}
      ${unknownLine}
      <div class="event-phase-rows">${rows}</div>
    </article>
  `;
}

function renderEventAnalytics(entries: Entry[]): void {
  const summaries = summarizeEventsByPhase(entries).filter((summary) => summary.total > 0);

  if (summaries.length === 0) {
    eventAnalyticsNode.innerHTML = '';
    eventAnalyticsNode.classList.add('hidden');
    return;
  }

  const moonSummaries = summarizeEventsByMoonPhase(entries);
  const moonByType = new Map(moonSummaries.map((summary) => [summary.eventType, summary]));

  eventAnalyticsNode.classList.remove('hidden');
  eventAnalyticsNode.innerHTML = `
    <h3>Events by cycle phase</h3>
    <p class="event-analytics-sub">Which cycle and moon phase you were in when each event happened.</p>
    <div class="event-summary-list">${summaries
      .map((summary) => renderEventSummary(summary, moonByType.get(summary.eventType)))
      .join('')}</div>
  `;
}

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

  const moon = computeMoonPhase(now);
  const moonChip = `<span class="moon-chip" title="Moon phase in Prague">`
    + `${moon.emoji} ${escapeHtml(moon.label)}</span>`;

  const phaseBlock = phaseInfo
    ? `
      <div class="phase-block">
        <p class="phase-label">${escapeHtml(PHASE_LABELS[phaseInfo.phase] ?? phaseInfo.phase)} (cycle day ${phaseInfo.cycleDay}) ${moonChip}</p>
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
      <p>Each period is a start date and an optional end date. Next period is estimated from the
      average length of your last logged cycles. Ovulation is estimated 14 days before that date,
      because the luteal phase stays fairly constant while the follicular phase is what varies.</p>
      <p>Older daily bleeding logs still count as periods, so existing history is included.</p>
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
    renderPeriods(entries);
    renderPrediction(entries);
    renderEventAnalytics(entries);
    renderDataWarnings(entries);
    setStatus('Entries loaded.', 'success');
    renderDebug(diagnostics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cached = loadCache();

    if (cached && cached.entries.length > 0) {
      setStatus('Offline mode. Showing cached entries.', 'error');
      renderPeriods(cached.entries);
      renderPrediction(cached.entries);
      renderEventAnalytics(cached.entries);
      renderDataWarnings(cached.entries);
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
    renderPeriods(cached.entries);
    renderPrediction(cached.entries);
    renderEventAnalytics(cached.entries);
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
