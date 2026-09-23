import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  Globe2,
  Layers3,
  MapPin,
  Search,
} from 'lucide-react';
import IndiaProjectMap from '../components/geo/IndiaProjectMap';
import { Badge, DataDisclaimer, HealthPill, KPICard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import {
  aggregateProjectsByState,
  getValidCoordinate,
  matchesProjectSearch,
  projectStates,
  toGeoRiskLevel,
  type GeoRiskLevel,
} from '../geo/geoIntelligence';
import type { Project } from '../types';

const ZONES: Record<string, string[]> = {
  North: ['Jammu and Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Haryana', 'Delhi', 'Uttarakhand', 'Uttar Pradesh', 'Chandigarh'],
  West: ['Maharashtra', 'Gujarat', 'Rajasthan', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu'],
  South: ['Karnataka', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Puducherry', 'Andaman and Nicobar Islands', 'Lakshadweep'],
  East: ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand'],
  Central: ['Madhya Pradesh', 'Chhattisgarh'],
  'North-East': ['Assam', 'Meghalaya', 'Arunachal Pradesh', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Sikkim'],
};

function riskVariant(level: Project['riskAssessment']['riskLevel']): 'healthy' | 'watch' | 'high' | 'critical' {
  if (level === 'Critical') return 'critical';
  if (level === 'High Risk') return 'high';
  if (level === 'Watch') return 'watch';
  return 'healthy';
}

export default function GeoIntelligence() {
  const { navigate } = useApp();
  const { projects: allProjects } = usePragatiData();
  const [selectedZone, setSelectedZone] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<GeoRiskLevel | 'All'>('All');
  const [selectedSector, setSelectedSector] = useState('All');
  const [selectedMinistry, setSelectedMinistry] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<string | null>(null);

  const sectors = useMemo(
    () => [...new Set(allProjects.map(project => project.sector))].sort(),
    [allProjects],
  );
  const ministries = useMemo(
    () => [...new Set(allProjects.map(project => project.ministry))].sort(),
    [allProjects],
  );
  const allStateData = useMemo(() => aggregateProjectsByState(allProjects), [allProjects]);

  const nonStateFilteredProjects = useMemo(() => allProjects.filter(project => {
    const states = projectStates(project);
    if (selectedSector !== 'All' && project.sector !== selectedSector) return false;
    if (selectedMinistry !== 'All' && project.ministry !== selectedMinistry) return false;
    if (selectedRiskLevel !== 'All' && toGeoRiskLevel(project) !== selectedRiskLevel) return false;
    if (selectedZone !== 'All' && !states.some(state => ZONES[selectedZone]?.includes(state))) return false;
    return matchesProjectSearch(project, searchQuery);
  }), [allProjects, searchQuery, selectedMinistry, selectedRiskLevel, selectedSector, selectedZone]);

  const filteredProjects = useMemo(() => nonStateFilteredProjects.filter(project => (
    selectedState === 'All' || projectStates(project).includes(selectedState)
  )), [nonStateFilteredProjects, selectedState]);

  const stateData = useMemo(
    () => aggregateProjectsByState(nonStateFilteredProjects),
    [nonStateFilteredProjects],
  );
  const activeProject = useMemo(
    () => filteredProjects.find(project => project.id === activeProjectId) ?? null,
    [activeProjectId, filteredProjects],
  );
  const activeStateSummary = useMemo(
    () => stateData.find(item => item.state === activeState) ?? null,
    [activeState, stateData],
  );
  const mappedProjects = useMemo(
    () => filteredProjects.filter(project => getValidCoordinate(project) !== null),
    [filteredProjects],
  );
  const unmappedProjects = useMemo(
    () => filteredProjects.filter(project => getValidCoordinate(project) === null),
    [filteredProjects],
  );
  const portfolioContext = useMemo(() => {
    const riskCounts: Record<GeoRiskLevel, number> = { Healthy: 0, Watch: 0, High: 0, Critical: 0 };
    filteredProjects.forEach(project => { riskCounts[toGeoRiskLevel(project)] += 1; });
    return {
      capitalExposure: filteredProjects.reduce((sum, project) => sum + project.revisedCost, 0),
      averageRisk: filteredProjects.length
        ? Math.round(filteredProjects.reduce((sum, project) => sum + project.riskAssessment.overallScore, 0) / filteredProjects.length)
        : 0,
      riskCounts,
      leadingStates: [...stateData].sort((left, right) => right.projectCount - left.projectCount).slice(0, 4),
    };
  }, [filteredProjects, stateData]);
  const activeFilterCount = [selectedZone, selectedState, selectedRiskLevel, selectedSector, selectedMinistry]
    .filter(value => value !== 'All').length + (searchQuery.trim() ? 1 : 0);

  const clearFilters = () => {
    setSelectedZone('All');
    setSelectedState('All');
    setSelectedRiskLevel('All');
    setSelectedSector('All');
    setSelectedMinistry('All');
    setSearchQuery('');
  };

  const inspectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveState(null);
  };
  const inspectState = (state: string) => {
    setActiveState(state);
    setActiveProjectId(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-navy-900">Geo Intelligence & Spatial Clusters</h1>
            <Badge variant="neutral">Interactive GIS</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            State-level exposure and project locations from stored coordinates. Projects without usable coordinates remain in portfolio totals and are identified separately.
          </p>
        </div>
        <DataDisclaimer label="Boundary: geoBoundaries IND ADM1 (CC BY 2.5 IN) · Basemap: OpenStreetMap" />
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              className="input w-full pl-9 text-xs"
              placeholder="Search project, ID, state, agency…"
              aria-label="Search projects"
            />
          </label>
          <select value={selectedSector} onChange={event => setSelectedSector(event.target.value)} className="select text-xs" aria-label="Filter by sector">
            <option value="All">All Sectors</option>
            {sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}
          </select>
          <select value={selectedMinistry} onChange={event => setSelectedMinistry(event.target.value)} className="select text-xs" aria-label="Filter by ministry">
            <option value="All">All Ministries</option>
            {ministries.map(ministry => <option key={ministry} value={ministry}>{ministry}</option>)}
          </select>
          <select value={selectedRiskLevel} onChange={event => setSelectedRiskLevel(event.target.value as GeoRiskLevel | 'All')} className="select text-xs" aria-label="Filter by risk level">
            <option value="All">All Risk Levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Watch">Watch</option>
            <option value="Healthy">Healthy</option>
          </select>
          <button onClick={clearFilters} className="btn btn-secondary text-xs" disabled={activeFilterCount === 0}>
            Clear filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={selectedZone}
            onChange={event => {
              setSelectedZone(event.target.value);
              setSelectedState('All');
            }}
            className="select text-xs"
            aria-label="Filter by zone"
          >
            <option value="All">All Zones</option>
            {Object.keys(ZONES).map(zone => <option key={zone} value={zone}>{zone} Zone</option>)}
          </select>
          <select value={selectedState} onChange={event => setSelectedState(event.target.value)} className="select text-xs" aria-label="Filter by state">
            <option value="All">All States / UTs</option>
            {allStateData.map(item => <option key={item.state} value={item.state}>{item.state} ({item.projectCount})</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard title="Filtered Projects" value={filteredProjects.length} subtitle={`${allProjects.length} in portfolio`} icon={<Layers3 className="h-4 w-4 text-navy-600" />} />
        <KPICard title="Mapped Locations" value={mappedProjects.length} subtitle="Usable stored coordinates" accent="green" icon={<MapPin className="h-4 w-4 text-green-600" />} />
        <KPICard title="Without Coordinates" value={unmappedProjects.length} subtitle="Not placed on map" accent={unmappedProjects.length ? 'amber' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} />
        <KPICard title="State Footprint" value={stateData.length} subtitle="Declared State / UT coverage" icon={<Globe2 className="h-4 w-4 text-blue-600" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="card xl:col-span-8">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">India Project Risk Map</h2>
              <p className="mt-0.5 text-xs text-slate-500">Select a project marker or state-count badge; enable the interactive GIS layer for official boundaries and zoom.</p>
            </div>
            <span className="text-xs text-slate-500">{mappedProjects.length} mapped · {unmappedProjects.length} unmapped</span>
          </div>
          <div className="card-body">
            <IndiaProjectMap
              projects={mappedProjects}
              stateAggregates={stateData}
              selectedProjectId={activeProject?.id ?? null}
              selectedState={activeState ?? (selectedState === 'All' ? null : selectedState)}
              onProjectSelect={inspectProject}
              onStateSelect={inspectState}
            />
          </div>
        </section>

        <aside className="card xl:col-span-4">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-navy-800">GIS Inspector</h2>
            {activeProject && <Badge variant={riskVariant(activeProject.riskAssessment.riskLevel)}>{toGeoRiskLevel(activeProject)}</Badge>}
            {activeStateSummary && <Badge variant="info">State summary</Badge>}
          </div>

          {activeProject ? (
            <div className="card-body space-y-4 text-xs">
              <div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-2xs font-bold text-slate-500">{activeProject.id}</span>
                <h3 className="mt-1 text-sm font-bold text-navy-900">{activeProject.name}</h3>
                <p className="text-xs text-slate-500">{activeProject.ministry} · {activeProject.implementingAgency}</p>
              </div>
              <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex justify-between gap-3"><span className="text-slate-500">State / Region</span><span className="text-right font-semibold text-slate-800">{activeProject.state}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Coordinates</span><span className="font-mono font-bold text-cyan-700">{activeProject.latitude?.toFixed(4)}° N, {activeProject.longitude?.toFixed(4)}° E</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Sector</span><span className="font-semibold text-slate-800">{activeProject.sector}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-blue-100 bg-blue-50 p-2.5">
                  <p className="text-2xs font-medium text-blue-700">Physical progress</p>
                  <p className="mt-0.5 text-base font-bold text-blue-950">{activeProject.physicalProgress}%</p>
                  <p className="text-2xs text-blue-600">Planned: {activeProject.expectedProgress}%</p>
                </div>
                <div className="rounded border border-amber-100 bg-amber-50 p-2.5">
                  <p className="text-2xs font-medium text-amber-700">Schedule delay</p>
                  <p className="mt-0.5 text-base font-bold text-amber-950">{activeProject.delayDays} days</p>
                  <p className="text-2xs text-amber-700">Risk: {activeProject.riskAssessment.overallScore}/100</p>
                </div>
              </div>
              <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex justify-between"><span className="text-slate-500">Approved cost</span><span className="font-semibold">₹{activeProject.approvedCost.toLocaleString()} Cr</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Revised cost</span><span className="font-bold text-navy-900">₹{activeProject.revisedCost.toLocaleString()} Cr</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Expenditure</span><span className="font-semibold text-green-700">₹{activeProject.expenditure.toLocaleString()} Cr</span></div>
              </div>
              <button onClick={() => navigate('project-intelligence', activeProject.id)} className="btn btn-primary flex w-full items-center justify-center gap-1.5 py-2 text-xs">
                Open Project Intelligence <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : activeStateSummary ? (
            <div className="card-body space-y-4 text-xs">
              <div>
                <p className="text-2xs font-bold uppercase tracking-wide text-slate-500">State / Union Territory</p>
                <h3 className="mt-1 text-base font-bold text-navy-900">{activeStateSummary.state}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Projects</p><p className="mt-1 text-lg font-bold text-navy-900">{activeStateSummary.projectCount}</p></div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Capital exposure</p><p className="mt-1 text-sm font-bold text-navy-900">₹{activeStateSummary.capitalExposure.toLocaleString()} Cr</p></div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Average risk</p><p className="mt-1"><HealthPill score={activeStateSummary.averageRiskScore} level={activeStateSummary.highestRisk} /></p></div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Locations</p><p className="mt-1 font-bold text-slate-800">{activeStateSummary.mappedProjectCount} mapped</p><p className="text-2xs text-slate-500">{activeStateSummary.unmappedProjectCount} unmapped</p></div>
              </div>
              <div className="space-y-2">
                {(['Critical', 'High', 'Watch', 'Healthy'] as GeoRiskLevel[]).map(level => (
                  <div key={level} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-600">{level}</span><span className="font-bold text-slate-900">{activeStateSummary.riskCounts[level]}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setSelectedState(selectedState === activeStateSummary.state ? 'All' : activeStateSummary.state)}
                className="btn btn-primary w-full text-xs"
              >
                {selectedState === activeStateSummary.state ? 'Clear state filter' : `Filter to ${activeStateSummary.state}`}
              </button>
            </div>
          ) : (
            <div className="card-body space-y-4 text-xs">
              <div className="rounded-lg border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-teal-700 p-2 text-white"><Compass className="h-4 w-4" /></span>
                  <div>
                    <p className="font-bold text-navy-900">National portfolio view</p>
                    <p className="text-2xs text-slate-500">Current filters · select any marker or state count</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Projects in view</p><p className="mt-1 text-lg font-bold text-navy-900">{filteredProjects.length}</p></div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Average risk</p><p className="mt-1"><HealthPill score={portfolioContext.averageRisk} level={portfolioContext.averageRisk >= 75 ? 'Critical' : portfolioContext.averageRisk >= 55 ? 'High' : portfolioContext.averageRisk >= 35 ? 'Watch' : 'Healthy'} /></p></div>
                <div className="col-span-2 rounded border border-slate-200 bg-slate-50 p-3"><p className="text-2xs text-slate-500">Capital represented</p><p className="mt-1 text-base font-bold text-navy-900">₹{portfolioContext.capitalExposure.toLocaleString()} Cr</p></div>
              </div>
              <div>
                <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-500">Risk distribution</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Critical', 'High', 'Watch', 'Healthy'] as GeoRiskLevel[]).map(level => (
                    <div key={level} className="rounded border border-slate-200 bg-white p-2 text-center">
                      <p className="text-sm font-bold text-slate-900">{portfolioContext.riskCounts[level]}</p>
                      <p className="text-[9px] text-slate-500">{level}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-500">Largest state footprints</p>
                <div className="space-y-1.5">
                  {portfolioContext.leadingStates.map(state => (
                    <button key={state.state} type="button" onClick={() => inspectState(state.state)} className="flex w-full items-center justify-between rounded border border-slate-200 px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50">
                      <span className="font-medium text-slate-700">{state.state}</span>
                      <span className="font-bold text-teal-800">{state.projectCount} projects</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-2xs leading-4 text-blue-800">Map markers use stored project coordinates. The reliable outline is a reference view; enable the interactive GIS layer for official boundary geometry.</p>
            </div>
          )}
        </aside>
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="text-sm font-semibold text-navy-800">Projects Without Usable Coordinates</h2>
            <p className="mt-0.5 text-xs text-slate-500">No centroid or substitute location is generated. These projects stay visible in declared-state aggregates where possible.</p>
          </div>
          <Badge variant={unmappedProjects.length ? 'watch' : 'healthy'}>{unmappedProjects.length} projects</Badge>
        </div>
        {unmappedProjects.length === 0 ? (
          <div className="card-body flex items-center gap-2 text-xs text-slate-600"><MapPin className="h-4 w-4 text-green-600" />All currently filtered projects have usable stored coordinates.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Project</th><th>Declared State / Region</th><th>Ministry</th><th>Reason</th></tr></thead>
              <tbody>{unmappedProjects.map(project => (
                <tr key={project.id}>
                  <td><span className="text-xs font-semibold text-navy-900">{project.name}</span><p className="text-2xs text-slate-400">{project.id}</p></td>
                  <td className="text-xs">{project.state}</td>
                  <td className="text-xs">{project.ministry}</td>
                  <td><Badge variant="watch">Missing or outside supported India bounds</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="text-sm font-semibold text-navy-800">State-Wise Infrastructure Exposure</h2>
            <p className="mt-0.5 text-xs text-slate-500">Filtered by current sector, ministry, risk, zone, and search criteria.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>State / Union Territory</th><th>Projects</th><th>Capital Exposure</th><th>Risk Mix</th><th>Average Risk</th><th>Map Coverage</th></tr></thead>
            <tbody>
              {stateData.map(item => (
                <tr key={item.state} onClick={() => inspectState(item.state)} className={activeState === item.state ? 'bg-blue-50/60' : ''}>
                  <td><div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-semibold text-navy-900">{item.state}</span></div></td>
                  <td className="text-xs text-slate-700">{item.projectCount}</td>
                  <td className="text-xs font-bold tabular-nums text-slate-900">₹{item.capitalExposure.toLocaleString()} Cr</td>
                  <td><span className="text-2xs text-slate-600">{item.riskCounts.Critical} Critical · {item.riskCounts.High} High</span></td>
                  <td><HealthPill score={item.averageRiskScore} level={item.highestRisk} /></td>
                  <td><span className="text-xs text-slate-700">{item.mappedProjectCount}/{item.projectCount} mapped</span></td>
                </tr>
              ))}
              {stateData.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-xs text-slate-500">No State / UT records match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-2xs text-slate-500">
          Capital exposure can include the full project value in each declared state for multi-state projects; do not sum state rows as a portfolio total.
        </div>
      </section>
    </div>
  );
}
