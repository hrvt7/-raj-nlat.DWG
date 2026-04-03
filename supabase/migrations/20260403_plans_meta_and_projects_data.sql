-- Migration: Create plans_meta JSONB blob table + add data column to projects
-- Required for: remote persistence of plan metadata and projects (user_id-scoped JSONB blobs)
-- The app stores these as { user_id, data: [...] } arrays, matching the pattern used by
-- settings, work_items, materials, and assemblies tables.

-- Create plans_meta table (new — was missing, causing savePlansRemote to fail silently)
CREATE TABLE IF NOT EXISTS public.plans_meta (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT plans_meta_user_id_key UNIQUE (user_id)
);

-- Add data JSONB column to projects table (projects table had structured columns only,
-- but the app's upsertUserBlob expects a data JSONB column)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '[]'::jsonb;

-- Add unique constraint on projects.user_id so upsertUserBlob's onConflict: 'user_id' works
-- (original table had non-unique index only)
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_unique UNIQUE (user_id);

-- Enable RLS on plans_meta
ALTER TABLE public.plans_meta ENABLE ROW LEVEL SECURITY;

-- RLS policies for plans_meta (same pattern as other blob tables)
CREATE POLICY "plans_meta_select_own" ON public.plans_meta FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "plans_meta_insert_own" ON public.plans_meta FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plans_meta_update_own" ON public.plans_meta FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "plans_meta_delete_own" ON public.plans_meta FOR DELETE USING (auth.uid() = user_id);
