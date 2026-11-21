"""Tests for external hiring through POST /employees/from-applicant/{id}."""

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["SUPABASE_URL"] = "http://127.0.0.1:54329"
os.environ["SUPABASE_ANON_KEY"] = "local-test-placeholder"
os.environ["SUPABASE_KEY"] = "local-test-placeholder"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["SUPABASE_JWT_SECRET"] = "local-test-jwt-secret"

from app.core.security import TokenData  # noqa: E402
from app.routes import employees as employees_module  # noqa: E402
from app.utils.dependencies import get_authenticated_user  # noqa: E402

APPLICANT_ID = "11111111-0000-4000-8000-0000000000bb"
EMPLOYEE_UUID = "e0e0e0e0-0000-4000-8000-000000000099"
VERIFIED_USER_ID = "77777777-0000-4000-8000-000000000077"

RPC_ROW = {
    "applicant_id": APPLICANT_ID,
    "employee_uuid": EMPLOYEE_UUID,
    "employee_number": "EMP-11111111",
    "slot_id": "51070000-0000-4000-8000-000000000001",
    "completed_at": "2026-11-20T08:00:00+00:00",
    "already_completed": False,
}

EMPLOYEE_VIEW_ROW = {
    "id": EMPLOYEE_UUID,
    "employee_id": "EMP-11111111",
    "user_id": None,
    "full_name": "Ana Reyes",
    "email": "ana.reyes@example.org",
    "date_of_birth": None,
    "place_of_birth": None,
    "gender": "Female",
    "civil_status": None,
    "nationality": None,
    "mobile_number": "09170000000",
    "home_address": None,
    "emergency_contact_name": None,
    "emergency_relationship": None,
    "emergency_contact_number": None,
    "sss_number": None,
    "philhealth_number": None,
    "pagibig_number": None,
    "tin_number": None,
    "current_position": "Clerk I",
    "current_department": "Human Resource Management Office",
    "current_division": "Records Division",
    "status": "Active",
    "hire_date": "2026-11-20",
    "position_history": [],
    "personal_details_finalized": False,
    "created_at": "2026-11-20T08:00:00+00:00",
    "updated_at": "2026-11-20T08:00:00+00:00",
}

WRITE_OPS = {"insert", "update", "upsert", "delete"}


class FakeQuery:
    def __init__(self, client, table_name):
        self.client = client
        self.table_name = table_name
        self.op = "select"
        self.payload = None
        self.filters = []

    def select(self, *_args):
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def execute(self):
        return SimpleNamespace(data=self.client.resolve(self))


class FakeClient:
    def __init__(self, applicant, rpc_data=None, rpc_error=None, view_rows=None):
        self.applicant = applicant
        self.rpc_data = RPC_ROW if rpc_data is None else rpc_data
        self.rpc_error = rpc_error
        self.view_rows = [EMPLOYEE_VIEW_ROW] if view_rows is None else view_rows
        self.queries = []
        self.rpc_calls = []

    def table(self, name):
        query = FakeQuery(self, name)
        self.queries.append(query)
        return query

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        client = self

        class Call:
            def execute(self_inner):
                if client.rpc_error is not None:
                    raise client.rpc_error
                return SimpleNamespace(data=client.rpc_data)

        return Call()

    def resolve(self, query):
        if query.table_name == "applicants" and query.op == "select":
            return [self.applicant] if self.applicant else []
        if query.table_name == "employees_with_department":
            return self.view_rows
        return []

    def writes(self):
        return [(q.table_name, q.op, q.payload) for q in self.queries if q.op in WRITE_OPS]

    def tables_touched(self):
        return {q.table_name for q in self.queries}


def external_applicant(**overrides):
    row = {
        "id": APPLICANT_ID,
        "application_type": "job",
        "status": "For Contract Signing",
        "first_name": "Ana",
        "last_name": "Reyes",
        "email": "ana.reyes@example.org",
    }
    row.update(overrides)
    return row


def api_error(code, hint=None, message="Readable message."):
    body = {"code": code, "message": message}
    if hint is not None:
        body["hint"] = hint
    return APIError(body)


