import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie sessions: every state-changing request must declare
 * `Content-Type: application/json`, with or without a body. A cross-site HTML form cannot send
 * that type, and a script on another origin would need a CORS preflight, which only the
 * configured web origin passes.
 */
export function jsonOnly(req: Request, res: Response, next: NextFunction): void {
  const type = req.headers['content-type'] ?? '';
  if (SAFE.has(req.method) || type.toLowerCase().startsWith('application/json')) return next();
  res.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).json({
    statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    error: 'Unsupported Media Type',
    message: 'Requests that change data must be sent as application/json',
  });
}
