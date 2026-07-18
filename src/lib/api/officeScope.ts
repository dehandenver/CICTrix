import { supabase } from '../supabase';

export interface OfficeScope {
  officeId: string | null;
  officeName: string | null;
}

export const norm = (v: any) => String(v ?? '').trim().toLowerCase();

export async function getAcceptedOfficeNames(scope?: OfficeScope | null): Promise<Set<string> | null> {
  if (!scope || (!scope.officeId && !scope.officeName)) return null;
  const names = new Set<string>();
  if (scope.officeName) names.add(norm(scope.officeName));
  if (scope.officeId) {
    const { data } = await (supabase as any)
      .from('departments')
      .select('name')
      .eq('id', scope.officeId)
      .maybeSingle();
    if (data?.name) names.add(norm(data.name));
  }
  return names;
}
