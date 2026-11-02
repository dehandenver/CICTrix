# backend/test_promotional_hiring.py
"""
Unit tests for POST /api/employees/from-applicant/{applicant_id}.

A promotion must complete through the complete_promotional_appointment RPC
(Task 4 migration) with the server-verified user as actor, and never insert or
update an employee directly. External hires keep their existing behavior.
Every Supabase call is a fake; nothing here reaches a real project.
"""
from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Harmless placeholders, forced so a developer's real .env is never used here.
os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
os.environ["SUPABASE_KEY"] = "local-test-placeholder"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.core.security import TokenData
from app.routes import employees as employees_module
from app.utils.dependencies import get_authenticated_user

APPLICANT_ID = "09e72c95-0000-4000-8000-0000000000aa"
EXTERNAL_ID = "11111111-0000-4000-8000-0000000000bb"
EMPLOYEE_UUID = "e0e0e0e0-0000-4000-8000-000000000042"
VERIFIED_USER_ID = "c0c0c0c0-0000-4000-8000-000000000001"
FORGED_USER_ID = "deadbeef-0000-4000-8000-000000000002"
URL = "/api/employees/from-applicant/{}"
WRITE_OPS = {"insert", "update", "upsert", "delete"}

RPC_ROW = {
    "applicant_id": APPLICANT_ID,
    "employee_uuid": EMPLOYEE_UUID,
    "employee_number": "EMP-0042",
    "slot_id": "slot-1",
    "completed_at": "2026-11-02T08:00:00+00:00",
    "already_completed": False,
}
EMPLOYEE_VIEW_ROW = {
    "id": EMPLOYEE_UUID,
    "employee_id": "EMP-0042",
    "full_name": "Maria Santos",
    "email": "maria.santos@example.org",
    "status": "Active",
    "current_position": "City Accountant II",
    "current_department": "Office of the City Accountant",
    "hire_date": "2019-03-04",
}


class FakeQuery:
    """Chainable stand-in for a PostgREST query builder."""

    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.op = "select"
        self.payload = None
        self.filters = []

    def select(self, *_args, **_kwargs):
        return self

    def insert(self, payload, *_args, **_kwargs):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload, *_args, **_kwargs):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload, *_args, **_kwargs):
        self.op, self.payload = "upsert", payload
        return self

    def delete(self, *_args, **_kwargs):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def ilike(self, column, value):
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
        if query.table_name == "employees" and query.op == "insert":
            return [{"id": "inserted-employee-uuid", **query.payload}]
        return []

    def writes(self):
        return [(q.table_name, q.op, q.payload) for q in self.queries if q.op in WRITE_OPS]

    def tables_touched(self):
        return {q.table_name for q in self.queries}


def promotion_applicant(**overrides):
    row = {
        "id": APPLICANT_ID,
        "application_type": "promotion",
        "employee_id": "EMP-0042",
        "status": "For Contract Signing",
        "position": "City Accountant II",
    }
    row.update(overrides)
    return row


def external_applicant(**overrides):
    row = {
        "id": EXTERNAL_ID,
        "application_type": "job",
        "employee_id": None,
        "first_name": "Ana",
        "last_name": "Reyes",
        "email": "ana.reyes@example.org",
        "contact_number": "09170000000",
        "position": "Clerk I",
        "office": "Human Resource Management Office",
        "gender": "Female",
    }
    row.update(overrides)
    return row


def api_error(code, hint=None, message="Readable message."):
    body = {"code": code, "message": message}
    if hint is not None:
        body["hint"] = hint
    return APIError(body)


class HireFromApplicantTestCase(unittest.TestCase):
    user_id = VERIFIED_USER_ID

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(employees_module.router)
        self.app.dependency_overrides[get_authenticated_user] = lambda: TokenData(
            user_id=self.user_id, email="rsp@example.org", role="RSP"
        )
        self.http = TestClient(self.app)

    def use_client(self, client, service_client_present=True):
        fake_db = SimpleNamespace(
            service_client=client if service_client_present else None,
            get_service_client=lambda: client,
        )
        patcher = patch.object(employees_module, "db", fake_db)
        patcher.start()
        self.addCleanup(patcher.stop)
        return client

    def post(self, applicant_id=APPLICANT_ID, **kwargs):
        return self.http.post(URL.format(applicant_id), **kwargs)


