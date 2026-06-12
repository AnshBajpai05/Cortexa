import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * T1-6 (minimal): opt-in API-key authorization.
 *
 * Scope is deliberately tiny — NOT JWT/RBAC/users (those are V2). When
 * CORTEXA_API_KEY is set, every request must carry a matching `x-api-key`
 * header. When unset, the guard is a no-op (local-dev convenience).
 *
 * Exemptions:
 *   - /api/internal/*      already authed by INTERNAL_WEBHOOK_SECRET (fail-closed)
 *   - /api/runs/events/*   SSE; browsers' EventSource cannot set headers
 *     (the workflowId in the URL is an unguessable cuid — adequate for v1)
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CORTEXA_API_KEY;
    if (!expected || !expected.trim()) return true; // disabled

    const req = context.switchToHttp().getRequest();
    const path: string = req.path || req.url || '';

    if (path.startsWith('/api/internal/')) return true;
    if (path.startsWith('/api/runs/events/')) return true;

    const provided = req.headers['x-api-key'];
    if (provided !== expected) {
      throw new UnauthorizedException('Missing or invalid x-api-key');
    }
    return true;
  }
}
