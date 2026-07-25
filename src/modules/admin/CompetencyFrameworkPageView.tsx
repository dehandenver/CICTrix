import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { PMCompetencyFramework } from './pm/PMCompetencyFramework';
import { readAdminSession } from '../../lib/adminSession';

/**
 * Competency Framework module shell.
 *
 * Lands directly on Competency Management (Position Requirements + Competency
 * Map). The former AI "Competency Gap Report" was removed as redundant — the
 * Summary of Ratings page is the single source of AI-based competency insights.
 */
export const CompetencyFrameworkPage = ({ isDashboardView = false }: { isDashboardView?: boolean }) => {
  const session = readAdminSession();
  const isSuper = session?.role === 'super-admin';
  const userName = isSuper ? 'Super Admin' : 'PM Admin';
  const divisionLabel = isSuper ? 'System Administrator' : 'Performance Management';
  const sidebarRole = isSuper ? 'super-admin' : 'pm';
  const sidebarModule = isSuper ? 'Super' : 'PM';

  const content = <PMCompetencyFramework />;

  if (isDashboardView) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName={userName} divisionLabel={divisionLabel} />
      <div className="admin-layout">
        <Sidebar activeModule={sidebarModule} userRole={sidebarRole} />
        <main className="admin-content">{content}</main>
      </div>
    </div>
  );
};
