from collections import Counter, defaultdict
from statistics import median
from typing import Any, Callable

from app.errors import AppError, NotFoundError


MetricGetter = Callable[[dict[str, Any]], float | int | None]

COST_BANDS: tuple[tuple[float, float | None, str], ...] = (
    (0, 1_000, "Below ₹1,000 Cr"),
    (1_000, 5_000, "₹1,000-5,000 Cr"),
    (5_000, 10_000, "₹5,000-10,000 Cr"),
    (10_000, 25_000, "₹10,000-25,000 Cr"),
    (25_000, 50_000, "₹25,000-50,000 Cr"),
    (50_000, 100_000, "₹50,000-100,000 Cr"),
    (100_000, None, "₹100,000 Cr and above"),
)

METRICS: tuple[tuple[str, str, str, bool, MetricGetter], ...] = (
    ("cost_overrun_percentage", "Cost overrun", "%", True, lambda row: row.get("cost_overrun_percentage")),
    ("schedule_delay_days", "Schedule delay", "days", True, lambda row: row.get("schedule_delay_days")),
    ("monthly_progress_velocity", "Physical progress velocity", "pp/month", False, lambda row: row.get("monthly_progress_velocity")),
    ("expenditure_efficiency", "Expenditure efficiency", "index", False, lambda row: row.get("expenditure_efficiency")),
    ("milestone_slippage_percentage", "Milestone slippage", "%", True, lambda row: row.get("milestone_slippage_percentage")),
    ("overall_risk_score", "Overall risk", "score", True, lambda row: row.get("overall_risk_score")),
    ("cost_risk_score", "Cost risk", "score", True, lambda row: row.get("cost_risk_score")),
    ("schedule_risk_score", "Schedule risk", "score", True, lambda row: row.get("schedule_risk_score")),
    ("implementation_risk_score", "Implementation risk", "score", True, lambda row: row.get("implementation_risk_score")),
)


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _median(rows: list[dict[str, Any]], getter: MetricGetter) -> float | None:
    values = [_number(getter(row)) for row in rows]
    available = [value for value in values if value is not None]
    return float(median(available)) if available else None


def _average(rows: list[dict[str, Any]], key: str) -> float | None:
    values = [_number(row.get(key)) for row in rows]
    available = [value for value in values if value is not None]
    return sum(available) / len(available) if available else None


def _clamp(value: float, lower: float = 0, upper: float = 100) -> float:
    return max(lower, min(upper, value))


def cost_band(value: Any) -> str | None:
    amount = _number(value)
    if amount is None or amount < 0:
        return None
    for lower, upper, label in COST_BANDS:
        if amount >= lower and (upper is None or amount < upper):
            return label
    return None


def _project(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": row["project_id"],
        "project_name": row["project_name"],
        "ministry": row["ministry"],
        "implementing_agency": row["implementing_agency"],
        "sector": row["sector"],
        "project_type": row["project_type"],
        "state": row["state"],
        "states": row.get("states") or [],
        "status": row["status"],
        "original_cost": row.get("original_cost"),
        "revised_cost": row.get("revised_cost"),
        "start_date": row.get("start_date"),
        "start_date_source": row.get("start_date_source"),
        "start_year": row.get("start_year"),
        "planned_duration_days": row.get("planned_duration_days"),
        "cost_band": cost_band(row.get("original_cost")),
        "cost_overrun_percentage": row.get("cost_overrun_percentage"),
        "schedule_delay_days": row.get("schedule_delay_days"),
        "monthly_progress_velocity": row.get("monthly_progress_velocity"),
        "expenditure_efficiency": row.get("expenditure_efficiency"),
        "milestone_slippage_percentage": row.get("milestone_slippage_percentage"),
        "milestone_completion_percentage": row.get("milestone_completion_percentage"),
        "overall_risk_score": row.get("overall_risk_score"),
        "cost_risk_score": row.get("cost_risk_score"),
        "schedule_risk_score": row.get("schedule_risk_score"),
        "implementation_risk_score": row.get("implementation_risk_score"),
    }


