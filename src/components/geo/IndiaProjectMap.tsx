import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Project } from '../../types';
import IndiaStaticMap from './IndiaStaticMap';
import {
  INDIA_BOUNDS,
  STATE_NAME_BY_ISO,
  projectsToPointCollection,
  riskRank,
  type StateAggregate,
} from '../../geo/geoIntelligence';

interface IndiaProjectMapProps {
  projects: Project[];
  stateAggregates: StateAggregate[];
  selectedProjectId: string | null;
  selectedState: string | null;
  onProjectSelect: (projectId: string) => void;
  onStateSelect: (state: string) => void;
}

const EMPTY_FILTER: FilterSpecification = ['==', ['get', 'projectId'], '__none__'];

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'openStreetMap', type: 'raster', source: 'openStreetMap' }],
};

function enrichBoundaries(
  boundaries: FeatureCollection<Geometry, GeoJsonProperties>,
  aggregates: StateAggregate[],
): FeatureCollection<Geometry, GeoJsonProperties> {
  const aggregateByState = new Map(aggregates.map(item => [item.state, item]));
  return {
    type: 'FeatureCollection',
    features: boundaries.features.map(feature => {
      const shapeIso = String(feature.properties?.shapeISO ?? '');
      const stateName = STATE_NAME_BY_ISO[shapeIso] ?? String(feature.properties?.shapeName ?? 'Unknown');
      const aggregate = aggregateByState.get(stateName);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          stateName,
          projectCount: aggregate?.projectCount ?? 0,
          averageRiskScore: aggregate?.averageRiskScore ?? 0,
          maxRiskRank: aggregate ? riskRank(aggregate.highestRisk) : -1,
          capitalExposure: aggregate?.capitalExposure ?? 0,
        },
      };
    }),
  };
}

