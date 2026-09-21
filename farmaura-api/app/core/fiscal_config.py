"""
farmaura-api/app/core/fiscal_config.py

Fiscal (NFC-e) settings for Farmaura.

Responsibilities:
- load the emitter identity, certificate reference, CSC and series from the environment;
- centralize which SEFAZ environment is active and refuse production unless explicitly unlocked;
- report exactly which required emitter fields are still missing, never guessing values;

Observations:
- secrets (certificate password, CSC) are `SecretStr`: they never show up in repr(), logs or API payloads;
- these variables intentionally do not use the `APP_` prefix, matching the names operations will fill in;
- production needs BOTH `FISCAL_ENV=producao` and `FISCAL_PRODUCTION_ENABLED=true`;
- `NFCE_ENV`, when present, must agree with `FISCAL_ENV`; a mismatch is treated as a configuration error;
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

FiscalEnvironmentName = Literal["homologacao", "producao"]

DF_UF_CODE = "53"
DF_UF_ACRONYM = "DF"


# ============================================================================
# ERRORS
# ============================================================================


class FiscalConfigurationError(Exception):
    """Raised when the fiscal module is misconfigured or blocked by a safety guard."""


# ============================================================================
# SETTINGS
# ============================================================================


class FiscalSettings(BaseSettings):
    """Typed fiscal configuration loaded from the environment."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore", populate_by_name=True)

    # Master switch: deploying this code never starts emitting by itself.
    nfce_enabled: bool = False
    fiscal_env: FiscalEnvironmentName = "homologacao"
    fiscal_production_enabled: bool = False
    nfce_env: str = ""

    nfce_cnpj: str = ""
    nfce_ie: str = ""
    nfce_razao_social: str = ""
    nfce_nome_fantasia: str = "FARMAURA"
    # CRT: 1=Simples Nacional, 2=Simples excesso de sublimite, 3=Regime Normal, 4=MEI.
    nfce_crt: str = ""
    nfce_logradouro: str = ""
    nfce_numero: str = ""
    nfce_complemento: str = ""
    nfce_bairro: str = ""
    nfce_cep: str = ""
    nfce_municipio: str = ""
    nfce_codigo_ibge_municipio: str = ""
    nfce_telefone: str = ""

    # CSC is not used by QR Code v3 online emission (NT 2025.001); kept for completeness/rollback.
    nfce_csc_id_homologacao: str = ""
    nfce_csc_homologacao: SecretStr = SecretStr("")
    nfce_csc_id_producao: str = ""
    nfce_csc_producao: SecretStr = SecretStr("")

    nfce_certificate_path: str = ""
    nfce_certificate_password: SecretStr = SecretStr("")
    nfce_certificate_warn_days: int = Field(default=30, ge=1, le=365)

    nfce_serie: str = ""
    nfce_cancel_window_minutes: int = Field(default=30, ge=1, le=1440)
    nfce_contingency_enabled: bool = False
    nfce_http_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)
    nfce_max_attempts: int = Field(default=6, ge=1, le=20)
    nfce_storage_prefix: str = "fiscal"
    # DF QR Code / consultation-by-key URLs as published by the Receita do DF (SEFAZ-DF NFC-e services page).
    # Confirm the homologation values against the first homologation answer before going live.
    nfce_qrcode_url: str = "http://www.fazenda.df.gov.br/nfce/qrcode"
    nfce_consultation_url: str = "http://www.fazenda.df.gov.br/nfce/consulta"
    # Optional PEM bundle with the ICP-Brasil chain, if the SEFAZ server certificate is not in the system store.
    nfce_ca_bundle_path: str = ""

    @model_validator(mode="after")
    def _reject_environment_mismatch(self) -> FiscalSettings:
        """Fail closed when NFCE_ENV and FISCAL_ENV disagree."""

        declared = self.nfce_env.strip().lower()
        if declared and declared != self.fiscal_env:
            raise ValueError("NFCE_ENV must match FISCAL_ENV; refusing an ambiguous fiscal environment.")
        return self

    # ------------------------------------------------------------------
    # Environment guards
    # ------------------------------------------------------------------

    @property
    def is_production(self) -> bool:
        """Return whether the active SEFAZ environment is production."""

        return self.fiscal_env == "producao"

    @property
    def tp_amb(self) -> str:
        """Return the NF-e `tpAmb` code (1=production, 2=homologation)."""

        return "1" if self.is_production else "2"

    def assert_environment_allowed(self) -> None:
        """Refuse production unless it was explicitly unlocked."""

        if self.is_production and not self.fiscal_production_enabled:
            raise FiscalConfigurationError(
                "FISCAL_ENV=producao exige FISCAL_PRODUCTION_ENABLED=true. Módulo fiscal bloqueado."
            )

    # ------------------------------------------------------------------
    # Emitter validation
    # ------------------------------------------------------------------

    def missing_emitter_fields(self) -> list[str]:
        """Return the environment variables required to emit that are still empty."""

        required: dict[str, str] = {
            "NFCE_CNPJ": self.nfce_cnpj,
            "NFCE_IE": self.nfce_ie,
            "NFCE_RAZAO_SOCIAL": self.nfce_razao_social,
            "NFCE_CRT": self.nfce_crt,
            "NFCE_LOGRADOURO": self.nfce_logradouro,
            "NFCE_NUMERO": self.nfce_numero,
            "NFCE_BAIRRO": self.nfce_bairro,
            "NFCE_CEP": self.nfce_cep,
            "NFCE_MUNICIPIO": self.nfce_municipio,
            "NFCE_CODIGO_IBGE_MUNICIPIO": self.nfce_codigo_ibge_municipio,
            "NFCE_SERIE": self.nfce_serie,
            "NFCE_CERTIFICATE_PATH": self.nfce_certificate_path,
            "NFCE_CERTIFICATE_PASSWORD": self.nfce_certificate_password.get_secret_value(),
        }
        return [name for name, value in required.items() if not str(value).strip()]

    def invalid_emitter_fields(self) -> list[str]:
        """Return human-readable format problems in the configured emitter values."""

        problems: list[str] = []
        digits = "".join(ch for ch in self.nfce_cnpj if ch.isdigit())
        if self.nfce_cnpj and len(digits) != 14:
            problems.append("NFCE_CNPJ deve ter 14 dígitos.")
        if self.nfce_crt and self.nfce_crt not in {"1", "2", "3", "4"}:
            problems.append("NFCE_CRT deve ser 1, 2, 3 ou 4.")
        if self.nfce_serie and not (self.nfce_serie.isdigit() and 0 <= int(self.nfce_serie) <= 999):
            problems.append("NFCE_SERIE deve ser um número entre 0 e 999.")
        if self.nfce_codigo_ibge_municipio and not (
            self.nfce_codigo_ibge_municipio.isdigit() and len(self.nfce_codigo_ibge_municipio) == 7
        ):
            problems.append("NFCE_CODIGO_IBGE_MUNICIPIO deve ter 7 dígitos.")
        if self.nfce_codigo_ibge_municipio and not self.nfce_codigo_ibge_municipio.startswith(DF_UF_CODE):
            problems.append("NFCE_CODIGO_IBGE_MUNICIPIO deve pertencer ao Distrito Federal (prefixo 53).")
        if self.nfce_cep and len("".join(ch for ch in self.nfce_cep if ch.isdigit())) != 8:
            problems.append("NFCE_CEP deve ter 8 dígitos.")
        return problems

    @property
    def emitter_cnpj_digits(self) -> str:
        """Return the emitter CNPJ with only digits."""

        return "".join(ch for ch in self.nfce_cnpj if ch.isdigit())

    @property
    def certificate_file(self) -> Path:
        """Return the configured certificate path."""

        return Path(self.nfce_certificate_path)

    @property
    def crt_requires_ibs_cbs(self) -> bool:
        """Return whether IBS/CBS fields are mandatory for this emitter (CRT=3, NT 2025.002 v1.51)."""

        return self.nfce_crt == "3"


@lru_cache(maxsize=1)
def get_fiscal_settings() -> FiscalSettings:
    """Return the cached fiscal settings."""

    return FiscalSettings()
