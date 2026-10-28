/**
 * Authentication & Access Control Middleware
 * 
 * Supports:
 * 1. API Key Authentication for programmatic and dashboard access (via x-api-key or Authorization Bearer)
 * 2. Exemption for public magic review links (/review/*, /api/review/*) validated by HMAC token
 * 3. Exemption for Google OAuth callback (/auth/youtube/callback)
 * 4. Graceful development fallback when API_KEY is not configured in .env
 */

function apiKeyAuth(req, res, next) {
  const configuredKey = process.env.API_KEY || process.env.ADMIN_API_KEY;

  // If no API_KEY is configured in development, allow pass-through
  if (!configuredKey) {
    return next();
  }

  // Exempt public paths: magic client review links and OAuth callback
  const path = req.path;
  if (
    path.startsWith('/review') ||
    path.startsWith('/api/review') ||
    path === '/auth/youtube/callback' ||
    !path.startsWith('/api') // Allow static dashboard assets to load
  ) {
    return next();
  }

  // Check header or query parameter
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerKey = req.headers['x-api-key'];
  const queryKey = req.query.apiKey;

  const providedKey = headerKey || bearerToken || queryKey;

  if (providedKey && providedKey === configuredKey) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Valid API Key required in x-api-key header or Bearer token.'
  });
}

module.exports = {
  apiKeyAuth
};
