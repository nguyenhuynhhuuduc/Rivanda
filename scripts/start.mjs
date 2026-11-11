import { spawn } from 'node:child_process';
import { preflight, reportFailure } from './check-staging.mjs';

try {
  await preflight(process.env);
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT không hợp lệ.');
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', String(port)], { stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('Không khởi động được web server.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { reportFailure(error); process.exitCode = 1; }
