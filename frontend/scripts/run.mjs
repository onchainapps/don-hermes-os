#!/usr/bin/env node
// don-os-frontend bin shim — runs vite preview from dist/
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname.replace(/[\\/]scripts$/, '');
const port = parseInt(process.env.PORT ?? '3002');

try { await import('fs/promises').then(fs => fs.access(path.join(root, 'dist'))); } catch {
  console.error('[don-os-frontend] dist/ not found. Build first.');
  process.exit(1);
}

const child = spawn('bunx', ['vite', 'preview', '--host', '0.0.0.0', '--port', String(port)], {
  stdio: 'inherit', cwd: root, env: { ...process.env, PORT: String(port) }
});
child.on('exit', code => process.exit(code ?? 0));
