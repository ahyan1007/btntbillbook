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
2. The SQL effects of the untracked migration have now been checked against live columns, index definition, and DELETE-policy predicate as recorded above.
3. The current linked-project migration list still contains only the seven versions above; save a fresh `supabase migration list` output before release.
4. The intended CLI history repair is `supabase migration repair 20261009154500 --status applied --linked`. It changes migration tracking only; it does **not** apply SQL. Use the Supabase CLI against the linked production project in a controlled session. Do not manually edit Supabase's internal migration registry table using ad hoc SQL. This workflow has not performed that repair because the available database connector exposes list/apply/SQL actions but not the CLI `migration repair` operation.
5. Create and review a verified schema baseline from the live database and retain the seven already-applied version records. Do not invent or split historical migration files from the current end-state schema, since that would falsely imply the original changes were reproduced in order.
6. Review and test all subsequent migrations on an isolated non-production database before any production migration is approved.

Official guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Accounting core rollout guardrails

The accounting foundation migration is additive: it creates the new ledger, allocation, and idempotency tables; installs posting/validation triggers; backfills existing financial records into the ledger; and creates a signed-balance view. It does not update or delete existing customers, bills, bill items, or payments.

The migration has been applied only to the separate isolated test project `btntbillbook-accounting-test`. SQL reconciliation and synthetic trigger/allocation checks passed there. It has **not** been applied to production.

Keep the current UI on `customer_balances` until the advance/payment-allocation RPC and UI phase is complete. The new `customer_ledger_balances` view is prepared for the signed balance model; switching UI behavior early would be misleading because existing payment RPCs currently reject overpayment.

Before applying the accounting migration in production, complete the documented migration-history repair, resolve the DELETE-policy review, review the migration with a production change checklist, and obtain explicit production-change approval.
