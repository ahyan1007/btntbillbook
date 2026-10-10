# Database migration reconciliation

Status checked against live Supabase project `btntbillbook` on 2026-10-10.
This document records a migration-history discrepancy; it does not authorize a production schema change.

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

## Repository mismatch

The repository currently contains:

- `supabase/migrations/20261009154500_customer_archive_and_delete.sql`
- `supabase/migrations/20261010100000_accounting_core_foundation.sql` (this feature branch)

Live schema inspection found `customers.is_archived`, the `customers_user_archived_name_idx` index, and the `customers_admin_delete` policy, but version `20261009154500` was not present in the remote migration registry. The schema change appears to have been applied outside the tracked migration workflow, so local files and remote migration history have drifted.

## Safe reconciliation procedure

1. **Do not run `supabase db push` against production yet.** The unregistered `20261009154500` migration is earlier than the new accounting migration and may be treated as pending.
2. Compare the full SQL effects of `20261009154500_customer_archive_and_delete.sql` with live columns, indexes, and policies. The live `customers` table has both `customers_delete_own` and `customers_admin_delete`; review the duplicate permissive DELETE policy before closing the drift.
3. Use `supabase migration list` against the linked project and save its output with the release record.
4. Only after the migration effects have been verified, repair the remote history record with `supabase migration repair 20261009154500 --status applied --linked`. This changes migration tracking only; it does **not** apply SQL. Do not use this command if the schema does not actually contain the migration's intended changes.
5. Create a verified schema baseline from the live database and retain the seven already-applied version records. Do not invent or split historical migration files from the current end-state schema, since that would falsely imply the original changes were reproduced in order.
6. Review and test all subsequent migrations on an isolated non-production database before any production migration is approved.

Official guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Accounting core rollout guardrails

The accounting foundation migration is additive: it creates the new ledger, allocation, and idempotency tables; installs posting/validation triggers; backfills the existing financial records into the ledger; and creates a signed-balance view. It does not update or delete existing customers, bills, bill items, or payments.

The migration is **not yet applied to Supabase**. Before applying it anywhere, test the SQL on an isolated database and verify ledger totals against:
- sum of customer opening due,
- sum of bill subtotals and bill-item amounts,
- sum of payment amounts,
- existing `customer_balances.current_due`,
- and expected raw signed balances.

Keep the current UI on `customer_balances` until the later advance/payment-allocation UI and RPC phase is complete. The new `customer_ledger_balances` view is prepared for the signed balance model; switching UI behavior early would be misleading because existing payment RPCs currently reject overpayment.
