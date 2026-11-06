const DEFAULT_CAPACITY = 250;
const DEFAULT_HEARTBEAT_MS = 15_000;
const MAX_EVENT_BYTES = 64 * 1024;
const REDACTED = '[REDACTED]';

const sensitiveKey = /(?:^|_)(?:api_?key|authorization|cookie|credential|password|private_?key|refresh_?token|secret|session_?token|token)(?:$|_)/i;
const secretValue = /(?:bearer\s+[a-z0-9._~+/=-]{12,}|\bsk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/gi;

function identifier(value, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new TypeError(`${name} ist ungültig`);
  }
  return value;
}

function redactString(value) {
  return value.replace(secretValue, REDACTED);
}

export function redactLiveEvent(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new TypeError('Zyklische Eventdaten sind nicht erlaubt');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => redactLiveEvent(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = sensitiveKey.test(key) ? REDACTED : redactLiveEvent(item, seen);
  }
  seen.delete(value);
  return result;
}

function normalizeEvent(input, sequence, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Event muss ein Objekt sein');
  const event = redactLiveEvent(input);
  event.userId = identifier(event.userId, 'userId');
  event.worldId = identifier(event.worldId, 'worldId');
  event.type = identifier(event.type, 'type').toUpperCase();
  if (event.eventId !== undefined) event.eventId = identifier(event.eventId, 'eventId');
  if (event.traceId !== undefined) event.traceId = identifier(event.traceId, 'traceId');
  event.sequence = sequence;
  event.createdAt = typeof event.createdAt === 'string' && Number.isFinite(Date.parse(event.createdAt))
    ? new Date(event.createdAt).toISOString()
    : new Date(now).toISOString();
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > MAX_EVENT_BYTES) throw new RangeError('Event überschreitet 64 KiB');
  return Object.freeze(event);
}

function matches(subscription, event) {
  return subscription.userId === event.userId && (!subscription.worldIds || subscription.worldIds.has(event.worldId));
}

export function formatSseMessage(message) {
  if (message.kind === 'heartbeat') return `: heartbeat ${message.sequence} ${message.createdAt}\n\n`;
  return `id: ${message.sequence}\nevent: ${message.type.toLowerCase()}\ndata: ${JSON.stringify(message)}\n\n`;
}

export function createLiveEventBus(options = {}) {
  const capacity = Number.isInteger(options.capacity) && options.capacity > 0 ? options.capacity : DEFAULT_CAPACITY;
  const heartbeatMs = Number.isFinite(options.heartbeatMs) && options.heartbeatMs > 0 ? options.heartbeatMs : DEFAULT_HEARTBEAT_MS;
  const clock = options.clock || Date.now;
  const startInterval = options.setIntervalFn || setInterval;
  const stopInterval = options.clearIntervalFn || clearInterval;
  const buffer = [];
  const subscribers = new Map();
  let sequence = 0;
  let subscriberId = 0;
  let heartbeatTimer = null;

  function remove(id) {
    const removed = subscribers.delete(id);
    if (removed && subscribers.size === 0 && heartbeatTimer !== null) {
      stopInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    return removed;
  }

  function safeDeliver(subscription, kind, value) {
    try {
      if (kind === 'event') subscription.onEvent(value);
      else subscription.onHeartbeat?.(value);
      return true;
    } catch (error) {
      remove(subscription.id);
      subscription.onError?.(error);
      return false;
    }
  }

  function heartbeat() {
    const message = Object.freeze({ kind: 'heartbeat', sequence, createdAt: new Date(clock()).toISOString() });
    for (const subscription of [...subscribers.values()]) safeDeliver(subscription, 'heartbeat', message);
  }

  function ensureHeartbeat() {
    if (heartbeatTimer === null) heartbeatTimer = startInterval(heartbeat, heartbeatMs);
  }

  function publish(input) {
    const event = normalizeEvent(input, sequence + 1, clock());
    sequence = event.sequence;
    buffer.push(event);
    if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity);
    for (const subscription of [...subscribers.values()]) {
      if (matches(subscription, event)) safeDeliver(subscription, 'event', event);
    }
    return event;
  }

  function subscribe({ userId, worldIds, since = 0, onEvent, onHeartbeat, onError } = {}) {
    identifier(userId, 'userId');
    if (typeof onEvent !== 'function') throw new TypeError('onEvent muss eine Funktion sein');
    if (!Number.isInteger(since) || since < 0) throw new TypeError('since muss eine nichtnegative Ganzzahl sein');
    const worlds = worldIds === undefined || worldIds === null
      ? null
      : new Set([...worldIds].map((worldId) => identifier(worldId, 'worldId')));
    const id = ++subscriberId;
    const subscription = { id, userId, worldIds: worlds, onEvent, onHeartbeat, onError };
    subscribers.set(id, subscription);
    ensureHeartbeat();
    for (const event of buffer) {
      if (!subscribers.has(id)) break;
      if (event.sequence > since && matches(subscription, event)) safeDeliver(subscription, 'event', event);
    }
    let active = subscribers.has(id);
    return Object.freeze({
      id,
      unsubscribe() {
        if (!active) return false;
        active = false;
        return remove(id);
      },
    });
  }

  function close() {
    subscribers.clear();
    if (heartbeatTimer !== null) stopInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  return Object.freeze({
    publish,
    subscribe,
    close,
    replay({ userId, worldIds, since = 0 } = {}) {
      identifier(userId, 'userId');
      const subscription = { userId, worldIds: worldIds == null ? null : new Set([...worldIds].map((id) => identifier(id, 'worldId'))) };
      return buffer.filter((event) => event.sequence > since && matches(subscription, event));
    },
    stats() {
      return Object.freeze({ sequence, buffered: buffer.length, subscribers: subscribers.size, capacity });
    },
  });
}
