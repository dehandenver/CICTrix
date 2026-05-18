import asyncio
from app.routes.employees import hire_from_applicant
from app.models.user import UserRole
import json
from datetime import date

async def run_test():
    from app.core.supabase_client import db
    client = db.get_service_client()
    
    # 1. Fetch an applicant
    app_res = client.table('applicants').select('id, application_type, first_name').limit(1).execute()
    if not app_res.data:
        print('No applicants found to test with!')
        return
        
    applicant_id = app_res.data[0]['id']
    print(f'Testing with applicant_id: {applicant_id}')
    
    mock_user = {'id': 'test-user', 'role': 'ADMIN'}
    try:
        # First call
        result = await hire_from_applicant(applicant_id, current_user=mock_user)
        print('\n--- SUCCESS! Response from first call: ---')
        
        # Helper to convert dates for json dumps
        def default_serializer(obj):
            if isinstance(obj, date):
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")
            
        print(json.dumps(result, indent=2, default=default_serializer))
        
        # Verify idempotency
        print('\n--- Testing idempotency (calling again) ---')
        result2 = await hire_from_applicant(applicant_id, current_user=mock_user)
        print('Idempotency check passed.')
        
        # Query DB to check row
        emp_res = client.table('employees').select('*').eq('employee_number', result['employee_id']).execute()
        print(f'\n--- DB query for employee {result["employee_id"]}: ---')
        print(f'Count: {len(emp_res.data)}')
        
        # Check view
        view_res = client.table('employees_with_department').select('*').eq('employee_id', result['employee_id']).execute()
        print(f'\n--- View query: ---')
        print(f"full_name: {view_res.data[0].get('full_name')}")
        print(f"current_position: {view_res.data[0].get('current_position')}")
        print(f"position_history type: {type(view_res.data[0].get('position_history'))}")
        
    except Exception as e:
        print(f'ERROR: {e}')

asyncio.run(run_test())
