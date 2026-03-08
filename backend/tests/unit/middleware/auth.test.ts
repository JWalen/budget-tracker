import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, AuthRequest } from '../../../src/middleware/auth';

// Set test secrets before importing middleware that uses them
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only';

// Mock database for sharing middleware
jest.mock('../../../src/config/database', () => ({
  query: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/services/logger', () => ({
  LoggerClass: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { sharingMiddleware, requireEditAccess } from '../../../src/middleware/sharing';
const { query } = require('../../../src/config/database');

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Middleware', () => {
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = jest.fn();
  });

  it('should return 401 when no token provided', () => {
    const req = { headers: {} } as AuthRequest;

    authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when invalid token provided', () => {
    const req = {
      headers: { authorization: 'Bearer invalid-token' },
    } as AuthRequest;

    authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should set userId when valid token provided', () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET!);
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthRequest;

    authMiddleware(req, res as Response, next);

    expect(req.userId).toBe(42);
    expect(next).toHaveBeenCalled();
  });

  it('should handle expired token', () => {
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET!, { expiresIn: '-1s' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthRequest;

    authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle missing Bearer prefix', () => {
    const req = {
      headers: { authorization: 'some-token' },
    } as AuthRequest;

    authMiddleware(req, res as Response, next);

    // 'some-token'.split(' ')[1] is undefined, so should fail
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('Sharing Middleware', () => {
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should set budgetUserId to own userId when no X-Budget-Owner header', async () => {
    const req = { headers: {}, userId: 1 } as any;

    await sharingMiddleware(req, res as Response, next);

    expect(req.budgetUserId).toBe(1);
    expect(req.shareRole).toBe('owner');
    expect(next).toHaveBeenCalled();
  });

  it('should set budgetUserId to own userId when X-Budget-Owner matches userId', async () => {
    const req = { headers: { 'x-budget-owner': '1' }, userId: 1 } as any;

    await sharingMiddleware(req, res as Response, next);

    expect(req.budgetUserId).toBe(1);
    expect(req.shareRole).toBe('owner');
    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when no share access exists', async () => {
    const req = { headers: { 'x-budget-owner': '99' }, userId: 1 } as any;
    query.mockResolvedValue({ rows: [] });

    await sharingMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should set correct shareRole from budget_shares', async () => {
    const req = { headers: { 'x-budget-owner': '99' }, userId: 1 } as any;
    query.mockResolvedValue({ rows: [{ role: 'edit' }] });

    await sharingMiddleware(req, res as Response, next);

    expect(req.budgetUserId).toBe(99);
    expect(req.shareRole).toBe('edit');
    expect(next).toHaveBeenCalled();
  });
});

describe('requireEditAccess Middleware', () => {
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = jest.fn();
  });

  it('should allow owner role', () => {
    const req = { shareRole: 'owner' } as any;
    requireEditAccess(req, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should allow edit role', () => {
    const req = { shareRole: 'edit' } as any;
    requireEditAccess(req, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block view role with 403', () => {
    const req = { shareRole: 'view' } as any;
    requireEditAccess(req, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
