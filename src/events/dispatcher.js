/**
 * 🔔 Domain Event Dispatcher — in-process pub/sub bus.
 *
 * Entities publish domain events (e.g. "order.paid"); features subscribe and react.
 * Handlers run asynchronously and in isolation: a handler that is slow or throws
 * can never block or fail the request that emitted the event, and one feature's
 * failure never affects another.
 */
import { EventEmitter } from 'events';

// The bus is pinned on globalThis (Symbol.for = process-wide registry), NOT held
// as a module-local. ESM gives one instance PER MODULE IDENTITY — and this file is
// imported both statically (subscribers) and dynamically (routes), where a path
// spelling difference (upper/lower drive letter on Windows, symlink, specifier
// casing) yields TWO module instances. A module-local bus then splits: publishers
// emit on one emitter, subscribers listen on another, and every event is silently
// dropped — no email, no calendar, no error. Pinning survives any number of
// module identities: same process ⇒ same bus.
const BUS_KEY = Symbol.for('forgx.domainEventBus');
const bus = globalThis[BUS_KEY] || (globalThis[BUS_KEY] = new EventEmitter());
bus.setMaxListeners(200);

/**
 * Publish a domain event. Called from entity routes after a successful DB change.
 * Fires "<entity>.<action>" and, for transitions, also "<entity>.<toState>".
 * @param {string} entity    e.g. "order"
 * @param {string} action    "created" | "updated" | "deleted" | "transition"
 * @param {string} tenantId
 * @param {object} [data]
 */
export function publishDomainEvent(entity, action, tenantId, data = {}) {
  const payload = { entity, action, tenantId, data, at: new Date().toISOString() };
  _emit(entity + '.' + action, payload);
  if (action === 'transition' && data && typeof data.to === 'string') {
    _emit(entity + '.' + data.to, payload);
  }
}

function _emit(name, payload) {
  // Fire-and-forget: never block the caller; isolate every handler's errors.
  for (const handler of bus.listeners(name)) {
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error('[event:' + name + '] handler error:', err && err.message));
  }
}

/**
 * Subscribe a handler to a domain event. Returns an unsubscribe function.
 * @param {string} eventName  e.g. "order.paid"
 * @param {(payload:object)=>any} handler
 */
export function subscribe(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  bus.on(eventName, handler);
  return () => bus.off(eventName, handler);
}

export function listSubscribedEvents() {
  return bus.eventNames();
}
