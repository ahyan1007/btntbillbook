-- Persist the user-selected payment receipt generation timestamp.
-- This is document metadata only; payment date, amount, and ledger postings are unchanged.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_payment_receipt_generated_at(
  p_payment_id uuid,
  p_receipt_generated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_receipt_generated_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_payment_id IS NULL OR p_receipt_generated_at IS NULL THEN
    RAISE EXCEPTION 'Payment and receipt generated date/time are required';
  END IF;

  UPDATE public.payments
  SET receipt_generated_at = p_receipt_generated_at
  WHERE id = p_payment_id
    AND user_id = v_user
  RETURNING receipt_generated_at INTO v_receipt_generated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for this admin account';
  END IF;

  RETURN jsonb_build_object(
    'receipt_generated_at', v_receipt_generated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_payment_receipt_generated_at(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_payment_receipt_generated_at(uuid, timestamptz)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
