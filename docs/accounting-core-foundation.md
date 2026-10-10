# Accounting core and advance payments

Branch: `feature/accounting-core-foundation`

## Release scope

This feature branch adds a normalized customer ledger and invoice allocations while leaving the current customer, bills, bill-item and payment tables in place. It includes a migration for advance handling and idempotent bill/payment RPCs, plus app forms, customer ledger, dashboard and PDF changes that display signed balances and advances.

**Neither migration has been applied to production.** SQL execution and financial test fixtures were confined to the separate `btntbillbook-accounting-test` project. See `docs/accounting-core-test-results-2026-10-10.md`.

## Accounting convention

- Debit increases what the customer owes the agency.
- Credit decreases receivables and may create a customer advance.
- Signed balance = total debit − total credit.
- Positive signed balance = due. Negative signed balance = customer advance.
- A payment credit is posted once. Allocations connect that credit to a bill; allocations must not create another credit posting.
- The allocation helper covers opening due first, then applies remaining credit to invoices FIFO by bill date/creation order. Existing partial allocations to an older invoice are completed before allocating the same credit to newer invoices.
- `advance_applied` records how much existing credit was used by a new bill; `advance_amount` records any advance still left after the transaction.

## Database objects

### `customer_ledger_entries`

Append-oriented financial postings for opening balance, bills, payments, refunds, credit notes, adjustments and reversals. A posting has exactly one positive side. A unique source index prevents a source bill/payment/opening balance from being posted twice. Triggers post new opening balances, bills and payments; existing source transactions are backfilled idempotently.

### `invoice_allocations`

Connects a bill to a credit posting. The validation trigger ensures the bill and credit belong to the same account/customer and rejects allocation totals above the bill subtotal or source credit. Browser clients have read-only access filtered by RLS; direct client writes are revoked.

### `financial_operation_keys`

Private idempotency registry for financial RPCs. The same key and same request returns the original JSON response; using an existing key for a different request is rejected. The table itself is not accessible to browser roles.

### `customer_ledger_balances`

Read-only `security_invoker` view exposing debit total, credit total and signed balance. The legacy `customer_balances` due view stays for compatibility and displays `greatest(signed balance, 0)`.

## RPC and UI behavior on the feature branch

- `create_bill` and `record_payment` accept an idempotency key and are granted only to authenticated clients, with a server-side admin/ownership check.
- Overpayments are accepted in the RPC layer. Any credit beyond open receivables remains as customer advance.
- Advance credit is allocated FIFO to invoices after first covering opening due.
- New Bill shows advance applied and any leftover advance.
- Payment form no longer blocks an amount above the due and previews the resulting advance.
- Dashboard, customer picker/list, customer ledger and PDF/WhatsApp share text show advance information when applicable.
- Party statement maintains a signed running balance; negative closing balances are labelled Customer Advance.

## Migration sequence and production gate

1. Production migration history has a known discrepancy: `20261009154500_customer_archive_and_delete.sql` effects are present but its version is not recorded in the live registry. See `docs/database-migration-reconciliation.md`.
2. Accounting foundation: `supabase/migrations/20261010100000_accounting_core_foundation.sql`.
3. Advance/allocation and idempotent RPCs: `supabase/migrations/20261010120000_advance_payment_and_allocation.sql`.
4. Both migrations have been exercised in the isolated test project with synthetic data; see the test report.
5. The latest Next.js Build Check and UI regression checks must pass before considering a merge. Preview must use a schema compatible with these migrations; deploying this UI against production before its schema is migrated will cause balance/RPC calls to fail closed.
6. Migration history must be reconciled with the Supabase CLI (do not manually edit the internal migration registry). Review the overlapping customer DELETE policies.
7. Production schema migration and production deployment require separate explicit approval. Do not merge/deploy as part of this test step.

## Remaining not in scope

- Actual browser-session validation against a preview configured to the test project.
- Allocation edits/reversals, refunds, credit notes and adjustment workflows.
- Independent production security review of every RLS policy.
- Migration-history repair command is not available through the current database connector; it remains a controlled CLI step before production rollout.
