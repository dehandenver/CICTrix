import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';
import { config } from '../config';

export const createToken = (userId: string, email: string, role: string): string => {
  const payload: TokenPayload = {
    userId,
    email,
    role: role as any,
  };

  const expirationHours = parseInt(config.JWT_EXPIRATION);
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: expirationHours * 3600,
  });
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const extractToken = (authHeader?: string): string => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  return authHeader.substring(7);
};
