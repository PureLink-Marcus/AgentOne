import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const APPLE_TYPES = new Map([
  ['HKQuantityTypeIdentifierStepCount', ['steps', 'count', 'sum']],
  ['HKQuantityTypeIdentifierActiveEnergyBurned', ['active_energy_kcal', 'kcal', 'sum']],
  ['HKQuantityTypeIdentifierDistanceWalkingRunning', ['walking_running_distance_m', 'm', 'sum']],
  ['HKQuantityTypeIdentifierHeartRate', ['heart_rate_bpm', 'bpm', 'average']],
  ['HKQuantityTypeIdentifierRestingHeartRate', ['resting_heart_rate_bpm', 'bpm', 'average']],
  ['HKQuantityTypeIdentifierHeartRateVariabilitySDNN', ['hrv_sdnn_ms', 'ms', 'average']],
  ['HKQuantityTypeIdentifierRespiratoryRate', ['respiratory_rate_per_minute', 'count/min', 'average']],
  ['HKQuantityTypeIdentifierOxygenSaturation', ['oxygen_saturation_percent', '%', 'average']],
  ['HKQuantityTypeIdentifierBodyMass', ['body_mass_kg', 'kg', 'average']],
  ['HKQuantityTypeIdentifierBodyTemperature', ['body_temperature_celsius', 'degC', 'average']],
  ['HKQuantityTypeIdentifierAppleExerciseTime', ['exercise_minutes', 'min', 'sum']],
]);

const SUM_METRICS = new Set(['steps', 'active_energy_kcal', 'walking_running_distance_m', 'exercise_minutes', 'sleep_minutes', 'workout_minutes']);
const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v2';
const WHOOP_SCOPES = Object.freeze(['offline', 'read:cycles', 'read:recovery', 'read:sleep', 'read:workout', 'read:body_measurement']);
const MAX_APPLE_IMPORT_BYTES = 32 * 1024 * 1024;
const HEALTH_CONSENT_SCOPES = Object.freeze(['activity', 'sleep', 'vitals', 'body', 'workouts']);
const HEALTH_METRIC_SCOPES = new Map([
  ['steps', ['activity']],
  ['active_energy_kcal', ['activity']],
  ['walking_running_distance_m', ['activity']],
  ['exercise_minutes', ['activity']],
  ['strain_score', ['activity']],
  ['sleep_minutes', ['sleep']],
  ['sleep_performance_percent', ['sleep']],
  ['sleep_consistency_percent', ['sleep']],
  ['sleep_efficiency_percent', ['sleep']],
  ['heart_rate_bpm', ['vitals']],
  ['resting_heart_rate_bpm', ['vitals']],
  ['hrv_sdnn_ms', ['vitals']],
  ['hrv_rmssd_ms', ['vitals']],
  ['respiratory_rate_per_minute', ['vitals']],
  ['oxygen_saturation_percent', ['vitals']],
  ['body_temperature_celsius', ['vitals']],
  ['skin_temperature_celsius', ['vitals']],
  ['recovery_score_percent', ['vitals']],
  ['body_mass_kg', ['body']],
  ['workout_minutes', ['workouts']],
]);
const SCOPE_EXCLUDED = Symbol('health-scope-excluded');

function healthError(message, code = 'HEALTH_INPUT_INVALID') {
  return Object.assign(new Error(message), { code, status: 400 });
}

function safeText(value, max = 180) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function stableId(parts) {
  return createHash('sha256').update(parts.map((value) => String(value ?? '')).join('\u001f')).digest('hex');
}

function parseOffset(value) {
  const match = String(value ?? '').match(/(?:^|\s)([+-])(\d{2}):?(\d{2})(?:$|\s)/);
  if (!match) return undefined;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function isoDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const apple = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{2}):?(\d{2})$/);
  const normalized = apple ? `${apple[1]}-${apple[2]}-${apple[3]}T${apple[4]}:${apple[5]}:${apple[6]}${apple[7]}:${apple[8]}` : text;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw healthError('Ungültiger Gesundheitszeitstempel');
  return date.toISOString();
}

