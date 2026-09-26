import { chromium } from 'playwright-core';
import path from 'node:path';
import { installSupabaseBrowserSession, startMockViteServer } from './supabase-browser-session.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { origin, server } = await startMockViteServer(root, 4177);

const accounts = [
  {
    role: 'administrator', label: 'Administrator',
    visibleGroups: ['Administration', 'Insights & Models', 'Operations', 'Risk & Action'], hiddenGroups: [],
    group: 'Administration', visibleItem: 'Master Access Portal', hiddenItem: null,
  },
  {
    role: 'executive', label: 'Executive',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations', 'Insights & Models'], hiddenGroups: ['Administration'],
    group: 'Operations', visibleItem: 'Reports', hiddenItem: 'Data Management',
  },
  {
    role: 'monitoring_officer', label: 'Monitoring Officer',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations'], hiddenGroups: ['Administration', 'Insights & Models'],
    group: 'Operations', visibleItem: 'Data Management', hiddenItem: null,
  },
  {
    role: 'analyst', label: 'Analyst',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations', 'Insights & Models'], hiddenGroups: ['Administration'],
    group: 'Risk & Action', visibleItem: 'Risk Intelligence', hiddenItem: 'Intervention Center',
  },
];

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

try {
  for (const [index, account] of accounts.entries()) {
    const context = await browser.newContext();
    await installSupabaseBrowserSession(context, root, account.role, index + 1);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Infrastructure Command Center', exact: true }).waitFor();
    await page.getByText(account.label, { exact: true }).last().waitFor();

    for (const group of account.visibleGroups) {
      await page.getByRole('button', { name: group, exact: true }).waitFor({ state: 'visible' });
    }
    for (const group of account.hiddenGroups) {
      if (await page.getByRole('button', { name: group, exact: true }).count()) {
        throw new Error(`${account.label} unexpectedly sees ${group}.`);
      }
    }
    await page.getByRole('button', { name: account.group, exact: true }).click();
    await page.getByText(account.visibleItem, { exact: true }).waitFor({ state: 'visible' });
    if (account.hiddenItem && await page.getByText(account.hiddenItem, { exact: true }).count()) {
      throw new Error(`${account.label} unexpectedly sees ${account.hiddenItem}.`);
    }
    await context.close();
  }

  console.log('All four Supabase profile roles and route visibility rules verified.');
} finally {
  await browser.close();
  server.kill();
}
