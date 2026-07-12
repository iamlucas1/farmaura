"""
farmaura-api/app/services/notification_service.py

Notification delivery service for Farmaura.

Responsibilities:
- send fiscal document e-mails through SMTP when configured;
- build deterministic HTML summaries for operational receipts and NFC-e data;
- keep delivery failures isolated from the core order and PDV flows.

Observations:
- SMTP delivery is best-effort and must not block the issuance lifecycle;
- printable HTML is generated locally to support browser printing without fake data.
"""

from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.core.config import get_settings
from app.models.fiscal_document import FiscalDocument


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

        if not self.settings.smtp_enabled:
            return False, "SMTP não configurado para envio automático."
        message = EmailMessage()
        message["Subject"] = f"Farmaura · NFC-e {document.document_number}"
        message["From"] = self._format_from_header()
        message["To"] = email
        message.set_content(self._build_text_body(document=document, printable_html_url=printable_html_url))
        message.add_alternative(self._build_html_body(document=document, printable_html_url=printable_html_url), subtype="html")
        try:
            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=20) as client:
                if self.settings.smtp_use_tls:
                    client.starttls()
                if self.settings.smtp_username:
                    client.login(self.settings.smtp_username, self.settings.smtp_password)
                client.send_message(message)
        except Exception as exc:
            return False, f"Falha ao enviar e-mail fiscal: {exc}"
        return True, "Documento fiscal enviado por e-mail com sucesso."

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

    def _build_html_body(self, *, document: FiscalDocument, printable_html_url: str) -> str:
        """Build the HTML body for one fiscal e-mail."""

        return f"""
        <div style=\"font-family:Arial,sans-serif;color:#111;line-height:1.5\">
          <h2 style=\"margin:0 0 12px;color:#7A0D16\">Sua NFC-e já foi emitida</h2>
          <p style=\"margin:0 0 12px\">Documento <strong>{document.document_number}</strong> · Série <strong>{document.series_code}</strong></p>
          <p style=\"margin:0 0 12px\">Emitida em {document.issue_datetime_label}</p>
          <p style=\"margin:0 0 12px\">Chave de acesso:<br /><span style=\"font-family:'Courier New',monospace\">{document.access_key}</span></p>
          <p style=\"margin:18px 0 0\"><a href=\"{printable_html_url}\" style=\"display:inline-block;padding:12px 16px;border-radius:12px;background:#7A0D16;color:#fff;text-decoration:none;font-weight:700\">Abrir versão para impressão</a></p>
        </div>
        """
