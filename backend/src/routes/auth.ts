import { Router, Response } from 'express';
import { supabase } from '../utils/supabase';
import { createToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Login endpoint
 * TODO: Implement Supabase Auth or your authentication method
 */
router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    // TODO: Replace with actual Supabase Auth
    // For now, this is a placeholder that should be implemented
    res.status(501).json({
      error: 'Authentication not yet implemented. Configure Supabase Auth.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Logout endpoint
 */
router.post('/logout', (req: AuthRequest, res: Response): void => {
  res.json({ message: 'Logged out successfully' });
});

/**
 * Get current user info
 */
router.get('/me', (req: AuthRequest, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  res.json({
    userId: req.user.userId,
    email: req.user.email,
    role: req.user.role,
  });
});

export default router;
