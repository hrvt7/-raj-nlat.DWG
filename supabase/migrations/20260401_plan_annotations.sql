-- ── plan_annotations: Per-plan annotation backup ────────────────────────────
-- Tárolja a tervrajz annotációkat (markerek, kábelek, mérések) felhasználónként.
-- Local-first: az IndexedDB az elsődleges, ez a remote backup.
--
-- Futtatás: Supabase Dashboard → SQL Editor → Run

CREATE TABLE IF NOT EXISTS public.plan_annotations (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  -- A felhasználó Supabase azonosítója
  user_id          uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Az app-beli terv ID (belső referencia; nem FK, offline is lehet)
  plan_id          text         NOT NULL,
  -- Az annotáció teljes adatstruktúrája (markerek, kábelek, mérések)
  data             jsonb        NOT NULL DEFAULT '{}',
  -- Metaadatok
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  -- Egy felhasználó egy tervhez csak egy annotation rekordot tarthat
  UNIQUE (user_id, plan_id)
);

-- Index a felhasználó terveinek listázásához
CREATE INDEX IF NOT EXISTS idx_plan_annotations_user ON public.plan_annotations (user_id);
-- Index a plan_id alapú keresésre
CREATE INDEX IF NOT EXISTS idx_plan_annotations_plan ON public.plan_annotations (plan_id);

-- Auto-update updated_at (reuse existing function if available)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER plan_annotations_updated_at
  BEFORE UPDATE ON public.plan_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.plan_annotations ENABLE ROW LEVEL SECURITY;

-- Felhasználó csak a saját annotációit látja és kezeli
CREATE POLICY "owner_all" ON public.plan_annotations
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