class TestPromotionBranch(HireFromApplicantTestCase):
    def test_calls_rpc_with_verified_user_and_returns_existing_employee(self):
        client = self.use_client(FakeClient(promotion_applicant()))

        response = self.post()

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["id"], EMPLOYEE_UUID)
        self.assertEqual(response.json()["employee_id"], "EMP-0042")
        self.assertEqual(
            client.rpc_calls,
            [
                (
                    "complete_promotional_appointment",
                    {"p_applicant_id": APPLICANT_ID, "p_actor_user_id": VERIFIED_USER_ID},
                )
            ],
        )

    def test_never_writes_employees_or_anything_else_directly(self):
        client = self.use_client(FakeClient(promotion_applicant()))

        self.post()

        self.assertEqual(client.writes(), [])
        # The title-based office lookup and the obsolete department_id update are gone.
        self.assertNotIn("employees", client.tables_touched())
        self.assertNotIn("job_postings", client.tables_touched())
        self.assertNotIn("departments", client.tables_touched())

    def test_reads_the_employee_through_the_view_by_the_rpc_uuid(self):
        client = self.use_client(FakeClient(promotion_applicant()))

        self.post()

        view_queries = [q for q in client.queries if q.table_name == "employees_with_department"]
        self.assertEqual(len(view_queries), 1)
        self.assertIn(("id", EMPLOYEE_UUID), view_queries[0].filters)

    def test_actor_in_body_or_query_is_ignored(self):
        client = self.use_client(FakeClient(promotion_applicant()))

        response = self.post(
            json={"p_actor_user_id": FORGED_USER_ID, "actor_user_id": FORGED_USER_ID, "user_id": FORGED_USER_ID},
            params={"p_actor_user_id": FORGED_USER_ID, "actor_user_id": FORGED_USER_ID},
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(client.rpc_calls), 1)
        self.assertEqual(client.rpc_calls[0][1]["p_actor_user_id"], VERIFIED_USER_ID)

    def test_route_accepts_no_actor_input(self):
        operation = self.app.openapi()["paths"]["/api/employees/from-applicant/{applicant_id}"]["post"]

        self.assertNotIn("requestBody", operation)
        self.assertEqual([p["name"] for p in operation.get("parameters", [])], ["applicant_id"])

    def test_promotional_spelling_and_missing_employee_number_still_use_the_rpc(self):
        # The old branch required employee_id and otherwise INSERTed a duplicate employee.
        client = self.use_client(
            FakeClient(promotion_applicant(application_type=" Promotional ", employee_id=None))
        )

        response = self.post()

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(client.rpc_calls), 1)
        self.assertEqual(client.writes(), [])

    def test_replay_returns_the_employee_again(self):
        client = self.use_client(
            FakeClient(promotion_applicant(), rpc_data={**RPC_ROW, "already_completed": True})
        )

        response = self.post()

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["id"], EMPLOYEE_UUID)
        self.assertEqual(client.writes(), [])

    def test_unverifiable_user_identity_is_refused_before_the_rpc(self):
        self.user_id = "not-a-uuid"
        self.setUp()
        client = self.use_client(FakeClient(promotion_applicant()))

        response = self.post()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(client.writes(), [])

    def test_missing_service_role_client_is_reported_not_worked_around(self):
        client = self.use_client(FakeClient(promotion_applicant()), service_client_present=False)

        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertIn("service", response.json()["detail"].lower())
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(client.writes(), [])

    def test_unknown_applicant_is_404(self):
        client = self.use_client(FakeClient(None))

        response = self.post()

        self.assertEqual(response.status_code, 404)
        self.assertEqual(client.rpc_calls, [])

    def test_failure_reading_the_employee_back_does_not_repeat_the_rpc(self):
        client = self.use_client(FakeClient(promotion_applicant(), view_rows=[]))

        response = self.post()

        self.assertEqual(response.status_code, 500)
        self.assertIn("recorded", response.json()["detail"].lower())
        self.assertEqual(len(client.rpc_calls), 1)
        self.assertEqual(client.writes(), [])


