import { Bell, Database, Settings, Shield } from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import '../../styles/admin.css';

export const SettingsPage = () => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <div className="admin-header">
          <h1>System Settings</h1>
          <p className="admin-subtitle">Configure global HRIS settings for HRMO operations</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Access Control</p>
              <p className="stat-value">Role Policies</p>
            </div>
            <div className="stat-icon" style={{ background: '#E3F2FD' }}>
              <Shield size={24} color="#1976D2" />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Notifications</p>
              <p className="stat-value">Email Alerts</p>
            </div>
            <div className="stat-icon" style={{ background: '#FFF3E0' }}>
              <Bell size={24} color="#F57C00" />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Data Settings</p>
              <p className="stat-value">Retention Rules</p>
            </div>
            <div className="stat-icon" style={{ background: '#E8F5E9' }}>
              <Database size={24} color="#388E3C" />
            </div>
          </div>
        </div>

        <div className="action-cards-grid">
          <div className="action-card primary">
            <div className="action-card-icon">
              <Settings size={24} />
            </div>
            <div className="action-card-content">
              <h3>General Preferences</h3>
              <p>Core platform settings and system defaults</p>
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-icon">
              <Shield size={24} />
            </div>
            <div className="action-card-content">
              <h3>Security</h3>
              <p>Password policy and account protection options</p>
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-icon">
              <Bell size={24} />
            </div>
            <div className="action-card-content">
              <h3>Notification Templates</h3>
              <p>Email and alert messaging for workflow updates</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};