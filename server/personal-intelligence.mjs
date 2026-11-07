import { createHash } from 'node:crypto';

const DAY_MS = 86_400_000;

function asDate(value) {
  if (value == null || String(value).trim() === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finite(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const sorted = [...values.filter(Number.isFinite)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function percentChange(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function sourceRef(event) {
  return {
    source: event.source,
    externalId: event.externalId ?? null,
    occurredAt: event.occurredAt,
  };
}

function safeText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function localDateKey(date, timeZone) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    throw new TypeError('timeZone must be a valid IANA timezone');
  }
}

function localHour(date, timeZone) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
  } catch {
    return null;
  }
}

export function normalizePersonalEvent(input) {
  if (!input || typeof input !== 'object') throw new TypeError('event must be an object');
  const occurredAt = asDate(input.occurredAt ?? input.startAt);
  if (!occurredAt) throw new TypeError('event.occurredAt must be a valid timestamp');
  const userId = safeText(input.userId, 128);
  const source = safeText(input.source, 80);
  const kind = safeText(input.kind, 80);
  if (!userId || !source || !kind) {
    throw new TypeError('event requires userId, source and kind');
  }
  if (input.provenance?.importedAt != null && !asDate(input.provenance.importedAt)) {
    throw new TypeError('event.provenance.importedAt must be a valid timestamp');
  }
  const inputMetrics = input.metrics && typeof input.metrics === 'object' && !Array.isArray(input.metrics) ? input.metrics : {};
  const metrics = input.metric == null ? inputMetrics : {
    ...inputMetrics,
    name: inputMetrics.name ?? safeText(input.metric, 100),
    value: inputMetrics.value ?? input.value,
    unit: inputMetrics.unit ?? input.unit,
  };

  return Object.freeze({
    userId,
    source,
    kind,
    externalId: input.externalId == null ? null : safeText(input.externalId, 256),
    occurredAt: occurredAt.toISOString(),
    title: safeText(input.title, 240),
    metrics: Object.freeze({ ...metrics }),
    tags: Object.freeze((Array.isArray(input.tags) ? input.tags : []).slice(0, 40).map((tag) => safeText(tag, 80)).filter(Boolean)),
    sensitivity: safeText(input.sensitivity, 40) || (kind.startsWith('health.') || source.startsWith('health.') || source === 'apple_health' || source === 'whoop' ? 'health' : 'personal'),
    provenance: Object.freeze({
      importedAt: asDate(input.provenance?.importedAt)?.toISOString() ?? new Date().toISOString(),
      connectorId: safeText(input.provenance?.connectorId ?? source, 128),
      rawRecordHash: input.provenance?.rawRecordHash == null ? null : safeText(input.provenance.rawRecordHash, 128),
    }),
  });
}

export function deduplicatePersonalEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = event.externalId
      ? `${event.userId}|${event.source}|${event.externalId}`
      : event.provenance?.rawRecordHash
        ? `${event.userId}|${event.source}|${event.provenance.rawRecordHash}`
        : createHash('sha256').update(JSON.stringify(stableValue({
          userId: event.userId, source: event.source, kind: event.kind, occurredAt: event.occurredAt,
          title: event.title, metrics: event.metrics, tags: event.tags,
        }))).digest('hex');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMailSignals(events, now) {
  const since = now.getTime() - DAY_MS;
  const mail = events.filter((event) => {
    const occurredAt = new Date(event.occurredAt).getTime();
    return event.kind === 'mail.message' && occurredAt >= since && occurredAt <= now.getTime();
  });
  const fromPeople = mail.filter((event) => event.tags.includes('person'));
  const needsReply = fromPeople.filter((event) => event.tags.includes('needs-reply'));
  const urgent = mail.filter((event) => event.tags.includes('urgent'));
  if (!mail.length) return [];

  return [{
    id: 'mail.daily-triage',
    domain: 'mail',
    severity: urgent.length ? 'attention' : 'info',
    title: urgent.length ? `${urgent.length} dringende Nachricht${urgent.length === 1 ? '' : 'en'}` : 'Posteingang ausgewertet',
    summary: `${mail.length} neue Nachrichten; ${fromPeople.length} von Personen; ${needsReply.length} benötigen wahrscheinlich eine Antwort.`,
    actions: needsReply.length ? [{ type: 'open-filter', target: 'mail:needs-reply', label: 'Antworten vorbereiten' }] : [],
    evidence: mail.slice(0, 20).map(sourceRef),
    confidence: 0.82,
  }];
}

function buildCalendarSignals(events, now) {
  const end = now.getTime() + DAY_MS;
  const meetings = events
    .filter((event) => event.kind === 'calendar.event')
    .filter((event) => {
      const start = new Date(event.occurredAt).getTime();
      return start >= now.getTime() && start <= end;
    })
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));

  if (!meetings.length) return [];
  let conflicts = 0;
  let occupiedUntil = new Date(meetings[0].metrics?.endAt ?? meetings[0].occurredAt).getTime();
  for (let index = 1; index < meetings.length; index += 1) {
    const start = new Date(meetings[index].occurredAt).getTime();
    const endAt = new Date(meetings[index].metrics?.endAt ?? meetings[index].occurredAt).getTime();
    if (start < occupiedUntil) conflicts += 1;
    occupiedUntil = Math.max(occupiedUntil, Number.isFinite(endAt) ? endAt : start);
  }
  const minutes = meetings.reduce((sum, event) => sum + Math.max(0, finite(event.metrics?.durationMinutes) ?? 0), 0);

  return [{
    id: 'calendar.next-24h',
    domain: 'calendar',
    severity: conflicts ? 'attention' : 'info',
    title: `${meetings.length} Termin${meetings.length === 1 ? '' : 'e'} in den nächsten 24 Stunden`,
    summary: `${Math.round(minutes / 60 * 10) / 10} Stunden geplant${conflicts ? `; ${conflicts} Überschneidung${conflicts === 1 ? '' : 'en'}` : ''}.`,
    actions: conflicts ? [{ type: 'open-calendar', target: 'calendar:conflicts', label: 'Konflikte prüfen' }] : [],
    evidence: meetings.slice(0, 20).map(sourceRef),
    confidence: 0.98,
  }];
}

