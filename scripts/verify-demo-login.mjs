import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

try {
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.getByLabel('Email address').fill('admin@dhristi.local');
  await page.getByLabel('Assigned access role').selectOption('administrator');
  await page.getByLabel('Password', { exact: true }).fill('DhristiAdmin@2026!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByRole('heading', { name: 'Infrastructure Command Center', exact: true })
    .waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByText('Cost Analytics', { exact: true }).waitFor({ state: 'visible' });

  if (runtimeErrors.length) {
    throw new Error(`Demo runtime errors:\n${runtimeErrors.join('\n')}`);
  }
  console.log('Demo login and sidebar interaction verified at http://127.0.0.1:5173/');
} finally {
  await browser.close();
}
