// Dev ecosystem — uses local source via bun run (hot-reload capable)
// Usage: pm2 start ecosystem.config.js --env dev
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
      env: { NODE_ENV: 'development', PORT: '5173' },
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-dashboard-dev-error.log',
      out_file: '/home/don/logs/don-os-dashboard-dev-out.log',
    }
  ]
};