function durationMinutes(start, end) {
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  return Number.isFinite(value) && value >= 0 ? round(value, 3) : undefined;
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlAttributes(fragment) {
  const result = {};
  for (const match of String(fragment).matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function requireConsent(consent, provider) {
  if (!consent || typeof consent !== 'object') throw healthError('Eine ausdrückliche Gesundheitsfreigabe fehlt', 'HEALTH_CONSENT_REQUIRED');
  if (consent.revokedAt) throw healthError('Die Gesundheitsfreigabe wurde widerrufen', 'HEALTH_CONSENT_REVOKED');
  if (consent.expiresAt && Date.parse(consent.expiresAt) <= Date.now()) throw healthError('Die Gesundheitsfreigabe ist abgelaufen', 'HEALTH_CONSENT_EXPIRED');
  if (!consent.providers?.includes(provider)) throw healthError(`Die Freigabe umfasst ${provider} nicht`, 'HEALTH_CONSENT_SCOPE');
  if (!Array.isArray(consent.scopes) || !consent.scopes.some((scope) => HEALTH_CONSENT_SCOPES.includes(scope))) throw healthError('Die Gesundheitsfreigabe umfasst keinen erlaubten Datenbereich', 'HEALTH_CONSENT_SCOPE');
  return consent;
}

function metricAllowedByConsent(consent, metricName, originalType) {
  const required = metricName === 'strain_score' && originalType === 'workout' ? ['workouts'] : HEALTH_METRIC_SCOPES.get(metricName);
  return Boolean(required?.some((scope) => consent.scopes.includes(scope)));
}

export function createHealthConsent(input = {}) {
  const providers = [...new Set((input.providers ?? []).map((value) => safeText(value, 40)).filter((value) => ['apple_health', 'whoop'].includes(value)))];
  const scopes = [...new Set((input.scopes ?? []).map((value) => safeText(value, 80)).filter((value) => HEALTH_CONSENT_SCOPES.includes(value)))];
  if (!safeText(input.userId) || !providers.length || !scopes.length) throw healthError('Benutzer, Anbieter und Datenbereiche sind für die Freigabe erforderlich');
  const grantedAt = isoDate(input.grantedAt ?? new Date().toISOString());
  const expiresAt = input.expiresAt ? isoDate(input.expiresAt) : undefined;
  if (expiresAt && expiresAt <= grantedAt) throw healthError('Das Freigabeende muss nach dem Freigabebeginn liegen');
  return Object.freeze({
    id: safeText(input.id || stableId([input.userId, grantedAt, providers.join(','), scopes.join(',')]), 128),
    userId: safeText(input.userId, 128), providers, scopes, grantedAt, expiresAt,
    purpose: safeText(input.purpose || 'Persönliche Trend- und Planungsanalyse', 240),
    revokedAt: input.revokedAt ? isoDate(input.revokedAt) : undefined,
  });
}

function metric({ provider, sourceRecordId, metric, value, unit, startAt, endAt, offsetMinutes, aggregation = 'average', dimensions = {}, consent, receivedAt, originalType }) {
  if (!Number.isFinite(value) || !metric || !startAt) return undefined;
  if (!metricAllowedByConsent(consent, metric, originalType)) return { [SCOPE_EXCLUDED]: true, metric };
  const normalizedEnd = endAt || startAt;
  const id = stableId([provider, sourceRecordId, metric, startAt, normalizedEnd, round(value), unit, JSON.stringify(dimensions)]);
  return {
    id, source: provider, sourceRecordId: safeText(sourceRecordId || id, 180), metric,
    value: round(value), unit, aggregation, startAt, endAt: normalizedEnd,
    timezoneOffsetMinutes: Number.isFinite(offsetMinutes) ? offsetMinutes : undefined,
    dimensions, sensitivity: 'health', interpretation: 'descriptive_not_medical',
    provenance: { provider, originalType: safeText(originalType, 120), consentId: consent.id, receivedAt: isoDate(receivedAt ?? new Date().toISOString()) },
  };
}

function convertAppleValue(value, sourceUnit, targetUnit) {
  let number = finite(value);
  if (number === undefined) return undefined;
  const unit = String(sourceUnit ?? '').toLowerCase();
  if (targetUnit === 'kcal' && unit === 'kj') number *= 0.239005736;
  if (targetUnit === 'm' && unit === 'km') number *= 1000;
  if (targetUnit === 'm' && ['mi', 'mile'].includes(unit)) number *= 1609.344;
  if (targetUnit === 'kg' && ['lb', 'lbs'].includes(unit)) number *= 0.45359237;
  if (targetUnit === 'degC' && ['degf', '°f'].includes(unit)) number = (number - 32) * 5 / 9;
  if (targetUnit === '%' && number >= 0 && number <= 1) number *= 100;
  return number;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function extractAppleXmlFromZip(buffer, maxBytes) {
  const minimum = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0) throw healthError('Ungültiges Apple-Health-ZIP: Verzeichnis fehlt');
  const disk = buffer.readUInt16LE(eocd + 4), entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12), directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || entries > 256 || directoryOffset + directorySize > buffer.length) throw healthError('Mehrteilige oder übergroße ZIP-Datei wird nicht unterstützt');
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw healthError('Beschädigtes ZIP-Verzeichnis');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10), expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20), uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42), name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!/(^|\/)export\.xml$/i.test(name)) continue;
    if (name.includes('../') || name.startsWith('/') || (flags & 1)) throw healthError('Unsicherer oder verschlüsselter ZIP-Eintrag');
    if (![0, 8].includes(method) || uncompressedSize > maxBytes || compressedSize > maxBytes || (compressedSize && uncompressedSize / compressedSize > 250)) throw healthError('Apple-Health-ZIP überschreitet Sicherheitsgrenzen');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw healthError('ZIP-Lokaleintrag fehlt');
    const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > buffer.length) throw healthError('ZIP-Daten sind unvollständig');
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: maxBytes });
    if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) throw healthError('ZIP-Prüfsumme stimmt nicht');
    return output.toString('utf8');
  }
  throw healthError('Apple-Health-ZIP enthält keine export.xml');
}

