from __future__ import annotations

from collections import defaultdict, deque
from typing import Any
from uuid import UUID

from app.auth.models import CurrentProfile
from app.errors import ConflictError, NotFoundError
from app.repositories.dependencies import DependencyRepository
from app.schemas.dependencies import DependencyCreateRequest, DependencyImportRequest


ANALYSIS_STATEMENT = (
    "Potentially affected milestones are reachable through explicit dependency edges from a currently delayed "
    "upstream milestone. This is dependency-risk propagation analysis, not a claim that downstream delay is certain."
)


class DependencyService:
    def __init__(self, repository: DependencyRepository) -> None:
        self.repository = repository

    async def graph(self, identifier: str) -> dict[str, Any]:
        project = await self.repository.project(identifier)
        if project is None:
            raise NotFoundError("Project", identifier)
        milestones = await self.repository.milestones(project["id"])
        edges = await self.repository.edges(project["id"])
        return self._analyse(project, milestones, edges)

    async def create(
        self,
        identifier: str,
        payload: DependencyCreateRequest,
        profile: CurrentProfile,
    ) -> dict[str, Any]:
        project = await self._project(identifier)
        upstream = await self._milestone(project["id"], payload.upstream_milestone)
        downstream = await self._milestone(project["id"], payload.downstream_milestone)
        edges = await self.repository.edges(project["id"])
        self._validate_new_edge(edges, upstream["id"], downstream["id"], payload.dependency_type)
        await self.repository.insert_edge(
            project_id=project["id"],
            upstream_id=upstream["id"],
            downstream_id=downstream["id"],
            dependency_type=payload.dependency_type,
            lag_days=payload.lag_days,
            source_system="MANUAL",
            source_reference=payload.source_reference,
            actor_id=profile.id,
        )
        return await self.graph(identifier)

    async def import_edges(
        self,
        identifier: str,
        payload: DependencyImportRequest,
        profile: CurrentProfile,
    ) -> dict[str, Any]:
        project = await self._project(identifier)
        existing = [] if payload.replace_existing else await self.repository.edges(project["id"])
        prepared: list[tuple[dict[str, Any], dict[str, Any], Any]] = []
        working = [dict(edge) for edge in existing]
        for definition in payload.edges:
            upstream = await self._milestone(project["id"], definition.upstream_milestone)
            downstream = await self._milestone(project["id"], definition.downstream_milestone)
            self._validate_new_edge(working, upstream["id"], downstream["id"], definition.dependency_type)
            prepared.append((upstream, downstream, definition))
            working.append({
                "upstream_milestone_id": upstream["id"],
                "downstream_milestone_id": downstream["id"],
                "dependency_type": definition.dependency_type,
            })

        if payload.replace_existing:
            await self.repository.delete_all(project["id"])
        for upstream, downstream, definition in prepared:
            await self.repository.insert_edge(
                project_id=project["id"],
                upstream_id=upstream["id"],
                downstream_id=downstream["id"],
                dependency_type=definition.dependency_type,
                lag_days=definition.lag_days,
                source_system=payload.source_system,
                source_reference=payload.source_reference,
                actor_id=profile.id,
            )
        return await self.graph(identifier)

    async def delete(self, identifier: str, dependency_id: UUID) -> None:
        project = await self._project(identifier)
        if not await self.repository.delete_edge(project["id"], dependency_id):
            raise NotFoundError("Milestone dependency", str(dependency_id))

    async def _project(self, identifier: str) -> dict[str, Any]:
        project = await self.repository.project(identifier)
        if project is None:
            raise NotFoundError("Project", identifier)
        return project

    async def _milestone(self, project_id: UUID, reference: str) -> dict[str, Any]:
        milestone = await self.repository.resolve_milestone(project_id, reference)
        if milestone is None:
            raise NotFoundError("Project milestone", reference)
        return milestone

    @staticmethod
    def _validate_new_edge(
        edges: list[dict[str, Any]],
        upstream_id: UUID,
        downstream_id: UUID,
        dependency_type: str,
    ) -> None:
        if upstream_id == downstream_id:
            raise ConflictError("A milestone cannot depend on itself.")
        if any(
            edge["upstream_milestone_id"] == upstream_id
            and edge["downstream_milestone_id"] == downstream_id
            and edge["dependency_type"] == dependency_type
            for edge in edges
        ):
            raise ConflictError("This explicit milestone dependency already exists.")
        adjacency: dict[UUID, set[UUID]] = defaultdict(set)
        for edge in edges:
            adjacency[edge["upstream_milestone_id"]].add(edge["downstream_milestone_id"])
        queue = deque([downstream_id])
        visited: set[UUID] = set()
        while queue:
            current = queue.popleft()
            if current == upstream_id:
                raise ConflictError("This dependency would create a cycle in the milestone graph.")
            if current in visited:
                continue
            visited.add(current)
            queue.extend(adjacency[current] - visited)

    @staticmethod
    def _analyse(
        project: dict[str, Any],
        milestones: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> dict[str, Any]:
        by_id = {milestone["id"]: milestone for milestone in milestones}
        adjacency: dict[UUID, list[tuple[UUID, UUID]]] = defaultdict(list)
        for edge in edges:
            adjacency[edge["upstream_milestone_id"]].append((edge["downstream_milestone_id"], edge["id"]))
        for values in adjacency.values():
            values.sort(key=lambda item: (by_id[item[0]]["sequence_no"], by_id[item[0]]["code"]))

        delayed = [milestone for milestone in milestones if milestone["status"] == "delayed"]
        best_paths: dict[UUID, list[UUID]] = {}
        trigger_ids: dict[UUID, set[UUID]] = defaultdict(set)
        affected_edges: set[UUID] = set()
        for source in delayed:
            queue = deque([(source["id"], [source["id"]])])
            visited = {source["id"]}
            while queue:
                current, path = queue.popleft()
                for target, edge_id in adjacency[current]:
                    target_milestone = by_id[target]
                    if target_milestone["status"] == "completed":
                        continue
                    affected_edges.add(edge_id)
                    trigger_ids[target].add(source["id"])
                    if target in visited:
                        continue
                    visited.add(target)
                    next_path = [*path, target]
                    if target not in best_paths or len(next_path) < len(best_paths[target]):
                        best_paths[target] = next_path
                    queue.append((target, next_path))

        paths = []
        for target_id, path in sorted(
            best_paths.items(), key=lambda item: (len(item[1]), by_id[item[0]]["sequence_no"], by_id[item[0]]["code"])
        ):
            source = by_id[path[0]]
            target = by_id[target_id]
            paths.append({
                "source_milestone_id": source["id"],
                "source_code": source["code"],
                "target_milestone_id": target["id"],
                "target_code": target["code"],
                "depth": len(path) - 1,
                "milestone_ids": path,
                "milestone_codes": [by_id[item]["code"] for item in path],
                "milestone_names": [by_id[item]["name"] for item in path],
            })

        nodes = [{
            **milestone,
            "is_delayed_trigger": milestone["id"] in {item["id"] for item in delayed},
            "potentially_affected": milestone["id"] in best_paths,
            "dependency_depth": len(best_paths[milestone["id"]]) - 1 if milestone["id"] in best_paths else None,
            "trigger_milestone_ids": sorted(trigger_ids[milestone["id"]], key=str),
        } for milestone in milestones]
        response_edges = [{**edge, "potentially_affected": edge["id"] in affected_edges} for edge in edges]
        return {
            "project_id": project["project_code"],
            "project_name": project["name"],
            "nodes": nodes,
            "edges": response_edges,
            "propagation_paths": paths,
            "summary": {
                "planning_node_count": len(milestones),
                "explicit_dependency_count": len(edges),
                "delayed_trigger_count": len(delayed),
                "potentially_affected_count": len(best_paths),
                "maximum_dependency_depth": max((len(path) - 1 for path in best_paths.values()), default=0),
                "analysis_kind": "explicit_dependency_risk_propagation",
                "causality_claimed": False,
                "statement": ANALYSIS_STATEMENT,
            },
        }
