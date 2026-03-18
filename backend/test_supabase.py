#!/usr/bin/env python3
"""Test Supabase connection and check applicants table"""

import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check environment
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print(f"SUPABASE_URL: {SUPABASE_URL}")
print(f"SUPABASE_KEY exists: {bool(SUPABASE_KEY)}")
print(f"SUPABASE_SERVICE_ROLE_KEY exists: {bool(SUPABASE_SERVICE_ROLE_KEY)}")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Missing Supabase credentials")
    sys.exit(1)

print("\nConnecting to Supabase...")
try:
    from supabase import create_client
    
    # Use service role for privileged operations
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    print("✓ Connected successfully")
    
    # Check if applicants table exists by trying to query it
    print("\nChecking applicants table...")
    try:
        response = client.table("applicants").select("*").limit(1).execute()
        print(f"✓ Applicants table exists")
        print(f"  Columns visible: {len(response.data[0].keys()) if response.data else 'N/A (empty table)'}")
    except Exception as e:
        print(f"✗ Error accessing applicants table: {e}")
        print("  Table might not exist or RLS policies are blocking access")
    
    # Try a test insert to verify permissions
    print("\nTesting insert permissions...")
    try:
        test_data = {
            "first_name": "Test",
            "last_name": "User",
            "email": f"test_{int(__import__('time').time())}@test.local",
            "position": "Test Position",
            "application_type": "job",
            "is_pwd": False,
            "address": "Not provided",
            "contact_number": "N/A",
            "middle_name": "",
            # Omit gender - let it be NULL
            "item_number": "UNASSIGNED",
            "office": "Unassigned",
        }
        response = client.table("applicants").insert(test_data).execute()
        if response.data and len(response.data) > 0:
            print(f"✓ Insert test successful! ID: {response.data[0].get('id')}")
            # Clean up test record
            try:
                client.table("applicants").delete().eq("id", response.data[0]['id']).execute()
                print("  Cleaned up test record")
            except Exception as cleanup_err:
                print(f"  Note: Could not clean up test record: {cleanup_err}")
        else:
            print(f"✗ Insert returned no data: {response}")
    except Exception as e:
        print(f"✗ Insert test failed: {e}")
        print("  Make sure:")
        print("  1. The 'applicants' table exists in Supabase")
        print("  2. RLS policies allow inserts (or are disabled)")
        print("  3. The service role key has sufficient permissions")
        
except ImportError as e:
    print(f"ERROR: Failed to import Supabase: {e}")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
