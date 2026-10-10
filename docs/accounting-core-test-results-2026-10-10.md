# Accounting core isolated test report — 2026-10-10

## Environment and safety boundary

- Supabase test project: `btntbillbook-accounting-test`
- Project ref: `qafnzanatljovuhsyzpe`
- Region: `ap-southeast-2` (Sydney)
- The project was created separately from production. **No production customer, bill, bill-item, or payment rows were copied.**
- A minimal test baseline was created from the live schema's relevant column/relationship shape, plus a compatibility `customer_balances` view and `private.is_admin()` function. This is a test harness, not a full clone of all production schema or authentication settings.
- The accounting migration was applied only in this isolated project as `accounting_core_foundation_test`. It has not been applied to production.

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

## Synthetic fixture arithmetic

- Synthetic customer **Due**: opening due 500 + existing bill 300 − payment 200 = signed balance 600. A subsequent test bill 75 − payment 25 changed this to 650 as expected.
- Synthetic customer **Advance**: bill 100 − payment 150 = signed balance −50, shown as `ADVANCE`; the legacy due view correctly floors it at 0. This is a synthetic accounting edge case, not copied production history.
- Opening-only synthetic customer: 55 updated to 70 before any bill/payment history; its opening posting updated to 70.
- After the repeated backfill, source posting counts were 2 opening postings, 3 bill postings, and 3 payment postings (8 total), unchanged by the repeated backfill.

## Important limitations

This test proves SQL installation and the listed accounting behavior against the minimal isolated harness. It is **not** a full copy of production, does not validate every production RLS policy under real authenticated sessions, and does not demonstrate the future RPC idempotency workflow (the registry table is only a foundation today). The application UI and RPCs still reject overpayments; that behavior must change together in a separate reviewed phase.

Do not use `supabase db push` on production yet. First reconcile the untracked `20261009154500_customer_archive_and_delete.sql` migration with remote migration history as documented in `database-migration-reconciliation.md`. Production deployment remains unapproved until the later RPC/UI work and release checks are complete.
