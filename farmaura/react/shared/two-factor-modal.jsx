/*
farmaura/react/shared/two-factor-modal.jsx

Shared authenticator-based two-factor modal for Farmaura portals.

Responsibilities:
- provision a new authenticator enrollment for the current session;
- render QR-code-first enrollment with manual fallback for authenticator apps;
- verify activation and deactivation codes through shared callbacks.

Observations:
- setup is limited to authenticator applications and intentionally excludes SMS;
- the modal expects authenticated transport callbacks from the host portal.
*/

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Modal } from "../marketplace/core/marketplace-components.jsx";
import { Icon } from "../marketplace/core/marketplace-icons.jsx";


function QrCodePanel({ value, accountName }) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    if (!value) {
      setQrCodeDataUrl("");
      setQrError("");
      return;
    }

    let active = true;
    setQrError("");
    setQrCodeDataUrl("");

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 224,
      color: {
        dark: "#2B1A1A",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl) => {
        if (!active) {
          return;
        }
        setQrCodeDataUrl(dataUrl);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setQrError("Nao foi possivel gerar o QR Code automaticamente.");
      });

    return () => {
      active = false;
    };
  }, [value]);

  if (qrError) {
    return (
      <div style={{ background: "var(--fa-rose-soft)", borderRadius: "var(--fa-r-card)", padding: 16, fontSize: 13.5, lineHeight: 1.55, color: "var(--fa-primary)" }}>
        {qrError}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--fa-mist-2)", borderRadius: "var(--fa-r-card)", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {qrCodeDataUrl ? (
        <img
          src={qrCodeDataUrl}
          alt={`QR Code para configurar autenticador da conta ${accountName || "Farmaura"}`}
          style={{ width: 224, height: 224, maxWidth: "100%", borderRadius: 18, background: "#fff", padding: 12, boxShadow: "var(--fa-shadow-sm)" }}
        />
      ) : (
        <div style={{ width: 224, height: 224, maxWidth: "100%", borderRadius: 18, background: "#fff", padding: 12, display: "grid", placeItems: "center", boxShadow: "var(--fa-shadow-sm)", fontSize: 13.5, color: "var(--fa-ink-2)" }}>
          Gerando QR Code...
        </div>
      )}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>Escaneie com o aplicativo autenticador</div>
        <div className="fa-faint" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Abra Google Authenticator, Microsoft Authenticator, Authy ou outro app TOTP e leia o QR Code para vincular a conta.
        </div>
      </div>
    </div>
  );
}


