from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from uuid import UUID

from app.ml.comparison import run_comparison


DEFINITION = {
    "code": "procurement_delay_days",
    "display_name": "Procurement delay",
    "category": "procurement",
    "unit": "days",
}


def rows(count: int = 40, *, external: bool = True) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    cost_rows: list[dict[str, object]] = []
    schedule_rows: list[dict[str, object]] = []
    for index in range(count):
        project_id = f"PX-{index:03d}"
        database_id = UUID(int=index + 1)
        risky = index % 2 == 0
        snapshot = date(2018, 1, 1) + timedelta(days=index * 30)
        label_date = date(2022, 1, 1) + timedelta(days=index * 30)
        external_features = {"procurement_delay_days": 180.0 if risky else 5.0} if external else {}
        provenance = {
            "procurement_delay_days": [{"source_name": "Published procurement register"}]
        } if external else {}
        common = {
            "project_database_id": database_id,
            "project_id": project_id,
            "snapshot_date": snapshot,
            "label_date": label_date,
            "planned_duration_days": 1000,
            "elapsed_days": 180,
            "physical_progress": 20 if risky else 28,
            "planned_progress": 30,
            "progress_variance": -10 if risky else -2,
            "expenditure_to_approved_pct": 25,
            "land_acquisition_progress": 80,
            "issue_count": 2 if risky else 0,
            "start_year": 2017,
            "snapshot_year": snapshot.year,
            "sector": "Transport",
            "project_type": "Infrastructure",
            "ministry": "Infrastructure",
            "implementing_agency": "Agency",
            "state": "State",
            "contract_status": "awarded",
            "is_synthetic": False,
            "external_features": external_features,
            "external_provenance": provenance,
        }
        cost_rows.append({
            **common,
            "approved_cost": 1000,
            "target_final_cost": 1250 if risky else 1000,
            "schedule_slippage_days": 60 if risky else 0,
            "milestone_completion_pct": 25,
            "milestone_slippage_pct": 20 if risky else 0,
        })
        schedule_rows.append({
            **common,
            "original_approved_cost": 1000,
            "elapsed_duration_pct": 18,
            "previous_physical_progress": 18 if risky else 25,
            "previous_planned_progress": 27,
            "monthly_progress_velocity": 2 if risky else 3,
            "reported_delay_days": 60 if risky else 0,
            "milestone_completion_pct": 25,
            "milestone_delay_pct": 20 if risky else 0,
            "clearance_completion_pct": 80,
            "clearance_pending_count": 1,
            "clearance_risk_status": "pending",
            "target_completion_variance_days": 300 if risky else -10,
        })
    return cost_rows, schedule_rows


def run(tmp_path: Path, *, external: bool) -> dict[str, object]:
    cost, schedule = rows(external=external)
    artifact, path, checksum = run_comparison(
        cost,
        schedule,
        [DEFINITION],
        version="comparison-1" if external else "comparison-no-external",
        artifact_dir=tmp_path,
        minimum_rows=30,
        minimum_class_rows=5,
        minimum_external_coverage=0.30,
        cost_overrun_threshold_pct=10,
        schedule_overrun_threshold_days=0,
        random_state=42,
    )
    assert path.exists()
    assert len(checksum) == 64
    return artifact


def test_comparison_uses_shared_splits_and_reports_all_outcomes(tmp_path: Path) -> None:
    artifact = run(tmp_path, external=True)

    assert artifact["status"] == "completed"
    assert artifact["feature_sets"]["model_b_external"]["cost"] == ["procurement_delay_days"]
    assert set(artifact["comparison"]) == {"cost_overrun", "time_overrun", "risk_classification"}
    assert artifact["metrics"]["cost_overrun"]["split"]["strategy"] == "chronological_60_20_20_by_label_date"
    assert artifact["metrics"]["risk_classification"]["class_counts"] == {"0": 20, "1": 20}
    assert isinstance(artifact["model_b_improvement_supported"], bool)
    assert "CUF+" in artifact["conclusion"]


def test_comparison_refuses_to_infer_model_b_without_validated_coverage(tmp_path: Path) -> None:
    artifact = run(tmp_path, external=False)

    assert artifact["status"] == "insufficient_data"
    assert artifact["model_b_improvement_supported"] is False
    assert artifact["comparison"] == {
        "cost_overrun": None,
        "time_overrun": None,
        "risk_classification": None,
    }
    assert "No consistent measured CUF+ improvement" in artifact["conclusion"]


def test_external_experiment_migration_has_provenance_and_rls() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase/migrations/20260921000200_cuf_plus_experiments.sql"
    ).read_text(encoding="utf-8")

    assert "source_uri text not null" in migration
    assert "validation_status public.external_feature_validation_status" in migration
    assert "enable row level security" in migration
    assert "public.can_manage_models()" in migration
    assert "insert into public.external_feature_definitions" in migration
    assert "external_feature_observations" in migration
