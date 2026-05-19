import { createDocumentRequest } from './src/lib/employeeDocuments';

async function run() {
  const result = await createDocumentRequest({
    employeeId: '3869564c-89b0-47c7-a963-f5ed4e8b9e30', // Maria Santos UUID
    documentName: 'Test Bulk Doc',
    description: 'Bulk test',
    dueDate: '2026-05-30',
    requestedBy: 'LND Admin',
    source: 'LND'
  });
  console.log(JSON.stringify(result, null, 2));
}

run();
