/*
shared/google-identity.js

Thin wrapper over Google Identity Services (GIS) for "Entrar com Google" —
marketplace only, never the internal console.

Responsibilities:
- wait for the GIS script (loaded async/defer in marketplace.html) to be ready;
- render the official Google button into a caller-provided container;
- hand the resulting ID token (a JWT signed by Google) back to the caller.

Observations:
- the ID token is verified server-side (app/core/google_identity.py) — this
  module never decodes or trusts it, just relays it to the backend;
- no client secret is involved in this flow, so nothing here is sensitive.
*/

(function attachGoogleIdentity(globalObject) {
  function waitForGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
      const ready = () => globalObject.google && globalObject.google.accounts && globalObject.google.accounts.id;
      if (ready()) {
        resolve(globalObject.google.accounts.id);
        return;
      }
      const startedAt = Date.now();
      const timer = globalObject.setInterval(() => {
        if (ready()) {
          globalObject.clearInterval(timer);
          resolve(globalObject.google.accounts.id);
        } else if (Date.now() - startedAt > 10000) {
          globalObject.clearInterval(timer);
          reject(new Error('Não foi possível carregar o login do Google agora.'));
        }
      }, 100);
    });
  }

  /**
   * Render the "Entrar com Google" button into `container`.
   * options: { clientId, onCredential(idToken), onError(error), text }
   * Returns the initialized `google.accounts.id` client, or null on failure.
   */
  async function renderGoogleButton(container, options) {
    const { clientId, onCredential, onError, text } = options || {};
    if (!container || !clientId) {
      return null;
    }
    container.innerHTML = '';
    try {
      const accountsId = await waitForGoogleIdentityServices();
      accountsId.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response && response.credential) {
            onCredential(response.credential);
          } else if (onError) {
            onError(new Error('O Google não retornou uma credencial válida.'));
          }
        },
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
      accountsId.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: Math.min(container.clientWidth || 320, 400),
        text: text || 'continue_with',
        locale: 'pt-BR',
      });
      return accountsId;
    } catch (error) {
      if (onError) {
        onError(error);
      }
      return null;
    }
  }

  globalObject.FA_GOOGLE_IDENTITY = { renderGoogleButton };
})(window);
