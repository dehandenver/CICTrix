const fs = require('fs');

async function updateLnd() {
  const lndPath = './src/modules/admin/LNDDashboard.tsx';
  let lnd = fs.readFileSync(lndPath, 'utf8');

  // Imports
  if (!lnd.includes('createDocumentRequest')) {
    lnd = lnd.replace(
      "import { getAllEmployees } from '../../lib/api/employees';",
      "import { getAllEmployees, type Employee } from '../../lib/api/employees';\nimport { createDocumentRequest } from '../../lib/employeeDocuments';"
    );
  }

  // State in LNDDocuments
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
  if (!lnd.includes('setActiveEmployees')) {
    lnd = lnd.replace(
      "const totalEmployees = 24;",
      stateToInject + "\n  const totalEmployees = activeEmployees.length;"
    );
  }

  // Update handleSendRequest
  const oldHandleSendRequest = `  const handleSendRequest = () => {
    if (!requestDocType || !requestDueDate) {
      alert('Please select a document type and due date.');
      return;
    }
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
          description: 'Requested via L&D', // or from a description field if available
          dueDate: new Date(requestDueDate).toISOString(),
          requestedBy: 'L&D Admin'
        });
      }
    }
    alert(\`Request sent for "\${requestDocType}" due \${requestDueDate}\${requestEmployee ? \` to \${requestEmployee.name}\` : ''}.\`);
    closeRequestModal();
    // OPTIONAL: refresh documents list here
  };`;
  
  if (lnd.includes(oldHandleSendRequest)) {
    lnd = lnd.replace(oldHandleSendRequest, newHandleSendRequest);
  }

  // Update handleBulkSendRequest
  const oldHandleBulkSendRequest = `  const handleBulkSendRequest = () => {
    if (!bulkDocName || !bulkDescription || !bulkDueDate) {
      alert('Please fill in all required fields.');
      return;
    }
    alert(\`Bulk request for "\${bulkDocName}" sent to \${dbDocumentRows.length} employees, due \${bulkDueDate.toLocaleDateString()}.\`);
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
        requestedBy: 'L&D Admin'
      });
      if (res.success) successCount++;
    }

    alert(\`Bulk request for "\${bulkDocName}" sent to \${successCount} employees, due \${bulkDueDate.toLocaleDateString()}.\`);
    closeBulkRequestModal();
  };`;

  if (lnd.includes(oldHandleBulkSendRequest)) {
    lnd = lnd.replace(oldHandleBulkSendRequest, newHandleBulkSendRequest);
  }

  fs.writeFileSync(lndPath, lnd, 'utf8');
  console.log('Updated LNDDashboard.tsx');
}

async function updatePM() {
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

  // PM handleSendRequest
  // wait we need to check how it actually looks in PMDashboard
}

updateLnd();
// We'll run this to quickly fix LND, then I'll look at PM.
