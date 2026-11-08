import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { startRuntimeDiagnostics } from '../services/runtimeDiagnostics.service.js';
const require = createRequire(new URL('../../package.json', import.meta.url));
const express = require('express');
const app = express(), records = [];
const diagnostics = startRuntimeDiagnostics({app, getStatus:()=>({ready:true,initializing:false}), log:(...args)=>records.push(args.join(' ')), intervalMs:25});
app.get('/', (_req,res)=>res.send('shell'));
app.get('/api/v1/health/live', (_req,res)=>res.json({ok:true}));
app.get('/private', (_req,res)=>res.status(401).end());
const server = http.createServer(app);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
try {
  const root=await fetch(base+'/?token=SECRET-MUST-NOT-LOG');
  assert.equal(await root.text(),'shell'); assert.match(root.headers.get('x-app-instance'),/^[a-f0-9]{8}$/);
  const health=await fetch(base+'/api/v1/health/live'); assert.equal(health.status,200);
  assert.equal(health.headers.get('x-app-instance'),root.headers.get('x-app-instance'));
  const privateResponse=await fetch(base+'/private'); assert.equal(privateResponse.status,401); assert.equal(privateResponse.headers.get('x-app-instance'),null);
  await new Promise(r=>setTimeout(r,60)); diagnostics.stop();
  const count=records.length; await new Promise(r=>setTimeout(r,60)); assert.equal(records.length,count);
  assert(records.some(x=>x.includes('"event":"response"')&&x.includes('"status":200')));
  assert(records.some(x=>x.includes('"rssMB"'))); assert(!records.join('').includes('SECRET')); assert(!records.join('').includes('token'));
  console.log('PASS: runtime, routing correlation, response status, unchanged private route, timer cleanup and secret-free logs');
} finally { diagnostics.stop(); await new Promise(r=>server.close(r)); }
