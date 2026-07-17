import fs from 'fs';
import { execSync } from 'child_process';

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');

for (let line of lines) {
  line = line.trim();
  if (line.startsWith('VITE_PINATA_')) {
    const idx = line.indexOf('=');
    const key = line.slice(0, idx);
    let val = line.slice(idx + 1);
    
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);

    console.log(`Adding ${key}...`);
    try {
      execSync(`npx vercel env rm ${key} production -y`, { stdio: 'ignore' });
    } catch (e) {}
    execSync(`npx vercel env add ${key} production`, { input: val, stdio: ['pipe', 'inherit', 'inherit'] });
  }
}
