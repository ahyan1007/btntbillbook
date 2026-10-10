# Accounting core and advance payments

Branch: `feature/accounting-core-foundation`

## Release scope

This feature branch adds a normalized customer ledger and invoice allocations while leaving the current customer, bills, bill-item and payment tables in place. It includes a migration for advance handling and idempotent bill/payment RPCs, plus app forms, customer ledger, dashboard and PDF changes that display signed balances and advances.

**Production database rollout completed on 2026-10-10.** The two migrations were applied as `20261010180107_accounting_core_foundation` and `20261010180130_advance_payment_and_allocation` after the isolated tests and production preflight reconciliation. Post-migration checks found zero signed-balance mismatches, zero legacy-due mismatches, zero duplicate source postings, and no allocations exceeding bill/credit limits. The separate `btntbillbook-accounting-test` project remains the source of transaction-level regression tests.

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

1. The migration-history repair for `20261009154500_customer_archive_and_delete` is complete.
2. Accounting foundation is recorded in Production as `20261010180107_accounting_core_foundation`; source file: `supabase/migrations/20261010180107_accounting_core_foundation.sql`.
3. Advance/allocation RPC migration is recorded in Production as `20261010180130_advance_payment_and_allocation`; source file: `supabase/migrations/20261010180130_advance_payment_and_allocation.sql`.
4. The isolated project passed transactional accounting regression checks; Production post-migration reconciliation also passed with zero mismatches.
5. The Preview build passed for commit `1711da3`; subsequent changes align migration filenames/docs with the live migration registry, and a fresh Preview build is required before merge.
6. The duplicate Production customer DELETE policies were reviewed and retained for this release because their predicates are overlapping/equivalent; cleanup is deferred to a separate change. Supabase Free-plan leaked-password protection remains unavailable and is documented as an accepted launch limitation—not represented as enabled.
7. After the fresh Preview build is READY, merge the reviewed PR to let Vercel deploy the app code to Production. A full browser UI workflow using a separate test-configured Preview session remains a follow-up check.

## Remaining not in scope

- Full bill/payment/PDF UI workflow against a Preview deployment configured to the isolated test project; the available verification covered successful build and direct SQL/accounting regression tests, not a signed-in browser end-to-end session.
- Allocation edits/reversals, refunds, credit notes and adjustment workflows.
- Independent production security review of every RLS policy.
- Vercel application code deployment follows the verified Production database migrations and successful latest Preview build.
