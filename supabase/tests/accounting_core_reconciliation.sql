-- Read-only accounting-core reconciliation checks.
-- Run only after 20261010100000_accounting_core_foundation.sql has been applied
-- to an isolated test database. This script does not insert, update or delete data.

DO $check$
BEGIN
  IF to_regclass('public.customer_ledger_entries') IS NULL
     OR to_regclass('public.customer_ledger_balances') IS NULL
     OR to_regclass('public.invoice_allocations') IS NULL THEN
    RAISE EXCEPTION 'Accounting core objects are missing; apply the foundation migration to the test database first';
  END IF;

  -- Every positive legacy opening balance must have exactly one matching ledger posting.
  IF EXISTS (
    SELECT 1
    FROM public.customers c
    LEFT JOIN public.customer_ledger_entries e
      ON e.source_type = 'opening_balance'
     AND e.source_id = c.id
    WHERE c.opening_due > 0
      AND (
        e.id IS NULL
        OR e.user_id IS DISTINCT FROM c.user_id
        OR e.customer_id IS DISTINCT FROM c.id
        OR e.debit IS DISTINCT FROM c.opening_due
        OR e.credit <> 0
      )
  ) THEN
    RAISE EXCEPTION 'Opening-balance ledger entries do not reconcile with customers';
  END IF;

  -- Every positive bill subtotal must have exactly one matching debit posting.
  IF EXISTS (
    SELECT 1
    FROM public.bills b
    LEFT JOIN public.customer_ledger_entries e
      ON e.source_type = 'bill'
     AND e.source_id = b.id
    WHERE b.subtotal > 0
      AND (
        e.id IS NULL
        OR e.user_id IS DISTINCT FROM b.user_id
        OR e.customer_id IS DISTINCT FROM b.customer_id
        OR e.debit IS DISTINCT FROM b.subtotal
        OR e.credit <> 0
      )
  ) THEN
    RAISE EXCEPTION 'Bill ledger entries do not reconcile with bill subtotals';
  END IF;

  -- Every payment must have exactly one matching credit posting.
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    LEFT JOIN public.customer_ledger_entries e
      ON e.source_type = 'payment'
     AND e.source_id = p.id
    WHERE p.amount > 0
      AND (
        e.id IS NULL
        OR e.user_id IS DISTINCT FROM p.user_id
        OR e.customer_id IS DISTINCT FROM p.customer_id
        OR e.debit <> 0
        OR e.credit IS DISTINCT FROM p.amount
      )
  ) THEN
    RAISE EXCEPTION 'Payment ledger entries do not reconcile with payments';
  END IF;

  -- The new signed balance must equal the independent legacy calculation.
  IF EXISTS (
    SELECT 1
    FROM public.customers c
    LEFT JOIN (
      SELECT customer_id, user_id, SUM(subtotal) AS total
      FROM public.bills
      GROUP BY customer_id, user_id
    ) b ON b.customer_id = c.id AND b.user_id = c.user_id
    LEFT JOIN (
      SELECT customer_id, user_id, SUM(amount) AS total
      FROM public.payments
      GROUP BY customer_id, user_id
    ) p ON p.customer_id = c.id AND p.user_id = c.user_id
    JOIN public.customer_ledger_balances lb ON lb.id = c.id
    WHERE lb.current_balance IS DISTINCT FROM (
      c.opening_due + COALESCE(b.total, 0) - COALESCE(p.total, 0)
    )::numeric(12,2)
  ) THEN
    RAISE EXCEPTION 'Signed ledger balances do not reconcile with existing customer balances';
  END IF;

  -- The legacy UI's balance view must remain reconciled during the transition.
  IF EXISTS (
    SELECT 1
    FROM public.customer_ledger_balances lb
    JOIN public.customer_balances cb ON cb.id = lb.id
    WHERE cb.current_due IS DISTINCT FROM GREATEST(lb.current_balance, 0)::numeric(12,2)
  ) THEN
    RAISE EXCEPTION 'Legacy customer_balances due does not reconcile with the new signed ledger';
  END IF;

  -- No bill/payment posting should exist without the source transaction it represents.
  IF EXISTS (
    SELECT 1
    FROM public.customer_ledger_entries e
    LEFT JOIN public.bills b ON b.id = e.source_id
    WHERE e.source_type = 'bill'
      AND (b.id IS NULL OR e.user_id IS DISTINCT FROM b.user_id
        OR e.customer_id IS DISTINCT FROM b.customer_id
        OR e.debit IS DISTINCT FROM b.subtotal OR e.credit <> 0)
  ) THEN
    RAISE EXCEPTION 'Orphaned or incorrect bill ledger posting found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_ledger_entries e
    LEFT JOIN public.payments p ON p.id = e.source_id
    WHERE e.source_type = 'payment'
      AND (p.id IS NULL OR e.user_id IS DISTINCT FROM p.user_id
        OR e.customer_id IS DISTINCT FROM p.customer_id
        OR e.debit <> 0 OR e.credit IS DISTINCT FROM p.amount)
  ) THEN
    RAISE EXCEPTION 'Orphaned or incorrect payment ledger posting found';
  END IF;

  -- The allocation totals must remain within source credit and bill subtotal limits.
  IF EXISTS (
    SELECT 1
    FROM public.invoice_allocations a
    JOIN public.bills b ON b.id = a.bill_id
    GROUP BY a.bill_id, b.subtotal
    HAVING SUM(a.amount) > b.subtotal
  ) THEN
    RAISE EXCEPTION 'Invoice allocations exceed one or more bill subtotals';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_allocations a
    JOIN public.customer_ledger_entries e ON e.id = a.credit_ledger_entry_id
    GROUP BY a.credit_ledger_entry_id, e.credit
    HAVING SUM(a.amount) > e.credit
  ) THEN
    RAISE EXCEPTION 'Invoice allocations exceed one or more credit postings';
  END IF;
END;
$check$;

-- Optional review output for the test operator; signed balance below zero means advance.
SELECT
  id,
  name,
  total_debits,
  total_credits,
  current_balance,
  CASE
    WHEN current_balance > 0 THEN 'DUE'
    WHEN current_balance < 0 THEN 'ADVANCE'
    ELSE 'SETTLED'
  END AS balance_status
FROM public.customer_ledger_balances
ORDER BY name;