def _peer_score(
    selected: dict[str, Any],
    candidate: dict[str, Any],
    agency_counts: Counter[str],
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    if selected["sector"] == candidate["sector"]:
        score += 30
        reasons.append(f"Same sector: {selected['sector']}")
    selected_type = selected.get("project_type")
    if selected_type and selected_type != "Not reported" and selected_type == candidate.get("project_type"):
        score += 20
        reasons.append(f"Same project type: {selected_type}")
    selected_band = cost_band(selected.get("original_cost"))
    if selected_band and selected_band == cost_band(candidate.get("original_cost")):
        score += 15
        reasons.append(f"Same original-cost band: {selected_band}")
    shared_states = sorted(set(selected.get("states") or []) & set(candidate.get("states") or []))
    if shared_states:
        score += 10
        reasons.append(f"Shared geography: {', '.join(shared_states)}")
    agency = selected.get("implementing_agency")
    if agency and agency != "Not reported" and agency == candidate.get("implementing_agency") and agency_counts[agency] > 1:
        score += 5
        reasons.append(f"Same implementing agency: {agency}")
    selected_duration = _number(selected.get("planned_duration_days"))
    candidate_duration = _number(candidate.get("planned_duration_days"))
    if selected_duration and candidate_duration:
        difference = abs(candidate_duration - selected_duration) / selected_duration
        if difference <= 0.25:
            score += 10
            reasons.append("Planned duration within 25%")
        elif difference <= 0.50:
            score += 5
            reasons.append("Planned duration within 50%")
    selected_year = selected.get("start_year")
    candidate_year = candidate.get("start_year")
    if selected_year is not None and candidate_year is not None:
        year_gap = abs(int(candidate_year) - int(selected_year))
        if year_gap <= 2:
            score += 10
            reasons.append("Start period within 2 years")
        elif year_gap <= 5:
            score += 5
            reasons.append("Start period within 5 years")
    return score, reasons


def _is_historical(selected: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if candidate.get("status") == "completed":
        return True
    selected_year = selected.get("start_year")
    candidate_year = candidate.get("start_year")
    return selected_year is not None and candidate_year is not None and int(candidate_year) < int(selected_year)


def _score(metric: str, row: dict[str, Any]) -> float | None:
    value = _number(row.get(metric))
    if value is None:
        return None
    if metric == "cost_overrun_percentage":
        return _clamp(100 - max(0, value) * 2)
    if metric == "schedule_delay_days":
        return _clamp(100 - max(0, value) / 10)
    if metric == "monthly_progress_velocity":
        return _clamp(value * 20)
    if metric == "expenditure_efficiency":
        return _clamp(value)
    if metric == "milestone_slippage_percentage":
        return _clamp(100 - value)
    if metric == "overall_risk_score":
        return _clamp(100 - value)
    return None


def _radar(selected: dict[str, Any], comparison: dict[str, Any] | None, peers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dimensions = (
        ("Cost discipline", "cost_overrun_percentage"),
        ("Schedule discipline", "schedule_delay_days"),
        ("Progress velocity", "monthly_progress_velocity"),
        ("Expenditure efficiency", "expenditure_efficiency"),
        ("Milestone delivery", "milestone_slippage_percentage"),
        ("Risk resilience", "overall_risk_score"),
    )
    result = []
    for subject, metric in dimensions:
        peer_scores = [_score(metric, peer) for peer in peers]
        available_peer_scores = [value for value in peer_scores if value is not None]
        result.append({
            "subject": subject,
            "selected_score": _score(metric, selected),
            "comparison_score": _score(metric, comparison) if comparison else None,
            "peer_median_score": float(median(available_peer_scores)) if available_peer_scores else None,
        })
    return result


def _agency_leaderboard(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in facts:
        grouped[row.get("implementing_agency") or "Not reported"].append(row)
    leaderboard = []
    for agency, rows in grouped.items():
        total_milestones = sum(int(row.get("total_milestones") or 0) for row in rows)
        completed_milestones = sum(int(row.get("completed_milestones") or 0) for row in rows)
        milestone_hit_rate = completed_milestones / total_milestones * 100 if total_milestones else None
        average_delay = _average(rows, "schedule_delay_days")
        average_overrun = _average(rows, "cost_overrun_percentage")
        average_risk = _average(rows, "overall_risk_score")
        score_parts = []
        if average_delay is not None:
            score_parts.append(_clamp(100 - max(0, average_delay) / 10))
        if average_overrun is not None:
            score_parts.append(_clamp(100 - max(0, average_overrun) * 2))
        if milestone_hit_rate is not None:
            score_parts.append(_clamp(milestone_hit_rate))
        if average_risk is not None:
            score_parts.append(_clamp(100 - average_risk))
        leaderboard.append({
            "agency": agency,
            "project_count": len(rows),
            "total_outlay": sum(_number(row.get("revised_cost")) or 0 for row in rows),
            "average_delay_days": average_delay,
            "average_cost_overrun_percentage": average_overrun,
            "milestone_hit_rate": milestone_hit_rate,
            "average_risk_score": average_risk,
            "delivery_efficiency_index": sum(score_parts) / len(score_parts) if score_parts else None,
        })
    leaderboard.sort(key=lambda row: (
        -(row["delivery_efficiency_index"] if row["delivery_efficiency_index"] is not None else -1),
        row["agency"],
    ))
    for index, row in enumerate(leaderboard, 1):
        row["rank"] = index
    return leaderboard


def build_peer_benchmark(
    facts: list[dict[str, Any]],
    *,
    project_id: str | None,
    comparison_project_id: str | None,
    max_peers: int = 8,
) -> dict[str, Any]:
    if not facts:
        raise NotFoundError("Project", project_id or "portfolio")
    selected = next(
        (row for row in facts if row["project_id"] == project_id or str(row["project_database_id"]) == project_id),
        facts[0] if project_id is None else None,
    )
    if selected is None:
        raise NotFoundError("Project", project_id or "")

    agency_counts = Counter(row.get("implementing_agency") or "Not reported" for row in facts)
    candidates = []
    for row in facts:
        if row["project_database_id"] == selected["project_database_id"]:
            continue
        score, reasons = _peer_score(selected, row, agency_counts)
        same_family = row["sector"] == selected["sector"] or (
            row.get("project_type") != "Not reported" and row.get("project_type") == selected.get("project_type")
        )
        candidates.append((row, score, reasons, same_family))
    eligible = [item for item in candidates if item[3] and item[1] >= 30]
    selection_method = "weighted sector/type peer match"
    if not eligible:
        eligible = [item for item in candidates if item[1] >= 15]
        selection_method = "relaxed weighted match (no sector/type peer met the threshold)"
    eligible.sort(key=lambda item: (-item[1], item[0]["project_id"]))
    selected_matches = eligible[:max_peers]
    peer_rows = [item[0] for item in selected_matches]
    historical_rows = [row for row in peer_rows if _is_historical(selected, row)]

    comparison = None
    if comparison_project_id:
        comparison = next((row for row in peer_rows if row["project_id"] == comparison_project_id), None)
        if comparison is None:
            raise AppError(
                "The requested comparison project is not in the selected project's peer group.",
                code="invalid_peer_comparison",
                status_code=422,
                details={"projectId": selected["project_id"], "comparisonProjectId": comparison_project_id},
            )
    elif peer_rows:
        comparison = peer_rows[0]

    def match_payload(item: tuple[dict[str, Any], int, list[str], bool]) -> dict[str, Any]:
        row, score, reasons, _ = item
        return {
            **_project(row),
            "match_score": score,
            "match_reasons": reasons,
            "is_historical": _is_historical(selected, row),
        }

    peer_payloads = [match_payload(item) for item in selected_matches]
    comparison_peer = next(
        (peer for peer in peer_payloads if comparison and peer["project_id"] == comparison["project_id"]), None
    )
    sector_rows = [row for row in facts if row["sector"] == selected["sector"]]
    metric_comparisons = []
    for key, label, unit, lower_is_better, getter in METRICS:
        metric_comparisons.append({
            "key": key,
            "label": label,
            "unit": unit,
            "lower_is_better": lower_is_better,
            "selected_value": _number(getter(selected)),
            "comparison_value": _number(getter(comparison)) if comparison else None,
            "sector_median": _median(sector_rows, getter),
            "peer_median": _median(peer_rows, getter),
            "historical_median": _median(historical_rows, getter),
            "sector_sample_size": sum(getter(row) is not None for row in sector_rows),
            "peer_sample_size": sum(getter(row) is not None for row in peer_rows),
            "historical_sample_size": sum(getter(row) is not None for row in historical_rows),
        })

    return {
        "selected_project": _project(selected),
        "comparison_peer": comparison_peer,
        "peer_group": {
            "selection_method": selection_method,
            "minimum_match_score": 30 if selection_method.startswith("weighted") else 15,
            "candidate_projects_evaluated": len(candidates),
            "peer_count": len(peer_rows),
            "historical_peer_count": len(historical_rows),
            "maximum_peers": max_peers,
        },
        "peers": peer_payloads,
        "historical_peers": [peer for peer in peer_payloads if peer["is_historical"]],
        "metric_comparisons": metric_comparisons,
        "radar": _radar(selected, comparison, peer_rows),
        "agency_leaderboard": _agency_leaderboard(facts),
        "data_availability": {
            "portfolio_projects": len(facts),
            "sector_projects": len(sector_rows),
            "projects_with_start_date": sum(row.get("start_date") is not None for row in facts),
            "projects_with_velocity": sum(row.get("monthly_progress_velocity") is not None for row in facts),
            "projects_with_milestones": sum((row.get("total_milestones") or 0) > 0 for row in facts),
            "projects_with_risk": sum(row.get("overall_risk_score") is not None for row in facts),
        },
    }