function TwoFactorModal({
  open,
  mode,
  portalLabel,
  onClose,
  onStartSetup,
  onEnable,
  onDisable,
  onStatusChange,
}) {
  const [busy, setBusy] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [copiedField, setCopiedField] = useState("");
  const [showManualSetup, setShowManualSetup] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setSetupData(null);
      setCode("");
      setError("");
      setDone(false);
      setCopiedField("");
      setShowManualSetup(false);
      return;
    }

    if (mode !== "enable") {
      return;
    }

    let active = true;
    setBusy(true);
    setError("");
    setShowManualSetup(false);

    Promise.resolve(onStartSetup())
      .then((payload) => {
        if (!active) {
          return;
        }
        setSetupData(payload || null);
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }
        setError(requestError && requestError.message ? requestError.message : "Nao foi possivel preparar a dupla autenticacao.");
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, onStartSetup, open]);

  const isEnableMode = mode === "enable";

  const copyValue = async (fieldName, value) => {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(String(value || ""));
        setCopiedField(fieldName);
        window.setTimeout(() => setCopiedField(""), 1800);
        return;
      }
      throw new Error("Clipboard unavailable.");
    } catch {
      setError("Nao foi possivel copiar automaticamente. Use a selecao manual do texto.");
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");

    try {
      if (isEnableMode) {
        await onEnable(code.trim());
        if (typeof onStatusChange === "function") {
          onStatusChange(true);
        }
      } else {
        await onDisable(code.trim());
        if (typeof onStatusChange === "function") {
          onStatusChange(false);
        }
      }
      setDone(true);
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : "Nao foi possivel concluir a operacao.");
    } finally {
      setBusy(false);
    }
  };

  const title = isEnableMode
    ? "Ativar autenticacao de dois fatores"
    : "Desativar autenticacao de dois fatores";

  const subtitle = isEnableMode
    ? `Use um aplicativo autenticador para proteger os acessos ao ${portalLabel}.`
    : `Informe um codigo valido do aplicativo autenticador para remover a protecao extra do ${portalLabel}.`;

  return (
    <Modal open={open} onClose={onClose} icon={isEnableMode ? "shield" : "lock"} title={title} sub={subtitle} maxw={560}>
      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
          <div style={{ background: "var(--fa-success-soft)", borderRadius: "var(--fa-r-card)", padding: 16, color: "var(--fa-ink)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, marginBottom: 6 }}>
              <Icon name="check" size={18} stroke={2.6} />
              {isEnableMode ? "Protecao ativada" : "Protecao desativada"}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              {isEnableMode
                ? "Os proximos logins passarao a exigir o codigo temporario do aplicativo autenticador."
                : "Os proximos logins voltam a depender somente das credenciais primarias ate uma nova ativacao."}
            </div>
          </div>
          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" onClick={onClose}>Concluir</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
          {isEnableMode ? (
            <React.Fragment>
              <div style={{ background: "var(--fa-mist-2)", borderRadius: "var(--fa-r-card)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>Aplicativos compativeis</div>
                <div className="fa-faint" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                  Google Authenticator, Microsoft Authenticator, Authy e apps compativeis com TOTP.
                </div>
              </div>

              {busy && !setupData ? (
                <div className="fa-card" style={{ padding: 16, background: "var(--fa-mist-2)", fontSize: 13.5 }}>
                  Preparando a configuracao do autenticador...
                </div>
              ) : null}

              {setupData ? (
                <React.Fragment>
                  <QrCodePanel value={setupData.provisioning_uri} accountName={setupData.account_name} />

                  <div style={{ background: "var(--fa-info-soft)", borderRadius: "var(--fa-r-card)", padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <Icon name="info" size={18} style={{ flex: "none", marginTop: 1, color: "var(--fa-info)" }} />
                    <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fa-ink)" }}>
                      Depois de escanear o QR Code, digite o codigo de 6 digitos gerado no aplicativo para concluir a ativacao.
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button className="fa-btn fa-btn-soft fa-btn-block" onClick={() => setShowManualSetup((current) => !current)}>
                      <Icon name="tag" size={15} />
                      {showManualSetup ? "Ocultar configuracao manual" : "Nao conseguiu ler o QR Code? Usar configuracao manual"}
                    </button>

                    {showManualSetup ? (
                      <div style={{ background: "var(--fa-mist-2)", borderRadius: "var(--fa-r-card)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          <div className="fa-faint" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Conta</div>
                          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{setupData.account_name}</div>
                        </div>
                        <div>
                          <div className="fa-faint" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Chave manual</div>
                          <div className="fa-mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 4, wordBreak: "break-all" }}>{setupData.manual_entry_key}</div>
                        </div>
                        <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => copyValue("manual_entry_key", setupData.manual_entry_key)}>
                          <Icon name="tag" size={15} />
                          {copiedField === "manual_entry_key" ? "Chave copiada" : "Copiar chave"}
                        </button>
                        <div>
                          <div className="fa-faint" style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Link de configuracao</div>
                          <div className="fa-mono" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 4, wordBreak: "break-all" }}>{setupData.provisioning_uri}</div>
                        </div>
                        <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => copyValue("provisioning_uri", setupData.provisioning_uri)}>
                          <Icon name="tag" size={15} />
                          {copiedField === "provisioning_uri" ? "Link copiado" : "Copiar link"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </React.Fragment>
              ) : null}
            </React.Fragment>
          ) : (
            <div style={{ background: "var(--fa-mist-2)", borderRadius: "var(--fa-r-card)", padding: 16, fontSize: 13.5, lineHeight: 1.55 }}>
              Para confirmar a desativacao, abra o aplicativo autenticador atualmente vinculado e informe o codigo temporario exibido.
            </div>
          )}

          <div className="fa-field">
            <label>{isEnableMode ? "Codigo do aplicativo autenticador" : "Codigo atual do aplicativo autenticador"}</label>
            <input
              className="fa-input"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
            />
          </div>

          {error ? <div className="fa-card" style={{ padding: "14px 16px", background: "var(--fa-rose-soft)", color: "var(--fa-primary)", fontWeight: 600, fontSize: 13.5 }}>{error}</div> : null}

          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={busy || code.length !== 6 || (isEnableMode && !setupData)} onClick={submit}>
            {busy ? "Validando..." : isEnableMode ? "Confirmar e ativar" : "Confirmar e desativar"}
          </button>
          <button className="fa-btn fa-btn-soft fa-btn-block" onClick={onClose}>Cancelar</button>
        </div>
      )}
    </Modal>
  );
}


export { TwoFactorModal };
