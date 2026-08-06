"""GET /admin/registrations -- returns every registration for foundation admins."""
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

    try:
        table = dynamodb.Table(REGISTRATIONS_TABLE)
        response = table.scan()
        registrations = response.get("Items", [])
        while "LastEvaluatedKey" in response:
            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            registrations.extend(response.get("Items", []))

        registrations.sort(key=lambda registration: registration.get("createdAt", ""), reverse=True)
        return build_response(200, {"registrations": registrations, "count": len(registrations)})
    except Exception as exc:
        return error_response(500, f"Could not list registrations: {str(exc)}")
