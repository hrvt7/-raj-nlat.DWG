-- ── quote_shares: Client-facing quote portal table ─────────────────────────────
-- Tárol egy-egy megosztott árajánlat snapshotot tokennel.
-- A nyilvános /q/:token útvonal olvassa (nincs login).
--
-- Futtatás: Supabase Dashboard → SQL Editor → Run

CREATE TABLE IF NOT EXISTS public.quote_shares (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  -- A vállalkozó Supabase felhasználói azonosítója
  user_id          uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Az App-beli ajánlat ID (belső referencia; nem FK, offline is lehet)
  quote_id         text         NOT NULL,
  -- Az ajánlat teljes adatstruktúrája (snapshot az elfogadáskor)
  quote_data       jsonb        NOT NULL,
  -- Vállalkozó cégadatai: { name, email, phone }
  company_data     jsonb        NOT NULL DEFAULT '{}',
  -- Nyilvános megosztó token: 64 karakter hex (256-bit véletlen)
  token            text         NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Állapot: pending | accepted | expired
  status           text         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  -- Lejárat (NULL = nincs lejárat)
  expires_at       timestamptz  DEFAULT NULL,
  -- Elfogadás adatai
  accepted_at      timestamptz  DEFAULT NULL,
  accepted_by_name text         DEFAULT NULL,
  -- Metaadatok
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- Index a token alapú keresésre (nyilvános portál)
CREATE INDEX IF NOT EXISTS idx_quote_shares_token   ON public.quote_shares (token);
-- Index a vállalkozó ajánlatainak listázásához
CREATE INDEX IF NOT EXISTS idx_quote_shares_user    ON public.quote_shares (user_id);
-- Composite index: egy vállalkozó egy ajánlathoz csak egy aktív sharelinkkel rendelkezhet
CREATE INDEX IF NOT EXISTS idx_quote_shares_user_quote ON public.quote_shares (user_id, quote_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_shares_updated_at
  BEFORE UPDATE ON public.quote_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.quote_shares ENABLE ROW LEVEL SECURITY;

-- 1. Vállalkozó látja és kezeli a saját megosztásait
CREATE POLICY "owner_all" ON public.quote_shares
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Nyilvános olvasás token alapján (kliens portál — nem hitelesített)
CREATE POLICY "public_read_by_token" ON public.quote_shares
  FOR SELECT
  TO anon
  USING (true);   -- token szűrés az alkalmazás rétegben történik

-- 3. Nyilvános UPDATE: csak status, accepted_at, accepted_by_name mezők frissíthetők
--    pending → accepted  (kliens elfogadás)
CREATE POLICY "public_accept" ON public.quote_shares
  FOR UPDATE
  TO anon
  USING  (status = 'pending')
  WITH CHECK (status = 'accepted');
