# Database migration reconciliation

Status verified against live Supabase project `btntbillbook` on 2026-10-10.
This document records the migration-history reconciliation and rollout guardrails. The targeted history repair below does not apply migration SQL.

## Live migration registry after reconciliation

The Production project now reports these applied versions:

| Version | Name |
| --- | --- |
| 20261006055835 | initial_bill_book_schema |
| 20261006060158 | fix_transaction_locking |
| 20261006060223 | harden_trigger_function |
| 20261006073500 | add_business_logo_settings |
| 20261006095634 | add_pdf_branding_settings |
| 20261006104623 | final_hardening_and_performance |
| 20261006105043 | move_admin_check_to_private_schema |
| 20261009154500 | customer_archive_and_delete |

The targeted repair was run from a checked-out copy of this repository with Supabase CLI `2.115.0` using a direct Production Postgres connection URI via `--db-url`, because `supabase link --project-ref sawxcpwyehrbfmhsiqaf` returned a Management API permission error. CLI output confirmed `Repaired migration history: [20261009154500] => applied`; the subsequent `supabase migration list --db-url ...` showed `20261009154500` in both the local and remote columns. A separate connected Supabase migration-list check also confirms the eight Production versions above.

**The repair changed migration tracking only. It did not run the migration SQL.** Production schema and data were not changed by this repair.

## Repository migration files and live verification

The feature branch contains:

- `supabase/migrations/20261009154500_customer_archive_and_delete.sql`
- `supabase/migrations/20261010100000_accounting_core_foundation.sql`
- `supabase/migrations/20261010120000_advance_payment_and_allocation.sql`

Before the repair, we compared the SQL effects of `20261009154500_customer_archive_and_delete.sql` against the live schema and verified all three intended effects:

| Intended effect | Live schema result |
| --- | --- |
| Add `customers.is_archived boolean NOT NULL DEFAULT false` | Present with matching type, nullability, and default |
| Add `customers_user_archived_name_idx (user_id, is_archived, name)` | Present with matching definition |
| Create `customers_admin_delete` for authenticated delete access restricted to the user's own row and admin role | Present with matching effective predicate |

That is why the version was reconciled as applied rather than executing its SQL again.

The live `customers` table also has `customers_delete_own` alongside `customers_admin_delete`. Both are permissive DELETE policies with overlapping admin/user predicates. This policy duplication predates the accounting foundation and should be reviewed separately; it was not changed as part of history repair.

## Current rollout status and safety rules

1. The migration history discrepancy for `20261009154500` is resolved.
2. The CLI list still shows `20261010100000` and `20261010120000` as local versions not applied remotely. **Do not run `supabase db push` against Production yet.**
3. Do not mark the accounting migrations as applied manually. `20261010100000_accounting_core_foundation.sql` and `20261010120000_advance_payment_and_allocation.sql` contain real schema, trigger, backfill, and RPC changes and remain pending on Production.
4. Do not fabricate or split the seven historical migration files from the current schema; their original sequence is not present in this repository.
5. Review and test subsequent migrations against an isolated non-production database, complete the separate DELETE-policy review, and use a production change checklist before approving any accounting rollout.

The CLI behavior was checked in the v2.115.0 source: [migration repair command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.command.ts), [migration repair handler](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.handler.ts), and [migration list command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/list/list.command.ts). Official guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Accounting core rollout guardrails

The accounting foundation migration creates the ledger, allocation, and idempotency tables; installs posting/validation triggers; backfills existing financial records into the ledger; and creates a signed-balance view. The follow-on migration adds advance-payment and allocation RPC behavior. Both migrations have been tested on the separate isolated project `btntbillbook-accounting-test`; neither has been applied to Production.

Keep the current UI on `customer_balances` until the advance/payment-allocation RPC and UI phase is completed and reviewed. The new `customer_ledger_balances` view is prepared for the signed-balance model; switching UI behavior early would be misleading because the legacy payment RPC rejects overpayment.

## Separate test-project security finding

In `btntbillbook-accounting-test`, RLS is disabled on `public.admin_users`, `public.customers`, `public.bills`, `public.bill_items`, and `public.payments`. Do not enable RLS without first creating and reviewing the correct policies, because the app may lose access. No RLS policy changes were made during Production migration reconciliation.
