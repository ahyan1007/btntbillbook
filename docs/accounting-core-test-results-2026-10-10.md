# Accounting core isolated test report — 2026-10-10

## Environment and safety boundary

- Supabase test project: `btntbillbook-accounting-test`
- Project ref: `qafnzanatljovuhsyzpe`
- Region: `ap-southeast-2` (Sydney)
- The project was created separately from production. **No production customer, bill, bill-item, or payment rows were copied.**
- A minimal test baseline was created from the live schema's relevant column/relationship shape, plus a compatibility `customer_balances` view and `private.is_admin()` function. This is a test harness, not a full clone of all production schema or authentication settings.
- The accounting foundation migration was applied only in this isolated project as `accounting_core_foundation_test`.
- The advance/payment allocation migration `20261010120000_advance_payment_and_allocation.sql` was then applied only in this isolated project as `advance_payment_and_allocation_test`.
- Neither migration has been applied to production.

## Results

The migration completed successfully, then `supabase/tests/accounting_core_reconciliation.sql` completed without raising an exception.

| Check | Result |
| --- | --- |
| Existing opening, bill, and payment rows backfilled | PASS |
| Signed balances reconcile to source transactions | PASS |
| Legacy due remains `greatest(signed balance, 0)` | PASS |
| New bill insert posts one ledger debit | PASS |
| New payment insert posts one ledger credit | PASS |
| Opening balance update syncs before financial history exists | PASS |
| Zero opening balance creates no posting | PASS |
| Valid credit-to-bill allocation accepted | PASS |
| Allocation exceeding a credit posting rejected | PASS |
| Allocation exceeding bill subtotal rejected | PASS |
| Cross-customer allocation rejected | PASS |
| Browser-role grants: ledger read-only; operation keys inaccessible | PASS |
| Re-running the backfill statements creates no duplicate entries | PASS |
| Historic payment credits are allocated FIFO after covering opening due | PASS |
| New `record_payment` accepts an amount greater than current due and leaves the excess as advance | PASS |
| Retrying `record_payment` with the same idempotency key returns the same response and inserts one payment | PASS |
| Reusing a payment idempotency key with a different request is rejected | PASS |
| New `create_bill` with overpayment returns zero due and a signed negative advance | PASS |
| RPC reports the existing advance applied to the new bill separately from leftover advance | PASS |
| Retrying `create_bill` with the same idempotency key returns the same response and inserts one bill | PASS |
| Existing advance is applied to a later bill using FIFO allocation | PASS |

## Synthetic fixture arithmetic

- Synthetic customer **Due**: opening due 500 + existing bill 300 − payment 200 = signed balance 600. A subsequent test bill 75 − payment 25 changed this to 650 as expected.
- Synthetic customer **Advance**: bill 100 − payment 150 = signed balance −50, shown as `ADVANCE`; the legacy due view correctly floors it at 0. This is a synthetic accounting edge case, not copied production history.
- Opening-only synthetic customer: 55 updated to 70 before any bill/payment history; its opening posting updated to 70.
- After the repeated backfill, source posting counts were 2 opening postings, 3 bill postings, and 3 payment postings (8 total), unchanged by the repeated backfill.
- Payment idempotency test: ₹500 payment recorded once despite a retry using the same key; due customer signed balance became ₹150 and invoice allocations totaled ₹225.
- Advance idempotency test: a prior ₹50 advance was applied to an ₹80 bill, leaving ₹30 due; retry generated no second bill.
- Overpayment test: a customer with a ₹30 credit balance received a new ₹10 bill with ₹1,000 paid-now. RPC response reconciled to ₹0 due, signed balance −₹960, and customer advance ₹960; it created one bill only.
- Different-request retry test: reusing the ₹500 payment's idempotency key for a ₹501 payment was rejected.
- Exact advance-applied test: existing signed balance −₹50 followed by a new ₹80 bill returned `advance_applied=₹50`, `total_due=₹30`, and `advance_amount=₹0`.

## Important limitations

This test proves migration installation and the listed accounting behavior against the minimal isolated harness. It is **not** a full copy of production and does not validate every production RLS policy under actual browser sessions. The RPC tests set an authenticated test JWT in a controlled SQL session and verify the database's admin check; the browser integration still requires preview/UI regression tests. Refunds, reversals, manual adjustments and advance reallocation workflows are not implemented in this phase.

Do not use `supabase db push` on production yet. First reconcile the untracked `20261009154500_customer_archive_and_delete.sql` migration with remote migration history as documented in `database-migration-reconciliation.md`. Production deployment remains unapproved until the later RPC/UI work and release checks are complete.
