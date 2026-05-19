const fs = require('fs');
const lnd = fs.readFileSync('src/modules/admin/LNDDashboard.tsx', 'utf8');
const lines = lnd.split('\n');
const idx = lines.findIndex(l => l.includes('Selected Employees'));
console.log(lines.slice(idx - 5, idx + 40).join('\n'));