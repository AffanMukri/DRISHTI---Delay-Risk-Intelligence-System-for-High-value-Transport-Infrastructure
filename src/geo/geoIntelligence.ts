import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Project } from '../types';

export type GeoRiskLevel = 'Healthy' | 'Watch' | 'High' | 'Critical';

export interface StateAggregate {
  state: string;
  projectCount: number;
  mappedProjectCount: number;
  unmappedProjectCount: number;
  capitalExposure: number;
  averageRiskScore: number;
  highestRisk: GeoRiskLevel;
  riskCounts: Record<GeoRiskLevel, number>;
  projects: Project[];
}

export interface ProjectPointProperties {
  projectId: string;
  projectName: string;
  state: string;
  sector: string;
  ministry: string;
  riskLevel: GeoRiskLevel;
  riskScore: number;
  riskRank: number;
  [key: string]: string | number;
}

export const INDIA_BOUNDS = {
  west: 67,
  south: 5,
  east: 98,
  north: 38,
} as const;

export const STATE_NAME_BY_ISO: Record<string, string> = {
  'IN-AN': 'Andaman and Nicobar Islands',
  'IN-AP': 'Andhra Pradesh',
  'IN-AR': 'Arunachal Pradesh',
  'IN-AS': 'Assam',
  'IN-BR': 'Bihar',
  'IN-CH': 'Chandigarh',
  'IN-CT': 'Chhattisgarh',
  'IN-DH': 'Dadra and Nagar Haveli and Daman and Diu',
  'IN-DL': 'Delhi',
  'IN-GA': 'Goa',
  'IN-GJ': 'Gujarat',
  'IN-HP': 'Himachal Pradesh',
  'IN-HR': 'Haryana',
  'IN-JH': 'Jharkhand',
  'IN-JK': 'Jammu and Kashmir',
  'IN-KA': 'Karnataka',
  'IN-KL': 'Kerala',
  'IN-LA': 'Ladakh',
  'IN-LD': 'Lakshadweep',
  'IN-MH': 'Maharashtra',
  'IN-ML': 'Meghalaya',
  'IN-MN': 'Manipur',
  'IN-MP': 'Madhya Pradesh',
  'IN-MZ': 'Mizoram',
  'IN-NL': 'Nagaland',
  'IN-OR': 'Odisha',
  'IN-PB': 'Punjab',
  'IN-PY': 'Puducherry',
  'IN-RJ': 'Rajasthan',
  'IN-SK': 'Sikkim',
  'IN-TG': 'Telangana',
  'IN-TN': 'Tamil Nadu',
  'IN-TR': 'Tripura',
  'IN-UP': 'Uttar Pradesh',
  'IN-UT': 'Uttarakhand',
  'IN-WB': 'West Bengal',
};

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const STATE_ALIASES = new Map<string, string>();
for (const state of Object.values(STATE_NAME_BY_ISO)) STATE_ALIASES.set(normalize(state), state);
STATE_ALIASES.set('jammu kashmir', 'Jammu and Kashmir');
STATE_ALIASES.set('jammu and kashmir', 'Jammu and Kashmir');
STATE_ALIASES.set('orissa', 'Odisha');
STATE_ALIASES.set('pondicherry', 'Puducherry');
STATE_ALIASES.set('uttaranchal', 'Uttarakhand');
STATE_ALIASES.set('dadra and nagar haveli', 'Dadra and Nagar Haveli and Daman and Diu');
STATE_ALIASES.set('daman and diu', 'Dadra and Nagar Haveli and Daman and Diu');

export function toGeoRiskLevel(project: Project): GeoRiskLevel {
  return project.riskAssessment.riskLevel === 'High Risk'
    ? 'High'
    : project.riskAssessment.riskLevel;
}

export function riskRank(level: GeoRiskLevel): number {
  return { Healthy: 0, Watch: 1, High: 2, Critical: 3 }[level];
}

export function getValidCoordinate(project: Project): [number, number] | null {
  const { longitude, latitude } = project;
  if (longitude === null || latitude === null) return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < INDIA_BOUNDS.west || longitude > INDIA_BOUNDS.east) return null;
  if (latitude < INDIA_BOUNDS.south || latitude > INDIA_BOUNDS.north) return null;
  return [longitude, latitude];
}

export function projectStates(project: Project): string[] {
  const matched = project.state
    .split('/')
    .map(part => STATE_ALIASES.get(normalize(part)))
    .filter((state): state is string => Boolean(state));
  return [...new Set(matched)];
}

export function aggregateProjectsByState(projects: Project[]): StateAggregate[] {
  const aggregates = new Map<string, StateAggregate>();

  for (const project of projects) {
    const coordinate = getValidCoordinate(project);
    const level = toGeoRiskLevel(project);
    for (const state of projectStates(project)) {
      const current = aggregates.get(state) ?? {
        state,
        projectCount: 0,
        mappedProjectCount: 0,
        unmappedProjectCount: 0,
        capitalExposure: 0,
        averageRiskScore: 0,
        highestRisk: 'Healthy' as GeoRiskLevel,
        riskCounts: { Healthy: 0, Watch: 0, High: 0, Critical: 0 },
        projects: [],
      };
      current.projectCount += 1;
      current.mappedProjectCount += coordinate ? 1 : 0;
      current.unmappedProjectCount += coordinate ? 0 : 1;
      current.capitalExposure += project.revisedCost;
      current.riskCounts[level] += 1;
      current.projects.push(project);
      if (riskRank(level) > riskRank(current.highestRisk)) current.highestRisk = level;
      aggregates.set(state, current);
    }
  }

  return [...aggregates.values()]
    .map(item => ({
      ...item,
      averageRiskScore: Math.round(
        item.projects.reduce((sum, project) => sum + project.riskAssessment.overallScore, 0) / item.projectCount,
      ),
    }))
    .sort((left, right) => right.capitalExposure - left.capitalExposure);
}

export function projectsToPointCollection(projects: Project[]): FeatureCollection<Point, ProjectPointProperties> {
  const features: Array<Feature<Point, ProjectPointProperties>> = [];
  for (const project of projects) {
    const coordinate = getValidCoordinate(project);
    if (!coordinate) continue;
    const level = toGeoRiskLevel(project);
    features.push({
      type: 'Feature',
      id: project.id,
      geometry: { type: 'Point', coordinates: coordinate },
      properties: {
        projectId: project.id,
        projectName: project.name,
        state: project.state,
        sector: project.sector,
        ministry: project.ministry,
        riskLevel: level,
        riskScore: project.riskAssessment.overallScore,
        riskRank: riskRank(level),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function matchesProjectSearch(project: Project, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  return normalize([
    project.id,
    project.name,
    project.state,
    project.sector,
    project.ministry,
    project.implementingAgency,
  ].join(' ')).includes(term);
}
