import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background, Controls, MarkerType, MiniMap, Position, ReactFlow,
  type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertCircle, GitBranch, Link2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, formatDate } from './ui';
import {
  DependencyService,
  type DependencyGraph,
  type DependencyNode,
  type DependencyType,
} from '../services/dependencyService';

interface Props {
  projectId: string;
  backendEnabled: boolean;
  canManage: boolean;
}

const TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'Finish to start',
  start_to_start: 'Start to start',
  finish_to_finish: 'Finish to finish',
  start_to_finish: 'Start to finish',
};

const STATUS_LABELS: Record<DependencyNode['status'], string> = {
  completed: 'Completed',
  on_track: 'On Track',
  at_risk: 'At Risk',
  delayed: 'Delayed',
};

function nodePalette(node: DependencyNode): { border: string; background: string; color: string } {
  if (node.isDelayedTrigger) return { border: '#dc2626', background: '#fef2f2', color: '#991b1b' };
  if (node.potentiallyAffected) return { border: '#f59e0b', background: '#fffbeb', color: '#92400e' };
  if (node.status === 'completed') return { border: '#22c55e', background: '#f0fdf4', color: '#166534' };
  if (node.status === 'at_risk') return { border: '#f59e0b', background: '#fffbeb', color: '#92400e' };
  return { border: '#287f86', background: '#eef8f7', color: '#164f5a' };
}

function graphElements(graph: DependencyGraph, selectedId: string | null): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    indegree.set(edge.downstreamMilestoneId, (indegree.get(edge.downstreamMilestoneId) ?? 0) + 1);
    outgoing.get(edge.upstreamMilestoneId)?.push(edge.downstreamMilestoneId);
  }
  const depth = new Map(graph.nodes.map(node => [node.id, 0]));
  const queue = graph.nodes
    .filter(node => (indegree.get(node.id) ?? 0) === 0)
    .sort((left, right) => left.sequenceNo - right.sequenceNo)
    .map(node => node.id);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const target of outgoing.get(current) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(current) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  const grouped = new Map<number, DependencyNode[]>();
  for (const node of graph.nodes) {
    const column = depth.get(node.id) ?? 0;
    grouped.set(column, [...(grouped.get(column) ?? []), node]);
  }
  for (const nodes of grouped.values()) nodes.sort((left, right) => left.sequenceNo - right.sequenceNo);

  return {
    nodes: graph.nodes.map(node => {
      const palette = nodePalette(node);
      const column = depth.get(node.id) ?? 0;
      const row = grouped.get(column)?.findIndex(item => item.id === node.id) ?? 0;
      return {
        id: node.id,
        position: { x: column * 285, y: row * 145 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div className="text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{node.code}</span>
                <span className="text-[9px] uppercase opacity-60">{node.nodeType}</span>
              </div>
              <p className="mt-1 text-xs font-semibold leading-snug">{node.name}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                <span>{STATUS_LABELS[node.status]}</span>
                {node.potentiallyAffected && <span>Depth {node.dependencyDepth}</span>}
              </div>
            </div>
          ),
        },
        style: {
          width: 225,
          border: `2px ${node.potentiallyAffected ? 'dashed' : 'solid'} ${palette.border}`,
          background: palette.background,
          color: palette.color,
          borderRadius: 8,
          padding: 11,
          boxShadow: selectedId === node.id ? '0 0 0 3px rgba(30, 86, 160, 0.22)' : '0 1px 3px rgba(15, 23, 42, 0.08)',
        },
      } satisfies Node;
    }),
    edges: graph.edges.map(edge => ({
      id: edge.id,
      source: edge.upstreamMilestoneId,
      target: edge.downstreamMilestoneId,
      label: edge.lagDays ? `${edge.lagDays > 0 ? '+' : ''}${edge.lagDays}d` : undefined,
      type: 'smoothstep',
      animated: edge.potentiallyAffected,
      style: {
        stroke: edge.potentiallyAffected ? '#f59e0b' : '#94a3b8',
        strokeWidth: edge.potentiallyAffected ? 2.5 : 1.5,
      },
      labelStyle: { fontSize: 10, fill: '#64748b' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.potentiallyAffected ? '#f59e0b' : '#94a3b8',
      },
      data: { dependencyType: edge.dependencyType, upstream: byId.get(edge.upstreamMilestoneId)?.code },
    })),
  };
}

