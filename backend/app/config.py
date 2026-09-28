from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "DRISHTI API"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    api_prefix: str = "/api"
    log_level: str = "INFO"
    backend_host: str = "127.0.0.1"
    backend_port: int = Field(default=8000, ge=1, le=65535)
    backend_reload: bool = False
    # The Vercel function intentionally excludes native scientific/document
    # dependencies that would exceed the platform's 500 MB function limit.
    # Full local/container deployments keep every API module enabled.
    serverless_core_runtime: bool = False

    database_url: str | None = Field(default=None, repr=False)
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=10, ge=0, le=100)
    db_pool_timeout_seconds: int = Field(default=10, ge=1, le=120)

    supabase_url: HttpUrl | None = None
    supabase_publishable_key: str | None = Field(default=None, repr=False)
    supabase_auth_timeout_seconds: float = Field(default=5, ge=1, le=30)

    cuf_max_file_size_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    cuf_max_rows: int = Field(default=10_000, ge=1, le=100_000)
    cuf_preview_rows: int = Field(default=100, ge=1, le=1000)

    # Ask DRISHTI uses Ollama only to synthesize retrieved evidence. Numeric
    # facts remain database-calculated and document retrieval uses pgvector.
    ollama_enabled: bool = False
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_chat_model: str = "qwen2.5:7b"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_embedding_dimensions: int = Field(default=768, ge=64, le=4096)
    ollama_timeout_seconds: float = Field(default=45, ge=1, le=300)
    assistant_document_dir: Path = Path("artifacts/documents")
    assistant_max_document_bytes: int = Field(default=20 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    assistant_chunk_characters: int = Field(default=1800, ge=500, le=8000)
    assistant_chunk_overlap_characters: int = Field(default=250, ge=0, le=2000)
    assistant_embedding_batch_size: int = Field(default=24, ge=1, le=128)
    assistant_max_document_chunks: int = Field(default=1500, ge=1, le=10000)
    assistant_max_evidence_items: int = Field(default=12, ge=1, le=30)
    assistant_document_min_relevance: float = Field(default=0.30, ge=0, le=1)
    assistant_major_delay_days: int = Field(default=365, ge=1, le=3650)

    ml_artifact_dir: Path = Path("artifacts/ml")
    ml_min_training_rows: int = Field(default=100, ge=30)
    ml_min_class_rows: int = Field(default=10, ge=2)
    ml_significant_overrun_threshold_pct: float = Field(default=10, ge=0, le=100)
    ml_schedule_min_training_rows: int = Field(default=100, ge=30)
    ml_schedule_min_class_rows: int = Field(default=10, ge=2)
    ml_schedule_overrun_threshold_days: int = Field(default=0, ge=0, le=3650)

    # CUF versus CUF+ experiment controls. Model B is not evaluated until at
    # least one source-attributed external feature reaches the coverage floor.
    experiment_artifact_dir: Path = Path("artifacts/experiments")
    experiment_min_training_rows: int = Field(default=100, ge=30)
    experiment_min_class_rows: int = Field(default=10, ge=2)
    experiment_external_min_feature_coverage: float = Field(default=0.30, gt=0, le=1)
    experiment_random_state: int = 42

    # Administrative model monitoring. These thresholds produce alerts only;
    # they never change model state or initiate retraining.
    model_monitoring_default_window_days: int = Field(default=90, ge=7, le=730)
    model_monitoring_min_samples: int = Field(default=30, ge=10, le=10000)
    model_monitoring_psi_warning: float = Field(default=0.10, gt=0, le=1)
    model_monitoring_psi_critical: float = Field(default=0.25, gt=0, le=2)
    model_monitoring_significance_level: float = Field(default=0.05, gt=0, lt=1)
    model_monitoring_performance_degradation_ratio: float = Field(default=1.25, gt=1, le=10)

    # Hybrid risk ensemble. The rule score remains the primary signal for
    # continuity; peer history and genuine model outputs are advisory signals.
    risk_ensemble_rule_weight: float = Field(default=0.50, ge=0, le=1)
    risk_ensemble_statistical_weight: float = Field(default=0.25, ge=0, le=1)
    risk_ensemble_ml_weight: float = Field(default=0.25, ge=0, le=1)
    risk_rule_progress_weight: float = Field(default=0.25, ge=0, le=1)
    risk_rule_cost_weight: float = Field(default=0.25, ge=0, le=1)
    risk_rule_schedule_weight: float = Field(default=0.25, ge=0, le=1)
    risk_rule_milestone_weight: float = Field(default=0.15, ge=0, le=1)
    risk_rule_expenditure_weight: float = Field(default=0.10, ge=0, le=1)
    risk_cost_domain_cost_weight: float = Field(default=0.60, ge=0, le=1)
    risk_cost_domain_progress_weight: float = Field(default=0.20, ge=0, le=1)
    risk_cost_domain_schedule_weight: float = Field(default=0.20, ge=0, le=1)
    risk_schedule_domain_schedule_weight: float = Field(default=0.60, ge=0, le=1)
    risk_schedule_domain_milestone_weight: float = Field(default=0.30, ge=0, le=1)
    risk_schedule_domain_progress_weight: float = Field(default=0.10, ge=0, le=1)
    risk_implementation_domain_progress_weight: float = Field(default=0.40, ge=0, le=1)
    risk_implementation_domain_milestone_weight: float = Field(default=0.35, ge=0, le=1)
    risk_implementation_domain_expenditure_weight: float = Field(default=0.25, ge=0, le=1)
    risk_progress_gap_saturation_pp: float = Field(default=30, gt=0)
    risk_cost_overrun_saturation_pct: float = Field(default=50, gt=0)
    risk_schedule_delay_saturation_days: float = Field(default=365, gt=0)
    risk_expenditure_gap_saturation_pp: float = Field(default=30, gt=0)
    risk_level_watch_threshold: float = Field(default=35, ge=0, le=100)
    risk_level_high_threshold: float = Field(default=60, ge=0, le=100)
    risk_level_critical_threshold: float = Field(default=80, ge=0, le=100)
    risk_driver_medium_threshold: float = Field(default=30, ge=0, le=100)
    risk_driver_high_threshold: float = Field(default=60, ge=0, le=100)
    risk_statistical_min_peer_count: int = Field(default=5, ge=3, le=1000)
    risk_ml_cost_weight: float = Field(default=0.50, ge=0, le=1)
    risk_ml_schedule_weight: float = Field(default=0.50, ge=0, le=1)
    # Risk trajectory bands are expressed in absolute 0-100 score points.
    # Small changes are treated as measurement noise, while a 10-point monthly
    # rise matches the default early-warning threshold for a sharp increase.
    risk_trajectory_stable_band_points: float = Field(default=2.0, ge=0, le=100)
    risk_trajectory_meaningful_increase_points: float = Field(default=5.0, ge=0, le=100)
    risk_trajectory_rapid_increase_points: float = Field(default=10.0, ge=0, le=100)
    comparison_significant_risk_increase_points: float = Field(default=10.0, ge=0, le=100)

    # Data confidence is a deterministic input-data assessment, never a model
    # probability. Weight groups must sum to one.
    data_confidence_required_fields_weight: float = Field(default=0.20, ge=0, le=1)
    data_confidence_freshness_weight: float = Field(default=0.15, ge=0, le=1)
    data_confidence_history_weight: float = Field(default=0.15, ge=0, le=1)
    data_confidence_milestone_weight: float = Field(default=0.10, ge=0, le=1)
    data_confidence_cost_weight: float = Field(default=0.10, ge=0, le=1)
    data_confidence_progress_weight: float = Field(default=0.10, ge=0, le=1)
    data_confidence_clearance_weight: float = Field(default=0.05, ge=0, le=1)
    data_confidence_land_weight: float = Field(default=0.05, ge=0, le=1)
    data_confidence_agency_contract_weight: float = Field(default=0.05, ge=0, le=1)
    data_confidence_validation_weight: float = Field(default=0.05, ge=0, le=1)
    data_confidence_fresh_days: int = Field(default=45, ge=1, le=365)
    data_confidence_stale_days: int = Field(default=180, ge=2, le=1825)
    data_confidence_history_target_months: int = Field(default=12, ge=1, le=60)
    data_confidence_anomaly_penalty: float = Field(default=20, ge=0, le=100)
    data_confidence_validation_issue_penalty: float = Field(default=10, ge=0, le=100)

    warning_progress_variance_threshold_pp: float = Field(default=10, ge=0, le=100)
    warning_progress_variance_high_pp: float = Field(default=15, ge=0, le=100)
    warning_progress_variance_critical_pp: float = Field(default=25, ge=0, le=100)
    warning_cost_escalation_threshold_pct: float = Field(default=10, ge=0)
    warning_cost_escalation_high_pct: float = Field(default=20, ge=0)
    warning_cost_escalation_critical_pct: float = Field(default=40, ge=0)
    warning_expenditure_gap_threshold_pp: float = Field(default=10, ge=0, le=100)
    warning_expenditure_gap_high_pp: float = Field(default=20, ge=0, le=100)
    warning_expenditure_gap_critical_pp: float = Field(default=30, ge=0, le=100)
    warning_risk_increase_threshold_points: float = Field(default=10, ge=0, le=100)
    warning_risk_increase_high_points: float = Field(default=20, ge=0, le=100)
    warning_risk_increase_critical_points: float = Field(default=30, ge=0, le=100)
    warning_delay_probability_threshold: float = Field(default=0.65, ge=0, le=1)
    warning_delay_probability_high: float = Field(default=0.80, ge=0, le=1)
    warning_delay_probability_critical: float = Field(default=0.90, ge=0, le=1)
    warning_cost_probability_threshold: float = Field(default=0.65, ge=0, le=1)
    warning_cost_probability_high: float = Field(default=0.80, ge=0, le=1)
    warning_cost_probability_critical: float = Field(default=0.90, ge=0, le=1)
    warning_completion_revision_threshold_days: int = Field(default=30, ge=1)
    warning_completion_revision_high_days: int = Field(default=180, ge=1)
    warning_completion_revision_critical_days: int = Field(default=365, ge=1)
    warning_overdue_milestone_threshold_count: int = Field(default=1, ge=1)
    warning_overdue_milestone_high_count: int = Field(default=3, ge=1)
    warning_overdue_milestone_critical_count: int = Field(default=5, ge=1)
    warning_stagnation_cycles: int = Field(default=3, ge=2, le=24)
    warning_stagnation_high_cycles: int = Field(default=4, ge=2, le=24)
    warning_stagnation_critical_cycles: int = Field(default=6, ge=2, le=24)
    warning_stagnation_epsilon_pp: float = Field(default=0.5, ge=0, le=10)

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    @field_validator("api_prefix")
    @classmethod
    def validate_api_prefix(cls, value: str) -> str:
        value = value.rstrip("/")
        if not value.startswith("/"):
            raise ValueError("API_PREFIX must start with '/'")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, values: list[str]) -> list[str]:
        if "*" in values:
            raise ValueError("CORS_ORIGINS cannot contain '*' when Bearer credentials are used")
        return values

    @model_validator(mode="after")
    def validate_risk_configuration(self) -> "Settings":
        if self.assistant_chunk_overlap_characters >= self.assistant_chunk_characters:
            raise ValueError("ASSISTANT_CHUNK_OVERLAP_CHARACTERS must be smaller than ASSISTANT_CHUNK_CHARACTERS")
        groups = {
            "RISK_ENSEMBLE_*_WEIGHT": (
                self.risk_ensemble_rule_weight,
                self.risk_ensemble_statistical_weight,
                self.risk_ensemble_ml_weight,
            ),
            "RISK_RULE_*_WEIGHT": (
                self.risk_rule_progress_weight,
                self.risk_rule_cost_weight,
                self.risk_rule_schedule_weight,
                self.risk_rule_milestone_weight,
                self.risk_rule_expenditure_weight,
            ),
            "RISK_ML_*_WEIGHT": (self.risk_ml_cost_weight, self.risk_ml_schedule_weight),
            "RISK_COST_DOMAIN_*_WEIGHT": (
                self.risk_cost_domain_cost_weight,
                self.risk_cost_domain_progress_weight,
                self.risk_cost_domain_schedule_weight,
            ),
            "RISK_SCHEDULE_DOMAIN_*_WEIGHT": (
                self.risk_schedule_domain_schedule_weight,
                self.risk_schedule_domain_milestone_weight,
                self.risk_schedule_domain_progress_weight,
            ),
            "RISK_IMPLEMENTATION_DOMAIN_*_WEIGHT": (
                self.risk_implementation_domain_progress_weight,
                self.risk_implementation_domain_milestone_weight,
                self.risk_implementation_domain_expenditure_weight,
            ),
            "DATA_CONFIDENCE_*_WEIGHT": (
                self.data_confidence_required_fields_weight,
                self.data_confidence_freshness_weight,
                self.data_confidence_history_weight,
                self.data_confidence_milestone_weight,
                self.data_confidence_cost_weight,
                self.data_confidence_progress_weight,
                self.data_confidence_clearance_weight,
                self.data_confidence_land_weight,
                self.data_confidence_agency_contract_weight,
                self.data_confidence_validation_weight,
            ),
        }
        for name, weights in groups.items():
            if abs(sum(weights) - 1.0) > 1e-9:
                raise ValueError(f"{name} values must sum to 1.0")
        if not (
            self.risk_level_watch_threshold
            < self.risk_level_high_threshold
            < self.risk_level_critical_threshold
        ):
            raise ValueError("Risk level thresholds must be strictly increasing")
        if self.risk_driver_medium_threshold >= self.risk_driver_high_threshold:
            raise ValueError("Risk driver thresholds must be strictly increasing")
        if self.data_confidence_fresh_days >= self.data_confidence_stale_days:
            raise ValueError("Data confidence freshness thresholds must be strictly increasing")
        if not (
            self.risk_trajectory_stable_band_points
            < self.risk_trajectory_meaningful_increase_points
            <= self.risk_trajectory_rapid_increase_points
        ):
            raise ValueError(
                "Risk trajectory thresholds must satisfy stable < meaningful <= rapid"
            )
        if self.model_monitoring_psi_warning >= self.model_monitoring_psi_critical:
            raise ValueError("Model monitoring PSI thresholds must be strictly increasing")
        warning_threshold_groups = {
            "WARNING_PROGRESS_VARIANCE_*": (
                self.warning_progress_variance_threshold_pp,
                self.warning_progress_variance_high_pp,
                self.warning_progress_variance_critical_pp,
            ),
            "WARNING_COST_ESCALATION_*": (
                self.warning_cost_escalation_threshold_pct,
                self.warning_cost_escalation_high_pct,
                self.warning_cost_escalation_critical_pct,
            ),
            "WARNING_EXPENDITURE_GAP_*": (
                self.warning_expenditure_gap_threshold_pp,
                self.warning_expenditure_gap_high_pp,
                self.warning_expenditure_gap_critical_pp,
            ),
            "WARNING_RISK_INCREASE_*": (
                self.warning_risk_increase_threshold_points,
                self.warning_risk_increase_high_points,
                self.warning_risk_increase_critical_points,
            ),
            "WARNING_DELAY_PROBABILITY_*": (
                self.warning_delay_probability_threshold,
                self.warning_delay_probability_high,
                self.warning_delay_probability_critical,
            ),
            "WARNING_COST_PROBABILITY_*": (
                self.warning_cost_probability_threshold,
                self.warning_cost_probability_high,
                self.warning_cost_probability_critical,
            ),
            "WARNING_COMPLETION_REVISION_*": (
                self.warning_completion_revision_threshold_days,
                self.warning_completion_revision_high_days,
                self.warning_completion_revision_critical_days,
            ),
            "WARNING_OVERDUE_MILESTONE_*": (
                self.warning_overdue_milestone_threshold_count,
                self.warning_overdue_milestone_high_count,
                self.warning_overdue_milestone_critical_count,
            ),
            "WARNING_STAGNATION_*_CYCLES": (
                self.warning_stagnation_cycles,
                self.warning_stagnation_high_cycles,
                self.warning_stagnation_critical_cycles,
            ),
        }
        for name, thresholds in warning_threshold_groups.items():
            if not thresholds[0] < thresholds[1] < thresholds[2]:
                raise ValueError(f"{name} thresholds must be strictly increasing")
        return self

    @property
    def sqlalchemy_database_url(self) -> str:
        if not self.database_url:
            raise ValueError("DATABASE_URL is required for database-backed endpoints")
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
