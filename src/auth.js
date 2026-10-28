const jwt = require('jsonwebtoken');
const { hashPassword, verifyPassword } = require('./crypto');
const logger = require('./logger');

const ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER'
};

const ROLE_HIERARCHY = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('[Auth Exception] JWT_SECRET must be defined and at least 16 characters.');
  }
  return secret;
}

function generateToken(user, expiresIn = '24h') {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role || ROLES.VIEWER,
    client_id: user.client_id || 1,
    name: user.name || ''
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn, algorithm: 'HS256' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (err) {
    logger.debug({ err: err.message }, 'JWT verification failed');
    return null;
  }
}

function hasMinimumRole(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 99;
  return userLevel >= requiredLevel;
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  generateToken,
  verifyToken,
  hasMinimumRole,
  hashPassword,
  verifyPassword
};
