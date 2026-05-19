const fs = require('fs');
let lnd = fs.readFileSync('./src/modules/admin/LNDDashboard.tsx', 'utf8');
const dmSelectStr = \`<select className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
                        <option value="">Select department...</option>\`;
const newDmSelectStr = \`<select 
                        value={bulkSelectedDepartment} 
                        onChange={(e) => setBulkSelectedDepartment(e.target.value)} 
                        className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
                        <option value="">Select department...</option>\`;
lnd = lnd.replace(dmSelectStr, newDmSelectStr);
fs.writeFileSync('./src/modules/admin/LNDDashboard.tsx', lnd, 'utf8');
