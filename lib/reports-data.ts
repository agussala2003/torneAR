import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

export type ReportEntityType = Database['public']['Enums']['report_entity_type'];

interface SubmitContentReportParams {
  reporterId: string;
  entityType: ReportEntityType;
  entityId: string;
  reason: string;
}

/**
 * Denuncia de un perfil o un partido. INSERT directo (no RPC): la RLS de
 * `content_reports` ya exige `reporter_id = mi profile.id` en el
 * `WITH CHECK`, así que no hace falta una función intermedia sólo para
 * repetir esa misma validación del lado del servidor.
 */
export async function submitContentReport({
  reporterId,
  entityType,
  entityId,
  reason,
}: SubmitContentReportParams): Promise<void> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    reported_entity_type: entityType,
    reported_entity_id: entityId,
    reason,
  });

  if (error) {
    throw error;
  }
}