function metricSeries(events, metricNames, source, now, convert = (value) => value) {
  const health = events
    .filter((event) => event.kind === 'health.metric' && event.source === source && metricNames.includes(event.metrics?.name))
    .map((event) => ({ event, time: new Date(event.occurredAt).getTime(), value: convert(finite(event.metrics?.value), event.metrics?.name) }))
    .filter((entry) => Number.isFinite(entry.value));
  const recent = health.filter((entry) => entry.time >= now.getTime() - 7 * DAY_MS && entry.time <= now.getTime());
  const baseline = health.filter((entry) => entry.time >= now.getTime() - 35 * DAY_MS && entry.time < now.getTime() - 7 * DAY_MS);
  return { recent, baseline };
}

function buildHealthSignals(events, now) {
  const definitions = [
    { names: ['sleep_duration_hours', 'sleep_minutes'], label: 'Schlafdauer', lowerAttention: -12, convert: (value, name) => name === 'sleep_minutes' ? value / 60 : value },
    { names: ['hrv_ms', 'hrv_sdnn_ms', 'hrv_rmssd_ms'], label: 'HRV', lowerAttention: -15 },
    { names: ['resting_heart_rate_bpm'], label: 'Ruhepuls', upperAttention: 10 },
    { names: ['recovery_score', 'recovery_score_percent'], label: 'Erholung', lowerAttention: -15 },
  ];
  const changes = [];

  for (const definition of definitions) {
    const sources = [...new Set(events.filter((event) => event.kind === 'health.metric' && definition.names.includes(event.metrics?.name)).map((event) => event.source))];
    for (const source of sources) {
      const { recent, baseline } = metricSeries(events, definition.names, source, now, definition.convert);
      if (recent.length < 2 || baseline.length < 4) continue;
      const recentValue = median(recent.map((entry) => entry.value));
      const baselineValue = median(baseline.map((entry) => entry.value));
      const change = percentChange(recentValue, baselineValue);
      const attention = (definition.lowerAttention != null && change <= definition.lowerAttention)
        || (definition.upperAttention != null && change >= definition.upperAttention);
      changes.push({ ...definition, source, recent, baseline, recentValue, baselineValue, change, attention });
    }
  }

  if (!changes.length) return [];
  const attention = changes.filter((change) => change.attention);
  const evidence = changes.flatMap((change) => change.recent.slice(-7).map((entry) => sourceRef(entry.event)));
  const summary = changes
    .map((change) => `${change.label} (${change.source}): ${change.change >= 0 ? '+' : ''}${Math.round(change.change)} % gegenüber persönlicher Basis`)
    .join('; ');

  return [{
    id: 'health.weekly-pattern',
    domain: 'health',
    severity: attention.length ? 'attention' : 'info',
    title: attention.length ? 'Körpermuster hat sich verändert' : 'Gesundheitsmuster stabil',
    summary,
    disclaimer: 'Nur persönlicher Verlaufshinweis, keine medizinische Diagnose. Bei Beschwerden oder Sorge medizinischen Rat einholen.',
    actions: [{ type: 'open-health', target: 'health:trends', label: 'Verlauf und Quellen ansehen' }],
    evidence,
    confidence: Math.min(0.94, 0.55 + evidence.length / 100),
  }];
}

