// Packaged ecosystem — uses installed npm packages at ~/.bun/packages/
// Build + install first:
//   cd frontend && npx vite build
//   cd backend && bun build src/server.ts --outdir=dist --target=bun
//   npm pack && tar -xzf ... -C ~/.bun/packages/
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
      env: { NODE_ENV: 'production', PORT: '3101' },
      exec_mode: 'fork',
      error_file: '/home/don/logs/don-os-dashboard.err.log',
      out_file: '/home/don/logs/don-os-dashboard.out.log',
    }
  ]
};
