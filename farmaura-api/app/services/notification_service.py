"""
farmaura-api/app/services/notification_service.py

Notification delivery service for Farmaura.

Responsibilities:
- send fiscal document e-mails through SMTP when configured;
- send first-access temporary-password e-mails through SMTP when configured;
- send account-lockout and back-in-stock e-mails through SMTP when configured;
- build one shared branded HTML shell (logo, colors, typography) that every e-mail body
  renders inside, so all transactional e-mails look like the same product;
- build deterministic HTML summaries for operational receipts and NFC-e data;
- keep delivery failures isolated from the core order and PDV flows.

Observations:
- SMTP delivery is best-effort and must not block the issuance lifecycle;
- the HTML shell uses a table-based layout with inline styles on purpose — e-mail clients
  (Outlook desktop especially) don't reliably support modern CSS, flexbox/grid, or external
  stylesheets, so every visual rule that must render is inlined on the element itself;
- printable HTML (`render_fiscal_document_html`) is a full standalone page for the browser,
  not an e-mail body — it keeps its own <style> block, unrelated to the e-mail shell below.
"""

from __future__ import annotations

import smtplib
from email.message import EmailMessage
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.models.fiscal_document import FiscalDocument


# ============================================================================
# BRAND TOKENS (e-mail-safe subset of the "Warm Apothecary" design system —
# hardcoded here because e-mail HTML can't reach the app's CSS custom properties)
# ============================================================================

_INK = "#2B1A1A"          # Grafite Quente — primary text
_INK_MUTED = "#6B5757"    # Grafite Quente — secondary text
_INK_FAINT = "#9A8A8A"    # Grafite Quente — faint/footer text
_PRIMARY = "#7A0D16"      # Vinho Aura — brand primary, trust/default
_PRIMARY_DARK = "#5C0910" # Vinho Aura, ink — text/border on soft rose
_VITAL = "#C81D28"        # Vermelho Vital — urgency/security accent (never swapped with Vinho Aura)
_BORDER = "#F1EBE9"       # Cinza Névoa — hairlines
_BG = "#FAF7F5"           # Off-white Clínico — page background
_BEGE = "#F6F1E8"         # Bege Atalho — soft neutral panel
_ROSE_SOFT = "#FFEDEE"    # Rosé Cuidado — soft highlight background
_FONT_STACK = "'Nunito Sans', Arial, Helvetica, sans-serif"
_MONO_STACK = "'Courier New', Courier, monospace"

# The logo ships as a CID-embedded attachment (not a hosted URL) so it always renders,
# regardless of whether the frontend's static build has been deployed anywhere reachable —
# most mail clients block/delay remote images by default, but never inline ones.
_LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "email" / "logo.png"
_LOGO_CID = "farmaura-email-logo"


@lru_cache(maxsize=1)
def _load_logo_bytes() -> bytes:
    """Read the e-mail logo once and cache it for the life of the process."""

    return _LOGO_PATH.read_bytes()


# ============================================================================
# NOTIFICATION SERVICE
# ============================================================================


