const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3003 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:3003`);
  const cwd = url.searchParams.get('cwd') || process.env.HOME || '/home/don';
  const shell = process.env.SHELL || '/bin/bash';
  
  const pty = require('node-pty').spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env,
  });
  
  pty.onData(data => {
    if (ws.readyState === 1) ws.send(Buffer.from(data, 'utf8'));
  });
  
  ws.on('message', (data) => {
    const str = data.toString();
    if (str[0] === '{') {
      try {
        const msg = JSON.parse(str);
        if (msg.type === 'resize') pty.resize(msg.cols, msg.rows);
        else if (msg.type === 'kill') pty.kill();
        else pty.write(str);
      } catch { pty.write(str); }
    } else {
      pty.write(str);
    }
  });
  
  ws.on('close', () => pty.kill());
});

console.log('[terminal-pty] Listening on :3003');
