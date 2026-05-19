const lnd = require('fs').readFileSync('src/modules/admin/LNDDashboard.tsx', 'utf8');
console.log(lnd.split('\n').slice(712, 720).join('\n'));
