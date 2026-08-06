"""Helpers for authorising Cognito-protected admin endpoints."""

from utils.response import error_response


def require_admin(event):
    """Return an error response unless the Cognito token belongs to Admins."""
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    groups = claims.get("cognito:groups", "")
    if isinstance(groups, str):
        groups = [group.strip() for group in groups.split(",")]
    if "Admins" not in groups:
        return error_response(403, "Admin access is required")
    return None
