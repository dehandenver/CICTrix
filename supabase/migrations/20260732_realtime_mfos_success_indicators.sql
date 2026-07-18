-- Safety net: Enable realtime replication for mfos and success_indicators
-- Created: 2026-07-18

DO  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE mfos;
EXCEPTION WHEN duplicate_object THEN NULL; END ;

DO  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE success_indicators;
EXCEPTION WHEN duplicate_object THEN NULL; END ;
