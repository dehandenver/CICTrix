const fs = require('fs');

let content = fs.readFileSync('src/modules/admin/EmployeeDirectory.tsx', 'utf-8');

const fetchPositionsRegex = /const fetchPositions = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};\s/g;

content = content.replace(
  fetchPositionsRegex,
  `const fetchPositions = async () => {
    try {
      setLoading(true);
      
      const { success, data, error } = await getAllEmployees({ status: 'Active' });

      if (!success) throw error;

      // Group hired applicants by position
      const positionMap = new Map<string, Position>();
      
      (data || []).forEach((emp: any) => {
        const position = emp.current_position || 'Unassigned Position';
        const office = emp.department || emp.current_department || 'Unassigned Office';
        const key = \`\${position}-\${office}\`;
        if (!positionMap.has(key)) {
          positionMap.set(key, {
            id: key,
            name: position,
            department: office,
            employee_count: 0,
            employees: []
          });
        }
        const pos = positionMap.get(key)!;
        pos.employee_count += 1;
        pos.employees!.push({
          id: emp.id,
          employee_id: emp.employee_id || 'N/A',
          full_name: emp.full_name || 'Unnamed',
          current_position: position,
          department: office,
          status: emp.status || 'Active',
          email: emp.email || '',
          mobile_number: emp.mobile_number || '',
          hire_date: emp.hire_date || '',
          photo_url: emp.photo_url || ''
        });
      });

      const posArray = Array.from(positionMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setPositions(posArray);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoading(false);
    }
  };
`
);

const handlePositionClickRegex = /const handlePositionClick = async \(position: Position\) => \{[\s\S]*?setViewMode\('position-list'\);\s*\} catch \(error\) \{\s*console\.error[\s\S]*?\}\s*\};\s/g;

content = content.replace(
  handlePositionClickRegex,
  `const handlePositionClick = async (position: Position) => {
    setSelectedPosition(position);
    setViewMode('position-list');
  };
`
);

fs.writeFileSync('src/modules/admin/EmployeeDirectory.tsx', content);
