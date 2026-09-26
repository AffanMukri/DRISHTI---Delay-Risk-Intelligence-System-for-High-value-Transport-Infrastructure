import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, BrainCircuit, Database, FileWarning, GitBranch, Lightbulb, Zap } from 'lucide-react';
import type { EvidenceNode, EvidenceStage, EvidenceSubjectType, ProjectEvidenceChain } from '../types';
import { EvidenceService } from '../services/evidenceService';
import { buildMockEvidenceChain } from '../services/mockProjectIntelligence';
import { EmptyState, ErrorState, LoadingState, Modal, formatDate } from './ui';

interface EvidenceChainModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  preferredSubject?: EvidenceSubjectType;
  preferredSubjectId?: string;
  preferredPrediction?: 'cost' | 'schedule';
  backendEnabled?: boolean;
}

const stageDetails: Record<EvidenceStage, { label: string; icon: typeof Database; color: string }> = {
  source_data: { label: 'SOURCE DATA', icon: Database, color: 'border-blue-200 bg-blue-50 text-blue-800' },
  derived_signal: { label: 'DERIVED SIGNAL', icon: GitBranch, color: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  prediction: { label: 'MODEL / RULE PREDICTION', icon: BrainCircuit, color: 'border-purple-200 bg-purple-50 text-purple-800' },
  explanation: { label: 'EXPLANATION', icon: Lightbulb, color: 'border-amber-200 bg-amber-50 text-amber-800' },
  warning: { label: 'WARNING', icon: FileWarning, color: 'border-red-200 bg-red-50 text-red-800' },
  intervention: { label: 'RECOMMENDED / CREATED INTERVENTION', icon: Zap, color: 'border-green-200 bg-green-50 text-green-800' },
};

function displayValue(value: unknown, unit?: string): string {
  if (value == null || value === '') return 'Not available';
  if (typeof value === 'number') {
    const number = unit === 'probability' ? value * 100 : value;
    const suffix = unit === 'probability' ? '%' : unit ? ` ${unit}` : '';
    return `${Number.isInteger(number) ? number.toLocaleString() : number.toFixed(2)}${suffix}`;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}

function EvidenceNodeCard({ node }: { node: EvidenceNode }) {
  const details = stageDetails[node.stage];
  const Icon = details.icon;
  return (
    <div className={`rounded border p-4 ${details.color}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-2xs font-bold tracking-wider flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{details.label}</p>
          <p className="text-sm font-semibold mt-1 text-slate-800">{node.title}</p>
          {node.description && <p className="text-2xs text-slate-600 mt-1">{node.description}</p>}
        </div>
        <span className="badge badge-neutral text-2xs">{node.provenanceType.replaceAll('_', ' ')}</span>
      </div>

      {node.values.length ? (
        <div className="mt-3 rounded border border-white/70 bg-white/80 divide-y divide-slate-100">
          {node.values.map((item, index) => (
            <div key={`${item.label}-${index}`} className="px-3 py-2">
              <div className="flex items-start justify-between gap-4 text-xs">
                <span className="text-slate-600">{item.label}</span>
                <span className="font-semibold text-slate-800 text-right break-words max-w-[60%]">{displayValue(item.value, item.unit)}</span>
              </div>
              {item.formula && <p className="text-2xs text-slate-400 mt-0.5">Basis: {item.formula}</p>}
              {(item.sourceTable || item.timestamp) && (
                <p className="text-2xs text-slate-400 mt-0.5 font-mono">
                  {item.sourceTable}{item.sourceRecordId ? ` · ${item.sourceRecordId}` : ''}{item.timestamp ? ` · ${formatDate(item.timestamp)}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-slate-500 mt-3 italic">No linked persisted value is available for this stage.</p>}

      <div className="flex flex-wrap gap-1.5 mt-3 text-2xs text-slate-500">
        {node.modelName && <span className="badge badge-neutral">Model: {node.modelName}</span>}
        {node.modelVersion && <span className="badge badge-neutral">v{node.modelVersion}</span>}
        {node.dataVersion && <span className="badge badge-neutral">Data: {node.dataVersion}</span>}
        {node.ruleVersion && <span className="badge badge-neutral">Rule: {node.ruleVersion}</span>}
        {node.timestamp && <span className="badge badge-neutral">{formatDate(node.timestamp)}</span>}
      </div>
    </div>
  );
}

export function EvidenceChainModal({ isOpen, projectId, onClose, preferredSubject = 'risk', preferredSubjectId, preferredPrediction, backendEnabled = true }: EvidenceChainModalProps) {
  const [data, setData] = useState<ProjectEvidenceChain | null>(null);
  const [selectedChainId, setSelectedChainId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const request = backendEnabled
      ? EvidenceService.getForProject(projectId, controller.signal)
      : Promise.resolve(buildMockEvidenceChain(projectId));
    void request
      .then(result => {
        setData(result);
        const preferred = result.chains.find(chain => (
          chain.subjectType === preferredSubject
          && (!preferredSubjectId || chain.subjectId === preferredSubjectId)
          && (!preferredPrediction || chain.title.toLowerCase().startsWith(preferredPrediction))
        )) ?? result.chains.find(chain => chain.subjectType === preferredSubject) ?? result.chains[0];
        setSelectedChainId(preferred?.chainId ?? '');
      })
      .catch(loadError => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load the evidence chain.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isOpen, projectId, preferredSubject, preferredSubjectId, preferredPrediction, backendEnabled, version]);

  const selected = useMemo(
    () => data?.chains.find(chain => chain.chainId === selectedChainId) ?? data?.chains[0],
    [data, selectedChainId],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Evidence Chain" size="lg">
      {loading && <LoadingState message="Tracing stored source, model, warning, and intervention records..." />}
      {!loading && error && <ErrorState title="Evidence unavailable" description={error} onRetry={() => setVersion(value => value + 1)} />}
      {!loading && !error && data && !data.chains.length && <EmptyState title="No evidence chains" description="No persisted major risk, genuine prediction, or High/Critical warning is available for this project." />}
      {!loading && !error && data && selected && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-navy-800">{data.projectName}</p>
              <p className="text-2xs text-slate-500">{data.projectId} · generated {formatDate(data.generatedAt)}</p>
            </div>
            <select className="select text-xs min-w-64" value={selected.chainId} onChange={event => setSelectedChainId(event.target.value)}>
              {data.chains.map(chain => (
                <option key={chain.chainId} value={chain.chainId}>{chain.subjectType.toUpperCase()} · {chain.title}</option>
              ))}
            </select>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <strong className="text-slate-800">Trace:</strong> {selected.title}
            {selected.asOfDate ? ` · ${formatDate(selected.asOfDate)}` : ''}
          </div>

          <div>
            {selected.nodes.map((node, index) => (
              <div key={`${node.stage}-${index}`}>
                <EvidenceNodeCard node={node} />
                {index < selected.nodes.length - 1 && <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-slate-400" /></div>}
              </div>
            ))}
          </div>

          {data.omissions.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Unavailable evidence</p>
              {data.omissions.map(omission => <p key={omission} className="mt-1">• {omission}</p>)}
            </div>
          )}
          <p className="text-2xs text-slate-500 border-t border-slate-100 pt-3">{data.methodology} No LLM-generated value is included.</p>
        </div>
      )}
    </Modal>
  );
}
