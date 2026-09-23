from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook

from app.ingestion.cuf import detect_mapping, parse_cuf_file, validate_rows


FIXTURE = Path(__file__).parent / "fixtures" / "sample_cuf.csv"


def project_lookup() -> dict[str, tuple[str, str]]:
    return {
        "prj-001": ("20000000-0000-0000-0000-000000000001", "PRJ-001"),
        "prj-002": ("20000000-0000-0000-0000-000000000002", "PRJ-002"),
    }


def test_csv_pipeline_maps_normalizes_and_reports_invalid_rows() -> None:
    table = parse_cuf_file(FIXTURE.read_bytes(), "csv", max_rows=100)
    result = validate_rows(table, project_lookup(), set())

    assert result.mapping["Project ID"] == "project_code"
    assert result.mapping["Reporting Month"] == "reporting_month"
    assert result.summary["total_rows"] == 4
    assert result.summary["valid_rows"] == 1
    assert result.summary["invalid_rows"] == 3
    assert result.summary["duplicate_rows"] == 1
    assert 0 < result.summary["quality_score"] < 100

    first = result.rows[0]
    assert first["normalized_data"]["reporting_month"] == "2026-05-01"
    assert first["normalized_data"]["approved_cost"] == 1000.0
    assert first["normalized_data"]["issues"] == ["Utility relocation", "land handover"]
    assert first["normalized_data"]["clearance_status"] == {
        "environment": "approved",
        "forest": "pending",
    }
    assert first["transformations"]

    error_codes = {
        error["code"]
        for row in result.rows
        for error in row["validation_errors"]
    }
    assert {"out_of_range", "duplicate_file_row", "unknown_project"} <= error_codes


def test_existing_month_is_rejected_without_overwrite() -> None:
    table = parse_cuf_file(FIXTURE.read_bytes(), "csv", max_rows=100)
    existing = {("20000000-0000-0000-0000-000000000001", date(2026, 5, 1))}
    result = validate_rows(table, project_lookup(), existing)
    assert result.rows[0]["validation_status"] == "invalid"
    assert result.rows[0]["is_duplicate"] is True
    assert any(error["code"] == "duplicate_monthly_import" for error in result.rows[0]["validation_errors"])


def test_xlsx_pipeline_reads_the_same_canonical_fields() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Project Code", "Monitoring Month", "Actual Progress", "Remarks"])
    sheet.append(["PRJ-001", date(2026, 5, 15), 64, "Reviewed"])
    buffer = BytesIO()
    workbook.save(buffer)

    table = parse_cuf_file(buffer.getvalue(), "xlsx", max_rows=10)
    mapping = detect_mapping(table.columns)
    result = validate_rows(table, project_lookup(), set())

    assert mapping == {
        "Project Code": "project_code",
        "Monitoring Month": "reporting_month",
        "Actual Progress": "physical_progress",
        "Remarks": "remarks",
    }
    assert result.rows[0]["validation_status"] == "valid"
    assert result.rows[0]["normalized_data"]["reporting_month"] == "2026-05-01"


def test_iqr_outlier_is_reported_without_modifying_or_rejecting_value() -> None:
    content = (
        "Project ID,Reporting Month,Approved Cost\n"
        "PX-001,2026-05,100\nPX-002,2026-05,101\n"
        "PX-003,2026-05,102\nPX-004,2026-05,1000\n"
    ).encode()
    lookup = {
        f"px-00{index}": (f"20000000-0000-0000-0000-00000000000{index}", f"PX-00{index}")
        for index in range(1, 5)
    }
    result = validate_rows(parse_cuf_file(content, "csv", 10), lookup, set())
    outlier = result.rows[3]
    assert outlier["validation_status"] == "valid"
    assert outlier["normalized_data"]["approved_cost"] == 1000.0
    assert outlier["anomaly_count"] == 1
    assert outlier["validation_warnings"][0]["code"] == "statistical_outlier"
