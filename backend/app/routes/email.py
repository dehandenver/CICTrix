"""
Email sending endpoint.

Uses Python's built-in smtplib so no new dependencies are required. SMTP
credentials come from environment variables — see backend/README.md for the
list. The endpoint accepts a single recipient or a list of recipients and
returns a structured success/error response so the frontend can show clear
feedback to the admin.
"""

from __future__ import annotations

import os
import re
import smtplib
from email.message import EmailMessage
from typing import List, Optional, Union

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/email", tags=["email"])

# Simple-but-correct email pattern; matches Pydantic's expectations for
# typical recipient addresses without requiring the email-validator package.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email_address(value: str) -> str:
    cleaned = value.strip()
    if not _EMAIL_RE.match(cleaned):
        raise ValueError(f"'{value}' is not a valid email address.")
    return cleaned


class SendEmailRequest(BaseModel):
    to: Union[str, List[str]] = Field(
        ...,
        description="Single recipient or a list of recipients.",
    )
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)

    @field_validator("to")
    @classmethod
    def _validate_to(cls, value: Union[str, List[str]]) -> Union[str, List[str]]:
        if isinstance(value, str):
            return _validate_email_address(value)
        if not value:
            raise ValueError("Recipient list cannot be empty.")
        return [_validate_email_address(v) for v in value]
    # Optional metadata that the frontend may pass through for logging/template
    # context. Not required for sending — kept loose so we don't reject calls.
    applicant_id: Optional[str] = None
    employee_id: Optional[str] = None
    template: Optional[str] = None


class SendEmailResponse(BaseModel):
    success: bool
    delivered_to: List[str]
    message: str


def _get_smtp_settings() -> dict:
    """Return SMTP settings from env vars, with sensible defaults for Gmail."""
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_address": os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "")),
        "from_name": os.getenv("SMTP_FROM_NAME", "CICTrix HRIS"),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() != "false",
    }


@router.post("/send", response_model=SendEmailResponse)
async def send_email(payload: SendEmailRequest) -> SendEmailResponse:
    settings = _get_smtp_settings()

    if not settings["user"] or not settings["password"]:
        # Fail fast with a clear hint so the admin knows what to configure.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Email is not configured. Set SMTP_USER and SMTP_PASSWORD in "
                "backend/.env (see backend/README.md for full setup)."
            ),
        )

    recipients: List[str] = (
        [payload.to] if isinstance(payload.to, str) else list(payload.to)
    )

    msg = EmailMessage()
    msg["From"] = (
        f'{settings["from_name"]} <{settings["from_address"]}>'
        if settings["from_name"]
        else settings["from_address"]
    )
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = payload.subject
    msg.set_content(payload.body)

    try:
        if settings["use_tls"]:
            with smtplib.SMTP(settings["host"], settings["port"], timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(settings["user"], settings["password"])
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=30) as smtp:
                smtp.login(settings["user"], settings["password"])
                smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        # Safely extract error message from SMTP exception
        error_msg = str(exc)
        if hasattr(exc, 'smtp_error') and exc.smtp_error:
            try:
                error_msg = exc.smtp_error.decode(errors='ignore') if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error)
            except (AttributeError, TypeError):
                error_msg = str(exc)
        
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "SMTP authentication failed. For Gmail, you must use an App "
                "Password (not your regular password). "
                f"Underlying error: {error_msg}"
            ),
        ) from exc
    except smtplib.SMTPException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMTP error while sending email: {exc}",
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error reaching SMTP server: {exc}",
        ) from exc

    return SendEmailResponse(
        success=True,
        delivered_to=recipients,
        message=f"Email sent to {len(recipients)} recipient(s).",
    )
