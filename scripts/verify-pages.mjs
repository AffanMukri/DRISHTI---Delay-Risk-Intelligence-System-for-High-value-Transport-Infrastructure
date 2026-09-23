import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:4176';
const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function parseEnv(contents) {
  return Object.fromEntries(contents.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start at ${url}.`);
}

const localEnv = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'));
const supabaseUrl = localEnv.VITE_SUPABASE_URL;
if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required in .env.local for the browser verification harness.');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const userId = '11111111-1111-4111-8111-111111111111';
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({
  aud: 'authenticated',
  exp: expiresAt,
  sub: userId,
  email: 'browser-admin@example.com',
  role: 'authenticated',
})}.browser-verification-signature`;

const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'browser-admin@example.com',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Browser Administrator' },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const session = {
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: expiresAt,
  refresh_token: 'browser-verification-refresh-token',
  user,
};
const profile = {
  id: userId,
  email: user.email,
  full_name: 'Browser Administrator',
  role: 'administrator',
  ministry_id: null,
  agency_id: null,
  designation: 'Verification User',
  avatar_url: null,
  is_active: true,
  last_login_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '4176'], {
  cwd: root,
  env: {
    ...process.env,
    VITE_DATA_SOURCE: 'mock',
    VITE_ENABLE_MOCK_FALLBACK: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  await waitForServer(origin);
  browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ storageKey, value }) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, { storageKey: `sb-${projectRef}-auth-token`, value: session });

  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.route(`${supabaseUrl}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/rest/v1/profiles')) {
      const wantsObject = (await request.allHeaders()).accept?.includes('application/vnd.pgrst.object');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: JSON.stringify(wantsObject ? profile : [profile]),
      });
      return;
    }
    if (url.pathname.includes('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const cufBatchId = '70000000-0000-4000-8000-000000000001';
  const cufPreview = {
    batchId: cufBatchId,
    fileName: 'browser_sample_cuf.csv',
    fileType: 'csv',
    fileSizeBytes: 128,
    status: 'validated',
    detectedColumns: ['Project ID', 'Reporting Month', 'Physical Progress'],
    fieldMapping: {
      'Project ID': 'project_code',
      'Reporting Month': 'reporting_month',
      'Physical Progress': 'physical_progress',
    },
    totalRows: 1,
    validRows: 1,
    invalidRows: 0,
    missingValues: 0,
    duplicateRows: 0,
    anomalyRows: 0,
    qualityScore: 100,
    validationSummary: { qualityFormula: '60% valid rows + 15% completeness + 15% uniqueness + 10% anomaly-free rows' },
    uploadedAt: new Date().toISOString(),
    previewRows: [{
      rowNumber: 2,
      projectCode: 'PRG-001',
      reportingMonth: '2026-09-01',
      validationStatus: 'valid',
      rawData: { 'Project ID': 'PRG-001', 'Reporting Month': 'Sep 2026', 'Physical Progress': '72%' },
      normalizedData: { project_code: 'PRG-001', reporting_month: '2026-09-01', physical_progress: 72 },
      transformations: [{ field: 'reporting_month', original: 'Sep 2026', normalized: '2026-09-01', rule: 'canonical_format' }],
      validationErrors: [],
      validationWarnings: [],
      missingValueCount: 0,
      isDuplicate: false,
      anomalyCount: 0,
    }],
    previewOffset: 0,
    previewLimit: 100,
    previewTruncated: false,
  };
  await page.route('**/api/cuf/**', async route => {
    const url = route.request().url();
    const response = url.endsWith('/confirm')
      ? {
          batchId: cufBatchId,
          status: 'imported',
          importedRows: 1,
          skippedRows: 0,
          invalidRows: 0,
          downstreamAnalysisStatus: 'pending',
          message: 'Validated rows were imported.',
        }
      : cufPreview;
    await route.fulfill({ status: url.endsWith('/uploads') ? 201 : 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/analytics/cost**', async route => {
    const projectCost = {
      projectId: 'PRJ-001', projectName: 'National Rail Corridor',
      ministry: 'Ministry of Railways', sector: 'Railways',
      originalApprovedCost: 1000, latestRevisedCost: 1200,
      cumulativeExpenditure: 780, absoluteCostEscalation: 200,
      costEscalationPercentage: 20, expenditurePercentage: 65,
      physicalProgress: 42, progressMismatch: 23,
      approvedCostSource: 'monthly_history', revisedCostSource: 'monthly_history',
      expenditureSource: 'monthly_history', hasMonthlyHistory: true,
    };
    const aggregate = {
      projectCount: 1, comparableProjects: 1, originalApprovedCost: 1000,
      latestRevisedCost: 1200, cumulativeExpenditure: 780,
      absoluteCostEscalation: 200, costEscalationPercentage: 20,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: {
          totalProjects: 1, originalApprovedCost: 1000, latestRevisedCost: 1200,
          cumulativeExpenditure: 780, absoluteCostEscalation: 200,
          costEscalationPercentage: 20, expenditurePercentage: 65,
          escalatedProjects: 1,
        },
        dataAvailability: {
          totalProjects: 1, approvedCostProjects: 1, revisedCostProjects: 1,
          expenditureProjects: 1, physicalProgressProjects: 1,
          comparableCostProjects: 1, monthlyHistoryProjects: 1,
          incompleteCostProjects: 0, latestReportingMonth: '2026-09-01',
        },
        series: [{
          period: '2026-09-01', reportingProjects: 1, approvedCostProjects: 1,
          revisedCostProjects: 1, expenditureProjects: 1,
          originalApprovedCost: 1000, latestRevisedCost: 1200,
          cumulativeExpenditure: 780, absoluteCostEscalation: 200,
          costEscalationPercentage: 20,
        }],
        sectorBreakdown: [{ sector: 'Railways', ...aggregate }],
        ministryBreakdown: [{ ministry: 'Ministry of Railways', ...aggregate }],
        projectBreakdown: [projectCost],
        breakdown: [projectCost],
        progressMismatches: [{
          projectId: projectCost.projectId, projectName: projectCost.projectName,
          ministry: projectCost.ministry, sector: projectCost.sector,
          latestRevisedCost: 1200, cumulativeExpenditure: 780,
          expenditurePercentage: 65, physicalProgress: 42, progressMismatch: 23,
        }],
      }),
    });
  });
  await page.route('**/api/analytics/schedule**', async route => {
    const projectSchedule = {
      projectId: 'PRJ-001', projectName: 'National Rail Corridor',
      ministry: 'Ministry of Railways', implementingAgency: 'Rail Vikas Authority', sector: 'Railways',
      originalCompletionDate: '2026-12-31', currentCompletionDate: '2027-03-31', scheduleSlippageDays: 90,
      plannedPhysicalProgress: 50, actualPhysicalProgress: 42, progressVariance: -8,
      monitoringStartDate: '2026-01-01', asOfDate: '2026-09-01', elapsedDurationPercentage: 53.8,
      totalMilestones: 10, completedMilestones: 6, onTrackMilestones: 2,
      atRiskMilestones: 1, delayedMilestones: 1, overdueMilestones: 1,
      milestoneCompletionPercentage: 60, monthlyProgressVelocity: 2.5,
      hasMonthlyHistory: true, delayRank: 1,
    };
    const aggregate = {
      projectCount: 1, comparableProjects: 1, delayedProjects: 1,
      averageDelayDays: 90, maximumDelayDays: 90,
      averageProgressVariance: -8, averageMonthlyProgressVelocity: 2.5,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: {
          totalProjects: 1, delayedProjects: 1, onTimeProjects: 0,
          severeDelayedProjects: 0, chronicDelayedProjects: 0,
          averageSlippageDays: 90, maximumSlippageDays: 90,
          averagePlannedProgress: 50, averageActualProgress: 42,
          averageProgressVariance: -8, averageElapsedDurationPercentage: 53.8,
          averageMonthlyProgressVelocity: 2.5, totalMilestones: 10,
          completedMilestones: 6, onTrackMilestones: 2, atRiskMilestones: 1,
          delayedMilestones: 1, overdueMilestones: 1, milestoneCompletionPercentage: 60,
        },
        dataAvailability: {
          totalProjects: 1, originalDateProjects: 1, currentDateProjects: 1,
          comparableDateProjects: 1, plannedProgressProjects: 1, actualProgressProjects: 1,
          comparableProgressProjects: 1, elapsedDurationProjects: 1,
          velocityProjects: 1,
          monthlyHistoryProjects: 1, milestoneDetailProjects: 1,
          milestoneReportingProjects: 1, latestAsOfDate: '2026-09-01',
          latestReportingMonth: '2026-09-01',
        },
        series: [
          { period: '2026-08-01', reportingProjects: 1, plannedProgressProjects: 1, actualProgressProjects: 1, plannedProgress: 46, actualProgress: 39, progressVariance: -7, monthlyProgressVelocity: null, averageSlippageDays: 90 },
          { period: '2026-09-01', reportingProjects: 1, plannedProgressProjects: 1, actualProgressProjects: 1, plannedProgress: 50, actualProgress: 42, progressVariance: -8, monthlyProgressVelocity: 3, averageSlippageDays: 90 },
        ],
        delayBrackets: [{ bracket: '1-12 Months', projectCount: 1, sortOrder: 2 }],
        sectorBreakdown: [{ sector: 'Railways', ...aggregate }],
        ministryBreakdown: [{ ministry: 'Ministry of Railways', ...aggregate }],
        projectBreakdown: [projectSchedule],
        breakdown: [projectSchedule],
      }),
    });
  });
  await page.route('**/api/analytics/benchmark**', async route => {
    const selected = {
      projectId: 'PRJ-001', projectName: 'National Rail Corridor',
      ministry: 'Ministry of Railways', implementingAgency: 'Rail Vikas Authority',
      sector: 'Railways', projectType: 'Rail Infrastructure', state: 'Maharashtra',
      states: ['Maharashtra'], status: 'active', originalCost: 1000, revisedCost: 1200,
      startDate: '2022-01-01', startDateSource: 'earliest_milestone', startYear: 2022,
      plannedDurationDays: 1825, costBand: '₹1,000-5,000 Cr', costOverrunPercentage: 20,
      scheduleDelayDays: 90, monthlyProgressVelocity: 2.5, expenditureEfficiency: 64.6,
      milestoneSlippagePercentage: 20, milestoneCompletionPercentage: 60,
      overallRiskScore: 55, costRiskScore: 50, scheduleRiskScore: 60, implementationRiskScore: 45,
    };
    const peer = {
      ...selected, projectId: 'PRJ-002', projectName: 'Comparable Rail Corridor',
      state: 'Maharashtra / Gujarat', states: ['Maharashtra', 'Gujarat'], startYear: 2020,
      matchScore: 95,
      matchReasons: ['Same sector: Railways', 'Same project type: Rail Infrastructure', 'Same original-cost band: ₹1,000-5,000 Cr', 'Shared geography: Maharashtra'],
      isHistorical: true,
    };
    const metric = (key, label, unit, lowerIsBetter, value) => ({
      key, label, unit, lowerIsBetter, selectedValue: value, comparisonValue: value,
      sectorMedian: value, peerMedian: value, historicalMedian: value,
      sectorSampleSize: 3, peerSampleSize: 1, historicalSampleSize: 1,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        selectedProject: selected,
        comparisonPeer: peer,
        peerGroup: { selectionMethod: 'weighted sector/type peer match', minimumMatchScore: 30, candidateProjectsEvaluated: 29, peerCount: 1, historicalPeerCount: 1, maximumPeers: 8 },
        peers: [peer], historicalPeers: [peer],
        metricComparisons: [
          metric('cost_overrun_percentage', 'Cost overrun', '%', true, 20),
          metric('schedule_delay_days', 'Schedule delay', 'days', true, 90),
          metric('monthly_progress_velocity', 'Physical progress velocity', 'pp/month', false, 2.5),
          metric('expenditure_efficiency', 'Expenditure efficiency', 'index', false, 64.6),
          metric('milestone_slippage_percentage', 'Milestone slippage', '%', true, 20),
          metric('overall_risk_score', 'Overall risk', 'score', true, 55),
        ],
        radar: [
          { subject: 'Cost discipline', selectedScore: 60, comparisonScore: 60, peerMedianScore: 60 },
          { subject: 'Schedule discipline', selectedScore: 91, comparisonScore: 91, peerMedianScore: 91 },
          { subject: 'Progress velocity', selectedScore: 50, comparisonScore: 50, peerMedianScore: 50 },
          { subject: 'Expenditure efficiency', selectedScore: 64.6, comparisonScore: 64.6, peerMedianScore: 64.6 },
          { subject: 'Milestone delivery', selectedScore: 80, comparisonScore: 80, peerMedianScore: 80 },
          { subject: 'Risk resilience', selectedScore: 45, comparisonScore: 45, peerMedianScore: 45 },
        ],
        agencyLeaderboard: [{ rank: 1, agency: 'Rail Vikas Authority', projectCount: 2, totalOutlay: 2400, averageDelayDays: 90, averageCostOverrunPercentage: 20, milestoneHitRate: 60, averageRiskScore: 55, deliveryEfficiencyIndex: 64 }],
        dataAvailability: { portfolioProjects: 30, sectorProjects: 3, projectsWithStartDate: 30, projectsWithVelocity: 24, projectsWithMilestones: 30, projectsWithRisk: 30 },
      }),
    });
  });

  await page.route('**/api/audit/**', async route => {
    const url = new URL(route.request().url());
    const auditId = '80000000-0000-4000-8000-000000000001';
    const payload = url.pathname.endsWith('/options')
      ? {
          actions: ['prediction.executed'],
          entityTypes: ['prediction'],
          sources: ['ml_inference'],
          actors: [{ id: userId, email: profile.email, fullName: profile.full_name }],
        }
      : {
          items: [{
            id: auditId,
            actor: { id: userId, email: profile.email, fullName: profile.full_name, role: profile.role },
            project: null,
            action: 'prediction.executed',
            entityType: 'prediction',
            entityId: auditId,
            tableName: 'predictions',
            recordKey: auditId,
            oldValues: null,
            newValues: { model_version: '1.0.0', input_data_version: 'monthly-update:test' },
            source: 'ml_inference',
            requestReference: 'browser-audit-request',
            importReference: null,
            ipAddress: null,
            userAgent: null,
            metadata: {},
            eventVersion: 1,
            occurredAt: new Date().toISOString(),
          }],
          total: 1,
          limit: 50,
          offset: 0,
        };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  const checks = [
    ['Portfolio', 'Command Center', 'Infrastructure Command Center'],
    ['Portfolio', 'Project Portfolio', 'Project Portfolio'],
    ['Risk & Action', 'Risk Intelligence', 'Risk Intelligence'],
    ['Risk & Action', 'Early Warnings', 'Early Warning Center'],
    ['Risk & Action', 'Intervention Center', 'Intervention Center'],
    ['Analytics', 'Cost Analytics', 'Cost Analytics & Escalation Forensics'],
    ['Analytics', 'Schedule Analytics', 'Schedule Analytics & Delay Forensics'],
    ['Analytics', 'Benchmarking', 'Benchmarking & Agency Intelligence'],
    ['Analytics', 'Geo Intelligence', 'Geo Intelligence & Spatial Clusters'],
    ['Operations', 'Reports', 'Reports & Cabinet Dossiers'],
    ['Operations', 'Data Management', 'Data Management & CUF Ingestion'],
    ['Insights & Models', 'Project Insights', 'Project Insights & Systemic Intelligence'],
    ['Insights & Models', 'Model Monitoring', 'ML Model Monitoring'],
    ['Administration', 'Audit Trail', 'Audit Trail'],
    ['Administration', 'Master Access Portal', 'Master Access Portal'],
  ];

  async function navigateFromSidebar(groupLabel, navigationLabel) {
    const navigationItem = page.getByText(navigationLabel, { exact: true }).first();
    if (!(await navigationItem.isVisible())) {
      await page.getByRole('button', { name: groupLabel, exact: true }).click();
    }
    await navigationItem.click();
  }

  const verified = [];
  for (const [groupLabel, navigationLabel, heading] of checks) {
    if (navigationLabel !== 'Command Center') {
      await navigateFromSidebar(groupLabel, navigationLabel);
    }
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' });
    if (navigationLabel === 'Geo Intelligence') {
      await page.getByRole('img', { name: 'Reference map of India with project markers plotted from stored coordinates' }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Enable interactive GIS' }).waitFor({ state: 'visible' });
      await page.getByText('Loading India boundary and project layers…', { exact: true }).waitFor({ state: 'hidden' });
      await page.getByLabel('Filter by risk level').selectOption('Critical');
      await page.getByLabel('Search projects').fill('project-that-does-not-exist');
      await page.getByText('No State / UT records match the current filters.', { exact: true }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: /Clear filters/ }).click();
    }
    verified.push(heading);
  }

  await navigateFromSidebar('Operations', 'Data Management');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser_sample_cuf.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Project ID,Reporting Month,Physical Progress\nPRG-001,Sep 2026,72%'),
  });
  await page.getByRole('button', { name: 'Upload & validate' }).click();
  await page.getByText('100.0%', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm import (1 rows)' }).click();
  await page.getByText('Import completed', { exact: true }).waitFor({ state: 'visible' });

  await navigateFromSidebar('Portfolio', 'Project Portfolio');
  await page.locator('table.data-table tbody tr').first().click();
  await page.getByText('Project Health Score', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Timeline & Milestones', { exact: true }).click();
  await page.getByText('Dependency graph requires backend data', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /Ask DHRISTI/ }).click();
  await page.getByText('Ask DHRISTI requires the authenticated FastAPI data source. It does not generate answers from mock project data.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Cost Prediction', { exact: true }).click();
  await page.getByText('Real model inference is unavailable while the application is using the explicit offline mock data source.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Schedule Prediction', { exact: true }).click();
  await page.getByText('No real schedule model result loaded', { exact: true }).waitFor({ state: 'visible' });
  verified.push('Project Intelligence');

  if (runtimeErrors.length) {
    throw new Error(`Browser runtime errors:\n${runtimeErrors.join('\n')}`);
  }
  process.stdout.write(`Verified ${verified.length} pages:\n${verified.map(value => `- ${value}`).join('\n')}\n`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
