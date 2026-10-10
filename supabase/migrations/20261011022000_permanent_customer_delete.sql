-- Permanently delete a customer and all customer-owned financial history.
-- This RPC is intentionally explicit and transactional. The caller must confirm
-- the irreversible action in the UI before invoking it.
-- No existing customer records are deleted by this migration.

CREATE OR REPLACE FUNCTION public.delete_customer_permanently(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_customer_name text;
  v_bill_ids text[] := ARRAY[]::text[];
  v_payment_ids text[] := ARRAY[]::text[];
  v_bill_count integer := 0;
  v_bill_item_count integer := 0;
  v_payment_count integer := 0;
  v_ledger_entry_count integer := 0;
  v_allocation_count integer := 0;
  v_operation_key_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer ID is required';
  END IF;

  SELECT c.name
    INTO v_customer_name
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.user_id = v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Refuse cross-customer reversal references rather than silently altering
  -- another customer's accounting history. All changes in this RPC are atomic.
  IF EXISTS (
    SELECT 1
    FROM public.customer_ledger_entries external_entry
    WHERE external_entry.customer_id <> p_customer_id
      AND external_entry.reverses_entry_id IN (
        SELECT e.id
        FROM public.customer_ledger_entries e
        WHERE e.customer_id = p_customer_id
          AND e.user_id = v_user
      )
  ) THEN
    RAISE EXCEPTION 'Cannot delete this customer because another customer ledger entry reverses their history. Reconcile that reference first.';
  END IF;

  SELECT COALESCE(array_agg(b.id::text), ARRAY[]::text[])
    INTO v_bill_ids
  FROM public.bills b
  WHERE b.customer_id = p_customer_id
    AND b.user_id = v_user;

  SELECT COALESCE(array_agg(p.id::text), ARRAY[]::text[])
    INTO v_payment_ids
  FROM public.payments p
  WHERE p.customer_id = p_customer_id
    AND p.user_id = v_user;

  SELECT cardinality(v_bill_ids) INTO v_bill_count;
  SELECT cardinality(v_payment_ids) INTO v_payment_count;

  -- Delete allocation links first because they reference both bills and ledger rows.
  DELETE FROM public.invoice_allocations a
  WHERE a.customer_id = p_customer_id
    AND a.user_id = v_user
    OR a.bill_id::text = ANY(v_bill_ids)
    OR a.credit_ledger_entry_id IN (
      SELECT e.id
      FROM public.customer_ledger_entries e
      WHERE e.customer_id = p_customer_id
        AND e.user_id = v_user
    );
  GET DIAGNOSTICS v_allocation_count = ROW_COUNT;

  DELETE FROM public.bill_items bi
  WHERE bi.bill_id::text = ANY(v_bill_ids);
  GET DIAGNOSTICS v_bill_item_count = ROW_COUNT;

  DELETE FROM public.bills b
  WHERE b.customer_id = p_customer_id
    AND b.user_id = v_user;

  DELETE FROM public.payments p
  WHERE p.customer_id = p_customer_id
    AND p.user_id = v_user;

  -- The ledger has a RESTRICT self-FK for reversals. Clear references only
  -- inside the set that is about to be deleted, then remove that set atomically.
  UPDATE public.customer_ledger_entries e
  SET reverses_entry_id = NULL
  WHERE e.customer_id = p_customer_id
    AND e.user_id = v_user
    AND e.reverses_entry_id IS NOT NULL;

  DELETE FROM public.customer_ledger_entries e
  WHERE e.customer_id = p_customer_id
    AND e.user_id = v_user;
  GET DIAGNOSTICS v_ledger_entry_count = ROW_COUNT;

  -- Remove idempotency responses that point at the deleted customer's source
  -- records, preventing the operation log from retaining these bill/payment IDs.
  DELETE FROM public.financial_operation_keys k
  WHERE k.user_id = v_user
    AND (
      k.response_payload->>'customer_id' = p_customer_id::text
      OR k.response_payload->>'bill_id' = ANY(v_bill_ids)
      OR k.response_payload->>'payment_id' = ANY(v_payment_ids)
    );
  GET DIAGNOSTICS v_operation_key_count = ROW_COUNT;

  DELETE FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer deletion did not complete';
  END IF;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_name', v_customer_name,
    'deleted_bills', v_bill_count,
    'deleted_bill_items', v_bill_item_count,
    'deleted_payments', v_payment_count,
    'deleted_ledger_entries', v_ledger_entry_count,
    'deleted_allocations', v_allocation_count,
    'deleted_operation_keys', v_operation_key_count,
    'permanently_deleted', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_customer_permanently(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_permanently(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_customer_permanently(uuid) IS
  'Irreversibly deletes an admin-owned customer and that customer''s bills, bill items, payments, ledger entries, invoice allocations, and related idempotency responses in one transaction.';
