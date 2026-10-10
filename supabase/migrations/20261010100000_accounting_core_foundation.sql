-- Accounting Core Foundation
-- Additive migration only: preserves existing customers, bills, bill_items and payments.
-- This migration is intentionally not applied to the production project during audit.
-- Before production rollout, reconcile the untracked 20261009154500 migration as documented
-- in docs/database-migration-reconciliation.md.

CREATE TABLE IF NOT EXISTS public.customer_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source_type text NOT NULL CHECK (
    source_type IN (
      'opening_balance',
      'bill',
      'payment',
      'refund',
      'credit_note',
      'adjustment',
      'reversal'
    )
  ),
  source_id uuid,
  debit numeric(12,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_ledger_one_sided_amount CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_ledger_source_unique
  ON public.customer_ledger_entries (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_ledger_user_customer_date_idx
  ON public.customer_ledger_entries (user_id, customer_id, entry_date, created_at);

CREATE TABLE IF NOT EXISTS public.invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  credit_ledger_entry_id uuid NOT NULL REFERENCES public.customer_ledger_entries(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_allocation_source_invoice_unique UNIQUE (credit_ledger_entry_id, bill_id)
);

CREATE INDEX IF NOT EXISTS invoice_allocations_user_customer_date_idx
  ON public.invoice_allocations (user_id, customer_id, allocation_date, created_at);

CREATE INDEX IF NOT EXISTS invoice_allocations_bill_idx
  ON public.invoice_allocations (bill_id);

CREATE TABLE IF NOT EXISTS public.financial_operation_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_type text NOT NULL CHECK (
    operation_type IN ('create_bill', 'record_payment', 'allocate_advance', 'post_adjustment')
  ),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  response_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_operation_key_unique UNIQUE (user_id, operation_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS financial_operation_keys_created_at_idx
  ON public.financial_operation_keys (created_at);

ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_operation_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_ledger_entries_select_admin ON public.customer_ledger_entries;
CREATE POLICY customer_ledger_entries_select_admin
  ON public.customer_ledger_entries
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));

DROP POLICY IF EXISTS invoice_allocations_select_admin ON public.invoice_allocations;
CREATE POLICY invoice_allocations_select_admin
  ON public.invoice_allocations
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_admin()));

-- Only future, narrowly scoped SECURITY DEFINER RPCs should write these tables.
-- Browser clients receive read-only access protected by RLS; operation keys remain private.
REVOKE ALL ON TABLE public.customer_ledger_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_allocations FROM anon, authenticated;
REVOKE ALL ON TABLE public.financial_operation_keys FROM anon, authenticated;

GRANT SELECT ON TABLE public.customer_ledger_entries TO authenticated;
GRANT SELECT ON TABLE public.invoice_allocations TO authenticated;

CREATE OR REPLACE FUNCTION private.sync_customer_opening_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.opening_due > 0 THEN
    INSERT INTO public.customer_ledger_entries (
      user_id, customer_id, entry_date, source_type, source_id,
      debit, credit, description, created_by, created_at
    )
    VALUES (
      NEW.user_id, NEW.id, COALESCE(NEW.created_at::date, CURRENT_DATE),
      'opening_balance', NEW.id, NEW.opening_due, 0,
      'Opening balance', NEW.user_id, COALESCE(NEW.created_at, now())
    )
    ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      customer_id = EXCLUDED.customer_id,
      entry_date = EXCLUDED.entry_date,
      debit = EXCLUDED.debit,
      credit = 0,
      description = EXCLUDED.description,
      created_by = EXCLUDED.created_by;
  ELSE
    -- Zero opening balance is not a financial posting. This delete is only relevant
    -- before any bills/payments exist; the existing opening_due guard protects history.
    DELETE FROM public.customer_ledger_entries
      WHERE source_type = 'opening_balance' AND source_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.post_bill_to_customer_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.subtotal > 0 THEN
    INSERT INTO public.customer_ledger_entries (
      user_id, customer_id, entry_date, source_type, source_id,
      debit, credit, description, created_by, created_at
    )
    VALUES (
      NEW.user_id, NEW.customer_id, NEW.bill_date, 'bill', NEW.id,
      NEW.subtotal, 0, 'Bill ' || NEW.bill_no, NEW.user_id, NEW.created_at
    )
    ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.post_payment_to_customer_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.amount > 0 THEN
    INSERT INTO public.customer_ledger_entries (
      user_id, customer_id, entry_date, source_type, source_id,
      debit, credit, description, created_by, created_at
    )
    VALUES (
      NEW.user_id, NEW.customer_id, NEW.payment_date, 'payment', NEW.id,
      0, NEW.amount,
      COALESCE(NULLIF(NEW.notes, ''), 'Payment ' || NEW.payment_no),
      NEW.user_id, NEW.created_at
    )
    ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.validate_invoice_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_bill public.bills%ROWTYPE;
  v_credit public.customer_ledger_entries%ROWTYPE;
  v_allocated_credit numeric(12,2);
  v_allocated_bill numeric(12,2);
