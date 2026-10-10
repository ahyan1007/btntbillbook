# Database migration reconciliation

Status checked against live Supabase project `btntbillbook` on 2026-10-10.
This document records a migration-history discrepancy; it does not authorize a production schema change or a production migration-history edit.

## Live migration registry

The linked project reports these applied versions:

| Version | Name |
| --- | --- |
| 20261006055835 | initial_bill_book_schema |
| 20261006060158 | fix_transaction_locking |
| 20261006060223 | harden_trigger_function |
| 20261006073500 | add_business_logo_settings |
| 20261006095634 | add_pdf_branding_settings |
| 20261006104623 | final_hardening_and_performance |
| 20261006105043 | move_admin_check_to_private_schema |

## Repository mismatch and live verification

The repository contains:

- `supabase/migrations/20261009154500_customer_archive_and_delete.sql`
- `supabase/migrations/20261010100000_accounting_core_foundation.sql` (feature branch `feature/accounting-core-foundation`)

The live registry still does not list version `20261009154500`. We compared the SQL effects of `20261009154500_customer_archive_and_delete.sql` against the live schema and verified all three intended effects:

| Intended effect | Live schema result |
| --- | --- |
| Add `customers.is_archived boolean NOT NULL DEFAULT false` | Present with matching type, nullability, and default |
| Add `customers_user_archived_name_idx (user_id, is_archived, name)` | Present with matching definition |
| Create `customers_admin_delete` for authenticated delete access restricted to the user's own row and admin role | Present with matching effective predicate |

This confirms the migration's intended end-state effects are already present in the live schema, while its migration-history record is missing. **No production migration-history repair has been executed by this workflow.**

The live `customers` table also has `customers_delete_own` alongside `customers_admin_delete`. Both are permissive DELETE policies with overlapping admin/user predicates. This policy duplication predates the accounting foundation and should be reviewed separately; do not silently change customer deletion semantics as part of history repair.

## Safe reconciliation procedure

1. **Do not run `supabase db push` against production yet.** The unregistered `20261009154500` migration is earlier than the new accounting migration and may be treated as pending.
2. The SQL effects of the untracked migration have been checked against live columns, index definition, and DELETE-policy predicate as recorded above.
3. The latest connected Supabase migration list still contains only the seven versions above. The local CLI should re-check the list immediately before repair.
4. The user's installed Supabase CLI `2.115.0` supports `--db-url` on both `migration list` and `migration repair`. The attempted `supabase link --project-ref sawxcpwyehrbfmhsiqaf` fails with a Management API permission error, so **bypass linking** and connect directly to the production Postgres URL:
   - From a checked-out copy of this repository, set `SUPABASE_DB_URL` in the shell to the database connection URI from the Supabase Dashboard's Connect panel. Do not paste that credential into chat or commit it. Confirm the URI points to project `sawxcpwyehrbfmhsiqaf` (host `db.sawxcpwyehrbfmhsiqaf.supabase.co`).
   - Run `supabase migration list --db-url "$SUPABASE_DB_URL"` and confirm the target database lists the same seven applied versions and does not list `20261009154500` as applied.
   - Then run exactly `supabase migration repair 20261009154500 --status applied --db-url "$SUPABASE_DB_URL"`.
   - Run `supabase migration list --db-url "$SUPABASE_DB_URL"` again. Confirm `20261009154500` appears as applied and that the existing seven versions remain.
   - This targeted CLI repair changes migration tracking only; it does **not** execute the migration SQL. Do not use `--linked` and `--db-url` together. Do not manually edit Supabase's internal migration registry table using ad hoc SQL.
5. The repository file must exist locally at `supabase/migrations/20261009154500_customer_archive_and_delete.sql` before running repair. A clone/checkout is required because the CLI reads the file to determine its version, name and statement metadata. Do not fabricate or split the seven historical migration files from the current schema; their original sequence is not present in this repository.
6. **Do not run `supabase db push` or apply `20261010100000_accounting_core_foundation.sql` to production as part of this repair.** Test and review subsequent migrations against an isolated non-production database first, and complete the separate DELETE-policy review before production accounting rollout.

The CLI behavior was checked in the v2.115.0 source: [migration repair command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.command.ts), [migration repair handler](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.handler.ts), and [migration list command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/list/list.command.ts). Official guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Accounting core rollout guardrails

The accounting foundation migration is additive: it creates the new ledger, allocation, and idempotency tables; installs posting/validation triggers; backfills existing financial records into the ledger; and creates a signed-balance view. It does not update or delete existing customers, bills, bill items, or payments.

The migration has been applied only to the separate isolated test project `btntbillbook-accounting-test`. SQL reconciliation and synthetic trigger/allocation checks passed there. It has **not** been applied to production.

Keep the current UI on `customer_balances` until the advance/payment-allocation RPC and UI phase is complete. The new `customer_ledger_balances` view is prepared for the signed balance model; switching UI behavior early would be misleading because existing payment RPCs currently reject overpayment.

Before applying the accounting migration in production, complete the documented migration-history repair, resolve the DELETE-policy review, review the migration with a production change checklist, and obtain explicit production-change approval.
