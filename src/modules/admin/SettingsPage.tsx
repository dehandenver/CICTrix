import { useState, useEffect } from 'react';
import { Bell, Database, Settings, Shield, Mail, Palette, Globe, User, Check, AlertCircle } from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import '../../styles/admin.css';

interface UserSettings {
  email_notifications_enabled: boolean;
  notification_frequency: string;
  profile_visibility: string;
  preferred_language: string;
  timezone: string;
  work_mode?: string;
}

interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
}

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const tabs = [
    { id: 'profile', label: 'Profile Settings', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System Settings', icon: Settings },
    { id: 'email', label: 'Email Configuration', icon: Mail },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'localization', label: 'Localization', icon: Globe },
  ];

  useEffect(() => {
    fetchSettings();
    fetchProfile();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/settings/me');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchProfile = async () => {
    try {
      // Get user info from localStorage (set during login/auth)
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        // Mock profile data - in production, fetch from API
        setProfile({
          first_name: user.first_name || 'Juan',
          last_name: user.last_name || 'Dela Cruz',
          email: user.email || 'juan.delacruz@iloilo.gov.ph',
          role: user.role || 'RSP',
          department: user.department || 'Human Resource Management Office',
        });
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setLoading(false);
    }
  };

  const handleSettingChange = async (section: string, key: string, value: any) => {
    try {
      const endpoint = `http://localhost:8000/api/settings/${section}`;
      const payload = { [key]: value };

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSettings(prev => prev ? { ...prev, [key]: value } : null);
        setSuccess(`${section.charAt(0).toUpperCase() + section.slice(1)} setting updated successfully!`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to update setting');
      }
    } catch (err) {
      setError('Error updating setting');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-content">
          <div className="admin-header">
            <h1>Settings</h1>
          </div>
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <div className="admin-header">
          <h1>Settings</h1>
          <p className="admin-subtitle">Manage your personal information and account details</p>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
          {/* Left Sidebar Navigation */}
          <div style={{
            width: '280px',
            borderRight: '1px solid #e0e0e0',
            paddingRight: '16px',
          }}>
            <nav>
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      marginBottom: '8px',
                      border: 'none',
                      borderRadius: '8px',
                      background: activeTab === tab.id ? '#E3F2FD' : 'transparent',
                      color: activeTab === tab.id ? '#1976D2' : '#666',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '14px',
                      fontWeight: activeTab === tab.id ? '600' : '500',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <TabIcon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Content Area */}
          <div style={{ flex: 1 }}>
            {error && (
              <div style={{
                padding: '12px 16px',
                marginBottom: '16px',
                background: '#FFEBEE',
                border: '1px solid #EF5350',
                borderRadius: '8px',
                color: '#C62828',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            {success && (
              <div style={{
                padding: '12px 16px',
                marginBottom: '16px',
                background: '#E8F5E9',
                border: '1px solid #66BB6A',
                borderRadius: '8px',
                color: '#2E7D32',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Check size={18} />
                {success}
              </div>
            )}

            {/* PROFILE SETTINGS */}
            {activeTab === 'profile' && profile && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Profile Settings</h2>
                <p style={{ color: '#999', marginBottom: '24px' }}>Personal information is view-only in this screen.</p>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                  marginBottom: '32px',
                  paddingBottom: '32px',
                  borderBottom: '1px solid #e0e0e0',
                }}>
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    background: '#E3F2FD',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <User size={48} color="#1976D2" />
                  </div>
                  <button style={{
                    padding: '12px 24px',
                    background: '#003399',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}>
                    Change Photo
                  </button>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#333' }}>First Name</span>
                    <span style={{ color: '#666' }}>{profile.first_name}</span>
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#333' }}>Last Name</span>
                    <span style={{ color: '#666' }}>{profile.last_name}</span>
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#333' }}>Email Address</span>
                    <span style={{ color: '#666' }}>{profile.email}</span>
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#333' }}>Role</span>
                    <span style={{ color: '#666' }}>{profile.role}</span>
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                    Department
                  </label>
                  <select
                    defaultValue={profile.department}
                    onChange={(e) => console.log('Department changed:', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#666',
                    }}
                  >
                    <option>{profile.department}</option>
                    <option>Human Resource Management Office</option>
                    <option>Finance Department</option>
                    <option>Operations Department</option>
                  </select>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && settings && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Notifications</h2>

                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e0e0e0' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Email Notifications</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.email_notifications_enabled}
                      onChange={(e) => handleSettingChange('notifications', 'email_notifications_enabled', e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: '#333' }}>Enable email notifications for important updates</span>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                    Notification Frequency
                  </label>
                  <select
                    value={settings.notification_frequency}
                    onChange={(e) => handleSettingChange('notifications', 'notification_frequency', e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '300px',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="never">Never</option>
                  </select>
                </div>
              </div>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Security</h2>

                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e0e0e0' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Password</h3>
                  <p style={{ color: '#666', marginBottom: '12px' }}>Change your account password</p>
                  <button style={{
                    padding: '10px 20px',
                    background: '#003399',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}>
                    Change Password
                  </button>
                </div>

                <div>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Two-Factor Authentication</h3>
                  <p style={{ color: '#666', marginBottom: '12px' }}>Add an extra layer of security to your account</p>
                  <button style={{
                    padding: '10px 20px',
                    background: 'white',
                    color: '#003399',
                    border: '2px solid #003399',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}>
                    Enable 2FA
                  </button>
                </div>
              </div>
            )}

            {/* SYSTEM SETTINGS */}
            {activeTab === 'system' && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>System Settings</h2>
                <div className="stats-grid" style={{ marginBottom: '24px' }}>
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
                      <p className="stat-label">Data Settings</p>
                      <p className="stat-value">Retention Rules</p>
                    </div>
                    <div className="stat-icon" style={{ background: '#E8F5E9' }}>
                      <Database size={24} color="#388E3C" />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Data Retention</h3>
                  <p style={{ color: '#666', marginBottom: '12px' }}>Configure how long data is kept in the system</p>
                  <select style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}>
                    <option>6 months</option>
                    <option>1 year</option>
                    <option>2 years</option>
                    <option>5 years</option>
                  </select>
                </div>
              </div>
            )}

            {/* EMAIL CONFIGURATION */}
            {activeTab === 'email' && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Email Configuration</h2>

                <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e0e0e0' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Email Address</h3>
                  <input
                    type="email"
                    defaultValue={profile?.email}
                    disabled
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      background: '#f5f5f5',
                      color: '#666',
                    }}
                  />
                </div>

                <div>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Email Templates</h3>
                  <p style={{ color: '#666', marginBottom: '16px' }}>Customize email messages for workflow updates</p>
                  <button style={{
                    padding: '10px 20px',
                    background: '#003399',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}>
                    Configure Templates
                  </button>
                </div>
              </div>
            )}

            {/* APPEARANCE */}
            {activeTab === 'appearance' && settings && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Appearance</h2>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                    Language
                  </label>
                  <select
                    value={settings.preferred_language}
                    onChange={(e) => handleSettingChange('appearance', 'preferred_language', e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '300px',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      marginBottom: '24px',
                    }}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="tl">Tagalog</option>
                  </select>
                </div>
              </div>
            )}

            {/* LOCALIZATION */}
            {activeTab === 'localization' && settings && (
              <div>
                <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: '600' }}>Localization</h2>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                    Timezone
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => handleSettingChange('localization', 'timezone', e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="Asia/Manila">Manila (UTC+8)</option>
                    <option value="Asia/Bangkok">Bangkok (UTC+7)</option>
                    <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                    <option value="America/New_York">New York (UTC-5)</option>
                    <option value="Europe/London">London (UTC+0)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
                    Language
                  </label>
                  <select
                    value={settings.preferred_language}
                    onChange={(e) => handleSettingChange('localization', 'preferred_language', e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="tl">Tagalog</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};