BEGIN
  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = NEW.bill_id
    AND user_id = NEW.user_id
    AND customer_id = NEW.customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill does not belong to this customer/account';
  END IF;

  SELECT * INTO v_credit
  FROM public.customer_ledger_entries
  WHERE id = NEW.credit_ledger_entry_id
    AND user_id = NEW.user_id
    AND customer_id = NEW.customer_id
    AND credit > 0
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation source must be a credit entry for the same customer/account';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_allocated_credit
  FROM public.invoice_allocations
  WHERE credit_ledger_entry_id = NEW.credit_ledger_entry_id
    AND id <> NEW.id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_allocated_bill
  FROM public.invoice_allocations
  WHERE bill_id = NEW.bill_id
    AND id <> NEW.id;

  IF v_allocated_credit + NEW.amount > v_credit.credit THEN
    RAISE EXCEPTION 'Allocation exceeds the available credit amount';
  END IF;

  IF v_allocated_bill + NEW.amount > v_bill.subtotal THEN
    RAISE EXCEPTION 'Allocation exceeds the bill amount';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_sync_opening_ledger ON public.customers;
CREATE TRIGGER customers_sync_opening_ledger
  AFTER INSERT OR UPDATE OF opening_due ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_customer_opening_ledger();

DROP TRIGGER IF EXISTS bills_post_to_customer_ledger ON public.bills;
CREATE TRIGGER bills_post_to_customer_ledger
  AFTER INSERT ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION private.post_bill_to_customer_ledger();

DROP TRIGGER IF EXISTS payments_post_to_customer_ledger ON public.payments;
CREATE TRIGGER payments_post_to_customer_ledger
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION private.post_payment_to_customer_ledger();

DROP TRIGGER IF EXISTS invoice_allocations_validate ON public.invoice_allocations;
CREATE TRIGGER invoice_allocations_validate
  BEFORE INSERT OR UPDATE ON public.invoice_allocations
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_invoice_allocation();

REVOKE ALL ON FUNCTION private.sync_customer_opening_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.post_bill_to_customer_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.post_payment_to_customer_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_invoice_allocation() FROM PUBLIC, anon, authenticated;

-- Backfill the existing financial history idempotently. No source records are edited or deleted.
INSERT INTO public.customer_ledger_entries (
  user_id, customer_id, entry_date, source_type, source_id,
  debit, credit, description, created_by, created_at
)
SELECT c.user_id, c.id, COALESCE(c.created_at::date, CURRENT_DATE),
       'opening_balance', c.id, c.opening_due, 0,
       'Opening balance', c.user_id, c.created_at
FROM public.customers c
WHERE c.opening_due > 0
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO public.customer_ledger_entries (
  user_id, customer_id, entry_date, source_type, source_id,
  debit, credit, description, created_by, created_at
)
SELECT b.user_id, b.customer_id, b.bill_date, 'bill', b.id,
       b.subtotal, 0, 'Bill ' || b.bill_no, b.user_id, b.created_at
FROM public.bills b
WHERE b.subtotal > 0
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

INSERT INTO public.customer_ledger_entries (
  user_id, customer_id, entry_date, source_type, source_id,
  debit, credit, description, created_by, created_at
)
SELECT p.user_id, p.customer_id, p.payment_date, 'payment', p.id,
       0, p.amount, COALESCE(NULLIF(p.notes, ''), 'Payment ' || p.payment_no),
       p.user_id, p.created_at
FROM public.payments p
WHERE p.amount > 0
ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

CREATE OR REPLACE VIEW public.customer_ledger_balances
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.user_id,
  c.name,
  c.phone,
  c.address,
  COALESCE(SUM(e.debit), 0)::numeric(12,2) AS total_debits,
  COALESCE(SUM(e.credit), 0)::numeric(12,2) AS total_credits,
  (COALESCE(SUM(e.debit), 0) - COALESCE(SUM(e.credit), 0))::numeric(12,2) AS current_balance
FROM public.customers c
LEFT JOIN public.customer_ledger_entries e
  ON e.customer_id = c.id
 AND e.user_id = c.user_id
GROUP BY c.id, c.user_id, c.name, c.phone, c.address;

REVOKE ALL ON TABLE public.customer_ledger_balances FROM anon, authenticated;
GRANT SELECT ON TABLE public.customer_ledger_balances TO authenticated;

COMMENT ON TABLE public.customer_ledger_entries IS
  'Append-oriented customer financial postings. Debits increase receivables; credits reduce receivables or create advances.';
COMMENT ON TABLE public.invoice_allocations IS
  'Maps one customer credit posting to a bill. Allocation does not create a second financial posting.';
COMMENT ON TABLE public.financial_operation_keys IS
  'Private idempotency registry for future financial RPC operations; not directly accessible to browser clients.';
COMMENT ON VIEW public.customer_ledger_balances IS
  'Signed customer balance from ledger entries; negative balances represent customer advances.';
