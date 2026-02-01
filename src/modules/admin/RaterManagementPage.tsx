import { useEffect, useState } from 'react';
import { UserCheck, Plus, Edit2, Trash2, Mail, Building } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Sidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Dialog } from '../../components/Dialog';
import { Select } from '../../components/Select';
import '../../styles/admin.css';

interface Rater {
  id: number;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
  created_at: string;
}

const DEPARTMENTS = ['HR', 'Finance', 'IT', 'Operations', 'Marketing', 'Sales', 'Legal', 'Admin'];

export const RaterManagementPage = () => {
  const [raters, setRaters] = useState<Rater[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRater, setEditingRater] = useState<Rater | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    is_active: true
  });

  useEffect(() => {
    fetchRaters();
  }, []);

  const fetchRaters = async () => {
    try {
      const { data, error } = await supabase
        .from('raters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRaters(data || []);
    } catch (error) {
      console.error('Error fetching raters:', error);
    }
  };

  const handleCreateRater = async () => {
    if (!formData.name || !formData.email || !formData.department) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('raters')
        .insert([formData]);

      if (error) {
        if (error.code === '23505') {
          alert('A rater with this email already exists');
          return;
        }
        throw error;
      }

      setShowDialog(false);
      setFormData({ name: '', email: '', department: '', is_active: true });
      fetchRaters();
    } catch (error) {
      console.error('Error creating rater:', error);
      alert('Failed to create rater');
    }
  };

  const handleUpdateRater = async () => {
    if (!editingRater) return;

    try {
      const { error } = await supabase
        .from('raters')
        .update({
          name: editingRater.name,
          department: editingRater.department,
          is_active: editingRater.is_active
        })
        .eq('id', editingRater.id);

      if (error) throw error;

      setEditingRater(null);
      fetchRaters();
    } catch (error) {
      console.error('Error updating rater:', error);
      alert('Failed to update rater');
    }
  };

  const handleDeleteRater = async (id: number) => {
    if (!confirm('Are you sure you want to delete this rater? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('raters')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchRaters();
    } catch (error) {
      console.error('Error deleting rater:', error);
      alert('Failed to delete rater');
    }
  };

  const toggleRaterStatus = async (rater: Rater) => {
    try {
      const { error } = await supabase
        .from('raters')
        .update({ is_active: !rater.is_active })
        .eq('id', rater.id);

      if (error) throw error;
      fetchRaters();
    } catch (error) {
      console.error('Error updating rater status:', error);
      alert('Failed to update rater status');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" />
      
      <main className="admin-content">
        <div className="admin-header">
          <div>
            <h1>Rater Management</h1>
            <p className="admin-subtitle">Manage interviewer accounts and permissions</p>
          </div>
          <Button onClick={() => setShowDialog(true)}>
            <Plus size={16} />
            Add New Rater
          </Button>
        </div>

        {/* Raters Table */}
        <div className="admin-section">
          <div className="raters-grid">
            {raters.map(rater => (
              <div key={rater.id} className="rater-card">
                <div className="rater-card-header">
                  <div className="rater-avatar">
                    <UserCheck size={24} />
                  </div>
                  <div className="rater-status-indicator">
                    <button
                      className={`status-toggle ${rater.is_active ? 'active' : 'inactive'}`}
                      onClick={() => toggleRaterStatus(rater)}
                      title={rater.is_active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {rater.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>

                <div className="rater-card-body">
                  <h3>{rater.name}</h3>
                  
                  <div className="rater-info">
                    <div className="info-row">
                      <Mail size={16} />
                      <span>{rater.email}</span>
                    </div>
                    <div className="info-row">
                      <Building size={16} />
                      <span>{rater.department}</span>
                    </div>
                  </div>
                </div>

                <div className="rater-card-footer">
                  <button
                    className="card-action-btn"
                    onClick={() => setEditingRater(rater)}
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button
                    className="card-action-btn danger"
                    onClick={() => handleDeleteRater(rater.id)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {raters.length === 0 && (
              <div className="empty-state-large">
                <UserCheck size={48} />
                <h3>No Raters Yet</h3>
                <p>Start by adding your first interviewer account</p>
                <Button onClick={() => setShowDialog(true)}>
                  <Plus size={16} />
                  Add New Rater
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Create/Edit Rater Dialog */}
        {(showDialog || editingRater) && (
          <Dialog
            isOpen={showDialog || !!editingRater}
            onClose={() => {
              setShowDialog(false);
              setEditingRater(null);
            }}
            title={editingRater ? 'Edit Rater' : 'Add New Rater'}
          >
            <div className="job-form">
              <Input
                label="Full Name *"
                value={editingRater ? editingRater.name : formData.name}
                onChange={(e) => editingRater
                  ? setEditingRater({ ...editingRater, name: e.target.value })
                  : setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Juan Dela Cruz"
              />

              <Input
                label="Email Address *"
                type="email"
                value={editingRater ? editingRater.email : formData.email}
                onChange={(e) => {
                  if (!editingRater) {
                    setFormData({ ...formData, email: e.target.value });
                  }
                }}
                placeholder="e.g., juan.delacruz@example.com"
                disabled={!!editingRater}
              />

              <Select
                label="Department *"
                value={editingRater ? editingRater.department : formData.department}
                onChange={(e) => editingRater
                  ? setEditingRater({ ...editingRater, department: e.target.value })
                  : setFormData({ ...formData, department: e.target.value })
                }
              >
                <option value="">Select Department</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </Select>

              {editingRater && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingRater.is_active}
                      onChange={(e) => setEditingRater({ 
                        ...editingRater, 
                        is_active: e.target.checked 
                      })}
                    />
                    <span>Active Status</span>
                  </label>
                  <p className="help-text">
                    Inactive raters cannot access the system
                  </p>
                </div>
              )}

              <div className="dialog-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDialog(false);
                    setEditingRater(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingRater ? handleUpdateRater : handleCreateRater}>
                  {editingRater ? 'Update Rater' : 'Add Rater'}
                </Button>
              </div>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  );
};
