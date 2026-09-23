import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:4177';
const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

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

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '4177'], {
  cwd: root,
  env: { ...process.env, VITE_DATA_SOURCE: 'mock', VITE_ENABLE_MOCK_FALLBACK: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  await waitForServer(origin);
  browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'See risk earlier. Move projects forward.' }).waitFor();
  await page.getByRole('button', { name: /Explore a public project/ }).click();
  await page.getByRole('heading', { name: 'Find a public infrastructure project' }).waitFor();
  await page.getByLabel('Search public projects').fill('PRJ-001');
  await page.getByRole('button', { name: /Mumbai–Ahmedabad High Speed Rail Corridor/ }).click();
  await page.getByRole('heading', { name: 'Mumbai–Ahmedabad High Speed Rail Corridor' }).waitFor();
  await page.getByText('Published estimated timeline', { exact: true }).waitFor();
  await page.getByText('Approved cost', { exact: true }).waitFor();
  if (await page.getByText('Project Health Score', { exact: true }).count()) throw new Error('Internal risk score leaked into public view.');
  if (await page.getByText('Schedule Delay', { exact: true }).count()) throw new Error('Internal schedule analysis leaked into public view.');

  await page.getByRole('button', { name: 'Scan site QR' }).click();
  await page.getByRole('dialog', { name: 'Scan a DHRISTI project QR code' }).waitFor();
  await page.getByRole('button', { name: 'Close QR scanner' }).click();

  await page.goto(`${origin}/?publicProject=PRJ-001`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Mumbai–Ahmedabad High Speed Rail Corridor' }).waitFor();

  if (runtimeErrors.length) throw new Error(`Browser runtime errors:\n${runtimeErrors.join('\n')}`);
  process.stdout.write('Verified public search, limited project details, scanner entry, and QR deep link.\n');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
