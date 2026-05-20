import sys
import os
import uuid
from typing import Dict, Any

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from main import app
from app.utils.dependencies import get_current_user
from pydantic import BaseModel

class MockTokenData(BaseModel):
    user_id: str
    role: str
    
    def get(self, key, default=None):
        return getattr(self, key, default)

client = TestClient(app)

print("Starting PVEV tests for Phase 2...")

# User setups
admin_user = MockTokenData(user_id=str(uuid.uuid4()), role="ADMIN")
emp_user_1 = MockTokenData(user_id=str(uuid.uuid4()), role="EMPLOYEE")
dummy_emp_id = str(uuid.uuid4())

def override_user(user: MockTokenData):
    app.dependency_overrides[get_current_user] = lambda: user

# 1. Unauthenticated
print("\\n--- 1. Testing Unauthenticated ---")
app.dependency_overrides = {}
response = client.get("/api/employees")
print(f"GET /api/employees (Unauth): {response.status_code} (Expected: 401)")

# 2. Testing Employee Endpoints with specific roles
override_user(admin_user)
response = client.get("/api/employees")
print(f"GET /api/employees (ADMIN): {response.status_code} (Expected: 200)")

override_user(emp_user_1)
response = client.get("/api/employees")
print(f"GET /api/employees (EMPLOYEE): {response.status_code} (Expected: 200)")

# Self check for ID
override_user(emp_user_1)
# we can't test actual DB responses dynamically inside because we'd need a real seeded user in local SB.
# However, we can test POST/PUT/PATCH roles
response = client.patch(f"/api/employees/{dummy_emp_id}/status", json={"status": "Resigned"})
print(f"PATCH /api/employees/ID/status (EMPLOYEE): {response.status_code} (Expected: 403)")

override_user(admin_user)
# Should be 404 because dummy_emp_id isn't in DB, but not 403!
response = client.patch(f"/api/employees/{dummy_emp_id}/status", json={"status": "Resigned"})
print(f"PATCH /api/employees/ID/status (ADMIN): {response.status_code} (Expected: 404)")

print("\\n--- Tests completed ---")
