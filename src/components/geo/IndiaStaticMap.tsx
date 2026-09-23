import { useMemo } from 'react';
import type { Project } from '../../types';
import {
  getValidCoordinate,
  INDIA_BOUNDS,
  projectStates,
  toGeoRiskLevel,
  type GeoRiskLevel,
  type StateAggregate,
} from '../../geo/geoIntelligence';

interface IndiaStaticMapProps {
  projects: Project[];
  stateAggregates: StateAggregate[];
  selectedProjectId: string | null;
  selectedState: string | null;
  onProjectSelect: (projectId: string) => void;
  onStateSelect: (state: string) => void;
  className?: string;
}

const RISK_COLOURS: Record<GeoRiskLevel, string> = {
  Healthy: '#16a34a',
  Watch: '#f59e0b',
  High: '#f97316',
  Critical: '#dc2626',
};

const VIEW = { left: 48, top: 24, width: 332, height: 448 };

function projectPoint(project: Project) {
  const coordinate = getValidCoordinate(project);
  if (!coordinate) return null;
  const [longitude, latitude] = coordinate;
  return {
    x: VIEW.left + ((longitude - INDIA_BOUNDS.west) / (INDIA_BOUNDS.east - INDIA_BOUNDS.west)) * VIEW.width,
    y: VIEW.top + ((INDIA_BOUNDS.north - latitude) / (INDIA_BOUNDS.north - INDIA_BOUNDS.south)) * VIEW.height,
  };
}

export default function IndiaStaticMap({
  projects,
  stateAggregates,
  selectedProjectId,
  selectedState,
  onProjectSelect,
  onStateSelect,
  className = '',
}: IndiaStaticMapProps) {
  const stateCentres = useMemo(() => stateAggregates
    .map(aggregate => {
      const points = projects
        .filter(project => projectStates(project).includes(aggregate.state))
        .map(projectPoint)
        .filter((point): point is { x: number; y: number } => point !== null);
      if (!points.length) return null;
      return {
        ...aggregate,
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
    })
    .filter((item): item is StateAggregate & { x: number; y: number } => item !== null)
    .sort((left, right) => right.projectCount - left.projectCount)
    .slice(0, 6), [projects, stateAggregates]);

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#edf4f3] ${className}`}>
      <svg
        viewBox="0 0 430 500"
        className="h-full w-full"
        role="img"
        aria-label="Reference map of India with project markers plotted from stored coordinates"
      >
        <defs>
          <linearGradient id="india-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fbf5" />
            <stop offset="100%" stopColor="#dbeae3" />
          </linearGradient>
          <pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#0f766e" strokeOpacity="0.055" strokeWidth="1" />
          </pattern>
          <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#123b43" floodOpacity="0.18" />
          </filter>
        </defs>

        <rect width="430" height="500" fill="#edf4f3" />
        <rect width="430" height="500" fill="url(#map-grid)" />
        <path
          d="M123 38 L102 52 L112 72 L108 105 L94 133 L81 173 L85 194 L55 201 L61 228 L94 260 L110 282 L109 322 L132 363 L146 404 L160 431 L176 404 L190 363 L210 322 L230 295 L252 268 L273 241 L269 228 L281 204 L302 220 L320 201 L347 197 L369 173 L337 151 L302 166 L273 161 L252 146 L202 133 L169 106 L135 80 Z"
          fill="url(#india-land)"
          stroke="#176b66"
          strokeWidth="2.2"
          filter="url(#map-shadow)"
        />
        <path d="M81 173 L142 169 L194 182 L252 146 M61 228 L125 221 L185 235 L269 228 M94 260 L154 272 L230 295 M109 322 L167 317 L210 322 M132 363 L176 350 L190 363 M108 105 L169 106 L202 133 M142 169 L125 221 M185 235 L154 272 M167 317 L160 431" fill="none" stroke="#4f807d" strokeOpacity="0.42" strokeWidth="1" />
        <path d="M322 356 q6 12 0 24 q-6 -12 0 -24 M326 390 q5 10 0 20 q-5 -10 0 -20 M109 397 q4 8 0 15 q-4 -8 0 -15" fill="#dbeae3" stroke="#176b66" strokeWidth="1" />

        <g aria-hidden="true">
          <text x="209" y="272" textAnchor="middle" fill="#315f5c" fontSize="13" fontWeight="700" opacity="0.38">INDIA</text>
          <path d="M394 38 v34 M394 38 l-6 11 M394 38 l6 11" stroke="#244b55" strokeWidth="1.5" />
          <text x="394" y="31" textAnchor="middle" fill="#244b55" fontSize="10" fontWeight="700">N</text>
        </g>

        {projects.map(project => {
          const point = projectPoint(project);
          if (!point) return null;
          const selected = selectedProjectId === project.id;
          const level = toGeoRiskLevel(project);
          return (
            <g
              key={project.id}
              role="button"
              tabIndex={0}
              aria-label={`${project.name}, ${level} risk`}
              onClick={() => onProjectSelect(project.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') onProjectSelect(project.id);
              }}
              className="cursor-pointer outline-none"
            >
              <title>{project.name} · {project.state} · Risk {project.riskAssessment.overallScore}/100</title>
              {selected && <circle cx={point.x} cy={point.y} r="10" fill="none" stroke="#0f766e" strokeWidth="2" opacity="0.75" />}
              <circle cx={point.x} cy={point.y} r={selected ? 5.5 : 4} fill={RISK_COLOURS[level]} stroke="#fff" strokeWidth="1.5" />
            </g>
          );
        })}

        {stateCentres.map(state => {
          const selected = selectedState === state.state;
          return (
            <g
              key={state.state}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${state.state}, ${state.projectCount} projects`}
              onClick={() => onStateSelect(state.state)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') onStateSelect(state.state);
              }}
              className="cursor-pointer outline-none"
            >
              <rect x={state.x + 6} y={state.y - 10} width="24" height="16" rx="8" fill={selected ? '#0f766e' : '#ffffff'} stroke="#0f766e" strokeOpacity="0.55" />
              <text x={state.x + 18} y={state.y + 1} textAnchor="middle" fill={selected ? '#ffffff' : '#155e75'} fontSize="9" fontWeight="700">{state.projectCount}</text>
              <title>{state.state}: {state.projectCount} projects</title>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-teal-200/80 bg-white/90 px-2.5 py-1.5 text-[10px] leading-4 text-slate-600 shadow-sm backdrop-blur">
        Reference outline · markers use stored coordinates
      </div>
    </div>
  );
}
