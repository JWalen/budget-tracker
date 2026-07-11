import { Request, Response, NextFunction } from 'express';
import TokenService from '../services/tokenService';

export interface AuthRequest extends Request {
  userId?: number;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Route through TokenService so the access token is validated with the algorithm
  // pinned to HS256 and the issuer/audience/type checked — not a bare jwt.verify
  // that would accept any HS-signed token.
  const decoded = TokenService.verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  next();
};
