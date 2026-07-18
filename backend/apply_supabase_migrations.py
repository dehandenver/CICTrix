import os
import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent))

from app.core.supabase_client import db

def run():
    client = db.get_service_client()
    migrations_dir = Path(__file__).parent.parent / "supabase" / "migrations"
    
    if not migrations_dir.exists():
        print(f"Migrations directory not found: {migrations_dir}")
        return
        
    migration_files = sorted([f for f in migrations_dir.glob("*.sql")])
    print(f"Found {len(migration_files)} migrations in supabase/migrations/")
    
    for mf in migration_files:
        print(f"Applying: {mf.name}")
        try:
            with open(mf, 'r', encoding='utf-8') as f:
                sql_content = f.read()
                
            # Execute the migration
            client.postgrest.rpc("exec_sql", {"sql": sql_content}).execute()
            print(f"Success: {mf.name}")
        except Exception as e:
            err_msg = str(e)
            if "already exists" in err_msg or "duplicate column" in err_msg or "duplicate key" in err_msg:
                print(f"Skipped (Already Applied): {mf.name}")
            else:
                print(f"Failed: {mf.name} - Error: {err_msg}")
                
    # Reload schema cache for postgrest
    try:
        client.postgrest.query("NOTIFY pgrst, 'reload schema';").execute()
        print("PostgREST schema cache reloaded.")
    except Exception as e:
        print(f"Failed to reload schema cache: {e}")

if __name__ == "__main__":
    run()