export function extractAppleHealthXml(input, { maxBytes = MAX_APPLE_IMPORT_BYTES } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input ?? ''), 'utf8');
  if (!buffer.length || buffer.length > maxBytes) throw healthError('Apple-Health-Datei fehlt oder ist zu groß');
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return extractAppleXmlFromZip(buffer, maxBytes);
  return buffer.toString('utf8');
}

export function importAppleHealth(input, { consent, receivedAt, maxRecords = 250_000, maxBytes } = {}) {
  requireConsent(consent, 'apple_health');
  const xml = extractAppleHealthXml(input, { maxBytes });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw healthError('XML-Dokumenttypen und Entitäten sind nicht zulässig');
  const metrics = [], excludedMetricTypes = new Set();
  let excludedByConsent = 0;
  const collect = (item) => { if (item?.[SCOPE_EXCLUDED]) { excludedByConsent += 1; excludedMetricTypes.add(item.metric); } else if (item) metrics.push(item); };
  let seen = 0;
  for (const match of xml.matchAll(/<Record\b([^>]*?)(?:\/>|>[\s\S]*?<\/Record>)/g)) {
    if (++seen > maxRecords) throw healthError('Apple-Health-Export enthält zu viele Datensätze');
    const attrs = xmlAttributes(match[1]);
    const startAt = isoDate(attrs.startDate), endAt = isoDate(attrs.endDate || attrs.startDate), offsetMinutes = parseOffset(attrs.startDate);
    const sourceRecordId = attrs.uuid || stableId([attrs.type, attrs.sourceName, attrs.startDate, attrs.endDate, attrs.value, attrs.unit]);
    if (attrs.type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const minutes = durationMinutes(startAt, endAt), stage = safeText(String(attrs.value || '').replace(/^HKCategoryValueSleepAnalysis/, '').toLowerCase() || 'unknown', 40);
      const item = metric({ provider: 'apple_health', sourceRecordId, metric: 'sleep_minutes', value: minutes, unit: 'min', startAt, endAt, offsetMinutes, aggregation: 'sum', dimensions: { stage }, consent, receivedAt, originalType: attrs.type });
      collect(item);
      continue;
    }
    const mapping = APPLE_TYPES.get(attrs.type);
    if (!mapping) continue;
    const [name, unit, aggregation] = mapping, value = convertAppleValue(attrs.value, attrs.unit, unit);
    const item = metric({ provider: 'apple_health', sourceRecordId, metric: name, value, unit, startAt, endAt, offsetMinutes, aggregation, consent, receivedAt, originalType: attrs.type });
    collect(item);
  }
  for (const match of xml.matchAll(/<Workout\b([^>]*?)(?:\/>|>[\s\S]*?<\/Workout>)/g)) {
    if (++seen > maxRecords) throw healthError('Apple-Health-Export enthält zu viele Datensätze');
    const attrs = xmlAttributes(match[1]), startAt = isoDate(attrs.startDate), endAt = isoDate(attrs.endDate || attrs.startDate), offsetMinutes = parseOffset(attrs.startDate);
    const sourceRecordId = attrs.uuid || stableId(['workout', attrs.workoutActivityType, attrs.startDate, attrs.endDate]);
    const minutes = finite(attrs.duration) ?? durationMinutes(startAt, endAt);
    const workout = metric({ provider: 'apple_health', sourceRecordId, metric: 'workout_minutes', value: minutes, unit: 'min', startAt, endAt, offsetMinutes, aggregation: 'sum', dimensions: { sport: safeText(String(attrs.workoutActivityType || '').replace(/^HKWorkoutActivityType/, '').toLowerCase(), 80) }, consent, receivedAt, originalType: 'Workout' });
    collect(workout);
  }
  const unique = [...new Map(metrics.map((item) => [item.id, item])).values()];
  return { provider: 'apple_health', importedAt: isoDate(receivedAt ?? new Date().toISOString()), recordsSeen: seen, metrics: unique, duplicatesRemoved: metrics.length - unique.length, ignoredRecords: Math.max(0, seen - metrics.length - excludedByConsent), excludedByConsent: { count: excludedByConsent, metricTypes: [...excludedMetricTypes].sort() } };
}

