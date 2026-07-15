/**
 * Stable item id (docs/architecture/01-profile-engine.md): generated once,
 * never reused. Documents reference items by id; connectors upsert by id;
 * deltas patch by id. `globalThis.crypto` exists in Node 20+ and every
 * browser, so the same helper serves server code and the editor.
 */
export function createItemId(): string {
  return crypto.randomUUID();
}