export function MilestoneDependencyGraph({ projectId, backendEnabled, canManage }: Props) {
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(backendEnabled);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [upstream, setUpstream] = useState('');
  const [downstream, setDownstream] = useState('');
  const [dependencyType, setDependencyType] = useState<DependencyType>('finish_to_start');
  const [lagDays, setLagDays] = useState(0);
  const [sourceReference, setSourceReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!backendEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await DependencyService.graph(projectId, signal);
      setGraph(response);
      setUpstream(current => current || response.nodes[0]?.id || '');
      setDownstream(current => current || response.nodes[1]?.id || '');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Unable to load milestone dependencies.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [backendEnabled, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const elements = useMemo(() => graph ? graphElements(graph, selectedNodeId) : { nodes: [], edges: [] }, [graph, selectedNodeId]);
  const selectedNode = graph?.nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedPaths = graph?.propagationPaths.filter(path => path.targetMilestoneId === selectedNodeId) ?? [];

  const createDependency = async () => {
    if (!upstream || !downstream) return;
    setSaving(true);
    setMutationError(null);
    try {
      const response = await DependencyService.create(projectId, {
        upstreamMilestone: upstream,
        downstreamMilestone: downstream,
        dependencyType,
        lagDays,
        sourceReference: sourceReference.trim() || undefined,
      });
      setGraph(response);
      setSourceReference('');
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : 'Unable to create dependency.');
    } finally {
      setSaving(false);
    }
  };

  const removeDependency = async (dependencyId: string) => {
    setSaving(true);
    setMutationError(null);
    try {
      await DependencyService.remove(projectId, dependencyId);
      await load();
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : 'Unable to remove dependency.');
    } finally {
      setSaving(false);
    }
  };

  if (!backendEnabled) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-5">
        <EmptyState title="Dependency graph requires backend data" description="Explicit dependency edges are not fabricated from offline demo milestone order." />
      </div>
    );
  }
  if (loading && !graph) return <LoadingState message="Loading explicit milestone dependencies..." />;
  if (error && !graph) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!graph) return null;

  return (
    <section className="space-y-4" aria-label="Milestone dependency and risk propagation analysis">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-navy-700" /><h3 className="text-sm font-semibold text-navy-900">Dependency & Risk Propagation</h3></div>
          <p className="mt-1 max-w-4xl text-2xs text-slate-500">{graph.summary.statement}</p>
        </div>
        <button className="btn btn-secondary text-xs" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Planning nodes', graph.summary.planningNodeCount],
          ['Explicit edges', graph.summary.explicitDependencyCount],
          ['Delayed triggers', graph.summary.delayedTriggerCount],
          ['Potentially affected', graph.summary.potentiallyAffectedCount],
          ['Maximum depth', graph.summary.maximumDependencyDepth],
        ].map(([label, value]) => <div key={label} className="rounded border border-slate-200 bg-slate-50 p-3 text-center"><p className="text-xl font-bold text-navy-900">{value}</p><p className="text-2xs text-slate-500">{label}</p></div>)}
      </div>

      <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Interpretation:</strong> amber dashed nodes are downstream exposure candidates through stored edges. Their delay is not asserted or predicted solely from the upstream status.</p>
      </div>

      {graph.edges.length === 0 && graph.nodes.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          No explicit dependency edges are recorded for this project. Milestone order and dates have not been used to infer relationships.
        </div>
      )}

      {graph.nodes.length === 0 ? (
        <EmptyState title="No milestone records available" description="Import or create validated milestone/package records before defining dependencies." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[520px] overflow-hidden rounded border border-slate-200 bg-white">
            <ReactFlow
              nodes={elements.nodes}
              edges={elements.edges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.25}
              maxZoom={1.8}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e2e8f0" gap={20} />
              <MiniMap pannable zoomable nodeColor={node => String(node.style?.background ?? '#f8fafc')} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Selected node</h4>
            {!selectedNode ? <p className="mt-3 text-xs text-slate-500">Select a node to inspect its status and shortest propagation path.</p> : (
              <div className="mt-3 space-y-3">
                <div><p className="text-sm font-semibold text-navy-900">{selectedNode.name}</p><p className="text-2xs text-slate-500">{selectedNode.code} · {selectedNode.nodeType}</p></div>
                <div className="space-y-1 text-xs text-slate-600"><p>Status: <strong>{STATUS_LABELS[selectedNode.status]}</strong></p><p>Planned: <strong>{formatDate(selectedNode.plannedDate)}</strong></p><p>Incoming / outgoing: <strong>{selectedNode.incomingDependencies} / {selectedNode.outgoingDependencies}</strong></p></div>
                {selectedNode.isDelayedTrigger ? (
                  <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">This delayed node is a propagation-analysis trigger. Only its explicitly connected, incomplete descendants are highlighted.</p>
                ) : selectedNode.potentiallyAffected ? selectedPaths.map(path => (
                  <div key={`${path.sourceMilestoneId}-${path.targetMilestoneId}`} className="rounded border border-amber-200 bg-white p-3">
                    <p className="text-2xs font-semibold text-amber-800">Potential exposure · depth {path.depth}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{path.milestoneNames.join(' → ')}</p>
                  </div>
                )) : <p className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-500">No path from a currently delayed upstream node.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {canManage && graph.nodes.length >= 2 && (
        <div className="rounded border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-navy-700" /><h4 className="text-sm font-semibold text-navy-900">Define explicit dependency</h4></div>
          <p className="text-2xs text-slate-500">Only stored edges are analysed. Cycles, self-dependencies, cross-project references, and duplicates are rejected by the API and database.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select className="select text-xs" aria-label="Upstream milestone" value={upstream} onChange={event => setUpstream(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select>
            <select className="select text-xs" aria-label="Downstream milestone" value={downstream} onChange={event => setDownstream(event.target.value)}>{graph.nodes.map(node => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select>
            <select className="select text-xs" aria-label="Dependency type" value={dependencyType} onChange={event => setDependencyType(event.target.value as DependencyType)}>{Object.entries(TYPE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            <input className="input text-xs" type="number" min={-3650} max={3650} aria-label="Dependency lag in days" value={lagDays} onChange={event => setLagDays(Number(event.target.value))} placeholder="Lag days" />
            <button className="btn btn-primary text-xs" disabled={saving || !upstream || !downstream || upstream === downstream} onClick={() => void createDependency()}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add edge</button>
          </div>
          <input className="input w-full text-xs" maxLength={300} value={sourceReference} onChange={event => setSourceReference(event.target.value)} placeholder="Source/reference (optional, e.g. approved CPM schedule revision)" />
          {mutationError && <p role="alert" className="text-xs text-red-600">{mutationError}</p>}
        </div>
      )}

      {graph.edges.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="data-table min-w-[850px]">
            <thead><tr><th>Upstream</th><th>Downstream</th><th>Type</th><th>Lag</th><th>Source</th>{canManage && <th>Action</th>}</tr></thead>
            <tbody>{graph.edges.map(edge => {
              const source = graph.nodes.find(node => node.id === edge.upstreamMilestoneId);
              const target = graph.nodes.find(node => node.id === edge.downstreamMilestoneId);
              return <tr key={edge.id}><td className="text-xs font-medium text-navy-900">{source?.code} · {source?.name}</td><td className="text-xs font-medium text-navy-900">{target?.code} · {target?.name}</td><td className="text-xs text-slate-600">{TYPE_LABELS[edge.dependencyType]}</td><td className="text-xs text-slate-600">{edge.lagDays} days</td><td><p className="text-xs text-slate-600">{edge.sourceSystem}</p><p className="text-2xs text-slate-400">{edge.sourceReference || 'No reference'}</p></td>{canManage && <td><button className="btn btn-secondary px-2 py-1 text-xs text-red-600" disabled={saving} onClick={() => void removeDependency(edge.id)}><Trash2 className="h-3 w-3" /> Remove</button></td>}</tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