class NotificationService:
    """Provide fiscal document notification helpers."""

    def __init__(self) -> None:
        """Load the current notification settings."""

        self.settings = get_settings()

    def send_fiscal_document_email(self, *, document: FiscalDocument, email: str, printable_html_url: str) -> tuple[bool, str]:
        """Send one fiscal document summary by e-mail when SMTP is configured."""

        total_amount = f"{float(document.gross_total_amount or 0):.2f}".replace(".", ",")
        content = "".join(
            [
                self._eyebrow("Nota fiscal"),
                self._heading("Sua NFC-e já foi emitida"),
                self._paragraph(f"Documento <strong>{document.document_number}</strong> · Série <strong>{document.series_code}</strong>"),
                self._paragraph(f"Emitida em {document.issue_datetime_label} · Total <strong>R$ {total_amount}</strong>"),
                self._code_block(document.access_key, label="Chave de acesso"),
                self._button("Abrir versão para impressão", printable_html_url),
            ]
        )
        return self._dispatch(
            email=email,
            subject=f"Farmaura · NFC-e {document.document_number}",
            preheader=f"Sua NFC-e {document.document_number} foi emitida — total R$ {total_amount}.",
            text_body=self._build_text_body(document=document, printable_html_url=printable_html_url),
            html_body=self._wrap_email_html(content),
        )

    def send_first_access_email(self, *, email: str, full_name: str, temporary_password: str) -> tuple[bool, str]:
        """Send one temporary password by e-mail for a marketplace first-access flow."""

        content = "".join(
            [
                self._eyebrow("Primeiro acesso"),
                self._heading(self._greeting(full_name)),
                self._paragraph("Recebemos uma solicitação de primeiro acesso à sua conta Farmaura."),
                self._code_block(temporary_password, label="Senha temporária"),
                self._paragraph("Use essa senha para entrar no marketplace — você será solicitado a criar uma nova senha em seguida."),
                self._paragraph("Se você não fez essa solicitação, ignore este e-mail.", faint=True),
            ]
        )
        return self._dispatch(
            email=email,
            subject="Farmaura · Sua senha de primeiro acesso",
            preheader="Sua senha temporária de acesso ao marketplace Farmaura chegou.",
            text_body=self._build_first_access_text_body(full_name=full_name, temporary_password=temporary_password),
            html_body=self._wrap_email_html(content),
        )

    def send_account_locked_email(self, *, email: str, full_name: str, unlock_url: str, lockout_minutes: int) -> tuple[bool, str]:
        """Send one account-lockout notification e-mail with a self-service unlock link."""

        content = "".join(
            [
                self._eyebrow("Segurança da conta", tone="urgent"),
                self._heading(self._greeting(full_name)),
                self._paragraph(
                    "Detectamos várias tentativas seguidas de login com senha incorreta na sua conta Farmaura "
                    "e bloqueamos o acesso temporariamente por segurança."
                ),
                self._paragraph(
                    f"O bloqueio expira sozinho em cerca de <strong>{lockout_minutes} minuto(s)</strong>, mas se foi você "
                    "quem errou a senha, pode desbloquear agora mesmo:"
                ),
                self._button("Desbloquear minha conta", unlock_url),
                self._paragraph("Se você não reconhece essas tentativas, recomendamos trocar sua senha assim que possível.", faint=True),
            ]
        )
        return self._dispatch(
            email=email,
            subject="Farmaura · Sua conta foi bloqueada temporariamente",
            preheader=f"Bloqueio temporário de {lockout_minutes} minuto(s) por tentativas de login incorretas.",
            text_body=self._build_account_locked_text_body(full_name=full_name, unlock_url=unlock_url, lockout_minutes=lockout_minutes),
            html_body=self._wrap_email_html(content),
        )

    def send_product_available_email(self, *, email: str, full_name: str, product_name: str) -> tuple[bool, str]:
        """Send one back-in-stock notification e-mail when SMTP is configured."""

        content = "".join(
            [
                self._eyebrow("Disponível de novo"),
                self._heading(self._greeting(full_name)),
                self._paragraph(f"O produto <strong>{product_name}</strong> que você pediu para ser avisado já está disponível no marketplace Farmaura."),
                self._paragraph("Corra antes que acabe de novo!"),
            ]
        )
        return self._dispatch(
            email=email,
            subject=f"Farmaura · {product_name} já está disponível",
            preheader=f"{product_name} voltou ao estoque.",
            text_body=self._build_product_available_text_body(full_name=full_name, product_name=product_name),
            html_body=self._wrap_email_html(content),
        )

    def render_fiscal_document_html(self, *, document: FiscalDocument) -> str:
        """Return one standalone printable HTML view for a fiscal document."""

        total_amount = f"{float(document.gross_total_amount or 0):.2f}".replace(".", ",")
        tax_amount = f"{float(document.approximate_tax_amount or 0):.2f}".replace(".", ",")
        recipient_document = document.recipient_document_snapshot or "CONSUMIDOR"
        authorized_label = "Autorizada" if document.authorized else "Pendente"
        return f"""<!doctype html>
<html lang=\"pt-BR\">
<head>
  <meta charset=\"utf-8\" />
  <title>NFC-e {document.document_number}</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; color: #111; margin: 0; padding: 24px; }}
    .sheet {{ max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }}
    h1 {{ margin: 0 0 8px; font-size: 28px; }}
    h2 {{ margin: 24px 0 12px; font-size: 18px; }}
    .muted {{ color: #666; font-size: 14px; }}
    .row {{ display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #eee; }}
    .pill {{ display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e9f7ef; color: #1f7a46; font-weight: 700; font-size: 12px; }}
    .mono {{ font-family: \"Courier New\", monospace; word-break: break-all; }}
    .actions {{ display: flex; gap: 12px; margin-top: 24px; }}
    .button {{ display: inline-block; padding: 12px 16px; border-radius: 12px; background: #7A0D16; color: #fff; text-decoration: none; font-weight: 700; }}
    @media print {{ body {{ background: #fff; padding: 0; }} .sheet {{ box-shadow: none; border-radius: 0; max-width: none; }} .actions {{ display: none; }} }}
  </style>
</head>
<body>
  <div class=\"sheet\">
    <div class=\"pill\">{authorized_label}</div>
    <h1>NFC-e {document.document_number}</h1>
    <div class=\"muted\">Série {document.series_code} · Emitida em {document.issue_datetime_label}</div>
    <h2>Resumo fiscal</h2>
    <div class=\"row\"><span>Canal</span><strong>{document.source_channel}</strong></div>
    <div class=\"row\"><span>Pagamento</span><strong>{document.payment_method_snapshot}</strong></div>
    <div class=\"row\"><span>Destinatário</span><strong>{document.recipient_name_snapshot or 'Consumidor não identificado'}</strong></div>
    <div class=\"row\"><span>Documento</span><strong>{recipient_document}</strong></div>
    <div class=\"row\"><span>Total bruto</span><strong>R$ {total_amount}</strong></div>
    <div class=\"row\"><span>Tributos aproximados</span><strong>R$ {tax_amount}</strong></div>
    <h2>Chave de acesso</h2>
    <div class=\"mono\">{document.access_key}</div>
    <div class=\"actions\">
      <a class=\"button\" href=\"#\" onclick=\"window.print(); return false;\">Imprimir</a>
    </div>
  </div>
</body>
</html>"""

    # ------------------------------------------------------------------
    # shared HTML e-mail shell + content fragment helpers
    # ------------------------------------------------------------------

    def _dispatch(self, *, email: str, subject: str, preheader: str, text_body: str, html_body: str) -> tuple[bool, str]:
        """Build and send one e-mail through SMTP; returns (sent, detail) — never raises."""

        if not self.settings.smtp_enabled:
            return False, "SMTP não configurado para envio automático."
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self._format_from_header()
        message["To"] = email
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        html_part = message.get_payload()[1]
        try:
            html_part.add_related(_load_logo_bytes(), maintype="image", subtype="png", cid=f"<{_LOGO_CID}>")
        except OSError:
            pass  # logo asset missing on disk — send without it rather than fail the whole e-mail
        try:
            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=20) as client:
                if self.settings.smtp_use_tls:
                    client.starttls()
                if self.settings.smtp_username:
                    client.login(self.settings.smtp_username, self.settings.smtp_password)
                client.send_message(message)
        except Exception as exc:
            return False, f"Falha ao enviar e-mail ({subject}): {exc}"
        return True, "E-mail enviado com sucesso."

    def _wrap_email_html(self, content_html: str) -> str:
        """Wrap inner content HTML in the shared Farmaura-branded e-mail shell.

        Table-based layout, everything inlined — the one part of the codebase that
        deliberately ignores the "no inline styles" instinct, because e-mail clients
        require it. Logo is referenced by CID (embedded attachment, see `_dispatch`),
        never by URL — so it always renders, with no dependency on any deploy.
        """

        return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>Farmaura</title>
