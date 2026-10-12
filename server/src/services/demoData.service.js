import fs from 'node:fs';
const file=new URL('../data/fleet_payroll_seed.json',import.meta.url);
export const legacyDemoIds=new Set(fs.existsSync(file)?(JSON.parse(fs.readFileSync(file,'utf8')).trips||[]).map(t=>t.id):[]);