function whoopMetric(payload, name, value, unit, consent, receivedAt, options = {}) {
  const sourceRecordId = safeText(options.sourceRecordId ?? payload.id ?? payload.sleep_id ?? payload.cycle_id, 180);
  const startAt = isoDate(options.startAt ?? payload.start ?? payload.created_at ?? payload.updated_at);
  const endAt = isoDate(options.endAt ?? payload.end ?? options.startAt ?? payload.start ?? payload.created_at ?? payload.updated_at);
  return metric({ provider: 'whoop', sourceRecordId, metric: name, value: finite(value), unit, startAt, endAt, offsetMinutes: parseOffset(payload.timezone_offset), aggregation: options.aggregation ?? (SUM_METRICS.has(name) ? 'sum' : 'average'), dimensions: options.dimensions, consent, receivedAt, originalType: options.originalType });
}

export function normalizeWhoopBundle(bundle = {}, { consent, receivedAt } = {}) {
  requireConsent(consent, 'whoop');
  const metrics = [], excludedMetricTypes = new Set();
  let excludedByConsent = 0;
  const add = (item) => { if (item?.[SCOPE_EXCLUDED]) { excludedByConsent += 1; excludedMetricTypes.add(item.metric); } else if (item) metrics.push(item); };
  for (const cycle of bundle.cycles ?? []) {
    add(whoopMetric(cycle, 'steps', cycle.step_count, 'count', consent, receivedAt, { aggregation: 'sum', originalType: 'cycle' }));
    if (cycle.score_state === 'SCORED') {
      add(whoopMetric(cycle, 'strain_score', cycle.score?.strain, 'score', consent, receivedAt, { originalType: 'cycle' }));
      add(whoopMetric(cycle, 'active_energy_kcal', finite(cycle.score?.kilojoule) * 0.239005736, 'kcal', consent, receivedAt, { aggregation: 'sum', originalType: 'cycle' }));
      add(whoopMetric(cycle, 'heart_rate_bpm', cycle.score?.average_heart_rate, 'bpm', consent, receivedAt, { originalType: 'cycle', dimensions: { statistic: 'average' } }));
    }
  }
  for (const recovery of bundle.recoveries ?? []) if (recovery.score_state === 'SCORED') {
    const values = [['recovery_score_percent', recovery.score?.recovery_score, '%'], ['resting_heart_rate_bpm', recovery.score?.resting_heart_rate, 'bpm'], ['hrv_rmssd_ms', recovery.score?.hrv_rmssd_milli, 'ms'], ['oxygen_saturation_percent', recovery.score?.spo2_percentage, '%'], ['skin_temperature_celsius', recovery.score?.skin_temp_celsius, 'degC']];
    for (const [name, value, unit] of values) add(whoopMetric(recovery, name, value, unit, consent, receivedAt, { sourceRecordId: `${recovery.sleep_id}:${name}`, originalType: 'recovery' }));
  }
  for (const sleep of bundle.sleeps ?? []) if (sleep.score_state === 'SCORED') {
    const stage = sleep.score?.stage_summary ?? {}, total = [stage.total_light_sleep_time_milli, stage.total_slow_wave_sleep_time_milli, stage.total_rem_sleep_time_milli].map(finite).filter((value) => value !== undefined).reduce((sum, value) => sum + value, 0);
    add(whoopMetric(sleep, 'sleep_minutes', total / 60_000, 'min', consent, receivedAt, { aggregation: 'sum', originalType: 'sleep', dimensions: { nap: Boolean(sleep.nap) } }));
    for (const [name, value, unit] of [['sleep_performance_percent', sleep.score?.sleep_performance_percentage, '%'], ['sleep_consistency_percent', sleep.score?.sleep_consistency_percentage, '%'], ['sleep_efficiency_percent', sleep.score?.sleep_efficiency_percentage, '%'], ['respiratory_rate_per_minute', sleep.score?.respiratory_rate, 'count/min']]) add(whoopMetric(sleep, name, value, unit, consent, receivedAt, { originalType: 'sleep' }));
  }
  for (const workout of bundle.workouts ?? []) {
    add(whoopMetric(workout, 'workout_minutes', durationMinutes(workout.start, workout.end), 'min', consent, receivedAt, { aggregation: 'sum', originalType: 'workout', dimensions: { sport: safeText(workout.sport_name, 80) } }));
    if (workout.score_state === 'SCORED') add(whoopMetric(workout, 'strain_score', workout.score?.strain, 'score', consent, receivedAt, { originalType: 'workout', dimensions: { sport: safeText(workout.sport_name, 80) } }));
  }
  if (bundle.bodyMeasurement) {
    const body = bundle.bodyMeasurement, timestamp = receivedAt ?? new Date().toISOString();
    add(whoopMetric({ id: 'body', created_at: timestamp }, 'body_mass_kg', body.weight_kilogram, 'kg', consent, receivedAt, { originalType: 'body_measurement' }));
  }
  const unique = [...new Map(metrics.map((item) => [item.id, item])).values()];
  return { provider: 'whoop', importedAt: isoDate(receivedAt ?? new Date().toISOString()), metrics: unique, duplicatesRemoved: metrics.length - unique.length, excludedByConsent: { count: excludedByConsent, metricTypes: [...excludedMetricTypes].sort() } };
}

