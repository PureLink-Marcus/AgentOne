import { randomUUID } from 'node:crypto';

const CHANNELS = new Set(['in-app', 'pwa', 'ntfy', 'telegram']);
const SIGNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const KEY = /^[A-Za-z0-9_-]{16,128}$/;

function pulseError(message, code = 'PERSONAL_PULSE_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function validUserId(value) {
  const userId = String(value ?? '').trim();
  if (!SIGNAL_ID.test(userId)) throw pulseError('userId ist ungültig');
  return userId;
}

function dateParts(date, timeZone) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  } catch {
    throw pulseError('timeZone ist ungültig');
  }
}

function localState(now, timeZone) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw pulseError('now ist ungültig');
  const parts = dateParts(date, timeZone);
  return {
    date,
    localDay: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function quietWindow(value) {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) throw pulseError('quietHours ist ungültig');
  const numbers = match.slice(1).map(Number);
  if (numbers[0] > 23 || numbers[2] > 23 || numbers[1] > 59 || numbers[3] > 59) throw pulseError('quietHours ist ungültig');
  return { start: numbers[0] * 60 + numbers[1], end: numbers[2] * 60 + numbers[3] };
}

function isQuiet(minuteOfDay, quietHours) {
  const { start, end } = quietWindow(quietHours);
  if (start === end) return false;
  return start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end;
}

function normalizeChannelList(values, { includeInApp = false } = {}) {
  const list = Array.isArray(values) ? values.map(String) : [];
  if (includeInApp && !list.includes('in-app')) list.unshift('in-app');
  const result = [...new Set(list)];
  if (result.some((channel) => !CHANNELS.has(channel))) throw pulseError('Unbekannter Pulse-Kanal');
  return result;
}

function normalizeSignal(signal, index) {
  if (!signal || typeof signal !== 'object') throw pulseError(`signals[${index}] ist ungültig`);
  const id = String(signal.id ?? '').trim();
  const notificationKey = String(signal.notificationKey ?? '').trim();
  if (!SIGNAL_ID.test(id)) throw pulseError(`signals[${index}].id ist ungültig`);
  if (!KEY.test(notificationKey)) throw pulseError(`signals[${index}].notificationKey ist ungültig`);
  const severity = signal.severity === 'attention' ? 'attention' : 'info';
  return { ...signal, id, notificationKey, severity };
}

export function initPersonalPulseStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_pulse_delivery(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      signal_id TEXT NOT NULL,
      notification_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      local_day TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      UNIQUE(user_id,notification_key,channel)
    );
    CREATE INDEX IF NOT EXISTS personal_pulse_delivery_user_day
      ON personal_pulse_delivery(user_id,local_day,delivered_at DESC);
  `);
}

export function planPersonalPulse(db, {
  userId,
  signals = [],
  channels = ['in-app'],
  externalOptIn = [],
  now = new Date(),
  timeZone = 'Europe/Berlin',
  quietHours = '22:00-07:00',
  dailyLimit = 3,
} = {}) {
  const owner = validUserId(userId);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10) throw pulseError('dailyLimit muss zwischen 1 und 10 liegen');
  if (!Array.isArray(signals) || signals.length > 100) throw pulseError('signals ist ungültig');
  const local = localState(now, timeZone);
  const quietNow = isQuiet(local.minuteOfDay, quietHours);
  const requested = normalizeChannelList(channels, { includeInApp: true });
  const optedIn = new Set(normalizeChannelList(externalOptIn));
  const allowedChannels = requested.filter((channel) => channel === 'in-app' || (!quietNow && optedIn.has(channel)));
  const deliveredToday = Number(db.prepare('SELECT COUNT(DISTINCT notification_key) AS count FROM personal_pulse_delivery WHERE user_id=? AND local_day=?').get(owner, local.localDay)?.count ?? 0);
  const remaining = Math.max(0, dailyLimit - deliveredToday);
  const alreadyInApp = new Set(db.prepare("SELECT notification_key AS notificationKey FROM personal_pulse_delivery WHERE user_id=? AND channel='in-app'").all(owner).map((row) => row.notificationKey));
  const seen = new Set();
  const normalized = signals.map(normalizeSignal).filter((signal) => {
    if (seen.has(signal.notificationKey) || alreadyInApp.has(signal.notificationKey)) return false;
    seen.add(signal.notificationKey);
    return true;
  });
  const ranked = normalized.map((signal, index) => ({ signal, index }))
    .sort((a, b) => (b.signal.severity === 'attention') - (a.signal.severity === 'attention') || a.index - b.index)
    .slice(0, remaining)
    .map(({ signal }) => ({ ...signal, channels: [...allowedChannels] }));
  return {
    generatedAt: local.date.toISOString(),
    localDay: local.localDay,
    quietNow,
    dailyLimit,
    deliveredToday,
    remainingAfterPlan: Math.max(0, remaining - ranked.length),
    channels: allowedChannels,
    items: ranked,
  };
}

export function recordPersonalPulseDelivery(db, {
  id = randomUUID(),
  userId,
  signalId,
  notificationKey,
  channel = 'in-app',
  externalOptIn = [],
  now = new Date(),
  timeZone = 'Europe/Berlin',
} = {}) {
  const owner = validUserId(userId);
  const normalizedSignalId = String(signalId ?? '').trim();
  const key = String(notificationKey ?? '').trim();
  const normalizedChannel = String(channel ?? '');
  if (!SIGNAL_ID.test(String(id)) || !SIGNAL_ID.test(normalizedSignalId) || !KEY.test(key)) throw pulseError('Pulse-Zustellung ist ungültig');
  normalizeChannelList([normalizedChannel]);
  if (normalizedChannel !== 'in-app' && !normalizeChannelList(externalOptIn).includes(normalizedChannel)) throw pulseError('Externer Kanal ist nicht freigegeben', 'PERSONAL_PULSE_CHANNEL_NOT_OPTED_IN', 403);
  const local = localState(now, timeZone);
  const result = db.prepare('INSERT OR IGNORE INTO personal_pulse_delivery(id,user_id,signal_id,notification_key,channel,local_day,delivered_at) VALUES(?,?,?,?,?,?,?)')
    .run(String(id), owner, normalizedSignalId, key, normalizedChannel, local.localDay, local.date.toISOString());
  return { delivered: result.changes === 1, signalId: normalizedSignalId, notificationKey: key, channel: normalizedChannel, deliveredAt: local.date.toISOString() };
}

export function listPersonalPulseDeliveries(db, userId, { limit = 100 } = {}) {
  const owner = validUserId(userId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw pulseError('limit ist ungültig');
  return db.prepare('SELECT id,signal_id AS signalId,notification_key AS notificationKey,channel,local_day AS localDay,delivered_at AS deliveredAt FROM personal_pulse_delivery WHERE user_id=? ORDER BY delivered_at DESC LIMIT ?').all(owner, limit);
}

export function resetPersonalPulseDeliveries(db, { userId, confirmation } = {}) {
  const owner = validUserId(userId);
  if (confirmation !== 'RESET_MY_PULSE') throw pulseError('Explizite Bestätigung fehlt', 'PERSONAL_PULSE_CONFIRMATION_REQUIRED', 409);
  const result = db.prepare('DELETE FROM personal_pulse_delivery WHERE user_id=?').run(owner);
  return { userId: owner, deleted: Number(result.changes) };
}

export const personalPulseInternals = Object.freeze({ isQuiet, localState });
