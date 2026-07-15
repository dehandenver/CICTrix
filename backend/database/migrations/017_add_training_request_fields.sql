-- Migration 017: Add structured columns to training_requests
ALTER TABLE training_requests
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('Cultural Transformation', 'Employee Development', 'Leadership', 'Technical')),
  ADD COLUMN IF NOT EXISTS competency text,
  ADD COLUMN IF NOT EXISTS rationales text[],
  ADD COLUMN IF NOT EXISTS current_proficiency integer CHECK (current_proficiency >= 1 AND current_proficiency <= 5),
  ADD COLUMN IF NOT EXISTS desired_proficiency integer CHECK (desired_proficiency >= 1 AND desired_proficiency <= 5),
  ADD COLUMN IF NOT EXISTS after_training_metric text,
  ADD COLUMN IF NOT EXISTS post_training_proficiency integer CHECK (post_training_proficiency >= 1 AND post_training_proficiency <= 5);
