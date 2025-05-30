const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// Simple in-memory user store (replace with database in production)
const users = new Map();

// Default admin user (create during startup)
const createDefaultAdmin = async () => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!@#';
  const hashedPassword = await bcrypt.hash(adminPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  
  users.set('admin', {
    username: 'admin',
    password: hashedPassword,
    email: 'admin@terraform-api.local',
    role: 'admin',
    createdAt: new Date().toISOString()
  });
  
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Default admin user created', { username: 'admin', password: adminPassword });
  }
};

// Initialize default admin
createDefaultAdmin();

// JWT token generation
const generateToken = (user) => {
  const payload = {
    username: user.username,
    role: user.role,
    email: user.email
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'terraform-backend-api',
    audience: 'terraform-frontend'
  });
};

// JWT verification middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    logger.warn('Access attempt without token', { ip: req.ip, url: req.originalUrl });
    return res.status(401).json({
      error: 'Access denied',
      message: 'No token provided'
    });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token used', { 
        ip: req.ip, 
        url: req.originalUrl,
        error: err.message 
      });
      return res.status(403).json({
        error: 'Invalid token',
        message: 'Token is invalid or expired'
      });
    }
    
    req.user = user;
    logger.info('Authenticated request', { 
      username: user.username, 
      role: user.role,
      url: req.originalUrl 
    });
    next();
  });
};

// Admin role check middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    logger.warn('Admin access denied', { 
      username: req.user.username, 
      role: req.user.role,
      url: req.originalUrl 
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'Admin role required'
    });
  }
  next();
};

// User authentication
const authenticateUser = async (username, password) => {
  const user = users.get(username);
  if (!user) {
    return null;
  }
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }
  
  return {
    username: user.username,
    email: user.email,
    role: user.role
  };
};

// Create new user
const createUser = async (userData) => {
  if (users.has(userData.username)) {
    throw new Error('User already exists');
  }
  
  const hashedPassword = await bcrypt.hash(userData.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  
  const user = {
    username: userData.username,
    password: hashedPassword,
    email: userData.email,
    role: userData.role || 'user',
    createdAt: new Date().toISOString()
  };
  
  users.set(userData.username, user);
  
  return {
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
};

// Get all users (admin only)
const getAllUsers = () => {
  return Array.from(users.values()).map(user => ({
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  }));
};

module.exports = {
  authenticateToken,
  requireAdmin,
  authenticateUser,
  createUser,
  getAllUsers,
  generateToken
};
