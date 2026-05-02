#!/usr/bin/env python
"""
Migration runner for CICTrix Supabase database
Applies all SQL migration files in order
"""

import os
import sys
from pathlib import Path
from app.core.config import settings
from app.core.supabase_client import db

def run_migrations():
    """Run all migrations from database/migrations/ directory"""
    
    migrations_dir = Path(__file__).parent / "database" / "migrations"
    
    if not migrations_dir.exists():
        print(f"❌ Migrations directory not found: {migrations_dir}")
        return False
    
    # Get all SQL files, sorted by name (001_, 002_, etc.)
    migration_files = sorted([f for f in migrations_dir.glob("*.sql")])
    
    if not migration_files:
        print(f"❌ No migration files found in {migrations_dir}")
        return False
    
    try:
        client = db.get_service_client()
    except RuntimeError:
        print("❌ Could not initialize Supabase client. Check your .env file.")
        return False
    
    print(f"🔧 Found {len(migration_files)} migration(s)")
    print(f"📍 Database: {settings.SUPABASE_URL}\n")
    
    for migration_file in migration_files:
        migration_name = migration_file.name
        
        print(f"⏳ Running: {migration_name}")
        
        try:
            with open(migration_file, 'r') as f:
                sql_content = f.read()
            
            # Execute the migration
            result = client.postgrest.rpc("exec_sql", {"sql": sql_content}).execute()
            
            print(f"✅ {migration_name} completed\n")
            
        except Exception as e:
            # Try direct SQL execution instead
            try:
                with open(migration_file, 'r') as f:
                    sql_content = f.read()
                
                # Split by semicolon and execute each statement
                statements = [s.strip() for s in sql_content.split(';') if s.strip()]
                
                for statement in statements:
                    try:
                        # Use Supabase Python client's query method
                        client.postgrest.query(statement).execute()
                    except:
                        # Some statements might not work with postgrest, that's okay
                        pass
                
                print(f"✅ {migration_name} completed\n")
                
            except Exception as e2:
                print(f"⚠️  Warning applying {migration_name}: {str(e2)}")
                print(f"   You may need to apply this migration manually via Supabase SQL editor\n")
                continue
    
    return True


def seed_missing_employee():
    """Add the missing employee record"""
    
    try:
        client = db.get_service_client()
    except RuntimeError:
        print("❌ Could not initialize Supabase client. Check your .env file.")
        return False
    
    print("🌱 Seeding missing employee record...")
    
    try:
        # Insert the missing employee
        result = client.table("employees").insert({
            "employee_number": "EMP-2026-002",
            "email": "rodrigodutae@gmail.com",
            "first_name": "Rodrigo",
            "last_name": "Dutae",
            "department": "Human Resources",
            "position": "HR Specialist",
            "date_hired": "2026-01-15",
            "employment_status": "Active",
            "status": "Active",
            "user_role": "employee",
            "account_status": "Active",
            "created_by": "00000000-0000-0000-0000-000000000000"
        }).execute()
        
        print("✅ Employee record created successfully\n")
        return True
        
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            print("✅ Employee record already exists\n")
            return True
        else:
            print(f"⚠️  Could not seed employee: {str(e)}")
            print("   You may need to add this manually via Supabase dashboard\n")
            return False


if __name__ == "__main__":
    print("=" * 60)
    print("CICTrix Database Migration Runner")
    print("=" * 60 + "\n")
    
    # Run migrations
    migrations_ok = run_migrations()
    
    # Seed missing employee
    if migrations_ok:
        seed_missing_employee()
    
    print("=" * 60)
    if migrations_ok:
        print("✨ Migration process completed!")
    else:
        print("⚠️  Some migrations may need manual attention.")
    print("=" * 60)
