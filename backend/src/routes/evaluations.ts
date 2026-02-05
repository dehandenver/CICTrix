import { Router, Response } from 'express';
import { supabase } from '../utils/supabase';
import { AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

/**
 * List evaluations with role-based access
 * - ADMIN/PM/RSP/LND: Can see all evaluations
 * - RATER/INTERVIEWER: Can see evaluations they created
 */
router.get('/', requireRole('ADMIN', 'PM', 'RSP', 'LND', 'RATER', 'INTERVIEWER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { applicant_id } = req.query;

      let query = supabase.from('evaluations').select('*');

      if (applicant_id) {
        query = query.eq('applicant_id', applicant_id as string);
      }

      if (req.user.role === 'RATER' || req.user.role === 'INTERVIEWER') {
        // Can only see their own evaluations
        query = query.eq('evaluator_id', req.user.userId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

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
 * Create an evaluation (Rater/Interviewer only)
 * Each user can only evaluate applicants assigned to them
 */
router.post('/', requireRole('RATER', 'INTERVIEWER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { applicant_id, score, comments } = req.body;

      if (!applicant_id || score === undefined) {
        res.status(400).json({ error: 'applicant_id and score are required' });
        return;
      }

      if (score < 0 || score > 100) {
        res.status(400).json({ error: 'Score must be between 0 and 100' });
        return;
      }

      // TODO: Add validation to ensure user is assigned to this applicant

      const evaluationData = {
        applicant_id,
        evaluator_id: req.user.userId,
        score,
        comments: comments || null,
      };

      const { data, error } = await supabase
        .from('evaluations')
        .insert(evaluationData)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
