// ─── Don Hermes OS — Packaged (Production) Ecosystem ───
// Port convention (must stay consistent — these feed into API_SERVER_CORS_ORIGINS):
//   3001  = backend API (production, installed dist bundle)
//   3002  = frontend dashboard (production, Vite preview)
//   3003  = backend API (dev, source hot-reload)
//   5173  = frontend dashboard (dev, Vite dev server)
//   Hermes gateway ports (8642, 8650+) are managed by Hermes Agent, not here.
//
// If you change any port below, update API_SERVER_CORS_ORIGINS in every profile's .env too.
//
// Build + install before starting:
//   cd frontend && npx vite build
//   cd backend && bun build src/server.ts --outdir=dist --target=bun
//   npm pack && npm install -g <tgz>
//   pm2 start ecosystem.packaged.config.js
module.exports = {
  apps: [
    {
      name: 'don-os-backend',
      script: 'bun',
      args: ['/home/don/.bun/packages/don-os-backend/dist/server.js'],
      cwd: '/home/don/.bun/packages/don-os-backend',
      env: { NODE_ENV: 'production', PORT: '3001' },
      env_file: '/home/don/dev/git/don-hermes-os/backend/.env',
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-backend.err.log',
      out_file: '/home/don/logs/don-os-backend.out.log',
    },
    {
      name: 'don-os-dashboard',
      script: 'node',
      args: ['/home/don/.bun/packages/don-os-frontend/scripts/run.mjs'],
      cwd: '/home/don/.bun/packages/don-os-frontend',
      env: { NODE_ENV: 'production', PORT: '3002' },
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-dashboard.err.log',
      out_file: '/home/don/logs/don-os-dashboard.out.log',
    }
  ]
};
