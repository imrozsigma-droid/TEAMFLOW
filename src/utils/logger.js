/**
 * 📊 Production Logger
 * Structured JSON logging with levels, timing, and metrics.
 *
 * Features:
 *   - JSON output (parseable by Datadog, CloudWatch, etc.)
 *   - Log levels: debug, info, warn, error
 *   - Request correlation via requestId
 *   - Performance timing
 *   - Metrics collection (query count, slow queries, errors)
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || "debug"];
const isDev = process.env.NODE_ENV === "development";

// ─── Metrics store ───────────────────────────────────────

const metrics = {
  requests: { total: 0, success: 0, error: 0 },
  queries: { total: 0, slow: 0, totalMs: 0 },
  endpoints: {},   // { "GET /api/task": { count, totalMs, avgMs } }
  errors: [],      // Last 50 errors
  startedAt: new Date().toISOString(),
};

// ─── Core log function ───────────────────────────────────

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  // In dev: pretty print. In prod: JSON line
  if (isDev) {
    const icon = { debug: "🔍", info: "ℹ️ ", warn: "🟡", error: "🔴" }[level];
    const extra = data.durationMs ? " (" + data.durationMs + "ms)" : "";
    const reqId = data.requestId ? " [" + data.requestId.slice(0, 8) + "]" : "";
    console.log(icon + reqId + " " + message + extra);

    // Show details for errors
    if (level === "error" && data.error) {
      console.error("   ", data.error);
    }
  } else {
    // Production: single JSON line per log entry
    console.log(JSON.stringify(entry));
  }
}

// ─── Public API ──────────────────────────────────────────

export function debug(message, data) { log("debug", message, data); }
export function info(message, data) { log("info", message, data); }
export function warn(message, data) { log("warn", message, data); }
export function error(message, data) { log("error", message, data); }

// ─── Query Logger ────────────────────────────────────────

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_MS || "500");

// N+1 detection: track queries per request
const requestQueryMap = new Map();

export function logQuery(requestId, sql, params, durationMs) {
  metrics.queries.total++;
  metrics.queries.totalMs += durationMs;

  const data = {
    requestId,
    durationMs: Math.round(durationMs),
    sql: sql.slice(0, 120),
    paramCount: params ? params.length : 0,
  };

  // Slow query detection
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    metrics.queries.slow++;
    warn("🐢 Slow query detected", {
      ...data,
      threshold: SLOW_QUERY_THRESHOLD_MS,
    });
  } else {
    debug("Query executed", data);
  }

  // N+1 detection: track queries per request
  if (requestId) {
    if (!requestQueryMap.has(requestId)) {
      requestQueryMap.set(requestId, []);
    }
    const queries = requestQueryMap.get(requestId);
    queries.push({ sql: sql.slice(0, 60), durationMs });

    // Detect N+1: same query pattern executed 3+ times in one request
    if (queries.length >= 3) {
      const patterns = {};
      for (const q of queries) {
        // Normalize: remove specific IDs to find repeated patterns
        const pattern = q.sql.replace(/\$\d+/g, "$?").replace(/'[^']*'/g, "'?'");
        patterns[pattern] = (patterns[pattern] || 0) + 1;
      }

      for (const [pattern, count] of Object.entries(patterns)) {
        if (count >= 3) {
          warn("⚠️  Possible N+1 query detected", {
            requestId,
            pattern,
            count,
            message: count + " similar queries in one request",
          });
        }
      }
    }
  }
}

/**
 * Clean up N+1 tracking for completed request
 */
export function clearRequestQueries(requestId) {
  requestQueryMap.delete(requestId);
}

// ─── Request Logger ──────────────────────────────────────

export function logRequest(req, res, durationMs) {
  metrics.requests.total++;

  const status = res.statusCode;
  const success = status < 400;

  if (success) {
    metrics.requests.success++;
  } else {
    metrics.requests.error++;
  }

  // Track per-endpoint metrics
  const key = req.method + " " + req.route?.path || req.path;
  if (!metrics.endpoints[key]) {
    metrics.endpoints[key] = { count: 0, totalMs: 0, errors: 0 };
  }
  metrics.endpoints[key].count++;
  metrics.endpoints[key].totalMs += durationMs;
  if (!success) metrics.endpoints[key].errors++;

  const data = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    status,
    durationMs: Math.round(durationMs),
    userRole: req.context?.role,
    tenantId: req.context?.tenant_id?.slice(0, 8),
  };

  if (status >= 500) {
    error("Request failed", data);
  } else if (status >= 400) {
    warn("Request rejected", data);
  } else if (durationMs > 1000) {
    warn("🐢 Slow request", data);
  } else {
    info("Request completed", data);
  }

  // Store last 50 errors
  if (status >= 400) {
    metrics.errors.push({
      ...data,
      timestamp: new Date().toISOString(),
    });
    if (metrics.errors.length > 50) metrics.errors.shift();
  }
}

// ─── Metrics API ─────────────────────────────────────────

export function getMetrics() {
  const uptime = Math.floor((Date.now() - new Date(metrics.startedAt).getTime()) / 1000);
  const avgQueryMs = metrics.queries.total > 0
    ? Math.round(metrics.queries.totalMs / metrics.queries.total)
    : 0;

  // Calculate per-endpoint averages
  const endpointStats = {};
  for (const [key, data] of Object.entries(metrics.endpoints)) {
    endpointStats[key] = {
      count: data.count,
      avgMs: Math.round(data.totalMs / data.count),
      errors: data.errors,
    };
  }

  return {
    uptime,
    startedAt: metrics.startedAt,
    requests: { ...metrics.requests },
    queries: {
      total: metrics.queries.total,
      slow: metrics.queries.slow,
      avgMs: avgQueryMs,
      slowThreshold: SLOW_QUERY_THRESHOLD_MS,
    },
    endpoints: endpointStats,
    recentErrors: metrics.errors.slice(-10),
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics.requests = { total: 0, success: 0, error: 0 };
  metrics.queries = { total: 0, slow: 0, totalMs: 0 };
  metrics.endpoints = {};
  metrics.errors = [];
}