export default function IndiaProjectMap({
  projects,
  stateAggregates,
  selectedProjectId,
  selectedState,
  onProjectSelect,
  onStateSelect,
}: IndiaProjectMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundariesRef = useRef<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const projectsRef = useRef(projects);
  const aggregatesRef = useRef(stateAggregates);
  const onProjectSelectRef = useRef(onProjectSelect);
  const onStateSelectRef = useRef(onStateSelect);
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [interactiveEnabled, setInteractiveEnabled] = useState(false);

  const boundaryUrl = useMemo(
    () => `${import.meta.env.BASE_URL}data/india-adm1.geojson`,
    [],
  );

  useEffect(() => {
    projectsRef.current = projects;
    aggregatesRef.current = stateAggregates;
    onProjectSelectRef.current = onProjectSelect;
    onStateSelectRef.current = onStateSelect;
  }, [onProjectSelect, onStateSelect, projects, stateAggregates]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(boundaryUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Boundary layer returned HTTP ${response.status}.`);
        return response.json() as Promise<FeatureCollection<Geometry, GeoJsonProperties>>;
      })
      .then(data => {
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          throw new Error('Boundary layer is not valid GeoJSON.');
        }
        boundariesRef.current = data;
        setBoundaries(data);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'India boundary layer could not be loaded.');
      });
    return () => controller.abort();
  }, [boundaryUrl]);

  useEffect(() => {
    if (!interactiveEnabled || !containerRef.current || !boundaries) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [80.6, 22.4],
      zoom: 3.35,
      minZoom: 2.8,
      maxZoom: 13,
      maxBounds: [
        [INDIA_BOUNDS.west - 3, INDIA_BOUNDS.south - 2],
        [INDIA_BOUNDS.east + 3, INDIA_BOUNDS.north + 2],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.addSource('india-states', {
        type: 'geojson',
        data: enrichBoundaries(boundaries, aggregatesRef.current),
      });
      map.addSource('project-points', {
        type: 'geojson',
        data: projectsToPointCollection(projectsRef.current),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 9,
        clusterProperties: {
          maxRiskRank: ['max', ['get', 'riskRank']],
        },
      });

      map.addLayer({
        id: 'state-risk-fill',
        type: 'fill',
        source: 'india-states',
        paint: {
          'fill-color': [
            'match', ['get', 'maxRiskRank'],
            3, '#dc2626',
            2, '#f97316',
            1, '#f59e0b',
            0, '#22c55e',
            '#94a3b8',
          ],
          'fill-opacity': ['case', ['>', ['get', 'projectCount'], 0], 0.25, 0.08],
        },
      });
      map.addLayer({
        id: 'state-boundaries',
        type: 'line',
        source: 'india-states',
        paint: { 'line-color': '#334155', 'line-width': 0.85, 'line-opacity': 0.78 },
      });
      map.addLayer({
        id: 'selected-state',
        type: 'line',
        source: 'india-states',
        filter: ['==', ['get', 'stateName'], '__none__'],
        paint: { 'line-color': '#0f8b8d', 'line-width': 3, 'line-opacity': 1 },
      });
      map.addLayer({
        id: 'project-clusters',
        type: 'circle',
        source: 'project-points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'match', ['get', 'maxRiskRank'],
            3, '#dc2626',
            2, '#f97316',
            1, '#f59e0b',
            '#22c55e',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 25, 26],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'project-points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'project-points-unclustered',
        type: 'circle',
        source: 'project-points',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match', ['get', 'riskRank'],
            3, '#dc2626',
            2, '#f97316',
            1, '#f59e0b',
            '#22c55e',
          ],
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'selected-project',
        type: 'circle',
        source: 'project-points',
        filter: EMPTY_FILTER,
        paint: {
          'circle-radius': 12,
          'circle-color': 'rgba(14, 165, 233, 0.12)',
          'circle-stroke-color': '#0f8b8d',
          'circle-stroke-width': 3,
        },
      });

      map.on('click', 'project-clusters', event => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['project-clusters'] })[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null;
        if (!Number.isFinite(clusterId) || !coordinates) return;
        const source = map.getSource('project-points') as GeoJSONSource;
        void source.getClusterExpansionZoom(clusterId).then(zoom => {
          map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
        });
      });
      map.on('click', 'project-points-unclustered', event => {
        const projectId = String(event.features?.[0]?.properties?.projectId ?? '');
        if (projectId) onProjectSelectRef.current(projectId);
      });
      map.on('click', 'state-risk-fill', event => {
        const points = map.queryRenderedFeatures(event.point, {
          layers: ['project-clusters', 'project-points-unclustered'],
        });
        if (points.length > 0) return;
        const stateName = String(event.features?.[0]?.properties?.stateName ?? '');
        if (stateName) onStateSelectRef.current(stateName);
      });

      for (const layer of ['project-clusters', 'project-points-unclustered', 'state-risk-fill']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      setMapReady(true);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [boundaries, interactiveEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    const boundaryData = boundariesRef.current;
    if (!mapReady || !map || !boundaryData) return;
    (map.getSource('india-states') as GeoJSONSource | undefined)?.setData(enrichBoundaries(boundaryData, stateAggregates));
    (map.getSource('project-points') as GeoJSONSource | undefined)?.setData(projectsToPointCollection(projects));
  }, [mapReady, projects, stateAggregates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer('selected-project')) return;
    map.setFilter('selected-project', selectedProjectId
      ? ['==', ['get', 'projectId'], selectedProjectId]
      : EMPTY_FILTER);
  }, [mapReady, selectedProjectId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer('selected-state')) return;
    map.setFilter('selected-state', selectedState
      ? ['==', ['get', 'stateName'], selectedState]
      : ['==', ['get', 'stateName'], '__none__']);
  }, [mapReady, selectedState]);

  return (
    <div className="relative h-[430px] sm:h-[500px] w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
      <IndiaStaticMap
        projects={projects}
        stateAggregates={stateAggregates}
        selectedProjectId={selectedProjectId}
        selectedState={selectedState}
        onProjectSelect={onProjectSelect}
        onStateSelect={onStateSelect}
        className={interactiveEnabled && mapReady ? 'invisible' : 'visible'}
      />
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-300 ${interactiveEnabled && mapReady ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        role="application"
        aria-label="Interactive India map showing project locations and state risk aggregation"
      />
      {interactiveEnabled && !mapReady && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90 text-xs text-slate-600">
          Loading India boundary and project layers…
        </div>
      )}
      {interactiveEnabled && loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-red-700">Map boundary layer unavailable</p>
            <p className="mt-1 text-xs text-slate-500">{loadError}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setInteractiveEnabled(enabled => !enabled)}
        disabled={!boundaries && !loadError}
        className="absolute right-3 top-3 z-20 rounded-md border border-teal-200 bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60"
      >
        {interactiveEnabled ? 'Use reliable map' : boundaries ? 'Enable interactive GIS' : loadError ? 'Reliable map active' : 'Preparing GIS layer…'}
      </button>
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-slate-200 bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur">
        <p className="text-2xs font-bold uppercase tracking-wide text-slate-600">Project risk</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-slate-700">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-green-500" />Healthy</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Watch</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" />High</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-600" />Critical</span>
        </div>
      </div>
    </div>
  );
}
