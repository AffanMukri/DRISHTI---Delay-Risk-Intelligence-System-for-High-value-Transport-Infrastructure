import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RiskTrajectory, RiskTrajectoryChange, RiskTrendDirection } from '../types';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface RiskTrajectoryPanelProps {
  trajectory: RiskTrajectory | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const trendStyle: Record<RiskTrendDirection, string> = {
  Improving: 'bg-green-50 text-green-700 border-green-200',
  Stable: 'bg-slate-50 text-slate-700 border-slate-200',
  Deteriorating: 'bg-amber-50 text-amber-700 border-amber-200',
  'Rapidly Deteriorating': 'bg-red-50 text-red-700 border-red-200',
};

function TrendIcon({ direction }: { direction: RiskTrendDirection }) {
  if (direction === 'Improving') return <ArrowDownRight className="w-3.5 h-3.5" />;
  if (direction === 'Stable') return <Minus className="w-3.5 h-3.5" />;
  return <ArrowUpRight className="w-3.5 h-3.5" />;
}

function monthLabel(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

function signed(value?: number): string {
  if (value === undefined) return 'Unavailable';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

export function RiskTrajectoryPanel({ trajectory, loading = false, error, onRetry }: RiskTrajectoryPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const chartData = useMemo(() => (trajectory?.points ?? []).map(point => ({
    ...point,
    month: monthLabel(point.reportingMonth),
  })), [trajectory]);
  const defaultChange = trajectory?.changes.findLast(change => change.meaningfulIncrease)
    ?? trajectory?.changes.at(-1)
    ?? null;
  const selectedChange = trajectory?.changes.find(change => change.toMonth === selectedMonth)
    ?? defaultChange;

  if (loading) return <LoadingState message="Loading stored monthly risk snapshots..." />;
  if (error) return <ErrorState title="Risk trajectory unavailable" description={error} onRetry={onRetry} />;
  if (!trajectory || trajectory.points.length === 0) {
    return (
      <EmptyState
        title="No stored risk trajectory"
        description="A trajectory will appear after monthly risk assessments have been persisted. Current project data is not used to fabricate historical points."
      />
    );
  }

  const latest = trajectory.points.at(-1)!;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-800">Monthly Risk Trajectory</p>
          <p className="text-xs text-slate-500 mt-0.5">
            One latest persisted assessment per reporting month. Dashed markers indicate meaningful increases.
          </p>
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold ${trendStyle[trajectory.trendDirection]}`}>
          <TrendIcon direction={trajectory.trendDirection} />
          {trajectory.trendDirection}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Overall risk', latest.overallRisk],
          ['Cost risk', latest.costRisk],
          ['Schedule risk', latest.scheduleRisk],
          ['Implementation risk', latest.implementationRisk],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-2xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-xl font-bold text-navy-800 tabular-nums mt-1">
              {typeof value === 'number' ? `${value.toFixed(1)}/100` : 'Unavailable'}
            </p>
          </div>
        ))}
      </div>

      <div>
        <ResponsiveContainer width="100%" height={310}>
          <LineChart data={chartData} margin={{ top: 15, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} width={34} />
            <ReTooltip
              formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}/100` : 'Unavailable', name]}
              labelStyle={{ color: '#0f172a', fontWeight: 600 }}
              contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 4 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="overallRisk"
              name="Overall risk"
              stroke="#176b78"
              strokeWidth={3}
              dot={(props: any) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={props.payload.meaningfulIncrease ? 6 : 3.5}
                  fill={props.payload.meaningfulIncrease ? '#dc2626' : '#176b78'}
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: props.payload.overallChange === undefined ? 'default' : 'pointer' }}
                  onClick={() => props.payload.overallChange !== undefined && setSelectedMonth(props.payload.reportingMonth)}
                />
              )}
              activeDot={{ r: 6 }}
            />
            <Line type="monotone" dataKey="costRisk" name="Cost risk" stroke="#ea580c" strokeWidth={2} connectNulls={false} />
            <Line type="monotone" dataKey="scheduleRisk" name="Schedule risk" stroke="#dc2626" strokeWidth={2} connectNulls={false} />
            <Line type="monotone" dataKey="implementationRisk" name="Implementation risk" stroke="#0f8b8d" strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-2xs text-slate-500 mt-1">
          Stable: within ±{trajectory.thresholds.stableBandPoints} points; meaningful rise: ≥{trajectory.thresholds.meaningfulIncreasePoints} points; rapidly deteriorating: ≥{trajectory.thresholds.rapidIncreasePoints} points month to month.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 border border-slate-200 rounded overflow-hidden">
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Reporting month</th>
                  <th className="text-right px-3 py-2 font-semibold">Overall</th>
                  <th className="text-right px-3 py-2 font-semibold">Cost</th>
                  <th className="text-right px-3 py-2 font-semibold">Schedule</th>
                  <th className="text-right px-3 py-2 font-semibold">Implementation</th>
                  <th className="text-left px-3 py-2 font-semibold">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trajectory.points.map(point => (
                  <tr
                    key={point.snapshotId}
                    className={`${point.meaningfulIncrease ? 'bg-red-50/70' : ''} ${point.overallChange !== undefined ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                    onClick={() => point.overallChange !== undefined && setSelectedMonth(point.reportingMonth)}
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {point.meaningfulIncrease && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                        {monthLabel(point.reportingMonth)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{point.overallRisk.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{point.costRisk?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{point.scheduleRisk?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{point.implementationRisk?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs ${trendStyle[point.trendDirection]}`}>
                        <TrendIcon direction={point.trendDirection} /> {point.trendDirection}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-2 border border-slate-200 rounded p-4">
          {selectedChange ? <ChangeInspection change={selectedChange} /> : (
            <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 p-6">
              At least two persisted monthly snapshots are required to inspect a change.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeInspection({ change }: { change: RiskTrajectoryChange }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-navy-800">What changed</p>
        <p className="text-2xs text-slate-500 mt-0.5">
          {monthLabel(change.fromMonth)} to {monthLabel(change.toMonth)}
        </p>
      </div>
      {change.meaningfulIncrease && (
        <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Overall risk increased by {change.overallChange.toFixed(1)} points, exceeding the configured meaningful-change threshold.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-slate-50 p-2"><span className="text-slate-500">Overall</span><p className="font-semibold">{signed(change.overallChange)}</p></div>
        <div className="rounded bg-slate-50 p-2"><span className="text-slate-500">Cost</span><p className="font-semibold">{signed(change.costRiskChange)}</p></div>
        <div className="rounded bg-slate-50 p-2"><span className="text-slate-500">Schedule</span><p className="font-semibold">{signed(change.scheduleRiskChange)}</p></div>
        <div className="rounded bg-slate-50 p-2"><span className="text-slate-500">Implementation</span><p className="font-semibold">{signed(change.implementationRiskChange)}</p></div>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">Stored driver changes</p>
        {change.driverChanges.length ? (
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {change.driverChanges.map(driver => (
              <div key={driver.code} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-800">{driver.name}</span>
                  <span className={driver.valueDelta > 0 ? 'text-red-600' : 'text-green-600'}>{signed(driver.valueDelta)}</span>
                </div>
                <p className="text-2xs text-slate-500 mt-0.5">
                  {driver.changeType} · weighted contribution {signed(driver.weightedContributionDelta)}
                </p>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500">No stored driver values changed for this period.</p>}
      </div>
    </div>
  );
}
