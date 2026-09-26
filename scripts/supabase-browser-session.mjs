import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

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

export async function installSupabaseBrowserSession(context, root, role, index = 1) {
  const localEnv = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8'));
  const supabaseUrl = localEnv.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required in .env.local for browser verification.');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const suffix = String(index).padStart(12, '0');
  const userId = `11111111-1111-4111-8111-${suffix}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const email = `browser-${role.replaceAll('_', '-')}@example.invalid`;
  const accessToken = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({
    aud: 'authenticated', exp: expiresAt, sub: userId, email, role: 'authenticated',
  })}.browser-verification-signature`;
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: `Browser ${role}` },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `browser-refresh-${role}`,
    user,
  };
  const profile = {
    id: userId,
    email,
    full_name: `Browser ${role}`,
    role,
    ministry_id: null,
    agency_id: null,
    designation: 'Browser verification identity',
    avatar_url: null,
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await context.addInitScript(({ storageKey, value }) => {
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, { storageKey: `sb-${projectRef}-auth-token`, value: session });

  await context.route(`${supabaseUrl}/**`, async route => {
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

export async function startMockViteServer(root, port) {
  const origin = `http://127.0.0.1:${port}`;
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: {
      ...process.env,
      VITE_DATA_SOURCE: 'mock',
      VITE_ENABLE_MOCK_FALLBACK: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok) return { origin, server };
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  server.kill();
  throw new Error(`Vite did not start at ${origin}.`);
}
