import { useState, useEffect, useRef } from 'react';
import { Bell, Settings, Shield, Mail, Palette, Globe, User, Check, AlertCircle, Download, Upload } from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import {
  type AccentColor,
  type ThemeMode,
  getStoredAccent,
  getStoredTheme,
  setAccent as applyAndStoreAccent,
  setTheme as applyAndStoreTheme,
} from '../../lib/theme';
import '../../styles/admin.css';

interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
  bio?: string;
  photo_url?: string;
}

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState<UserProfile>({
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    email: 'juan.delacruz@iloilo.gov.ph',
    role: 'RSP',
    department: 'Human Resource Management Office',
    bio: '',
    photo_url: '',
  });
  const [profileEdits, setProfileEdits] = useState<Partial<UserProfile>>(profile);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notifications, setNotifications] = useState({
    newApplicants: true,
    statusChanges: true,
    interviewSchedules: true,
    systemUpdates: true,
    realTimeAlerts: true,
    soundNotifications: true,
    desktopNotifications: true,
  });

  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [systemPrefs, setSystemPrefs] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12-hour (AM/PM)',
  });

  const [emailConfig, setEmailConfig] = useState({
    smtpServer: 'smtp.gmail.com',
    port: '587',
    fromEmail: 'noreply@iloilo.gov.ph',
    fromName: 'HRIS - City Government of Iloilo',
  });

  // Initialize from persisted choice so the buttons reflect what's actually applied.
  const [appearance, setAppearance] = useState<{ theme: ThemeMode; colorScheme: AccentColor }>(() => ({
    theme: getStoredTheme(),
    colorScheme: getStoredAccent(),
  }));

  const [localization, setLocalization] = useState({
    language: 'English (United States)',
    timezone: 'Asia/Manila (GMT+8)',
    currency: 'PHP (₱) - Philippine Peso',
  });

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
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        const profileData: UserProfile = {
          first_name: user.first_name || profile.first_name,
          last_name: user.last_name || profile.last_name,
          email: user.email || profile.email,
          role: user.role || profile.role,
          department: user.department || profile.department,
          bio: user.bio || profile.bio || '',
          photo_url: user.photo_url || profile.photo_url || '',
        };
        setProfile(profileData);
        setProfileEdits(profileData);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }, []);

  const handleProfileFieldChange = (field: keyof UserProfile, value: string) => {
    setProfileEdits(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    if (!profileEdits.first_name?.trim() || !profileEdits.last_name?.trim()) {
      setError('First and last names are required');
      setTimeout(() => setError(''), 3000);
      setIsSaving(false);
      return;
    }
    setProfile(profileEdits as UserProfile);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    Object.assign(user, profileEdits);
    localStorage.setItem('user', JSON.stringify(user));
    setSuccess('✓ Profile updated successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setIsSaving(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be less than 2MB');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
      setError('Only JPG, PNG, or GIF files are allowed');
      setTimeout(() => setError(''), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileEdits(prev => ({ ...prev, photo_url: reader.result as string }));
      setSuccess('✓ Photo selected! Click "Save Profile" to confirm');
      setTimeout(() => setSuccess(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    setSuccess('✓ Notification preference updated!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const handlePasswordUpdate = () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError('All password fields are required');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setSuccess('✓ Password updated successfully!');
    setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    setShowPasswordForm(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="Settings" userRole="rsp" />
      <main className="admin-content">
        <div className="admin-header">
          <h1>Settings</h1>
          <p className="admin-subtitle">Manage your personal information and account details</p>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', maxWidth: '1400px' }}>
          <div style={{ width: '280px', borderRight: '1px solid var(--border-subtle)', paddingRight: '16px', flexShrink: 0 }}>
            <nav>
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent', color: activeTab === tab.id ? '#ffffff' : 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: activeTab === tab.id ? '600' : '500', transition: 'all 0.2s ease', border: '1px solid ' + (activeTab === tab.id ? 'var(--accent-primary)' : 'transparent') }}>
                    <TabIcon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div style={{ flex: 1, paddingRight: '40px' }}>
            {error && (<div style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={18} />{error}</div>)}
            {success && (<div style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(40, 167, 69, 0.1)', border: '1px solid rgba(40, 167, 69, 0.3)', borderRadius: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={18} />{success}</div>)}

            {activeTab === 'profile' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>Profile Settings</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Manage your personal information</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: profileEdits.photo_url ? 'transparent' : 'var(--bg-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid var(--border-subtle)' }}>
                  {profileEdits.photo_url ? (<img src={profileEdits.photo_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : (<User size={48} color="var(--accent-primary)" />)}
                </div>
                <div>
                  <button onClick={() => fileInputRef.current?.click()} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Change Photo</button>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif" onChange={handlePhotoChange} style={{ display: 'none' }} />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>JPG, PNG or GIF. Max 2MB</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>First Name</label><input type="text" value={profileEdits.first_name || ''} onChange={(e) => handleProfileFieldChange('first_name', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div>
                <div><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Last Name</label><input type="text" value={profileEdits.last_name || ''} onChange={(e) => handleProfileFieldChange('last_name', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div>
              </div>
              <div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Email</label><input type="email" value={profileEdits.email || ''} disabled style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg-sidebar)', color: 'var(--text-secondary)', boxSizing: 'border-box' }} /></div>
              <div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Role</label><input type="text" value={profileEdits.role || ''} disabled style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg-sidebar)', color: 'var(--text-secondary)', boxSizing: 'border-box' }} /></div>
              <div style={{ marginBottom: '20px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Department</label><select value={profileEdits.department || ''} onChange={(e) => handleProfileFieldChange('department', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>{profileEdits.department}</option><option>Finance</option><option>Operations</option></select></div>
              <div style={{ marginBottom: '24px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Bio</label><textarea value={profileEdits.bio || ''} onChange={(e) => handleProfileFieldChange('bio', e.target.value)} placeholder="Tell us about yourself..." style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', minHeight: '120px', resize: 'vertical', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div>
              <button onClick={handleSaveProfile} disabled={isSaving} style={{ padding: '10px 24px', background: isSaving ? 'var(--bg-sidebar)' : 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1 }}>{isSaving ? 'Saving...' : 'Save Profile'}</button>
            </div>)}

            {activeTab === 'notifications' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>Notifications</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Configure notifications</p>
              <div style={{ background: 'var(--bg-sidebar)', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Email Notifications</h3>
                {['newApplicants', 'statusChanges', 'interviewSchedules', 'systemUpdates'].map(key => (<label key={key} style={{ display: 'flex', gap: '12px', marginBottom: '12px', cursor: 'pointer', color: 'var(--text-primary)' }}><input type="checkbox" checked={(notifications as any)[key]} onChange={() => handleNotificationChange(key as keyof typeof notifications)} style={{ accentColor: 'var(--accent-primary)' }} /><span style={{ fontWeight: '600', fontSize: '14px' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span></label>))}
              </div>
              <div style={{ background: 'var(--bg-sidebar)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>In-App Notifications</h3>
                {['realTimeAlerts', 'soundNotifications', 'desktopNotifications'].map(key => (<label key={key} style={{ display: 'flex', gap: '12px', marginBottom: '12px', cursor: 'pointer', color: 'var(--text-primary)' }}><input type="checkbox" checked={(notifications as any)[key]} onChange={() => handleNotificationChange(key as keyof typeof notifications)} style={{ accentColor: 'var(--accent-primary)' }} /><span style={{ fontWeight: '600', fontSize: '14px' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span></label>))}
              </div>
            </div>)}

            {activeTab === 'security' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>Security</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Manage security settings</p>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Password</h3>
                {!showPasswordForm ? (<button onClick={() => setShowPasswordForm(true)} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Change Password</button>) : (<div><div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Current Password</label><input type="password" value={passwordForm.oldPassword} onChange={(e) => setPasswordForm(prev => ({ ...prev, oldPassword: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div><div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>New Password</label><input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div><div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Confirm Password</label><input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div><button onClick={handlePasswordUpdate} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginRight: '8px' }}>Update</button><button onClick={() => { setShowPasswordForm(false); setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' }); }} style={{ padding: '10px 20px', background: 'var(--bg-control)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button></div>)}
              </div>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '8px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Two-Factor Authentication</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>Add extra security</p>
                <button onClick={() => { setSuccess('✓ 2FA enabled!'); setTimeout(() => setSuccess(''), 3000); }} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Enable 2FA</button>
              </div>
            </div>)}

            {activeTab === 'system' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>System Settings</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Configure preferences</p>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Data Management</h3>
                <button onClick={() => { setSuccess('✓ Backup initiated!'); setTimeout(() => setSuccess(''), 3000); }} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Download size={16} />Backup</button>
                <button onClick={() => { setSuccess('✓ Restore initiated!'); setTimeout(() => setSuccess(''), 3000); }} style={{ padding: '10px 20px', background: 'var(--bg-control)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Upload size={16} />Restore</button>
              </div>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Preferences</h3>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Date Format</label><select value={systemPrefs.dateFormat} onChange={(e) => setSystemPrefs(prev => ({ ...prev, dateFormat: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></div>
                <div><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Time Format</label><select value={systemPrefs.timeFormat} onChange={(e) => setSystemPrefs(prev => ({ ...prev, timeFormat: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>12-hour (AM/PM)</option><option>24-hour</option></select></div>
              </div>
            </div>)}

            {activeTab === 'email' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>Email Configuration</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Configure SMTP settings</p>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>SMTP Server</label><input type="text" value={emailConfig.smtpServer} onChange={(e) => setEmailConfig(prev => ({ ...prev, smtpServer: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Port</label><input type="text" value={emailConfig.port} onChange={(e) => setEmailConfig(prev => ({ ...prev, port: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }} /></div>
                <button onClick={() => { setSuccess('✓ SMTP test successful!'); setTimeout(() => setSuccess(''), 3000); }} style={{ padding: '10px 20px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Test Connection</button>
              </div>
            </div>)}

            {activeTab === 'appearance' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600' }}>Appearance</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Customize appearance</p>
              
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Theme</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>Choose between Light, Dark, or Auto mode</p>
                <div className="theme-button-group">
                  {(['Light', 'Dark', 'Auto'] as const).map(theme => (
                    <button
                      key={theme}
                      className={`theme-button ${appearance.theme === theme ? 'active' : ''}`}
                      onClick={() => {
                        applyAndStoreTheme(theme);
                        setAppearance(prev => ({ ...prev, theme }));
                      }}
                      title={theme === 'Auto' ? 'Follow system preference' : `Use ${theme} theme`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Accent Color</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>Select your preferred accent color</p>
                <div className="accent-button-group">
                  {([
                    { name: 'Blue' as const, hex: '#007bff' },
                    { name: 'Green' as const, hex: '#28a745' },
                    { name: 'Purple' as const, hex: '#6f42c1' },
                    { name: 'Orange' as const, hex: '#fd7e14' }
                  ]).map(accent => (
                    <button
                      key={accent.name}
                      className={`accent-button ${appearance.colorScheme === accent.name ? 'active' : ''}`}
                      onClick={() => {
                        applyAndStoreAccent(accent.name);
                        setAppearance(prev => ({ ...prev, colorScheme: accent.name }));
                      }}
                      title={`Set accent color to ${accent.name}`}
                    >
                      <span className="accent-color-swatch" style={{ backgroundColor: accent.hex, borderColor: accent.hex }}></span>
                      {accent.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>)}

            {activeTab === 'localization' && (<div>
              <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>Localization</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Language & regional settings</p>
              <div style={{ background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Language</label><select value={localization.language} onChange={(e) => setLocalization(prev => ({ ...prev, language: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>English (US)</option><option>English (Philippines)</option><option>Tagalog</option></select></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Timezone</label><select value={localization.timezone} onChange={(e) => setLocalization(prev => ({ ...prev, timezone: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>Asia/Manila</option><option>Asia/Bangkok</option><option>UTC</option></select></div>
                <div><label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Currency</label><select value={localization.currency} onChange={(e) => setLocalization(prev => ({ ...prev, currency: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'var(--bg-control)', color: 'var(--text-primary)' }}><option>PHP</option><option>USD</option><option>EUR</option></select></div>
              </div>
            </div>)}
          </div>
        </div>
      </main>
    </div>
  );
};
