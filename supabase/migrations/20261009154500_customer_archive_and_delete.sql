-- Safely remove customers from day-to-day lists without destroying financial history.
-- Apply this migration before deploying the matching admin UI changes.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS customers_user_archived_name_idx
  ON public.customers (user_id, is_archived, name);

-- Allow verified admins to permanently delete only customers that have no bill/payment
-- history (the UI checks history first; foreign keys remain the final safeguard).
DROP POLICY IF EXISTS customers_admin_delete ON public.customers;

CREATE POLICY customers_admin_delete
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (SELECT private.is_admin())
  );