function buildCrossDomainSignals(signals, events, now) {
  const healthAttention = signals.find((signal) => signal.id === 'health.weekly-pattern' && signal.severity === 'attention');
  const calendar = signals.find((signal) => signal.id === 'calendar.next-24h');
  if (!healthAttention || !calendar) return [];
  const meetings = events.filter((event) => event.kind === 'calendar.event'
    && new Date(event.occurredAt).getTime() >= now.getTime()
    && new Date(event.occurredAt).getTime() <= now.getTime() + DAY_MS);
  const scheduledMinutes = meetings.reduce((sum, event) => sum + (finite(event.metrics?.durationMinutes) ?? 0), 0);
  if (scheduledMinutes < 240) return [];

  return [{
    id: 'cross.recovery-schedule',
    domain: 'planning',
    severity: 'attention',
    title: 'Hohe Terminlast trifft auf verändertes Körpermuster',
    summary: 'Prüfe freiwillig Pausen, Prioritäten oder verschiebbare Termine. AgentOne ändert nichts ohne deine Freigabe.',
    disclaimer: 'Planungshinweis aus deinen eigenen Daten, keine medizinische Bewertung.',
    actions: [{ type: 'draft-plan', target: 'calendar:recovery-buffer', label: 'Entlasteten Tagesplan entwerfen' }],
    evidence: [...healthAttention.evidence, ...calendar.evidence],
    confidence: Math.min(healthAttention.confidence, calendar.confidence),
  }];
}

function fingerprint(signal, userId, dateKey) {
  const evidenceKeys = signal.evidence.map((item) => `${item.source}:${item.externalId ?? item.occurredAt}`).sort();
  return createHash('sha256')
    .update(JSON.stringify([userId, dateKey, signal.id, signal.severity, evidenceKeys]))
    .digest('hex');
}

export function buildPersonalBrief({ userId, events, now = new Date(), timeZone = 'Europe/Berlin' }) {
  const current = asDate(now);
  if (!current) throw new TypeError('now must be a valid timestamp');
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const normalizedUserId = safeText(userId, 128);
  if (!normalizedUserId) throw new TypeError('userId is required');
  const normalized = deduplicatePersonalEvents(events.map((event) => normalizePersonalEvent(event)))
    .filter((event) => event.userId === normalizedUserId);
  const baseSignals = [
    ...buildMailSignals(normalized, current),
    ...buildCalendarSignals(normalized, current),
    ...buildHealthSignals(normalized, current),
  ];
  const signals = [...baseSignals, ...buildCrossDomainSignals(baseSignals, normalized, current)];
  const dateKey = localDateKey(current, timeZone);

  return {
    generatedAt: current.toISOString(),
    userId: normalizedUserId,
    eventCount: normalized.length,
    signals: signals.map((signal) => ({ ...signal, notificationKey: fingerprint(signal, normalizedUserId, dateKey) })),
    summary: {
      attention: signals.filter((signal) => signal.severity === 'attention').length,
      informational: signals.filter((signal) => signal.severity === 'info').length,
    },
  };
}

export function shouldNotify(signal, { deliveredKeys = new Set(), quietHours = { start: 22, end: 7 }, now = new Date(), timeZone = 'Europe/Berlin' } = {}) {
  if (!signal || deliveredKeys.has(signal.notificationKey)) return false;
  if (signal.severity !== 'attention') return false;
  const date = asDate(now);
  const start = Number(quietHours?.start), end = Number(quietHours?.end);
  if (!date || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 0 || end > 23) return false;
  const hour = localHour(date, timeZone);
  if (!Number.isInteger(hour)) return false;
  const inQuietHours = start > end
    ? hour >= start || hour < end
    : hour >= start && hour < end;
  return !inQuietHours;
}

export const personalIntelligenceInternals = Object.freeze({ average, median, percentChange });