class TestPromotionErrorMapping(HireFromApplicantTestCase):
    EXPECTED_STATUS = {
        ("42501", "not_authorized"): 403,
        ("P0001", "application_not_found"): 404,
        ("P0001", "partial_completion"): 409,
        ("P0001", "concurrent_change"): 409,
        ("P0001", "slot_missing"): 409,
        ("P0001", "slot_filled_elsewhere"): 409,
        ("P0001", "slot_reserved_elsewhere"): 409,
        ("P0001", "not_reserved"): 409,
        ("P0001", "not_promotion"): 422,
        ("P0001", "employee_not_found"): 422,
        ("P0001", "employee_ambiguous"): 422,
        ("P0001", "account_missing"): 422,
        ("P0001", "account_ambiguous"): 422,
        ("P0001", "assessment_incomplete"): 422,
        ("P0001", "posting_missing"): 422,
        ("P0001", "office_inactive"): 422,
        ("P0001", "plantilla_ambiguous"): 422,
        ("PGRST202", None): 503,
        ("42883", None): 503,
        ("42501", None): 403,
    }

    def test_rpc_errors_map_to_http_status_and_nothing_else_is_tried(self):
        for (code, hint), expected in self.EXPECTED_STATUS.items():
            with self.subTest(code=code, hint=hint):
                client = self.use_client(
                    FakeClient(promotion_applicant(), rpc_error=api_error(code, hint, "Readable message."))
                )

                response = self.post()

                self.assertEqual(response.status_code, expected, response.text)
                self.assertEqual(len(client.rpc_calls), 1, "a rejected transaction is not retried")
                self.assertEqual(client.writes(), [], "no other privileged write path")
                self.assertNotIn("employees", client.tables_touched())

    def test_readable_message_is_passed_through_for_rejections(self):
        self.use_client(
            FakeClient(promotion_applicant(), rpc_error=api_error("P0001", "not_reserved", "Reserve it first."))
        )

        response = self.post()

        self.assertEqual(response.json()["detail"], "Reserve it first.")

    def test_missing_rpc_message_says_the_update_is_not_deployed(self):
        self.use_client(FakeClient(promotion_applicant(), rpc_error=api_error("PGRST202", None, "no function")))

        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertIn("not been deployed", response.json()["detail"])

    def test_unknown_database_error_is_a_500(self):
        client = self.use_client(
            FakeClient(promotion_applicant(), rpc_error=api_error("XX000", None, "internal"))
        )

        response = self.post()

        self.assertEqual(response.status_code, 500)
        self.assertEqual(client.writes(), [])

    def test_transport_timeout_is_a_504_that_says_retry_is_safe(self):
        client = self.use_client(
            FakeClient(promotion_applicant(), rpc_error=httpx.ReadTimeout("timed out"))
        )

        response = self.post()

        self.assertEqual(response.status_code, 504)
        self.assertIn("retry", response.json()["detail"].lower())
        self.assertEqual(len(client.rpc_calls), 1)
        self.assertEqual(client.writes(), [])


class TestExternalBranchUnchanged(HireFromApplicantTestCase):
    def test_external_applicant_is_inserted_and_marked_hired_without_the_rpc(self):
        client = self.use_client(FakeClient(external_applicant()))

        response = self.post(EXTERNAL_ID)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(client.rpc_calls, [])

        inserts = [w for w in client.writes() if w[0] == "employees" and w[1] == "insert"]
        self.assertEqual(len(inserts), 1)
        payload = inserts[0][2]
        self.assertEqual(payload["employee_number"], "EMP-11111111")
        self.assertEqual(payload["first_name"], "Ana")
        self.assertEqual(payload["last_name"], "Reyes")
        self.assertEqual(payload["email"], "ana.reyes@example.org")
        self.assertEqual(payload["position"], "Clerk I")
        self.assertEqual(payload["employment_status"], "Regular")
        self.assertEqual(payload["status"], "Active")
        self.assertIn("date_hired", payload)
        self.assertIn("department_id", payload)

        applicant_updates = [w for w in client.writes() if w[0] == "applicants"]
        self.assertEqual(applicant_updates, [("applicants", "update", {"status": "Hired"})])

    def test_missing_application_type_is_external(self):
        client = self.use_client(FakeClient(external_applicant(application_type=None)))

        response = self.post(EXTERNAL_ID)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(len([w for w in client.writes() if w[:2] == ("employees", "insert")]), 1)

    def test_external_branch_does_not_need_the_service_role_client_check(self):
        # Behavior preserved: external hires keep using get_service_client() as before.
        client = self.use_client(FakeClient(external_applicant()), service_client_present=False)

        response = self.post(EXTERNAL_ID)

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(client.rpc_calls, [])


if __name__ == "__main__":
    unittest.main()
