/**
 * 🚨 Backend Factory — Error Classes
 * Auto-generated structured errors with codes, status, and debugging info.
 */

/**
 * Base application error.
 * All custom errors extend this.
 */
export class AppError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = opts.status || 500;
    this.code = opts.code || 'INTERNAL_ERROR';
    this.details = opts.details || null;
    this.hint = opts.hint || null;
    this.timestamp = new Date().toISOString();
    this.requestId = opts.requestId || null;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    const json = {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        timestamp: this.timestamp,
      },
    };
    if (this.details) json.error.details = this.details;
    if (this.hint) json.error.hint = this.hint;
    if (this.requestId) json.error.requestId = this.requestId;
    return json;
  }
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends AppError {
  constructor(resource, id, opts = {}) {
    super(resource + ' not found' + (id ? ': ' + id : ''), {
      status: 404,
      code: resource.toUpperCase() + '_NOT_FOUND',
      details: { resource, id },
      hint: 'Check the ' + resource + ' ID and try again. Use GET /api/' + resource + 's to list available records.',
      ...opts,
    });
  }
}

/**
 * Input validation failed (400)
 */
export class ValidationError extends AppError {
  constructor(message, fields = {}, opts = {}) {
    super(message, {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fields },
      hint: 'Check the request body and fix the following fields: ' + Object.keys(fields).join(', '),
      ...opts,
    });
  }
}

/**
 * Authentication failed (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', opts = {}) {
    super(message, {
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      hint: 'Include a valid Bearer token in the Authorization header.',
      ...opts,
    });
  }
}

/**
 * Insufficient permissions (403)
 */
export class AuthorizationError extends AppError {
  constructor(action, resource, opts = {}) {
    super('Not authorized to ' + action + ' ' + resource, {
      status: 403,
      code: 'FORBIDDEN',
      details: { action, resource },
      hint: 'Your role does not have permission to ' + action + ' this resource. Contact an admin.',
      ...opts,
    });
  }
}

/**
 * Resource conflict (409)
 */
export class ConflictError extends AppError {
  constructor(message, opts = {}) {
    super(message, {
      status: 409,
      code: 'CONFLICT',
      hint: 'This operation conflicts with the current state. Refresh and retry.',
      ...opts,
    });
  }
}

/**
 * Invalid state transition (400)
 */
export class StateTransitionError extends AppError {
  constructor(entity, currentState, action, validActions, opts = {}) {
    super('Cannot ' + action + ' ' + entity + ' — current state is ' + currentState, {
      status: 400,
      code: 'INVALID_TRANSITION',
      details: { entity, currentState, attemptedAction: action, validActions },
      hint: 'Valid actions from ' + currentState + ': ' + validActions.join(', '),
      ...opts,
    });
  }
}

/**
 * Rate limit exceeded (429)
 */
export class RateLimitError extends AppError {
  constructor(retryAfter = 60, opts = {}) {
    super('Rate limit exceeded', {
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter },
      hint: 'Too many requests. Wait ' + retryAfter + ' seconds before retrying.',
      ...opts,
    });
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message, originalError, opts = {}) {
    const pgCode = originalError?.code || null;
    const pgCodes = {
      '23505': { code: 'DUPLICATE_ENTRY', hint: 'A record with this value already exists. Use a unique value.' },
      '23503': { code: 'FOREIGN_KEY_VIOLATION', hint: 'Referenced record does not exist. Verify the ID.' },
      '23502': { code: 'NOT_NULL_VIOLATION', hint: 'A required field is missing.' },
      '23514': { code: 'CHECK_VIOLATION', hint: 'Value does not meet constraints. Check allowed values.' },
      '42P01': { code: 'TABLE_NOT_FOUND', hint: 'Run migrations: npm run migrate' },
      '57014': { code: 'QUERY_TIMEOUT', hint: 'Query took too long. Try narrowing your request.' },
      '08006': { code: 'CONNECTION_FAILED', hint: 'Cannot reach database. Check DATABASE_URL and network.' },
    };
    const mapped = pgCodes[pgCode] || { code: 'DATABASE_ERROR', hint: 'A database error occurred.' };

    super(process.env.NODE_ENV === 'production' ? 'Database error' : message, {
      status: 500,
      code: mapped.code,
      details: process.env.NODE_ENV === 'production' ? { pgCode } : { pgCode, originalMessage: message },
      hint: mapped.hint,
      ...opts,
    });
  }
}

/**
 * Webhook delivery error
 */
export class WebhookError extends AppError {
  constructor(url, statusCode, opts = {}) {
    super('Webhook delivery failed to ' + url, {
      status: 502,
      code: 'WEBHOOK_DELIVERY_FAILED',
      details: { url, statusCode },
      hint: 'The webhook endpoint returned ' + statusCode + '. Verify the URL is correct and accessible.',
      ...opts,
    });
  }
}
