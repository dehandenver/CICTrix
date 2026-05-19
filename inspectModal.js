const fs = require('fs');
const lnd = fs.readFileSync('./src/modules/admin/LNDDashboard.tsx', 'utf8');
const reqModalIdx = lnd.indexOf('showRequestModal &&');
if (reqModalIdx !== -1) {
    const endIdx = lnd.indexOf('showBulkRequestModal &&');
    console.log(lnd.substring(reqModalIdx, endIdx !== -1 ? endIdx : reqModalIdx + 2000));
}
