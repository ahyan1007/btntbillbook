-- Advance payments, FIFO invoice allocation, and idempotent financial RPCs.
-- Depends on 20261010100000_accounting_core_foundation.sql.
-- Do not apply to production until migration-history reconciliation is complete
-- and the matching app/UI changes are reviewed and released together.

CREATE OR REPLACE FUNCTION private.allocate_customer_credits_fifo(
  p_user_id uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_opening_due numeric;
  v_cumulative_paid numeric := 0;
  v_opening_applied numeric;
  v_available numeric;
  v_allocated_from_credit numeric;
  v_allocated_to_bill numeric;
  v_bill_remaining numeric;
  v_to_allocate numeric;
  v_payment record;
  v_bill record;
BEGIN
  -- Serialize all allocation work for one customer, including direct table inserts.
  SELECT c.opening_due
    INTO v_opening_due
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_opening_due := COALESCE(v_opening_due, 0);

  -- Opening balance is paid first; only the remainder of each credit may settle bills.
  -- Existing allocations are retained. Re-running this function only fills gaps.
  FOR v_payment IN
    SELECT
      p.id AS payment_id,
      p.amount AS payment_amount,
      p.payment_date,
      p.created_at,
      e.id AS ledger_entry_id
    FROM public.payments p
    JOIN public.customer_ledger_entries e
      ON e.source_type = 'payment'
     AND e.source_id = p.id
     AND e.user_id = p.user_id
     AND e.customer_id = p.customer_id
    WHERE p.user_id = p_user_id
      AND p.customer_id = p_customer_id
    ORDER BY p.payment_date, p.created_at, p.id
  LOOP
    v_opening_applied := LEAST(
      v_payment.payment_amount,
      GREATEST(v_opening_due - v_cumulative_paid, 0)
    );
    v_available := GREATEST(v_payment.payment_amount - v_opening_applied, 0);

    SELECT COALESCE(SUM(a.amount), 0)
      INTO v_allocated_from_credit
    FROM public.invoice_allocations a
    WHERE a.credit_ledger_entry_id = v_payment.ledger_entry_id;

    v_available := GREATEST(v_available - v_allocated_from_credit, 0);

    IF v_available > 0 THEN
      FOR v_bill IN
        SELECT b.id, b.subtotal
        FROM public.bills b
        WHERE b.user_id = p_user_id
          AND b.customer_id = p_customer_id
          AND b.subtotal > 0
        ORDER BY b.bill_date, b.created_at, b.id
      LOOP
        EXIT WHEN v_available <= 0;

        SELECT COALESCE(SUM(a.amount), 0)
          INTO v_allocated_to_bill
        FROM public.invoice_allocations a
        WHERE a.bill_id = v_bill.id;

        v_bill_remaining := GREATEST(v_bill.subtotal - v_allocated_to_bill, 0);
        IF v_bill_remaining <= 0 THEN
          CONTINUE;
        END IF;

        v_to_allocate := LEAST(v_available, v_bill_remaining);
        IF v_to_allocate > 0 THEN
          INSERT INTO public.invoice_allocations (
            user_id, customer_id, bill_id, credit_ledger_entry_id,
            amount, allocation_date, description
          )
          VALUES (
            p_user_id, p_customer_id, v_bill.id, v_payment.ledger_entry_id,
            v_to_allocate, v_payment.payment_date,
            'Automatic FIFO allocation'
          )
          ON CONFLICT (credit_ledger_entry_id, bill_id) DO NOTHING;

          -- Count only what was actually inserted. A conflict may indicate an existing
          -- allocation on this source/invoice pair, which is included on the next pass.
          IF FOUND THEN
            v_available := v_available - v_to_allocate;
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_cumulative_paid := v_cumulative_paid + v_payment.payment_amount;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION private.allocate_customer_credits_fifo(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

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

  PERFORM private.allocate_customer_credits_fifo(NEW.user_id, NEW.customer_id);
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

  PERFORM private.allocate_customer_credits_fifo(NEW.user_id, NEW.customer_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.post_bill_to_customer_ledger()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.post_payment_to_customer_ledger()
  FROM PUBLIC, anon, authenticated;

-- Allocate legacy history into invoices FIFO. Existing source transactions are untouched.
DO $backfill$
DECLARE
  v_customer record;
BEGIN
  FOR v_customer IN
    SELECT c.user_id, c.id AS customer_id
    FROM public.customers c
    ORDER BY c.user_id, c.id
  LOOP
    PERFORM private.allocate_customer_credits_fifo(
      v_customer.user_id, v_customer.customer_id
    );
  END LOOP;
END;
$backfill$;

DROP FUNCTION IF EXISTS public.create_bill(uuid, date, jsonb, numeric, text, text);

CREATE FUNCTION public.create_bill(
  p_customer_id uuid,
  p_bill_date date,
  p_items jsonb,
  p_paid_now numeric,
  p_payment_method text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_signed_balance numeric(12,2);
  v_previous_due numeric(12,2);
  v_subtotal numeric(12,2);
  v_total_due numeric(12,2);
  v_advance numeric(12,2);
  v_bill_id uuid;
  v_bill_no text;
  v_operation_id uuid;
  v_request_hash text;
  v_existing_hash text;
  v_existing_response jsonb;
  v_completed_at timestamptz;
  v_response jsonb;
  v_item jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Bill must contain at least one item';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS entry(value)
    WHERE jsonb_typeof(entry.value) <> 'object'
       OR NULLIF(entry.value->>'amount', '') IS NULL
       OR (entry.value->>'amount') !~ '^[0-9]+([.][0-9]{1,2})?$'
  ) THEN
    RAISE EXCEPTION 'Every bill item must have a non-negative amount with at most two decimals';
  END IF;
  IF p_paid_now IS NULL OR p_paid_now < 0 THEN
    RAISE EXCEPTION 'Payment now cannot be negative';
  END IF;

  SELECT COALESCE(SUM((entry.value->>'amount')::numeric), 0)::numeric(12,2)
    INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS entry(value);

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Bill must contain a positive total';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'customer_id', p_customer_id,
    'bill_date', COALESCE(p_bill_date, CURRENT_DATE),
    'items', p_items,
    'paid_now', p_paid_now,
    'payment_method', COALESCE(NULLIF(p_payment_method, ''), 'Cash'),
    'notes', p_notes
  )::text);

  PERFORM 1
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  INSERT INTO public.financial_operation_keys (
    user_id, operation_type, idempotency_key, request_hash
  )
  VALUES (v_user, 'create_bill', p_idempotency_key, v_request_hash)
  ON CONFLICT (user_id, operation_type, idempotency_key) DO NOTHING;

  SELECT k.id, k.request_hash, k.response_payload, k.completed_at
    INTO v_operation_id, v_existing_hash, v_existing_response, v_completed_at
  FROM public.financial_operation_keys k
  WHERE k.user_id = v_user
    AND k.operation_type = 'create_bill'
    AND k.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_existing_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'Idempotency key was already used with a different request';
  END IF;
  IF v_completed_at IS NOT NULL AND v_existing_response IS NOT NULL THEN
    RETURN v_existing_response;
  END IF;
  IF v_completed_at IS NOT NULL OR v_existing_response IS NOT NULL THEN
    RAISE EXCEPTION 'Financial operation state is invalid; retry with the same key';
  END IF;

  SELECT COALESCE(SUM(e.debit - e.credit), 0)::numeric(12,2)
    INTO v_signed_balance
  FROM public.customer_ledger_entries e
  WHERE e.user_id = v_user AND e.customer_id = p_customer_id;

  v_previous_due := GREATEST(v_signed_balance, 0);
  v_total_due := GREATEST(v_signed_balance + v_subtotal - p_paid_now, 0);
  v_advance := GREATEST(-(v_signed_balance + v_subtotal - p_paid_now), 0);

  INSERT INTO public.bills (
    user_id, customer_id, bill_date, subtotal, previous_due,
    paid_now, total_due, notes
  )
  VALUES (
    v_user, p_customer_id, COALESCE(p_bill_date, CURRENT_DATE),
    v_subtotal, v_previous_due, p_paid_now, v_total_due, p_notes
  )
  RETURNING id, bill_no INTO v_bill_id, v_bill_no;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS items(value)
  LOOP
    INSERT INTO public.bill_items (
      bill_id, passenger_name, travel_date, service_type, details, amount
    )
    VALUES (
      v_bill_id,
      COALESCE(NULLIF(v_item->>'passenger_name', ''), 'Passenger'),
      NULLIF(v_item->>'travel_date', '')::date,
      COALESCE(NULLIF(v_item->>'service_type', ''), 'Flight Ticket'),
      NULLIF(v_item->>'details', ''),
      (v_item->>'amount')::numeric
    );
  END LOOP;

  IF p_paid_now > 0 THEN
    INSERT INTO public.payments (
      user_id, customer_id, payment_date, amount, payment_method, notes
    )
    VALUES (
      v_user, p_customer_id, COALESCE(p_bill_date, CURRENT_DATE), p_paid_now,
      COALESCE(NULLIF(p_payment_method, ''), 'Cash'),
      'Payment received with ' || v_bill_no
    );
  END IF;

  SELECT COALESCE(SUM(e.debit - e.credit), 0)::numeric(12,2)
    INTO v_signed_balance
  FROM public.customer_ledger_entries e
  WHERE e.user_id = v_user AND e.customer_id = p_customer_id;

  v_response := jsonb_build_object(
    'bill_id', v_bill_id,
    'bill_no', v_bill_no,
    'previous_due', v_previous_due,
    'subtotal', v_subtotal,
    'paid_now', p_paid_now,
    'total_due', GREATEST(v_signed_balance, 0),
    'current_balance', v_signed_balance,
    'advance_amount', GREATEST(-v_signed_balance, 0)
  );

  UPDATE public.financial_operation_keys
  SET response_payload = v_response, completed_at = now()
  WHERE id = v_operation_id;

  RETURN v_response;
END;
$function$;

DROP FUNCTION IF EXISTS public.record_payment(uuid, date, numeric, text, text);

CREATE FUNCTION public.record_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_signed_balance numeric(12,2);
  v_previous_due numeric(12,2);
  v_remaining_due numeric(12,2);
  v_advance numeric(12,2);
  v_payment_id uuid;
  v_payment_no text;
  v_operation_id uuid;
  v_request_hash text;
  v_existing_hash text;
  v_existing_response jsonb;
  v_completed_at timestamptz;
  v_response jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment must be greater than zero';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'customer_id', p_customer_id,
    'payment_date', COALESCE(p_payment_date, CURRENT_DATE),
    'amount', p_amount,
    'payment_method', COALESCE(NULLIF(p_payment_method, ''), 'Cash'),
    'notes', p_notes
  )::text);

  PERFORM 1
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  INSERT INTO public.financial_operation_keys (
    user_id, operation_type, idempotency_key, request_hash
  )
  VALUES (v_user, 'record_payment', p_idempotency_key, v_request_hash)
  ON CONFLICT (user_id, operation_type, idempotency_key) DO NOTHING;

  SELECT k.id, k.request_hash, k.response_payload, k.completed_at
    INTO v_operation_id, v_existing_hash, v_existing_response, v_completed_at
  FROM public.financial_operation_keys k
  WHERE k.user_id = v_user
    AND k.operation_type = 'record_payment'
    AND k.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_existing_hash IS DISTINCT FROM v_request_hash THEN
    RAISE EXCEPTION 'Idempotency key was already used with a different request';
  END IF;
  IF v_completed_at IS NOT NULL AND v_existing_response IS NOT NULL THEN
    RETURN v_existing_response;
  END IF;
  IF v_completed_at IS NOT NULL OR v_existing_response IS NOT NULL THEN
    RAISE EXCEPTION 'Financial operation state is invalid; retry with the same key';
  END IF;

  SELECT COALESCE(SUM(e.debit - e.credit), 0)::numeric(12,2)
    INTO v_signed_balance
  FROM public.customer_ledger_entries e
  WHERE e.user_id = v_user AND e.customer_id = p_customer_id;

  v_previous_due := GREATEST(v_signed_balance, 0);

  INSERT INTO public.payments (
    user_id, customer_id, payment_date, amount, payment_method, notes
  )
  VALUES (
    v_user, p_customer_id, COALESCE(p_payment_date, CURRENT_DATE),
    p_amount, COALESCE(NULLIF(p_payment_method, ''), 'Cash'), p_notes
  )
  RETURNING id, payment_no INTO v_payment_id, v_payment_no;

  SELECT COALESCE(SUM(e.debit - e.credit), 0)::numeric(12,2)
    INTO v_signed_balance
  FROM public.customer_ledger_entries e
  WHERE e.user_id = v_user AND e.customer_id = p_customer_id;

  v_remaining_due := GREATEST(v_signed_balance, 0);
  v_advance := GREATEST(-v_signed_balance, 0);

  v_response := jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_no', v_payment_no,
    'previous_due', v_previous_due,
    'paid', p_amount,
    'remaining_due', v_remaining_due,
    'current_balance', v_signed_balance,
    'advance_amount', v_advance
  );

  UPDATE public.financial_operation_keys
  SET response_payload = v_response, completed_at = now()
  WHERE id = v_operation_id;

  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_bill(uuid, date, jsonb, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment(uuid, date, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_bill(uuid, date, jsonb, numeric, text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, date, numeric, text, text, uuid)
  TO authenticated;

-- Keep PostgREST's exposed function cache in sync with the changed RPC signatures.
NOTIFY pgrst, 'reload schema';
