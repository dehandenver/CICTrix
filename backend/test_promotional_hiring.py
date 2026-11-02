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

HR_OFFICE = "Human Resource Management Office"
DEPARTMENTS = [{"id": "dept-hr", "name": HR_OFFICE, "is_active": True}]

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
        self.ilikes = []
        self.nulls = []

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
        self.ilikes.append((column, value))
        return self

    def is_(self, column, value):
        self.filters.append((column, value))
        self.nulls.append(column)
        return self

    def execute(self):
        return SimpleNamespace(data=self.client.resolve(self))


class FakeClient:
    def __init__(
        self, applicant, rpc_data=None, rpc_error=None, view_rows=None,
        slots=None, postings=None, departments=None,
    ):
        self.applicant = applicant
        self.tables = {
            "plantilla_slots": slots or [],
            "job_postings": postings or [],
            "departments": DEPARTMENTS if departments is None else departments,
        }
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
        if query.table_name in self.tables and query.op == "select":
            return [
                row for row in self.tables[query.table_name]
                if all(
                    row.get(c) == v for c, v in query.filters
                    if (c, v) not in query.ilikes and c not in query.nulls
                )
                and all(str(row.get(c) or "").lower() == v.lower() for c, v in query.ilikes)
                and all(row.get(c) is None for c in query.nulls)
            ]
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
        "office": HR_OFFICE,
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
        ("P0001", "office_ambiguous"): 422,
        ("P0001", "plantilla_ambiguous"): 422,
        ("57014", None): 503,
        ("40P01", None): 503,
        ("40001", None): 503,
        ("55P03", None): 503,
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

    def test_busy_database_is_a_503_that_says_retry_is_safe(self):
        self.use_client(
            FakeClient(promotion_applicant(), rpc_error=api_error("40P01", None, "deadlock detected"))
        )

        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertIn("try again", response.json()["detail"].lower())
        self.assertNotIn("deadlock detected", response.json()["detail"])

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
        self.assertNotIn("department_id", payload)
        self.assertEqual(payload["department"], HR_OFFICE)

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


SLOT_ID = "5107-0000-4000-8000-000000000001"
POSTING_ID = "905-0000-4000-8000-000000000002"
OFFICE_NAME = "Office of the City Accountant"


def slot_row(**overrides):
    row = {"id": SLOT_ID, "job_posting_id": POSTING_ID, "label": "Plantilla 3", "division": None}
    row.update(overrides)
    return row


def posting_row(**overrides):
    row = {
        "id": POSTING_ID, "title": "Clerk I", "department": OFFICE_NAME,
        "division": "Accounting Division", "deleted_at": None,
    }
    row.update(overrides)
    return row


def active_office(name=OFFICE_NAME, **overrides):
    return {"id": f"dept-{name}", "name": name, "is_active": True, **overrides}


