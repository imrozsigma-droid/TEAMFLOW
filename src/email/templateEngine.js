/**
 * 📧 Email Template Engine
 * Simple variable substitution + HTML wrapper.
 */

/**
 * Escape a value for safe interpolation into HTML
 */
export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Wrap content in responsive HTML email template.
 * `title` is escaped here; `body` is caller-built HTML — callers must
 * escape every dynamic value they interpolate into it.
 */
export function wrapHTML(rawTitle, body, opts = {}) {
  const { brandColor = '#4F46E5', logoUrl, footerText = 'Sent by Backend Factory' } = opts;
  const title = escapeHtml(rawTitle);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff;">
    <tr><td style="background:${brandColor}; padding:20px 30px; color:white; font-size:18px; font-weight:600;">
      ${title}
    </td></tr>
    <tr><td style="padding:30px;">
      ${body}
    </td></tr>
    <tr><td style="padding:20px 30px; background:#f9fafb; color:#6b7280; font-size:12px; text-align:center;">
      ${footerText}
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Replace {{variables}} in template string
 * @param {string} template
 * @param {object} vars
 */
export function renderTemplate(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? escapeHtml(vars[key]) : match;
  });
}
