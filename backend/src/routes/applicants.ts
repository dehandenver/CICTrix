import { Router, Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest, requireRole } from '../middleware/auth';
import { Applicant } from '../types';

const router = Router();

/**
 * List applicants with role-based access control
 * - ADMIN/PM/RSP/LND: Can see all applicants
 * - INTERVIEWER: Can see assigned applicants only
 * - APPLICANT: Can see their own profile only
 */
router.get('/', requireRole('ADMIN', 'PM', 'RSP', 'LND', 'INTERVIEWER', 'RATER', 'APPLICANT'), 
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

      let query = supabase.from('applicants').select('*');

      // Filter based on role
      if (req.user.role === 'APPLICANT') {
        // Applicants can only see their own data
        query = query.eq('email', req.user.email);
      } else if (req.user.role === 'INTERVIEWER' || req.user.role === 'RATER') {
        // TODO: Filter by assigned applicants (when assignments table is available)
        // For now, allow all to see
      }

      const { data, error } = await query
        .range(skip, skip + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Get a specific applicant with access control
 */
router.get('/:id', requireRole('ADMIN', 'PM', 'RSP', 'LND', 'INTERVIEWER', 'RATER', 'APPLICANT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { id } = req.params;

      const { data, error } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'Applicant not found' });
        return;
      }

      // Check access permissions
      if (req.user.role === 'APPLICANT' && (data as Applicant).email !== req.user.email) {
        res.status(403).json({ error: 'You can only view your own profile' });
        return;
      }

      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Update an applicant (Admin only)
 */
router.put('/:id', requireRole('ADMIN', 'PM', 'RSP', 'LND'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Verify applicant exists
      const { data: existing, error: existError } = await supabase
        .from('applicants')
        .select('id')
        .eq('id', id)
        .single();

      if (existError || !existing) {
        res.status(404).json({ error: 'Applicant not found' });
        return;
      }

      const { data, error } = await supabase
        .from('applicants')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
