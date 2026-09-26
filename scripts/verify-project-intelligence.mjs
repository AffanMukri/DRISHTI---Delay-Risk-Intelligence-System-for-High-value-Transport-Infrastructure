import { chromium } from 'playwright-core';
import path from 'node:path';
import { installSupabaseBrowserSession, startMockViteServer } from './supabase-browser-session.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { origin, server } = await startMockViteServer(root, 4178);
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await installSupabaseBrowserSession(context, root, 'administrator');
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto(origin, { waitUntil: 'networkidle' });

  const fixtureCoverage = await page.evaluate(async () => {
    const [{ PROJECTS }, intelligence] = await Promise.all([
      import('/src/data/projects.ts'),
      import('/src/services/mockProjectIntelligence.ts'),
    ]);
    const failures = [];
    for (const project of PROJECTS) {
      try {
        const history = intelligence.buildMockProjectHistory(project.id);
        const confidence = intelligence.buildMockDataConfidence(project.id);
        const trajectory = intelligence.buildMockRiskTrajectory(project.id);
        const cost = intelligence.buildMockCostProjection(project.id);
        const schedule = intelligence.buildMockScheduleProjection(project.id);
        const configuration = intelligence.buildMockScenarioConfiguration(project.id);
        const scenario = intelligence.simulateMockScenario(project.id, {
          scheduleDelayDays: Math.max(0, project.delayDays - 30),
        });
        const graph = intelligence.buildMockDependencyGraph(project.id);
        const evidence = intelligence.buildMockEvidenceChain(project.id);
        if (history.monthlyUpdates.length !== 12) throw new Error('history does not contain 12 points');
        if (!(confidence.overallScore > 0)) throw new Error('confidence score is missing');
        if (trajectory.points.length < 2) throw new Error('trajectory is missing');
        if (!cost.synthetic || !Number.isFinite(cost.predictedFinalCost)) throw new Error('cost projection is invalid');
        if (!schedule.synthetic || !schedule.predictedProgressSeries.length) throw new Error('schedule projection is invalid');
        if (!configuration.supportedVariables.length || scenario.methodology !== 'deterministic_demo') throw new Error('scenario is invalid');
        if (graph.nodes.length !== project.milestones.length) throw new Error('dependency nodes are incomplete');
        if (evidence.chains.length < 3) throw new Error('evidence chains are incomplete');
      } catch (error) {
        failures.push(`${project.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { projectCount: PROJECTS.length, failures };
  });

  if (fixtureCoverage.failures.length) {
    throw new Error(`Project fixture coverage failed:\n${fixtureCoverage.failures.join('\n')}`);
  }

  await page.getByRole('heading', { name: 'Infrastructure Command Center', exact: true }).waitFor();

  await page.getByText('Project Portfolio', { exact: true }).last().click();
  await page.getByRole('heading', { name: 'Project Portfolio', exact: true }).waitFor();
  await page.locator('tbody tr').first().click();
  await page.getByText('Project Health Score', { exact: true }).waitFor();

  const tabExpectations = [
    ['Data Confidence', 'Synthetic demonstration assessment:'],
    ['Risk Trajectory', 'Synthetic demonstration trajectory:'],
    ['Timeline & Milestones', 'Dependency & Risk Propagation'],
    ['Cost Analytics', 'Monthly Expenditure Trend'],
    ['Schedule Analytics', 'Planned vs Actual Progress (%)'],
    ['Cost Prediction', 'Deterministic Demo Cost Projection'],
    ['Schedule Prediction', 'Deterministic Demo Schedule Projection'],
    ['What-If Simulator', 'Physical progress'],
  ];
  for (const [tab, expected] of tabExpectations) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.getByText(expected, { exact: false }).first().waitFor({ state: 'visible' });
  }

  const progressInput = page.getByLabel('Physical progress');
  const currentProgress = Number(await progressInput.inputValue());
  await progressInput.fill(String(Math.min(100, currentProgress + (currentProgress < 100 ? 1 : -1))));
  await page.getByRole('button', { name: 'Compare scenario' }).click();
  await page.getByText('SCENARIO', { exact: true }).waitFor();
  await page.getByText('Scenario/demo estimate - not a guaranteed project outcome.', { exact: false }).waitFor();

  await page.getByRole('button', { name: 'Cost Prediction', exact: true }).click();
  await page.getByRole('button', { name: 'View Evidence', exact: true }).last().click();
  await page.getByRole('dialog', { name: 'Evidence Chain' }).waitFor();
  await page.getByText('Synthetic demo evidence', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Close' }).click();

  if (runtimeErrors.length) {
    throw new Error(`Browser runtime errors:\n${runtimeErrors.join('\n')}`);
  }
  console.log(`Verified all Project Intelligence generators for ${fixtureCoverage.projectCount} projects and exercised every detail tab.`);
} finally {
  await browser.close();
  server.kill();
}
