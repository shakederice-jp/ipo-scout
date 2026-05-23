const fs = require('fs');
let c = fs.readFileSync('src/app/api/admin/auto-fetch/route.ts', 'utf8');
const helper = `
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}
`;
c = c.replace('export async function POST', helper + 'export async function POST');
c = c.replace(/const jsonMatch[\s\S]*?analysisText = jsonMatch\[0\][^;]*;/, 'const analysisText = extractJson(rawAnalysis);');
c = c.replace(/const fixMatch[\s\S]*?fixText = fixMatch\[0\][^;]*;/, 'const fixText = extractJson(rawFix);');
c = c.replace(/const geminiMatch[\s\S]*?geminiText = geminiMatch\[0\][^;]*;/, 'const geminiText = extractJson(rawGemini);');
fs.writeFileSync('src/app/api/admin/auto-fetch/route.ts', c);
console.log('Done');
