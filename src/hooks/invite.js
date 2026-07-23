/**
 * 🪝 Hooks for `invite` — YOUR code. Forgx creates this once and never
 * overwrites it, so anything you write here is safe across regenerations.
 *
 * Implement only the functions you need. Each is async and receives:
 *   ctx = { req, res, tenantId, entity, action, input, id, record }
 *
 *   before*  runs before the DB write. Enrich ctx.input in place, or reject the
 *            request by writing ctx.res and `return false`.
 *   after*   runs after the DB write (ctx.record is the row). Errors are logged,
 *            never fail the request.
 *
 * Example:
 *   export async function beforeCreate(ctx) {
 *     if (!ctx.input.email) { ctx.res.status(400).json({ error: 'email required' }); return false; }
 *     ctx.input.email = ctx.input.email.trim().toLowerCase();
 *   }
 *   export async function afterCreate(ctx) {
 *     await notifyInviteCreated(ctx.record);
 *   }
 */

// export async function beforeCreate(ctx) {}
// export async function afterCreate(ctx) {}
// export async function beforeUpdate(ctx) {}
// export async function afterUpdate(ctx) {}
// export async function beforeDelete(ctx) {}
// export async function afterDelete(ctx) {}