</head>
<body style="margin:0;padding:0;background-color:{_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{_BG};">&#8203;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(43,26,26,.10);font-family:{_FONT_STACK};">
          <tr>
            <td style="height:5px;line-height:5px;font-size:0;background-color:{_PRIMARY};background-image:linear-gradient(90deg,{_PRIMARY},{_VITAL});">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:34px 32px 20px;background-color:{_BEGE};">
              <img src="cid:{_LOGO_CID}" width="50" height="49" alt="Farmaura" style="display:block;margin:0 auto 12px;border:0;" />
              <div style="font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:{_PRIMARY_DARK};">Farmaura</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 4px;color:{_INK};font-size:15px;line-height:1.6;">
              {content_html}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <div style="height:1px;line-height:1px;background-color:{_BORDER};font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 30px;background-color:{_BG};">
              <div style="font-size:12px;color:{_INK_FAINT};line-height:1.65;text-align:center;">
                <strong style="color:{_INK_MUTED};">Farmaura</strong> · Sua farmácia de bairro, pertinho de você.<br />
                Este é um e-mail automático — a Farmaura nunca liga ou manda mensagem pedindo sua senha, código de acesso ou dados de cartão completos.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    def _greeting(self, full_name: str) -> str:
        """Build the "Olá, Nome!" heading text, with a name-less fallback."""

        return f"Olá, {full_name}!" if full_name else "Olá!"

    def _eyebrow(self, text: str, *, tone: str = "brand") -> str:
        """Render the small-caps label above the heading — mirrors the app's own PageHead

        eyebrow convention. `tone="urgent"` switches to Vermelho Vital for security/lockout
        moments; the brand's "dois vermelhos" rule never lets the two swap roles.
        """

        color = _VITAL if tone == "urgent" else _PRIMARY
        return f'<div style="margin:0 0 8px;font-size:11.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:{color};">{text}</div>'

    def _heading(self, text: str) -> str:
        """Render the shared e-mail-body heading style."""

        return f'<h2 style="margin:0 0 14px;font-size:20px;font-weight:800;color:{_INK};letter-spacing:-.01em;">{text}</h2>'

    def _paragraph(self, html: str, *, muted: bool = False, faint: bool = False) -> str:
        """Render one shared-style paragraph — muted/faint pick a lighter ink tone."""

        color = _INK_FAINT if faint else (_INK_MUTED if muted else _INK)
        size = "12.5px" if faint else "14.5px"
        return f'<p style="margin:0 0 14px;color:{color};font-size:{size};line-height:1.6;">{html}</p>'

    def _code_block(self, value: str, *, label: str = "") -> str:
        """Render one highlighted monospace value — temporary passwords, access keys.

        Optional `label` sits as a small caps caption above the value (e.g. "Senha
        temporária" / "Chave de acesso") so the block reads on its own if skimmed.
        """

        caption = (
            f'<div style="margin:0 0 8px;font-size:10.5px;font-weight:800;letter-spacing:.08em;'
            f'text-transform:uppercase;color:{_PRIMARY_DARK};opacity:.75;">{label}</div>'
            if label
            else ""
        )
        return (
            '<div style="margin:4px 0 20px;text-align:center;">'
            f'<div style="display:inline-block;padding:16px 24px;border-radius:12px;background-color:{_ROSE_SOFT};'
            f'border:1.5px dashed {_PRIMARY};">'
            f"{caption}"
            f'<span style="display:block;color:{_PRIMARY_DARK};font-family:{_MONO_STACK};font-size:19px;'
            'font-weight:800;letter-spacing:.05em;word-break:break-all;">'
            f"{value}</span></div></div>"
        )

    def _button(self, label: str, url: str) -> str:
        """Render one primary call-to-action button (table-based for Outlook safety)."""

        return (
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">'
            "<tr><td "
            f'style="border-radius:11px;background-color:{_PRIMARY};box-shadow:0 4px 14px rgba(122,13,22,.28);">'
            f'<a href="{url}" style="display:inline-block;padding:14px 26px;font-size:14.5px;font-weight:700;'
            f'color:#ffffff;text-decoration:none;border-radius:11px;">{label}</a>'
            "</td></tr></table>"
        )

    def _format_from_header(self) -> str:
        """Return the SMTP From header value."""

        if self.settings.smtp_from_name and self.settings.smtp_from_email:
            return f"{self.settings.smtp_from_name} <{self.settings.smtp_from_email}>"
        return self.settings.smtp_from_email or "no-reply@farmaura.local"

    def _build_text_body(self, *, document: FiscalDocument, printable_html_url: str) -> str:
        """Build the plain-text body for one fiscal e-mail."""

        return "\n".join(
            [
                "Olá,",
                "",
                f"Sua NFC-e {document.document_number} já foi emitida pela Farmaura.",
                f"Série: {document.series_code}",
                f"Emitida em: {document.issue_datetime_label}",
                f"Total: R$ {float(document.gross_total_amount or 0):.2f}",
                f"Chave de acesso: {document.access_key}",
                "",
                f"Versão para impressão: {printable_html_url}",
            ]
        )

    def _build_first_access_text_body(self, *, full_name: str, temporary_password: str) -> str:
        """Build the plain-text body for one first-access e-mail."""

        return "\n".join(
            [
                f"Olá, {full_name}!" if full_name else "Olá!",
                "",
                "Recebemos uma solicitação de primeiro acesso à sua conta Farmaura.",
                f"Sua senha temporária de acesso é: {temporary_password}",
                "",
                "Use essa senha para entrar no marketplace — você será solicitado a criar uma nova senha em seguida.",
                "Se você não fez essa solicitação, ignore este e-mail.",
            ]
        )

    def _build_account_locked_text_body(self, *, full_name: str, unlock_url: str, lockout_minutes: int) -> str:
        """Build the plain-text body for one account-lockout e-mail."""

        return "\n".join(
            [
                f"Olá, {full_name}!" if full_name else "Olá!",
                "",
                "Detectamos várias tentativas seguidas de login com senha incorreta na sua conta Farmaura",
                "e bloqueamos o acesso temporariamente por segurança.",
                "",
                f"O bloqueio expira sozinho em cerca de {lockout_minutes} minuto(s), mas se foi você quem errou",
                "a senha, pode desbloquear agora mesmo pelo link abaixo:",
                "",
                unlock_url,
                "",
                "Se você não reconhece essas tentativas, recomendamos trocar sua senha assim que possível.",
            ]
        )

    def _build_product_available_text_body(self, *, full_name: str, product_name: str) -> str:
        """Build the plain-text body for one back-in-stock e-mail."""

        return "\n".join(
            [
                f"Olá, {full_name}!" if full_name else "Olá!",
                "",
                f"O produto {product_name} que você pediu para ser avisado já está disponível no marketplace Farmaura.",
                "Corra antes que acabe de novo!",
            ]
        )
