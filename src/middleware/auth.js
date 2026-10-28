const crypto = require('node:crypto');
const db = require('../db');
const { verifyToken, hasMinimumRole, ROLES } = require('../auth');
const logger = require('../logger');

function timingSafeMatch(provided, expected) {
  if (!provided || !expected) return false;
  const bufA = Buffer.from(String(provided));
  const bufB = Buffer.from(String(expected));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authentication Middleware: Extracts and validates Bearer token or API key
 */
function authenticate(req, res, next) {
  const configuredKey = process.env.API_KEY || process.env.ADMIN_API_KEY;
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // Check API Key with constant-time equality
  if (configuredKey) {
    const isHeaderMatch = timingSafeMatch(apiKeyHeader, configuredKey);
    const isBearerMatch = authHeader?.startsWith('Bearer ') && timingSafeMatch(authHeader.slice(7).trim(), configuredKey);
    if (isHeaderMatch || isBearerMatch) {
      req.user = {
        sub: 1,
        role: ROLES.OWNER,
        client_id: 1,
        name: 'API Key Admin'
      };
      return next();
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7).trim();
  if (db.isTokenRevoked(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication token has been revoked. Please sign in again.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired authentication token' });
  }

  req.user = decoded;
  next();
}

/**
 * Guard: Requires authentication for the endpoint
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required to access this resource' });
  }
  next();
}

/**
 * Guard: Role-Based Access Control
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
    }

    const userRole = req.user.role;
    // OWNER role bypasses all role checks
    if (userRole === ROLES.OWNER) {
      return next();
    }

    const isAllowed = allowedRoles.some((role) => {
      if (typeof role === 'string') {
        return userRole === role;
      }
      return hasMinimumRole(userRole, role.minimumRole);
    });

    if (!isAllowed) {
      logger.warn({ userId: req.user.sub, userRole, required: allowedRoles, path: req.path }, 'RBAC Access Denied');
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions for this action' });
    }

    next();
  };
}

/**
 * Guard: Tenant Data Isolation (Anti-IDOR)
 * Ensures non-OWNER users can never view, update, or delete another client's assets.
 */
function enforceTenantScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
  }

  if (req.user.role === ROLES.OWNER) {
    return next(); // Owners can manage all client workspaces
  }

  const userClientId = req.user.client_id;

  // Check URL parameter if route is scoped by client (e.g. /api/clients/:id/...)
  const routeClientId = req.params?.clientId || (req.path.includes('/clients/') ? req.params?.id : null);
  if (routeClientId) {
    const parsedId = Number.parseInt(routeClientId, 10);
    if (!Number.isNaN(parsedId) && parsedId !== userClientId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to requested client workspace is denied' });
    }
  }

  // Check query parameter
  if (req.query.clientId && Number.parseInt(req.query.clientId, 10) !== userClientId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Access to requested client workspace is denied' });
  }

  // Check body parameter if modifying or creating
  if (req.body && req.body.client_id && Number.parseInt(req.body.client_id, 10) !== userClientId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot create or modify resources outside assigned workspace' });
  }

  // Force workspace scope to user's client_id
  if (req.body && typeof req.body === 'object') {
    req.body.client_id = userClientId;
  }
  req.scopedClientId = userClientId;

  next();
}

function apiKeyAuth(req, res, next) {
  const configuredKey = process.env.API_KEY || process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return next();
  }

  const path = req.path;
  if (
    path.startsWith('/review') ||
    path.startsWith('/api/review') ||
    path === '/auth/youtube/callback' ||
    path.startsWith('/api/auth') ||
    path === '/healthz' ||
    !path.startsWith('/api')
  ) {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerKey = req.headers['x-api-key'];
  const queryKey = req.query.apiKey;

  const providedKey = headerKey || bearerToken || queryKey;
  if (providedKey && timingSafeMatch(providedKey, configuredKey)) {
    return next();
  }

  return authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user) return next();
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid API Key or authentication token required.'
    });
  });
}

module.exports = {
  authenticate,
  requireAuth,
  requireRole,
  enforceTenantScope,
  apiKeyAuth
};