export function createWhoopAuthorizationUrl({ clientId, redirectUri, state, scopes = WHOOP_SCOPES } = {}) {
  if (!safeText(clientId) || !/^https:\/\//i.test(String(redirectUri ?? '')) || !/^[A-Za-z0-9_-]{8,128}$/.test(String(state ?? ''))) throw healthError('WHOOP OAuth benötigt Client-ID, HTTPS-Redirect und sicheren State');
  const allowed = scopes.filter((scope) => WHOOP_SCOPES.includes(scope));
  if (!allowed.length) throw healthError('WHOOP OAuth benötigt mindestens einen erlaubten Scope');
  const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', redirectUri); url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', allowed.join(' ')); url.searchParams.set('state', state);
  return url.toString();
}

export function createWhoopReadPlan({ start, end, nextToken } = {}) {
  const query = new URLSearchParams({ limit: '25' });
  if (start) query.set('start', isoDate(start)); if (end) query.set('end', isoDate(end)); if (nextToken) query.set('nextToken', safeText(nextToken, 500));
  return ['cycle', 'activity/sleep', 'recovery', 'activity/workout'].map((path) => `${WHOOP_BASE}/${path}?${query}`);
}

export function verifyWhoopWebhook({ rawBody, signature, timestamp, secret, now = Date.now(), toleranceMs = 5 * 60_000 } = {}) {
  if (!rawBody || !signature || !timestamp || !secret) return false;
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(now - numericTimestamp) > toleranceMs) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`).digest('base64');
  const actualBuffer = Buffer.from(String(signature)), expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function dailyValues(metrics) {
  const grouped = new Map();
  for (const item of metrics) {
    if (!item?.startAt || !Number.isFinite(item.value)) continue;
    const key = `${item.startAt.slice(0, 10)}|${item.source}|${item.metric}`;
    const bucket = grouped.get(key) ?? { date: item.startAt.slice(0, 10), source: item.source, metric: item.metric, unit: item.unit, values: [], aggregation: item.aggregation };
    bucket.values.push(item.value); grouped.set(key, bucket);
  }
  return [...grouped.values()].map((item) => ({ ...item, value: round(item.aggregation === 'sum' ? item.values.reduce((sum, value) => sum + value, 0) : item.values.reduce((sum, value) => sum + value, 0) / item.values.length), values: undefined }));
}

export function compareHealthSources(metrics = []) {
  const daily = dailyValues(metrics), byKey = new Map();
  for (const item of daily) {
    const key = `${item.date}|${item.metric}`, rows = byKey.get(key) ?? [];
    rows.push(item); byKey.set(key, rows);
  }
  const comparisons = [];
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue;
    const [date, name] = key.split('|'), apple = rows.find((row) => row.source === 'apple_health'), whoop = rows.find((row) => row.source === 'whoop');
    if (!apple || !whoop || apple.unit !== whoop.unit) continue;
    const baseline = Math.max(Math.abs(apple.value), Math.abs(whoop.value), 1);
    comparisons.push({ date, metric: name, unit: apple.unit, appleHealth: apple.value, whoop: whoop.value, absoluteDifference: round(apple.value - whoop.value), relativeDifferencePercent: round(Math.abs(apple.value - whoop.value) / baseline * 100, 2), interpretation: 'measurement_comparison_not_medical' });
  }
  return { daily, comparisons, sources: [...new Set(metrics.map((item) => item.source))], generatedAt: new Date().toISOString() };
}

export function buildHealthDigest(metrics = [], { now = new Date() } = {}) {
  const comparison = compareHealthSources(metrics), cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  const recent = comparison.daily.filter((item) => new Date(`${item.date}T00:00:00Z`) >= cutoff);
  const coverage = Object.fromEntries([...new Set(metrics.map((item) => item.source))].map((source) => [source, new Set(recent.filter((item) => item.source === source).map((item) => item.date)).size]));
  const notices = [];
  const highDifferences = comparison.comparisons.filter((item) => item.relativeDifferencePercent >= 20);
  if (highDifferences.length) notices.push({ kind: 'source_difference', title: 'Messquellen weichen voneinander ab', count: highDifferences.length, action: 'Quellen, Tragezeiten und Zeitzonen prüfen', medicalAdvice: false });
  if (Object.values(coverage).some((days) => days < 3)) notices.push({ kind: 'coverage', title: 'Noch zu wenig Daten für belastbare Muster', action: 'Weitere Tage synchronisieren', medicalAdvice: false });
  return { periodDays: 14, coverageDaysBySource: coverage, notices, comparison, disclaimer: 'Nur deskriptive Trends. Keine Diagnose oder Therapieempfehlung.' };
}

export const healthConnectorCapabilities = Object.freeze({
  appleHealth: { mode: 'import-live-persistent_companion-prepared', directImportMaxBytes: MAX_APPLE_IMPORT_BYTES, maxImportBytes: 512 * 1024 * 1024, largeArchiveMode: 'persistent-encrypted-worker', inputs: ['Apple Health export.xml', 'Apple Health export.zip'], nativeSyncRequires: ['iOS Companion App', 'HealthKit capability', 'per-type user consent'] },
  whoop: { mode: 'oauth-prepared', apiVersion: 'v2', scopes: WHOOP_SCOPES, webhooks: ['recovery.updated', 'recovery.deleted', 'sleep.updated', 'sleep.deleted', 'workout.updated', 'workout.deleted'] },
});
