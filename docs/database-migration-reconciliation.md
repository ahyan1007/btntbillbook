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
- `supabase/tests/test_project_core_rls_setup.sql` (isolated test setup only; not a production migration)

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
2. The CLI list showed `20261010100000` and `20261010120000` as local versions not applied remotely. **Do not run `supabase db push` against Production yet.**
3. Do not mark the accounting migrations as applied manually. `20261010100000_accounting_core_foundation.sql` and `20261010120000_advance_payment_and_allocation.sql` contain real schema, trigger, backfill, and RPC changes and remain pending on Production.
4. Do not fabricate or split the seven historical migration files from the current schema; their original sequence is not present in this repository.
5. Review and test subsequent migrations against an isolated non-production database, complete the separate DELETE-policy review, and use a production change checklist before approving any accounting rollout.

The CLI behavior was checked in the v2.115.0 source: [migration repair command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.command.ts), [migration repair handler](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/repair/repair.handler.ts), and [migration list command](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/migration/list/list.command.ts). Official guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Accounting core rollout guardrails and test status

The accounting foundation migration creates the ledger, allocation, and idempotency tables; installs posting/validation triggers; backfills existing financial records into the ledger; and creates a signed-balance view. The follow-on migration adds advance-payment and allocation RPC behavior. Both migrations have been tested on the separate isolated project `btntbillbook-accounting-test`; neither has been applied to Production.

On 2026-10-10, after test-project RLS was enabled, these checks passed:

- Initial read-only ledger reconciliation checked five customers, ten bills, six payments, eighteen ledger entries, and nine allocations with zero mismatch between legacy due and signed-ledger-derived due.
- Under a simulated authenticated admin JWT context, RLS exposed the admin's own rows (five customers, ten bills, eleven bill items, six payments). A different admin context saw zero customer, bill, bill-item, and payment rows.
- A non-admin authenticated context could not read those business rows and attempts to call `create_bill` or `record_payment` were rejected with `Admin access required`.
- An anonymous role saw zero customers, bills, and payments. Anonymous EXECUTE privilege for both accounting RPCs was false. The `authenticated` role can execute these RPCs by design, and both functions contain explicit admin checks.
- A transactional smoke test confirmed authenticated admin execution of `create_bill` and `record_payment`; idempotent retries returned matching responses without duplicate bills/payments, and each source produced exactly one ledger posting. The test transaction was rolled back.
- A transactional FIFO/advance test passed: a 150 payment against a 100 bill allocated 100 to the first bill and left 50 advance; a 30 next bill consumed 30 of advance and carried 20; a 25 third bill consumed the final 20 and left 5 due. It ran in a transaction that included `ROLLBACK`.

### Test-project RLS policy status and customer-count investigation

RLS is enabled on all five legacy core tables in `btntbillbook-accounting-test`: `admin_users`, `customers`, `bills`, `bill_items`, and `payments`. The predicates restrict authenticated access to the admin's own account and bill ownership. The applied policies are now saved as a rerunnable setup script at `supabase/tests/test_project_core_rls_setup.sql`. **It is explicitly test-only; do not run it on Production or use it as a production migration.**

The initial exact admin-context count was five customers. A later direct query showed four, while bills (10), payments (6), ledger entries (18), and allocations (9) were stable. All four current customers account for those financial records. The missing customer could not have had dependent bills, payments, ledger entries, or allocations when the deletion succeeded because those foreign keys restrict deletion.

A deeper `pg_stat_statements` query identified one parameterized PostgREST statement:
`DELETE FROM public.customers WHERE id = $1 AND user_id = $2 RETURNING id`
Its statement stats show `calls = 1`, `rows = 1`, with the entry first tracked at `2026-10-10 17:00:53 UTC`. This is a strong likely explanation for the count moving from five to four: a customer DELETE request through the Data API returned one row. The stored query does not retain the bound customer ID or actor, and available Postgres/PostgREST logs did not reveal those values. No current trigger or application function that deletes from `public.customers` was found. The SQL-editor transactions used for regression tests ended with `ROLLBACK`; none of those test scripts contained a customer DELETE statement.

**Finding:** the discrepancy is likely explained by one successful Data API customer-delete request, not by ledger/backfill drift. The exact customer identity and initiating session cannot be recovered from the available statement statistics. No row was recreated. The current four-customer dataset still reconciles with all bills/payments/ledger/allocation totals, so no financial inconsistency was found. If an empty synthetic customer fixture is needed for a UI test, recreate it deliberately through a documented test setup step; do not infer the deleted customer's identity.

### Remaining security findings

The latest Supabase security advisor no longer reports the five core tables as RLS-disabled. Findings were reviewed as follows:

- `financial_operation_keys` has RLS enabled and no policy, which is intentional for direct client isolation; the authenticated role has no SELECT privilege.
- `create_bill` and `record_payment` are SECURITY DEFINER RPCs executable by `authenticated`. Their source pins `search_path`, explicitly checks `auth.uid()` and `private.is_admin()`, validates customer ownership, and tests above confirm non-admin calls are rejected. The functions have no EXECUTE privilege for `anon`; keep them under review and do not grant EXECUTE to `PUBLIC`.
- Anonymous role has SELECT grants on some public tables, but RLS returned zero rows for customers, bills, and payments in the smoke test. RLS must remain enabled and the policies must not be weakened.
- Leaked-password protection is disabled in Supabase Auth on both test and Production. The connected Supabase organization is currently on the Free plan; current Supabase documentation says leaked-password protection is available on Pro and above. Before launch, either upgrade if this control is required or explicitly document acceptance of this limitation and review compensating controls. See the [Supabase password security guide](https://supabase.com/docs/guides/auth/password-security).
- Production's `customers_delete_own` and `customers_admin_delete` policies overlap. Review whether to keep one policy as a separate, explicit change; this was not altered by migration repair.

## Release readiness decision

**Not production-ready yet.** The customer count discrepancy is now likely explained by a successful Data API deletion and no financial-record mismatch was found. Accounting transactional tests passed, and the documentation/build check for the prior commit succeeded, but release remains gated by:

1. deciding whether to upgrade the currently Free Supabase organization to enable leaked-password protection or formally accept/document this plan limitation and compensating controls;
2. an explicit review/decision on duplicate Production customer DELETE policies;
3. verifying the new test-only RLS setup script is kept separate from deployable migrations;
4. end-to-end browser/UI tests for bill creation, payment entry, PDF history, ledger display, and advance carry-forward on the intended app branch; and
5. a final review of accounting migrations and their rollout order.

Do not apply either accounting migration to Production or switch the UI to `customer_ledger_balances` until the above gates are resolved and the change is explicitly reviewed.
