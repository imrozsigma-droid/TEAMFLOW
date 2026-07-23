# Customizing this backend

Forgx is **re-runnable**. You can regenerate this project (add an entity, change a
rule, pull a Forgx update) as many times as you like — your work is preserved.

## The one rule

> **Edit any file. Forgx refreshes only the files you have *not* touched.**

Every file Forgx generates is recorded in `.forgx-manifest.json` with a hash. On a
re-run, Forgx decides per file:

| The file | On re-run |
|---|---|
| You never touched it | Forgx refreshes it with the latest generated output |
| **You edited it** | **Forgx keeps your version** and prints a notice — never overwrites |
| You created it (not generated) | Forgx never touches it |
| A file Forgx no longer generates | Removed — *unless you had edited it* |

If you revert an edited file back to Forgx's version, Forgx reclaims it and resumes
refreshing it. So you are never locked out.

## Special files on re-run

- **`migrations/**`** — base migrations are refreshed but use `IF NOT EXISTS`, so
  re-applying them is safe. When you add a field and regenerate, the new column
  lands as a **new** additive migration (`990_forgx_column_additions.sql`) using
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — non-destructive and safe on a live DB.
  Applied migrations are never rewritten. Change the spec and regenerate — don't
  hand-edit migrations.
- **`package.json`** — MERGED, not overwritten. Your extra packages, script tweaks,
  version, and custom fields are kept; Forgx only updates the packages it manages.
- **`.env`** — never clobbered. Existing values (secrets, credentials, custom vars)
  are preserved; Forgx only appends keys that are missing. Your `JWT_SECRET` is never
  rotated, so live sessions keep working.
- **`.forgx-schema.base.json` / `.forgx-manifest.json`** — Forgx bookkeeping. Don't
  delete or edit them; they drive safe re-runs and additive migrations.

## Ways to customize (most durable first)

1. **Change the spec** — permissions, business rules, entities, integrations. Stays
   100% regenerable; nothing to hand-maintain.
2. **Lifecycle hooks** — add logic around any entity's create/update/delete without
   touching generated code. Fill the functions in `src/hooks/<entity>.js` (write-once,
   never overwritten):
     - `beforeCreate/Update/Delete(ctx)` — runs before the DB write. Enrich
       `ctx.input` in place, or reject by writing `ctx.res` and `return false`.
     - `afterCreate/Update/Delete(ctx)` — runs after the write (`ctx.record` is the
       row). Errors are logged, never turn a success into a 500.
   You keep getting Forgx updates to the route itself — your hook just runs inside it.
3. **Base / override** (when generated with `--overridable`) — a service is emitted as
   `xService.gen.js` (Forgx-owned, refreshed every run) plus a write-once shim
   `xService.js` that re-exports it. Override any function in the shim; your version
   wins and everything else keeps updating.
4. **Edit the generated file directly** — supported and preserved (see the rule above).
   Best for one-off changes you don't need Forgx to keep improving.

## Do not delete

`.forgx-manifest.json` is how Forgx knows which files are yours. If it is missing,
the next run treats the project as legacy and does a one-time clean. If it is
corrupted, Forgx refuses to delete anything and warns you.
