/*
shared/portal-cache.js

Scoped cache helpers for Farmaura portal clients.

Responsibilities:
- derive deterministic cache keys per portal, tenant, and user;
- read and write JSON snapshots safely from browser storage;
- prevent cross-account leakage when local caches are reused.

Observations:
- server data remains authoritative and cached snapshots are only a client-side optimization;
- guest data is isolated from authenticated customer and internal sessions.
*/

(function attachPortalCache(globalObject) {
  function buildScope(portal, actor) {
    const tenantId = actor && actor.tenantId ? String(actor.tenantId) : 'public';
    const userId = actor && actor.id ? String(actor.id) : 'guest';
    return [String(portal || 'shared'), tenantId, userId].join(':');
  }

  function buildKey(portal, actor, name) {
    return ['fa', buildScope(portal, actor), String(name || 'cache')].join(':');
  }

  function readJson(storageObject, key, fallbackValue) {
    try {
      const rawValue = storageObject.getItem(key);
      if (!rawValue) {
        return fallbackValue;
      }
      return JSON.parse(rawValue);
    } catch {
      return fallbackValue;
    }
  }

  function writeJson(storageObject, key, value) {
    try {
      storageObject.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function remove(storageObject, key) {
    try {
      storageObject.removeItem(key);
    } catch {}
  }

  globalObject.FA_PORTAL_CACHE = {
    buildScope,
    buildKey,
    readLocal(portal, actor, name, fallbackValue) {
      return readJson(globalObject.localStorage, buildKey(portal, actor, name), fallbackValue);
    },
    writeLocal(portal, actor, name, value) {
      writeJson(globalObject.localStorage, buildKey(portal, actor, name), value);
    },
    removeLocal(portal, actor, name) {
      remove(globalObject.localStorage, buildKey(portal, actor, name));
    },
    readSession(portal, actor, name, fallbackValue) {
      return readJson(globalObject.sessionStorage, buildKey(portal, actor, name), fallbackValue);
    },
    writeSession(portal, actor, name, value) {
      writeJson(globalObject.sessionStorage, buildKey(portal, actor, name), value);
    },
    removeSession(portal, actor, name) {
      remove(globalObject.sessionStorage, buildKey(portal, actor, name));
    },
  };
})(window);
