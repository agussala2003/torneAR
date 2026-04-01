-- tornear/supabase/migrations/20260401_profile_football_data.sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS date_of_birth  date,
  ADD COLUMN IF NOT EXISTS gender         text CHECK (gender IN ('M', 'F', 'X')),
  ADD COLUMN IF NOT EXISTS favorite_team  text,
  ADD COLUMN IF NOT EXISTS strong_foot    text CHECK (strong_foot IN ('RIGHT', 'LEFT', 'BOTH'));

COMMENT ON COLUMN profiles.date_of_birth  IS 'Fecha de nacimiento; requerido en onboarding';
COMMENT ON COLUMN profiles.gender         IS 'M | F | X; requerido en onboarding';
COMMENT ON COLUMN profiles.favorite_team  IS 'Club del que es hincha; opcional';
COMMENT ON COLUMN profiles.strong_foot    IS 'RIGHT | LEFT | BOTH; requerido en onboarding';
