# Accounting core foundation

Branch: `feature/accounting-core-foundation`

## Scope of this step

This is the first additive database foundation for the travel-agency bill book. The existing customer, bill, bill-item, and payment tables stay in place. The migration adds a normalized financial posting layer and allocation/idempotency structures for later RPC/UI work.

No migration has been applied to production by this change.

## Accounting convention

- A **debit** increases what the customer owes the agency.
- A **credit** decreases receivables and can result in a customer advance.
- A signed customer balance is `sum(debit) - sum(credit)`.
- A positive signed balance is receivable/due.
- A negative signed balance is money held as customer advance.
- Allocation connects a credit posting to a bill; creating an allocation must not create another payment/credit posting.

## Objects in the migration

### `customer_ledger_entries`

Append-oriented posting records for opening balance, bill, payment, refund, credit note, adjustment, and reversal. A posting has exactly one positive side (debit or credit). Source uniqueness prevents the same source bill/payment/opening balance from being backfilled twice.

Existing positive customer opening balances, bills and payments are backfilled idempotently. Database triggers maintain corresponding ledger entries for subsequent customer opening-balance changes, bill inserts, and payment inserts. Existing source records are left unchanged.

### `invoice_allocations`

Connects a bill to a customer credit posting. The validation trigger verifies that the bill and credit belong to the same customer/account and rejects allocation sums greater than either the credit source or bill subtotal. The table has no browser write policy; allocations must be made through a future narrow, authorized financial RPC.

### `financial_operation_keys`

Private idempotency registry for create-bill, record-payment, advance-allocation, and adjustment RPCs. The table is not directly accessible to browser roles. The next RPC/UI phase must actually use this registry and pass a stable request key; creating the table by itself does not deduplicate calls.

### `customer_ledger_balances`

A read-only, `security_invoker` view that exposes debit total, credit total and signed current balance under underlying table RLS. The existing `customer_balances` view remains untouched for backward compatibility until the next step changes RPC and UI behavior together.

## Implementation sequence after this foundation

1. Verify and repair migration history (see `docs/database-migration-reconciliation.md`).
2. Run this migration and tests in an isolated database; verify all existing ledger totals reconcile.
3. Replace the existing payment RPC and UI together so overpayments become an unallocated advance instead of an error. Do not ship one without the other.
4. Add idempotency behavior to both bill and payment RPCs and pass stable request keys from the UI.
5. Implement advance-to-invoice allocation and display per-invoice outstanding separately from signed party balance.
6. Add refund, reversal, and adjustment workflows with an audit trail.
7. Only after all test gates pass, seek explicit approval for production migration/application deployment.

## Required verification scenarios

The SQL migration must be exercised against representative test data, not merely accepted because the Next.js build passes:

- Opening due + bill + payment reconciling to the existing current due.
- Existing zero opening balances not producing zero-value ledger rows.
- Inserting a bill and its items results in one bill posting, with the subtotal matching item sum.
- A bill with payment-now results in one bill debit and one payment credit.
- Repeated backfill creates no duplicate source entries.
- Updating an opening balance before history updates the opening posting; the existing trigger blocks edits after bill/payment history.
- A payment amount can be allocated across multiple bills without exceeding its credit source.
- Combined allocations never exceed a bill subtotal.
- Cross-customer or cross-account allocation is rejected.
- Browser roles cannot directly insert/update/delete ledger postings or financial operation keys.
- Unauthorized users cannot read other accounts' ledger entries or allocations.
- Duplicate RPC retries with one idempotency key return the original result after the RPC implementation is added.
- Signed balances match independently calculated expected balances, including a negative balance when an advance is present.

## Explicit limitations

This foundation does not yet enable overpayments in the existing UI or make the existing `record_payment` RPC accept advances; that RPC currently rejects payments greater than current due. It also does not yet make the current statement UI allocation-aware. Those changes belong together in the next step and must not be enabled before that release.
