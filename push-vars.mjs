import fs from 'fs';
import { execSync } from 'child_process';

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');

const args = [];
for (let line of lines) {
  line = line.trim();
  if (!line || line.startsWith('#')) continue;
  
  const idx = line.indexOf('=');
  if (idx > 0) {
    const key = line.slice(0, idx);
    let val = line.slice(idx + 1);
    
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    
    args.push(`${key}=${val}`);
  }
}

console.log(`Setting ${args.length} variables...`);
if (args.length > 0) {
  const cmd = `railway variable set --service anyalpha --skip-deploys ` + args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
  execSync(cmd, { env: { ...process.env, RAILWAY_TOKEN: '2d167125-138e-497d-b991-78beb9497a39' }, stdio: 'inherit' });
  console.log('Variables set successfully!');
}
