// ─── Don Hermes OS — Dev Ecosystem ───
// Port convention (must stay consistent — these feed into API_SERVER_CORS_ORIGINS):
//   3001  = backend API (production, installed dist bundle)
//   3002  = frontend dashboard (production, Vite preview)
//   3003  = backend API (dev, source hot-reload)
//   5173  = frontend dashboard (dev, Vite dev server)
//   Hermes gateway ports (8642, 8650+) are managed by Hermes Agent, not here.
//
// If you change any port below, update API_SERVER_CORS_ORIGINS in every profile's .env too.
module.exports = {
  apps: [
    {
      name: 'don-os-backend',
      script: 'bun',
      args: ['run', 'server.ts'],
      cwd: '/home/don/dev/git/don-hermes-os/backend',
      env: { NODE_ENV: 'development', PORT: '3001' },
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-backend-dev-error.log',
      out_file: '/home/don/logs/don-os-backend-dev-out.log',
    },
    {
      name: 'don-os-dashboard',
      script: 'bun',
      args: ['run', 'dev'],
      cwd: '/home/don/dev/git/don-hermes-os/frontend',
      env: { NODE_ENV: 'development', PORT: '3002' },
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-dashboard-dev-error.log',
      out_file: '/home/don/logs/don-os-dashboard-dev-out.log',
    }
  ]
};
