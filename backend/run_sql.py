import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent))

from app.core.supabase_client import db

def run():
    client = db.get_service_client()
    
    statements = [
        "ALTER TABLE employees DISABLE ROW LEVEL SECURITY;",
        "ALTER TABLE office_role_assignments DISABLE ROW LEVEL SECURITY;",
        "ALTER TABLE access_change_audit DISABLE ROW LEVEL SECURITY;",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, anon;",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON office_role_assignments TO authenticated, anon;",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON access_change_audit TO authenticated, anon;",
        "NOTIFY pgrst, 'reload schema';"
    ]
    
    print("Executing SQL statements...")
    for stmt in statements:
        try:
            # Execute direct query
            client.postgrest.query(stmt).execute()
            print(f"✅ Success: {stmt}")
        except Exception as e:
            print(f"❌ Failed: {stmt} - Error: {e}")

run()
