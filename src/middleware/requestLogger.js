/**
 * 📊 Request Logger Middleware
 * Times every request, logs structured output, tracks metrics.
 * Replaces the inline logging in server.js
 */

import { logRequest, clearRequestQueries } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const start = Date.now();

  // When response finishes, log it
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logRequest(req, res, durationMs);
    clearRequestQueries(req.id);
  });

  next();
}