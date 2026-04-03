-- Add output_mode column to quotes table
-- The buildQuoteRow() function sends output_mode but the column was missing,
-- causing saveQuoteRemote to fail ("Felhő szinkron sikertelen").
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS output_mode text DEFAULT 'combined';
