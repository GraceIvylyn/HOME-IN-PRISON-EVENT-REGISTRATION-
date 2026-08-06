"""DELETE /admin/registration/{id} -- cancels a registration for foundation admins."""
import os

import boto3

from utils.auth import require_admin
from utils.response import build_response, error_response

dynamodb = boto3.resource("dynamodb")
REGISTRATIONS_TABLE = os.environ["REGISTRATIONS_TABLE"]


def handler(event, context):
    denied = require_admin(event)
    if denied:
        return denied

    registration_id = ((event.get("pathParameters") or {}).get("id") or "").strip()
    if not registration_id:
        return error_response(400, "registration id path parameter is required")

    try:
        table = dynamodb.Table(REGISTRATIONS_TABLE)
        existing = table.get_item(Key={"registrationId": registration_id}).get("Item")
        if not existing:
            return error_response(404, f"Registration '{registration_id}' not found")
        table.delete_item(Key={"registrationId": registration_id})
        return build_response(200, {"message": "Registration cancelled", "registrationId": registration_id})
    except Exception as exc:
        return error_response(500, f"Could not cancel registration: {str(exc)}")
