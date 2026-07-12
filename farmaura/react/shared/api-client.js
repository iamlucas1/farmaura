/*
shared/api-client.js

Shared authentication API client for Farmaura portals.

Responsibilities:
- perform login, refresh, logout, and session requests against the backend;
- persist tokens in sessionStorage or localStorage based on remember-session choice;
- retry authenticated requests once after refresh token rotation;

Observations:
- this client is transport-focused and keeps UI concerns out of fetch flows;
- secrets stay in browser storage only for the current portal namespace.
*/

(function attachApiClient(globalObject) {
  function resolveApiBase() {
    if (globalObject.FA_API_BASE) {
      return globalObject.FA_API_BASE;
    }
    if (globalObject.location && globalObject.location.protocol === 'file:') {
      return 'http://127.0.0.1:8080/api/v1';
    }
    if (globalObject.location && (globalObject.location.hostname === 'localhost' || globalObject.location.hostname === '127.0.0.1') && globalObject.location.port && globalObject.location.port !== '8080') {
      return 'http://127.0.0.1:8080/api/v1';
    }
    return '/api/v1';
  }

  const API_BASE = resolveApiBase();
  const API_ORIGIN = (() => {
    if (globalObject.FA_API_ORIGIN) {
      return globalObject.FA_API_ORIGIN;
    }
    if (API_BASE.indexOf("http://") === 0 || API_BASE.indexOf("https://") === 0) {
      return API_BASE.split("/api/v1")[0];
    }
    if (globalObject.location && globalObject.location.protocol === "file:") {
      return "http://127.0.0.1:8080";
    }
        if (globalObject.location && (globalObject.location.hostname === "localhost" || globalObject.location.hostname === "127.0.0.1") && globalObject.location.port && globalObject.location.port !== "8080") {
      return "http://127.0.0.1:8080";
    }
    return "";
  })();

  function keys(namespace) {
    return {
      local: namespace + '_auth_local',
      session: namespace + '_auth_session',
    };
  }

  function readStored(namespace) {
    const storageKeys = keys(namespace);
    try {
      const sessionValue = globalObject.sessionStorage.getItem(storageKeys.session);
      if (sessionValue) {
        return { rememberSession: false, data: JSON.parse(sessionValue) };
      }
      const localValue = globalObject.localStorage.getItem(storageKeys.local);
      if (localValue) {
        return { rememberSession: true, data: JSON.parse(localValue) };
      }
    } catch {}
    return { rememberSession: false, data: null };
  }

  function persistAuthState(namespace, data, rememberSession) {
    const storageKeys = keys(namespace);
    try {
      globalObject.localStorage.removeItem(storageKeys.local);
      globalObject.sessionStorage.removeItem(storageKeys.session);
      const serialized = JSON.stringify(data);
      if (rememberSession) {
        globalObject.localStorage.setItem(storageKeys.local, serialized);
      } else {
        globalObject.sessionStorage.setItem(storageKeys.session, serialized);
      }
    } catch {}
  }

  function clearAuthState(namespace) {
    const storageKeys = keys(namespace);
    try {
      globalObject.localStorage.removeItem(storageKeys.local);
      globalObject.sessionStorage.removeItem(storageKeys.session);
    } catch {}
  }

  async function rawRequest(path, options) {
    const response = await fetch(API_BASE + path, options);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(body && body.detail ? body.detail : 'Request failed.');
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function createClient(namespace) {
    async function refreshTokens(currentState) {
      if (!currentState || !currentState.refreshToken) {
        throw new Error('No refresh token available.');
      }
      const refreshed = await rawRequest('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: currentState.refreshToken }),
      });
      const nextState = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        subject: refreshed.subject,
      };
      persistAuthState(namespace, nextState, currentState.rememberSession);
      return { ...currentState, ...nextState };
    }

    async function authenticatedFetch(path, options) {
      const stored = readStored(namespace);
      if (!stored.data) {
        throw new Error('Not authenticated.');
      }
      const attempt = async (state) => {
        const headers = {
          ...(options && options.headers ? options.headers : {}),
          Authorization: 'Bearer ' + state.accessToken,
        };
        if (!headers['Content-Type'] && !(options && options.skipJsonContentType)) {
          headers['Content-Type'] = 'application/json';
        }
        return fetch(API_BASE + path, {
          ...(options || {}),
          headers,
        });
      };
      try {
        const response = await attempt({ ...stored.data, rememberSession: stored.rememberSession });
        if (response.status !== 401) {
          return response;
        }
        throw Object.assign(new Error('Unauthorized.'), { status: 401 });
      } catch (error) {
        if (error.status !== 401) {
          throw error;
        }
        try {
          const refreshedState = await refreshTokens({ ...stored.data, rememberSession: stored.rememberSession });
          return attempt(refreshedState);
        } catch (refreshError) {
          clearAuthState(namespace);
          const sessionError = new Error('Session expired.');
          sessionError.status = refreshError && refreshError.status ? refreshError.status : 401;
          sessionError.code = 'session_expired';
          sessionError.body = refreshError && refreshError.body ? refreshError.body : null;
          throw sessionError;
        }
      }
    }

    async function authenticatedRequest(path, options) {
      const response = await authenticatedFetch(path, options);
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        const error = new Error(body && body.detail ? body.detail : 'Request failed.');
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    }

    return {
      getStoredAuth() {
        const stored = readStored(namespace);
        return stored.data ? { ...stored.data, rememberSession: stored.rememberSession } : null;
      },
      async login(payload) {
        return rawRequest('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            portal: namespace,
          }),
        });
      },
      async verifyTwoFactor(payload) {
        return rawRequest('/auth/verify-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      },
      async beginTwoFactorSetup() {
        return authenticatedRequest('/auth/2fa/setup', {
          method: 'POST',
          body: JSON.stringify({}),
        });
      },
      async enableTwoFactor(code) {
        return authenticatedRequest('/auth/2fa/enable', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
      },
      async disableTwoFactor(code) {
        return authenticatedRequest('/auth/2fa/disable', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
      },
      async fetchSession() {
        return authenticatedRequest('/auth/session', { method: 'GET' });
      },
      async request(path, options) {
        return authenticatedRequest(path, options || {});
      },
      async publicRequest(path, options) {
        return rawRequest(path, options || {});
      },
      async download(path, options) {
        const response = await authenticatedFetch(path, { ...(options || {}), skipJsonContentType: true });
        if (!response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const body = contentType.includes('application/json') ? await response.json() : null;
          const error = new Error(body && body.detail ? body.detail : 'Request failed.');
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return {
          blob: await response.blob(),
          filename: response.headers.get('content-disposition') || '',
          contentType: response.headers.get('content-type') || '',
        };
      },
      async logout() {
        const stored = readStored(namespace);
        if (stored.data && stored.data.refreshToken) {
          try {
            await rawRequest('/auth/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: stored.data.refreshToken }),
            });
          } catch {}
        }
        clearAuthState(namespace);
      },
      async logoutAll() {
        try {
          await authenticatedRequest('/auth/logout-all', {
            method: 'POST',
            body: JSON.stringify({}),
          });
        } finally {
          clearAuthState(namespace);
        }
      },
      persistAuthenticatedFlow(flow, rememberSession) {
        if (!flow || !flow.token_pair) {
          return;
        }
        persistAuthState(namespace, {
          accessToken: flow.token_pair.access_token,
          refreshToken: flow.token_pair.refresh_token,
          subject: flow.token_pair.subject,
        }, rememberSession);
      },
      clear() {
        clearAuthState(namespace);
      },
    };
  }

  globalObject.FA_API = {
    createClient,
    base: API_BASE,
    origin: API_ORIGIN,
    staticBase: API_ORIGIN ? API_ORIGIN + "/static" : "/static",
  };
})(window);
