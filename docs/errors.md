# 🚨 Error Reference

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "status": 400,
    "details": { "fields": { "title": "title is required" } },
    "hint": "What to do to fix this",
    "requestId": "req_1234567890",
    "timestamp": "2025-01-01T00:00:00.000Z"
  }
}
```

## Error Codes

| Code | Status | Description | How to Fix |
|------|--------|-------------|------------|
| `VALIDATION_ERROR` | 400 | Input validation failed | Check `details.fields` for specific issues |
| `INVALID_TRANSITION` | 400 | State transition not allowed | Check `details.validActions` for allowed transitions |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid token | Include `Authorization: Bearer <token>` header |
| `FORBIDDEN` | 403 | Insufficient permissions | Your role lacks permission for this action |
| `ROUTE_NOT_FOUND` | 404 | Endpoint doesn't exist | Check API docs at GET /docs |
| `CONFLICT` | 409 | Resource conflict | Refresh data and retry |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry after `details.retryAfter` seconds |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Report to support with `requestId` |
| `DUPLICATE_ENTRY` | 500 | Unique constraint violated | Use a unique value |
| `FOREIGN_KEY_VIOLATION` | 500 | Referenced record missing | Verify the referenced ID exists |
| `NOT_NULL_VIOLATION` | 500 | Required field missing | Include all required fields |
| `QUERY_TIMEOUT` | 500 | Query exceeded time limit | Narrow your request parameters |
| `CONNECTION_FAILED` | 500 | Database unreachable | Check server status |
| `WEBHOOK_DELIVERY_FAILED` | 502 | Webhook endpoint unreachable | Verify webhook URL is accessible |

## Entity-Specific Errors

### Attachment

| Code | When |
|------|------|
| `ATTACHMENT_NOT_FOUND` | Attachment with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `active`, `archived` |

### Comment

| Code | When |
|------|------|
| `COMMENT_NOT_FOUND` | Comment with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `active`, `flagged`, `removed` |

### Invite

| Code | When |
|------|------|
| `INVITE_NOT_FOUND` | Invite with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `pending`, `accepted`, `expired`, `revoked` |

### Project

| Code | When |
|------|------|
| `PROJECT_NOT_FOUND` | Project with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `active`, `completed`, `archived` |

### Subscription

| Code | When |
|------|------|
| `SUBSCRIPTION_NOT_FOUND` | Subscription with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `trialing`, `active`, `past_due`, `cancelled` |

### Task

| Code | When |
|------|------|
| `TASK_NOT_FOUND` | Task with given ID doesn't exist |
| `INVALID_TRANSITION` | Invalid status change. Valid states: `todo`, `in_progress`, `in_review`, `done`, `blocked` |

