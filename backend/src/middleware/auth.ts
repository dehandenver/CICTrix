import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractToken } from '../utils/jwt';
import { TokenPayload, AuthenticatedRequest } from '../types';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req.headers.authorization);
    req.user = verifyToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    try {
      const token = extractToken(req.headers.authorization);
      const user = verifyToken(token);

      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
};
