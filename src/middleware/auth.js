const { verifyToken, hasMinimumRole, ROLES } = require('../auth');
const logger = require('../logger');

/**
 * Authentication Middleware: Extracts and validates Bearer token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7).trim();
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
    const parsedId = parseInt(routeClientId, 10);
    if (!isNaN(parsedId) && parsedId !== userClientId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to requested client workspace is denied' });
    }
  }

  // Check query parameter
  if (req.query.clientId && parseInt(req.query.clientId, 10) !== userClientId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Access to requested client workspace is denied' });
  }

  // Check body parameter if modifying or creating
  if (req.body && req.body.client_id && parseInt(req.body.client_id, 10) !== userClientId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cannot create or modify resources outside assigned workspace' });
  }

  // Force workspace scope to user's client_id
  if (req.body && typeof req.body === 'object') {
    req.body.client_id = userClientId;
  }
  req.scopedClientId = userClientId;

  next();
}

module.exports = {
  authenticate,
  requireAuth,
  requireRole,
  enforceTenantScope
};
