import { useEffect, useState, useMemo } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Calendar, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Sidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Dialog } from '../../components/Dialog';
import '../../styles/admin.css';

interface Training {
  id: number;
  title: string;
  date: string;
  speaker: string;
  venue: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  created_at: string;
}

interface TrainingStats {
  upcomingTrainings: number;
  totalCompleted: number;
}

export const LNDDashboard = ({ isDashboardView = true }: { isDashboardView?: boolean }) => {
  const [stats, setStats] = useState<TrainingStats>({
    upcomingTrainings: 0,
    totalCompleted: 0
  });
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTrainingDialog, setShowTrainingDialog] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTraining, setNewTraining] = useState<{
    title: string;
    date: string;
    speaker: string;
    venue: string;
    status: 'Scheduled' | 'Completed' | 'Cancelled';
  }>({
    title: '',
    date: '',
    speaker: '',
    venue: '',
    status: 'Scheduled'
  });

  useEffect(() => {
    fetchTrainings();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [trainings]);

  const fetchTrainings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setTrainings(data || []);
    } catch (error) {
      console.error('Error fetching trainings:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = trainings.filter(t => t.date >= today && t.status !== 'Cancelled').length;
    const completed = trainings.filter(t => t.status === 'Completed').length;
    setStats({ upcomingTrainings: upcoming, totalCompleted: completed });
  };

  const handleAddTraining = async () => {
    if (!newTraining.title || !newTraining.date || !newTraining.speaker || !newTraining.venue) {
      alert('Please fill in all fields');
      return;
    }

    try {
      if (editingTraining) {
        const { error } = await supabase
          .from('trainings')
          .update(newTraining)
          .eq('id', editingTraining.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trainings')
          .insert([newTraining]);
        if (error) throw error;
      }
      
      await fetchTrainings();
      setShowTrainingDialog(false);
      setEditingTraining(null);
      setNewTraining({ title: '', date: '', speaker: '', venue: '', status: 'Scheduled' });
    } catch (error) {
      console.error('Error saving training:', error);
      alert('Failed to save training');
    }
  };

  const handleDeleteTraining = async (id: number) => {
    if (!confirm('Are you sure you want to delete this training?')) return;

    try {
      const { error } = await supabase
        .from('trainings')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchTrainings();
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('Failed to delete training');
    }
  };

  const handleEditTraining = (training: Training) => {
    setEditingTraining(training);
    setNewTraining({
      title: training.title,
      date: training.date,
      speaker: training.speaker,
      venue: training.venue,
      status: training.status as 'Scheduled' | 'Completed' | 'Cancelled'
    });
    setShowTrainingDialog(true);
  };

  const filteredTrainings = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return trainings.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.speaker.toLowerCase().includes(query)
    );
  }, [trainings, searchTerm]);

  if (isDashboardView) {
    return (
      <div className="flex h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-8">Learning & Development</h1>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-slate-600">Loading...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upcoming Trainings Card */}
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 hover:shadow-lg transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Upcoming Trainings</p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-blue-900 to-blue-700 bg-clip-text text-transparent">
                        {stats.upcomingTrainings}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-900/10 rounded-lg">
                      <Calendar className="w-8 h-8 text-blue-900" />
                    </div>
                  </div>
                </div>

                {/* Total Completed Card */}
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 hover:shadow-lg transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Total Completed</p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
                        {stats.totalCompleted}
                      </p>
                    </div>
                    <div className="p-3 bg-green-600/10 rounded-lg">
                      <BookOpen className="w-8 h-8 text-green-600" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Learning & Development Management</h1>
            <Button onClick={() => {
              setEditingTraining(null);
              setNewTraining({ title: '', date: '', speaker: '', venue: '', status: 'Scheduled' });
              setShowTrainingDialog(true);
            }} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Training
            </Button>
          </div>

          {/* Search Bar */}
          <div className="mb-6 flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by title or speaker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading trainings...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Speaker</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Venue</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrainings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        {searchTerm ? 'No trainings match your search.' : 'No trainings scheduled yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTrainings.map((training) => (
                      <tr key={training.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{training.title}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{new Date(training.date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{training.speaker}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{training.venue}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            training.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                            training.status === 'Completed' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {training.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => handleEditTraining(training)}
                            className="text-blue-900 hover:text-blue-700 transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteTraining(training.id)}
                            className="text-red-600 hover:text-red-800 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Training Dialog */}
      <Dialog 
        open={showTrainingDialog} 
        onClose={() => {
          setShowTrainingDialog(false);
          setEditingTraining(null);
          setNewTraining({ title: '', date: '', speaker: '', venue: '', status: 'Scheduled' });
        }}
        title={editingTraining ? 'Edit Training' : 'Add New Training'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Training Title *</label>
            <Input
              type="text"
              placeholder="e.g., Leadership Development Program"
              value={newTraining.title}
              onChange={(e) => setNewTraining({ ...newTraining, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
            <Input
              type="date"
              value={newTraining.date}
              onChange={(e) => setNewTraining({ ...newTraining, date: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Speaker Name *</label>
            <Input
              type="text"
              placeholder="e.g., Dr. John Smith"
              value={newTraining.speaker}
              onChange={(e) => setNewTraining({ ...newTraining, speaker: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Venue *</label>
            <Input
              type="text"
              placeholder="e.g., Conference Room A"
              value={newTraining.venue}
              onChange={(e) => setNewTraining({ ...newTraining, venue: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={newTraining.status}
              onChange={(e) => setNewTraining({ ...newTraining, status: e.target.value as 'Scheduled' | 'Completed' | 'Cancelled' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/30 focus:border-blue-900"
            >
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleAddTraining}
              className="flex-1 bg-blue-900 text-white"
            >
              {editingTraining ? 'Update Training' : 'Add Training'}
            </Button>
            <Button 
              onClick={() => {
                setShowTrainingDialog(false);
                setEditingTraining(null);
                setNewTraining({ title: '', date: '', speaker: '', venue: '', status: 'Scheduled' });
              }}
              className="flex-1 bg-slate-300 text-slate-900"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

