import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).parent))

from app.core.supabase_client import db

def run():
    try:
        client = db.get_service_client()
        print("Reloading Supabase schema cache...")
        result = client.postgrest.rpc("exec_sql", {"sql": "NOTIFY pgrst, 'reload schema';"}).execute()
        print("✅ Schema cache reloaded successfully!")
    except Exception as e:
        print(f"❌ Failed to reload schema cache: {e}")

if __name__ == "__main__":
    run()
