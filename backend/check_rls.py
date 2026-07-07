import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent))

from app.core.supabase_client import db

def run():
    client = db.get_service_client()
    try:
        # Check if RPC exec_sql exists by executing a test query
        res = client.postgrest.rpc("exec_sql", {"sql": "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('employees', 'office_role_assignments');"}).execute()
        print("RLS Status via exec_sql:")
        print(res.data)
    except Exception as e:
        print("exec_sql failed:", str(e))
        
        # If exec_sql fails, let's select from employees and office_role_assignments to verify service client access
        try:
            res_emp = client.table("employees").select("id", count="exact").limit(1).execute()
            print("Employees select successful, count:", res_emp.count)
        except Exception as ex:
            print("Employees select failed:", str(ex))

run()