class TestExternalHireOffice(HireFromApplicantTestCase):
    def hire(self, applicant=None, **client_kwargs):
        applicant = applicant or external_applicant(plantilla_slot_id=SLOT_ID)
        client = self.use_client(FakeClient(applicant, **client_kwargs))
        return client, self.post(EXTERNAL_ID)

    def insert_payload(self, client):
        inserts = [w for w in client.writes() if w[:2] == ("employees", "insert")]
        self.assertEqual(len(inserts), 1)
        return inserts[0][2]

    def assert_refused_before_any_write(self, client, response, detail):
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"], detail)
        self.assertEqual(client.writes(), [])

    def test_slot_path_writes_the_canonical_active_office_name(self):
        client, response = self.hire(
            slots=[slot_row()],
            postings=[posting_row(department="  office OF the city accountant ")],
            departments=[active_office(), active_office("Other Office")],
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = self.insert_payload(client)
        self.assertEqual(payload["department"], OFFICE_NAME)
        self.assertNotIn("department_id", payload)

    def test_division_comes_from_the_slot_then_the_posting_trimmed(self):
        client, _ = self.hire(
            slots=[slot_row(division="  Billing Section ")],
            postings=[posting_row()],
            departments=[active_office()],
        )
        self.assertEqual(self.insert_payload(client)["division"], "Billing Section")

        client, _ = self.hire(
            slots=[slot_row(division="   ")],
            postings=[posting_row(division=" Accounting Division ")],
            departments=[active_office()],
        )
        self.assertEqual(self.insert_payload(client)["division"], "Accounting Division")

        client, _ = self.hire(
            slots=[slot_row()],
            postings=[posting_row(division=None)],
            departments=[active_office()],
        )
        self.assertIsNone(self.insert_payload(client)["division"])

    def test_plantilla_number_is_read_from_the_label(self):
        client, _ = self.hire(
            slots=[slot_row(label="Plantilla 3")], postings=[posting_row()], departments=[active_office()]
        )
        self.assertEqual(self.insert_payload(client)["plantilla_num"], "3")

        client, _ = self.hire(
            slots=[slot_row(label="  plantilla   12 ")], postings=[posting_row()], departments=[active_office()]
        )
        self.assertEqual(self.insert_payload(client)["plantilla_num"], "12")

    def test_unreadable_label_still_hires_with_no_plantilla_number(self):
        client, response = self.hire(
            slots=[slot_row(label="Item 7-A")], postings=[posting_row()], departments=[active_office()]
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertIsNone(self.insert_payload(client)["plantilla_num"])

    def test_inactive_office_is_refused_before_any_write(self):
        client, response = self.hire(
            slots=[slot_row()],
            postings=[posting_row()],
            departments=[active_office(is_active=False)],
        )

        self.assert_refused_before_any_write(
            client, response,
            f'Office "{OFFICE_NAME}" is not an active office. '
            "Change the job posting's office to an active one, then hire again.",
        )

    def test_blank_office_is_refused_before_any_write(self):
        client, response = self.hire(
            slots=[slot_row()], postings=[posting_row(department="   ")], departments=[active_office()]
        )

        self.assert_refused_before_any_write(
            client, response,
            "This application has no office. Set the job posting's office, then hire again.",
        )

    def test_duplicate_active_office_is_refused_before_any_write(self):
        client, response = self.hire(
            slots=[slot_row()],
            postings=[posting_row()],
            departments=[active_office(), active_office(" office of the city ACCOUNTANT")],
        )

        self.assert_refused_before_any_write(
            client, response,
            f'Office "{OFFICE_NAME}" matches more than one active office. Resolve the duplicate first.',
        )

    def test_missing_posting_is_refused_before_any_write(self):
        message = "The job posting for this plantilla no longer exists."
        for case, kwargs in {
            "no posting": {"slots": [slot_row()], "postings": []},
            "deleted posting": {"slots": [slot_row()], "postings": [posting_row(deleted_at="2026-10-01")]},
            "no slot": {"slots": [], "postings": [posting_row()]},
        }.items():
            with self.subTest(case):
                client, response = self.hire(departments=[active_office()], **kwargs)
                self.assert_refused_before_any_write(client, response, message)

    def test_no_slot_and_one_matching_posting_uses_its_office_and_division(self):
        client, response = self.hire(
            external_applicant(position="Clerk I", office=HR_OFFICE),
            postings=[posting_row(title="clerk i"), posting_row(id="x", title="Cook", department=HR_OFFICE)],
            departments=[active_office(), *DEPARTMENTS],
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = self.insert_payload(client)
        self.assertEqual(payload["department"], OFFICE_NAME)
        self.assertEqual(payload["division"], "Accounting Division")
        self.assertIsNone(payload["plantilla_num"])

    def test_no_slot_and_two_matching_postings_uses_the_applicant_office(self):
        client, response = self.hire(
            external_applicant(position="Clerk I", office=HR_OFFICE),
            postings=[posting_row(), posting_row(id="y", department="Elsewhere")],
            departments=[active_office(), *DEPARTMENTS],
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = self.insert_payload(client)
        self.assertEqual(payload["department"], HR_OFFICE)
        self.assertIsNone(payload["division"])
        self.assertIsNone(payload["plantilla_num"])

    def test_no_slot_and_no_posting_uses_the_applicant_office(self):
        client, response = self.hire(external_applicant())

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(self.insert_payload(client)["department"], HR_OFFICE)

    def test_no_slot_and_no_office_anywhere_is_refused(self):
        client, response = self.hire(external_applicant(office=None))

        self.assert_refused_before_any_write(
            client, response,
            "This application has no office. Set the job posting's office, then hire again.",
        )

    def test_payload_never_contains_department_id(self):
        client, _ = self.hire(
            slots=[slot_row()], postings=[posting_row()], departments=[active_office()]
        )
        self.assertNotIn("department_id", self.insert_payload(client))


if __name__ == "__main__":
    unittest.main()
