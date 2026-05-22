#!/usr/bin/env bun
// don-os-backend bin shim — runs bundled server.js from dist/
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'dist', 'server.js');

// Verify dist exists
try { await import('fs/promises').then(fs => fs.access(serverPath)); } catch {
  console.error('[don-os-backend] dist/server.js not found.');
  console.error('  Build first: cd packages/don-os-backend && bun build');
  process.exit(1);
}

const child = spawn('bun', [serverPath], { stdio: 'inherit', env: process.env });
child.on('exit', code => process.exit(code ?? 0));
