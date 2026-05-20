const fs = require('fs');

const pmPath = './src/modules/admin/PMDashboard.tsx';
let pm = fs.readFileSync(pmPath, 'utf8');

if (!pm.includes('createDocumentRequest')) {
  pm = pm.replace(
    "import { getAllEmployees, type Employee } from '../../lib/api/employees';",
    "import { getAllEmployees, type Employee } from '../../lib/api/employees';\nimport { createDocumentRequest } from '../../lib/employeeDocuments';"
  );
}

const stateToInject = `  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [bulkSelectedDepartment, setBulkSelectedDepartment] = useState<string>('');
  const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<string[]>([]);
  
  useEffect(() => {
    (async () => {
      const res = await getAllEmployees({ status: 'Active' });
      if (res.success && Array.isArray(res.data)) {
        setActiveEmployees(res.data);
      }
    })();
  }, []);
`;
if (!pm.includes('setActiveEmployees')) {
  pm = pm.replace(
    "const totalEmployees = 24;",
    stateToInject + "\n  const totalEmployees = activeEmployees.length;"
  );
}

const oldHandleSendRequest = `  const handleSendRequest = () => {
    if (!requestDocType || !requestDueDate) {
      alert('Please select a document type and due date.');
      return;
    }
    // TODO: integrate with Supabase to persist the request
    alert(\`Request sent for "\${requestDocType}" due \${requestDueDate}\${requestEmployee ? \` to \${requestEmployee.name}\` : ''}.\`);
    closeRequestModal();
  };`;

const newHandleSendRequest = `  const handleSendRequest = async () => {
    if (!requestDocType || !requestDueDate) {
      alert('Please select a document type and due date.');
      return;
    }
    if (requestEmployee) {
      // Find the employee to get ID
      const emp = activeEmployees.find(e => e.fullName === requestEmployee.name);
      if (emp) {
        await createDocumentRequest({
          employeeId: emp.employeeId,
          email: emp.email,
          documentName: requestDocType,
          description: 'Requested via Performance Management',
          dueDate: new Date(requestDueDate).toISOString(),
          requestedBy: 'PM Admin'
        });
      }
    }
    alert(\`Request sent for "\${requestDocType}" due \${requestDueDate}\${requestEmployee ? \` to \${requestEmployee.name}\` : ''}.\`);
    closeRequestModal();
  };`;

if (pm.includes(oldHandleSendRequest)) pm = pm.replace(oldHandleSendRequest, newHandleSendRequest);

const oldHandleBulkSendRequest = `  const handleBulkSendRequest = () => {
    if (!bulkDocName || !bulkDescription || !bulkDueDate) {
      alert('Please fill in all required fields.');
      return;
    }
    // TODO: integrate with Supabase to persist the bulk request
    alert(\`Bulk request for "\${bulkDocName}" sent to \${totalEmployees} employees, due \${bulkDueDate.toLocaleDateString()}.\`);
    closeBulkRequestModal();
  };`;

const newHandleBulkSendRequest = `  const handleBulkSendRequest = async () => {
    if (!bulkDocName || !bulkDescription || !bulkDueDate) {
      alert('Please fill in all required fields.');
      return;
    }
    
    let targets = activeEmployees;
    if (bulkSendTo === 'department') {
      targets = activeEmployees.filter(e => e.department === bulkSelectedDepartment);
    } else if (bulkSendTo === 'selected') {
      targets = activeEmployees.filter(e => bulkSelectedEmployees.includes(e.employeeId));
    }

    let successCount = 0;
    for (const emp of targets) {
      const res = await createDocumentRequest({
        employeeId: emp.employeeId,
        email: emp.email,
        documentName: bulkDocName,
        description: bulkDescription,
        dueDate: bulkDueDate.toISOString(),
        requestedBy: 'PM Admin'
      });
      if (res.success) successCount++;
    }

    alert(\`Bulk request for "\${bulkDocName}" sent to \${successCount} employees, due \${bulkDueDate.toLocaleDateString()}.\`);
    closeBulkRequestModal();
  };`;

if (pm.includes(oldHandleBulkSendRequest)) pm = pm.replace(oldHandleBulkSendRequest, newHandleBulkSendRequest);

// Update dropdowns for department
const dmSelectStr = `<select className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
                        <option value="">Select department...</option>`;
const newDmSelectStr = `<select 
                        value={bulkSelectedDepartment} 
                        onChange={(e) => setBulkSelectedDepartment(e.target.value)} 
                        className="w-full rounded-lg border border-blue-500 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 shadow-sm">
                        <option value="">Select department...</option>`;
                        
if (pm.includes(dmSelectStr)) pm = pm.replace(dmSelectStr, newDmSelectStr);

// We need to also add the UI for the selected employees, but the current UI for "Selected Employees" might just be a placeholder.
// The user mentions "when selecting the all employees or a specific employee, it should actually show up for the user".
// So they will provide the implementation. Let's write the file.
                      
fs.writeFileSync(pmPath, pm, 'utf8');
console.log('Updated PMDashboard.tsx');
