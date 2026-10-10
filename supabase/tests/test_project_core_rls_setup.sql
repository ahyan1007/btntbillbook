-- TEST PROJECT ONLY — do not run this script on Production and do not use it as a production migration.
-- Purpose: make the legacy core-table RLS policy setup repeatable for the isolated
-- btntbillbook-accounting-test project, where the original seven historical migrations
-- are not available as individual files in this repository.
-- This changes schema policies only; it does not insert, update, or delete business data.
-- Review any changes to these predicates before using them in a production migration.

BEGIN;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_select_own ON public.admin_users;
CREATE POLICY admin_users_select_own
  ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND role = 'admin');

DROP POLICY IF EXISTS customers_select_own ON public.customers;
CREATE POLICY customers_select_own
  ON public.customers
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_insert_own ON public.customers;
CREATE POLICY customers_insert_own
  ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_update_own ON public.customers;
CREATE POLICY customers_update_own
  ON public.customers
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customers_delete_own ON public.customers;
CREATE POLICY customers_delete_own
  ON public.customers
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bills_select_own ON public.bills;
CREATE POLICY bills_select_own
  ON public.bills
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bills_insert_own ON public.bills;
CREATE POLICY bills_insert_own
  ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS bill_items_select_own ON public.bill_items;
CREATE POLICY bill_items_select_own
  ON public.bill_items
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_admin())
    AND EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS bill_items_insert_own ON public.bill_items;
CREATE POLICY bill_items_insert_own
  ON public.bill_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_admin())
    AND EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id AND b.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own
  ON public.payments
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS payments_insert_own ON public.payments;
CREATE POLICY payments_insert_own
  ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) AND user_id = (SELECT auth.uid()));

COMMIT;
