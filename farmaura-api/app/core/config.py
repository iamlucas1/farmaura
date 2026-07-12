"""
farmaura-api/app/core/config.py

Application settings for Farmaura.

Responsibilities:
- define typed configuration values;
- load settings from environment variables;
- centralize runtime limits and security parameters;

Observations:
- settings are cached for stable process-wide access;
- all sensitive defaults must be overridden in real environments;
"""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


# ============================================================================
# SETTINGS
# ============================================================================


class Settings(BaseSettings):
    """Typed application settings loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
    )

    app_name: str = "Farmaura API"
    environment: str = Field(default="development", validation_alias=AliasChoices("APP_ENV", "ENVIRONMENT"))
    host: str = "0.0.0.0"
    port: int = 8080
    base_url: HttpUrl = HttpUrl("https://api.farmaura.local")
    api_v1_prefix: str = "/api/v1"
    debug: bool = False
    allowed_origins_raw: str = Field(default="", validation_alias=AliasChoices("APP_ALLOWED_ORIGINS", "ALLOWED_ORIGINS"))
    database_url: str
    redis_url: str
    jwt_issuer: str
    jwt_audience: str
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    jwt_refresh_remember_ttl_days: int = 90
    jwt_mfa_ttl_minutes: int = 5
    jwt_private_key: str
    jwt_public_key: str
    jwt_algorithm: str = "HS256"
    storage_root: Path = Path("farmaura-api/storage/private")
    storage_tmp_root: Path = Path("farmaura-api/storage/tmp")
    storage_quarantine_root: Path = Path("farmaura-api/storage/quarantine")
    max_request_body_bytes: int = 6_291_456
    max_upload_bytes: int = 5_242_880
    default_page_size: int = 20
    max_page_size: int = 100
    ai_enabled: bool = False
    ai_default_provider: str = "gemini"
    ai_request_timeout_seconds: int = 30
    ai_gemini_api_key: str = ""
    ai_gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_openai_api_key: str = ""
    ai_openai_base_url: str = "https://api.openai.com/v1"
    ai_openai_model: str = "gpt-5.5"
    asaas_enabled: bool = False
    asaas_base_url: str = "https://api-sandbox.asaas.com"
    asaas_access_token: str = ""
    asaas_webhook_auth_token: str = ""
    asaas_webhook_allowed_ips: str = ""
    asaas_invoice_enabled: bool = False
    asaas_invoice_municipal_service_id: str = ""
    asaas_invoice_municipal_service_code: str = ""
    asaas_invoice_municipal_service_name: str = ""
    asaas_invoice_service_list_item: str = ""
    asaas_invoice_cnae: str = ""
    asaas_invoice_nbs_code: str = ""
    asaas_invoice_special_tax_regime: str = ""
    asaas_invoice_simples_nacional: bool = False
    asaas_invoice_fiscal_email: str = ""
    asaas_invoice_municipal_inscription: str = ""
    asaas_invoice_rps_serie: str = ""
    asaas_invoice_rps_number: int | None = None
    asaas_invoice_certificate_file: str = ""
    asaas_invoice_certificate_password: str = ""
    asaas_invoice_observations: str = ""
    asaas_invoice_effective_date_period: str = "ON_PAYMENT_CONFIRMATION"
    asaas_invoice_update_payment: bool = False
    asaas_invoice_retain_iss: bool = False
    asaas_invoice_iss: float = 0.0
    asaas_invoice_pis: float = 0.0
    asaas_invoice_cofins: float = 0.0
    asaas_invoice_csll: float = 0.0
    asaas_invoice_inss: float = 0.0
    asaas_invoice_ir: float = 0.0
    geocoding_enabled: bool = True
    geocoding_base_url: str = "https://nominatim.openstreetmap.org"
    geocoding_user_agent: str = "farmaura-api/1.0 (contato@farmaura.com.br)"
    geocoding_timeout_seconds: int = 10
    store_hub_name: str = ""
    store_hub_address: str = ""
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_from_email: str = ""
    smtp_from_name: str = "Farmaura"
    ai_inventory_system_prompt: str = (
        "Voce e um analista de estoque farmaceutico da Farmaura. "
        "Responda apenas com base no contexto operacional recebido, "
        "seja objetivo, aponte riscos de ruptura, excesso, validade, "
        "movimentacao e necessidade de reposicao quando relevante."
    )

    @property
    def allowed_origins(self) -> list[str]:
        """Return allowed origins parsed from configuration with local dev fallbacks."""

        parsed_origins = [item.strip() for item in self.allowed_origins_raw.split(",") if item.strip()]
        if self.environment.lower() in {"development", "docker", "local"}:
            for origin in (
                "http://127.0.0.1:3000",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://localhost:5173",
            ):
                if origin not in parsed_origins:
                    parsed_origins.append(origin)
        return parsed_origins


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached application settings."""

    return Settings()
