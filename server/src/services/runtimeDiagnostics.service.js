import { randomUUID } from 'node:crypto';

// Infrastructure diagnosis only: never record URLs, tokens, bodies or business data.
export function startRuntimeDiagnostics({ app, getStatus, log = console.log, intervalMs = 60000 }) {
  const instance = randomUUID().slice(0, 8);
  const emit = (event, fields = {}) => log('[AVAILABILITY]', JSON.stringify({ event, instance, ...fields }));
  let expected = Date.now() + intervalMs;
  let lastHealth = 0;
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !['/', '/api/v1/health', '/api/v1/health/live'].includes(req.path)) return next();
    res.setHeader('X-App-Instance', instance);
    const now = Date.now();
    const route = req.path === '/' ? 'shell' : 'health';
    if (route === 'health' && now - lastHealth < intervalMs) return next();
    if (route === 'health') lastHealth = now;
    emit('request', { route });
    let finished = false;
    res.once('finish', () => { finished = true; emit('response', { route, status: res.statusCode, ms: Date.now() - now }); });
    res.once('close', () => { if (!finished) emit('aborted', { route, ms: Date.now() - now }); });
    next();
  });
  const report = (lagMs = 0) => {
    const state = getStatus();
    const memory = process.memoryUsage();
    emit('runtime', { uptimeSeconds: Math.round(process.uptime()), rssMB: Math.round(memory.rss / 1048576), heapMB: Math.round(memory.heapUsed / 1048576), lagMs, ready: Boolean(state.ready), restoring: Boolean(state.initializing) });
  };
  const timer = setInterval(() => { const now = Date.now(); report(Math.max(0, now - expected)); expected = now + intervalMs; }, intervalMs);
  timer.unref();
  const stop = () => clearInterval(timer);
  report();
  return { stop };
}
