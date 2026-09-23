import { chromium } from 'playwright-core';

const accounts = [
  {
    email: 'admin@drishti.local', password: 'DrishtiAdmin@2026!', role: 'administrator', label: 'Administrator',
    visibleGroups: ['Administration', 'Insights & Models', 'Operations', 'Risk & Action'], hiddenGroups: [],
    group: 'Administration', visibleItem: 'Master Access Portal', hiddenItem: null,
  },
  {
    email: 'executive@drishti.local', password: 'DrishtiExec@2026!', role: 'executive', label: 'Executive',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations', 'Insights & Models'], hiddenGroups: ['Administration'],
    group: 'Operations', visibleItem: 'Reports', hiddenItem: 'Data Management',
  },
  {
    email: 'officer@drishti.local', password: 'DrishtiOfficer@2026!', role: 'monitoring_officer', label: 'Monitoring Officer',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations'], hiddenGroups: ['Administration', 'Insights & Models'],
    group: 'Operations', visibleItem: 'Data Management', hiddenItem: null,
  },
  {
    email: 'analyst@drishti.local', password: 'DrishtiAnalyst@2026!', role: 'analyst', label: 'Analyst',
    visibleGroups: ['Risk & Action', 'Analytics', 'Operations', 'Insights & Models'], hiddenGroups: ['Administration'],
    group: 'Risk & Action', visibleItem: 'Risk Intelligence', hiddenItem: 'Intervention Center',
  },
];

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

async function openLogin(page) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.getByLabel('Email address').waitFor({ state: 'visible' });
}

try {
  for (const account of accounts) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await openLogin(page);
    await page.getByLabel('Email address').fill(account.email);
    await page.getByLabel('Assigned access role').selectOption(account.role);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
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

  const mismatchContext = await browser.newContext();
  const mismatchPage = await mismatchContext.newPage();
  await openLogin(mismatchPage);
  await mismatchPage.getByLabel('Email address').fill('admin@drishti.local');
  await mismatchPage.getByLabel('Assigned access role').selectOption('executive');
  await mismatchPage.getByLabel('Password', { exact: true }).fill('DrishtiAdmin@2026!');
  await mismatchPage.getByRole('button', { name: 'Sign In' }).click();
  await mismatchPage.getByText('The selected role does not match the role assigned to this account.', { exact: true }).waitFor();
  await mismatchContext.close();

  console.log('All four demo roles and role-mismatch protection verified.');
} finally {
  await browser.close();
}
