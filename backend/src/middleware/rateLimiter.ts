import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// General API rate limiter - 100 requests per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints - 5 requests per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // failed login/register attempts per window (successful ones don't count)
  skipSuccessfulRequests: true, // Only count failed attempts (brute-force protection)
  message: 'Too many authentication attempts, please try again later.',
});

// File upload rate limiter - 10 uploads per hour
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many file uploads, please try again later.',
});

// Export rate limiter - 20 exports per hour
export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many export requests, please try again later.',
});

// Create transaction rate limiter - 50 per hour (prevent spam)
export const transactionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Too many transactions created, please try again later.',
});
