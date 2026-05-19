const fs = require('fs');

function updateDashboard(filename) {
    let content = fs.readFileSync(filename, 'utf8');

    // Add search state if not there
    if (!content.includes('employeeSearchTerm')) {
        content = content.replace(
            "const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<string[]>([]);",
            "const [bulkSelectedEmployees, setBulkSelectedEmployees] = useState<string[]>([]);\n  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');"
        );
    }

    // Prepare search markup
    const oldSearchPlaceholder = `<div className="flex items-center px-3 py-2.5 border-b border-slate-200">
                          <Search className="h-4 w-4 text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            placeholder="Search by name, position, or department..." 
                            className="w-full text-sm text-slate-700 outline-none bg-transparent placeholder-slate-400"
                          />
                        </div>
                        <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/30">
                          <Search className="h-8 w-8 text-slate-300 mb-2 opacity-50" />
                          <p className="text-sm font-medium text-slate-600">Start typing to search for employees</p>
                          <p className="text-xs text-slate-400 mt-1">Search by name, position, or department</p>
                        </div>`;

    const newSearchMarkup = `<div className="flex items-center px-3 py-2.5 border-b border-slate-200">
                          <Search className="h-4 w-4 text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            value={employeeSearchTerm}
                            onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                            placeholder="Search by name, position, or department..." 
                            className="w-full text-sm text-slate-700 outline-none bg-transparent placeholder-slate-400"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto w-full bg-slate-50/30">
                          {activeEmployees
                            .filter(emp => 
                              (emp.fullName || '').toLowerCase().includes(employeeSearchTerm.toLowerCase()) || 
                              (emp.department || '').toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                              (emp.role || '').toLowerCase().includes(employeeSearchTerm.toLowerCase())
                            )
                            .map(emp => {
                              const isSelected = bulkSelectedEmployees.includes(emp.employeeId);
                              return (
                                <div key={emp.employeeId} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 hover:bg-slate-50">
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                                      {emp.fullName ? emp.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '??'}
                                    </div>
                                    <div className="overflow-hidden">
                                      <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName || 'Unknown'}</p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBulkSelectedEmployees(prev => 
                                        isSelected 
                                          ? prev.filter(id => id !== emp.employeeId)
                                          : [...prev, emp.employeeId]
                                      );
                                    }}
                                    className={"text-xs px-2.5 py-1 rounded-md font-semibold transition " + (isSelected ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
                                  >
                                    {isSelected ? 'Remove' : 'Select'}
                                  </button>
                                </div>
                              );
                            })}
                          {activeEmployees.length === 0 && (
                            <div className="py-8 text-center">
                              <p className="text-sm font-medium text-slate-600">No employees found.</p>
                            </div>
                          )}
                        </div>
                        {bulkSelectedEmployees.length > 0 && (
                            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                              <p className="text-xs text-slate-600"><b>{bulkSelectedEmployees.length}</b> employee(s) selected.</p>
                              <button 
                                type="button" 
                                onClick={() => setBulkSelectedEmployees([])}
                                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                              >
                                Clear all
                              </button>
                            </div>
                        )}`;

    if (content.includes('Start typing to search')) {
        content = content.replace(oldSearchPlaceholder, newSearchMarkup);
        fs.writeFileSync(filename, content, 'utf8');
        console.log("Updated " + filename);
    } else {
        console.log("Could not find search placeholder in " + filename);
    }
}

updateDashboard('src/modules/admin/LNDDashboard.tsx');
updateDashboard('src/modules/admin/PMDashboard.tsx');