class TestExternalHireEndpoint(unittest.TestCase):
    user_id = VERIFIED_USER_ID

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(employees_module.router)
        self.app.dependency_overrides[get_authenticated_user] = lambda: TokenData(
            user_id=self.user_id, email="rsp@example.org", role="RSP"
        )

    def post(self, client, applicant_id=APPLICANT_ID, body=None, service_client_present=True):
        with (
            patch.object(employees_module.db, "get_service_client", return_value=client),
            patch.object(
                employees_module.db,
                "service_client",
                object() if service_client_present else None,
                create=True,
            ),
        ):
            return TestClient(self.app).post(f"/api/employees/from-applicant/{applicant_id}", json=body or {})

    def test_external_hire_routes_to_complete_external_hire_rpc_and_returns_view_row(self):
        client = FakeClient(external_applicant())

        response = self.post(client, body={"actor_user_id": "forged-actor"})

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["id"], EMPLOYEE_UUID)
        self.assertEqual(response.json()["employee_id"], "EMP-11111111")
        self.assertEqual(
            client.rpc_calls,
            [
                (
                    "complete_external_hire",
                    {"p_applicant_id": APPLICANT_ID, "p_actor_user_id": VERIFIED_USER_ID},
                )
            ],
        )
        self.assertEqual(client.writes(), [])
        self.assertEqual(client.tables_touched(), {"applicants", "employees_with_department"})

    def test_missing_application_type_routes_to_external_rpc(self):
        client = FakeClient(external_applicant(application_type=None))

        response = self.post(client)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(client.rpc_calls[0][0], "complete_external_hire")
        self.assertEqual(client.writes(), [])

    def test_missing_service_role_client_returns_503_without_writes(self):
        client = FakeClient(external_applicant())

        response = self.post(client, service_client_present=False)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(client.writes(), [])

    def test_unparseable_token_user_id_returns_403_without_calling_rpc(self):
        self.user_id = "not-a-uuid"
        client = FakeClient(external_applicant())

        response = self.post(client)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(client.writes(), [])

    def test_maps_rpc_hints_to_expected_http_statuses_without_fallback_writes(self):
        expected = {
            "not_authorized": 403,
            "application_not_found": 404,
            "partial_completion": 409,
            "concurrent_change": 409,
            "slot_missing": 409,
            "slot_filled_elsewhere": 409,
            "slot_reserved_elsewhere": 409,
            "not_reserved": 409,
            "employee_number_conflict": 409,
            "email_conflict": 409,
            "is_promotion": 422,
            "posting_missing": 422,
            "office_inactive": 422,
            "office_ambiguous": 422,
            "plantilla_ambiguous": 422,
        }
        for hint, status in expected.items():
            with self.subTest(hint=hint):
                client = FakeClient(
                    external_applicant(),
                    rpc_error=api_error("P0001", hint=hint, message=f"Msg for {hint}"),
                )
                response = self.post(client)
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()["detail"], f"Msg for {hint}")
                self.assertEqual(client.writes(), [])

    def test_missing_rpc_returns_503_and_never_falls_back(self):
        for code in ("PGRST202", "42883"):
            with self.subTest(code=code):
                client = FakeClient(
                    external_applicant(),
                    rpc_error=api_error(code, None, "Could not find function"),
                )
                response = self.post(client)
                self.assertEqual(response.status_code, 503)
                self.assertEqual(client.writes(), [])

    def test_busy_codes_return_503_with_retry_guidance_without_raw_text(self):
        for code in ("57014", "40P01", "40001", "55P03"):
            with self.subTest(code=code):
                client = FakeClient(
                    external_applicant(),
                    rpc_error=api_error(code, None, "deadlock detected on table"),
                )
                response = self.post(client)
                self.assertEqual(response.status_code, 503)
                detail = response.json()["detail"]
                self.assertIn("retry", detail.lower())
                self.assertNotIn("deadlock detected", detail)
                self.assertEqual(client.writes(), [])

    def test_transport_timeout_returns_504_retry_safe(self):
        client = FakeClient(
            external_applicant(),
            rpc_error=httpx.ReadTimeout("timed out"),
        )

        response = self.post(client)

        self.assertEqual(response.status_code, 504)
        self.assertIn("retry", response.json()["detail"].lower())
        self.assertEqual(client.writes(), [])

    def test_missing_employee_uuid_in_rpc_result_returns_504(self):
        client = FakeClient(external_applicant(), rpc_data={"already_completed": False})

        response = self.post(client)

        self.assertEqual(response.status_code, 504)
        self.assertIn("retry", response.json()["detail"].lower())

    def test_missing_view_row_after_commit_returns_500_with_replay_safe_message(self):
        client = FakeClient(external_applicant(), view_rows=[])

        response = self.post(client)

        self.assertEqual(response.status_code, 500)
        self.assertIn("retry", response.json()["detail"].lower())
        self.assertEqual(client.writes(), [])


if __name__ == "__main__":
    unittest.main()
