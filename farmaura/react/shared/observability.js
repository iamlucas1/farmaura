/*
shared/observability.js

Frontend observability helpers for Farmaura portals.

Responsibilities:
- emit normalized frontend logs for navigation, actions, and failures;
- persist a bounded local trail for inspection during development;
- correlate browser-side events with a stable session identifier;

Observations:
- browser logs are supplemental and must never replace backend enforcement;
- payloads are intentionally compact and avoid secrets or raw sensitive form data;
*/

(function attachObservability(globalObject) {
  const STORAGE_KEY = 'fa_observability_events';
  const SESSION_KEY = 'fa_observability_session_id';
  const MAX_EVENTS = 400;

  function nowIso() {
    return new Date().toISOString();
  }

  function getSessionId() {
    try {
      const existing = globalObject.sessionStorage.getItem(SESSION_KEY);
      if (existing) {
        return existing;
      }
      const created = (globalObject.crypto && globalObject.crypto.randomUUID)
        ? globalObject.crypto.randomUUID()
        : String(Date.now());
      globalObject.sessionStorage.setItem(SESSION_KEY, created);
      return created;
    } catch {
      return String(Date.now());
    }
  }

  function readTrail() {
    try {
      const raw = globalObject.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeTrail(events) {
    try {
      globalObject.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    } catch {}
  }

  function buildEvent(input) {
    const source = input || {};
    return {
      id: (globalObject.crypto && globalObject.crypto.randomUUID)
        ? globalObject.crypto.randomUUID()
        : String(Date.now() + Math.random()),
      at: nowIso(),
      sessionId: getSessionId(),
      portal: source.portal || 'unknown',
      type: source.type || 'info',
      action: source.action || 'unknown',
      route: source.route || '',
      userRole: source.userRole || '',
      accessScope: source.accessScope || '',
      detail: source.detail || '',
      metadata: source.metadata || {},
    };
  }

  function emit(input) {
    const event = buildEvent(input);
    const nextTrail = [...readTrail(), event];
    writeTrail(nextTrail);
    try {
      console.info('[FA_OBS]', event);
    } catch {}
    return event;
  }

  function deriveClickableLabel(target) {
    if (!target) {
      return '';
    }
    const label = target.getAttribute('aria-label')
      || target.getAttribute('title')
      || target.textContent
      || target.id
      || target.className
      || '';
    return String(label).trim().slice(0, 120);
  }

  function initPortal(config) {
    const portal = config && config.portal ? config.portal : 'unknown';
    const getRoute = config && config.getRoute ? config.getRoute : function getRouteFallback() { return ''; };
    const getUser = config && config.getUser ? config.getUser : function getUserFallback() { return null; };
    if (globalObject.__faObsInitialized && globalObject.__faObsInitialized[portal]) {
      return;
    }
    globalObject.__faObsInitialized = globalObject.__faObsInitialized || {};
    globalObject.__faObsInitialized[portal] = true;

    emit({ portal, type: 'session', action: 'portal.initialized', route: getRoute() });

    globalObject.addEventListener('error', function onError(event) {
      emit({
        portal,
        type: 'error',
        action: 'window.error',
        route: getRoute(),
        userRole: getUser() && getUser().role || '',
        accessScope: getUser() && getUser().accessScope || '',
        detail: event.message || 'Unhandled error',
        metadata: {
          filename: event.filename || '',
          lineno: event.lineno || 0,
          colno: event.colno || 0,
        },
      });
    });

    globalObject.addEventListener('unhandledrejection', function onUnhandledRejection(event) {
      emit({
        portal,
        type: 'error',
        action: 'window.unhandledrejection',
        route: getRoute(),
        userRole: getUser() && getUser().role || '',
        accessScope: getUser() && getUser().accessScope || '',
        detail: String(event.reason || 'Unhandled promise rejection'),
      });
    });

    globalObject.document.addEventListener('click', function onClick(event) {
      const target = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
      if (!target) {
        return;
      }
      emit({
        portal,
        type: 'ui',
        action: 'ui.click',
        route: getRoute(),
        userRole: getUser() && getUser().role || '',
        accessScope: getUser() && getUser().accessScope || '',
        detail: deriveClickableLabel(target),
        metadata: {
          tag: target.tagName || '',
        },
      });
    }, true);

    globalObject.document.addEventListener('visibilitychange', function onVisibilityChange() {
      emit({
        portal,
        type: 'lifecycle',
        action: 'document.visibility',
        route: getRoute(),
        detail: globalObject.document.visibilityState,
      });
    });
  }

  globalObject.FA_OBS = {
    emit,
    getTrail: readTrail,
    initPortal,
  };
})(window);
