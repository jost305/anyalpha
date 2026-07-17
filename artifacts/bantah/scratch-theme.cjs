const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'olusegun', 'Downloads', 'anyalpha-terminal', 'anyalpha-terminal', 'artifacts', 'bantah', 'src', 'components', 'pages', 'launcher-trade-page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace dark mode specific classes with semantic ones
const replacements = [
  { from: /bg-\[#141414\]\/90/g, to: 'bg-card' },
  { from: /border-white\/10/g, to: 'border-border' },
  { from: /border-white\/5/g, to: 'border-border/50' },
  { from: /text-white\/70/g, to: 'text-foreground/70' },
  { from: /text-white\/50/g, to: 'text-foreground/50' },
  { from: /text-white/g, to: 'text-foreground' },
  { from: /bg-white\/5/g, to: 'bg-muted/50' },
  { from: /bg-white\/10/g, to: 'bg-muted' },
  { from: /bg-white\/\[0\.02\]/g, to: 'bg-muted/20' },
  { from: /bg-white\/\[0\.03\]/g, to: 'bg-muted/30' },
  { from: /bg-white\/\[0\.04\]/g, to: 'bg-muted/40' },
  { from: /bg-black\/50/g, to: 'bg-muted/50 dark:bg-black/50' },
  // specific black text fix
  { from: /text-black/g, to: 'text-primary-foreground dark:text-black' },
];

replacements.forEach(({ from, to }) => {
  content = content.replace(from, to);
});

// Also fix the chart colors based on current theme. 
// For now, let's just make the chart grid lines adaptive if possible, or leave them as is but less white
content = content.replace(/rgba\(255,255,255,0\.04\)/g, "'rgba(128,128,128,0.1)'");
content = content.replace(/rgba\(255,255,255,0\.08\)/g, "'rgba(128,128,128,0.2)'");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');
