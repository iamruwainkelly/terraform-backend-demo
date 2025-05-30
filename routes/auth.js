const express = require('express');
const { authenticateUser, createUser, generateToken, getAllUsers, requireAdmin } = require('../middleware/auth');
const { validateLogin, validateUser } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Login endpoint
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.validatedData;
    
    logger.info('Login attempt', { username, ip: req.ip });
    
    const user = await authenticateUser(username, password);
    if (!user) {
      logger.warn('Failed login attempt', { username, ip: req.ip });
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
    }
    
    const token = generateToken(user);
    
    logger.info('Successful login', { username: user.username, role: user.role });
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
    
  } catch (error) {
    logger.error('Login error:', { error: error.message, ip: req.ip });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed'
    });
  }
});

// Register endpoint (admin only)
router.post('/register', validateUser, async (req, res) => {
  try {
    const userData = req.validatedData;
    
    logger.info('User registration attempt', { 
      username: userData.username, 
      email: userData.email,
      role: userData.role,
      ip: req.ip 
    });
    
    const user = await createUser(userData);
    
    logger.info('User registered successfully', { 
      username: user.username,
      role: user.role 
    });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Registration error:', { 
      error: error.message, 
      username: req.validatedData?.username,
      ip: req.ip 
    });
    
    if (error.message === 'User already exists') {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username is already taken'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed'
    });
  }
});

// Get current user info
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Get all users (admin only)
router.get('/users', require('../middleware/auth').authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    
    logger.info('Users list requested', { 
      requestedBy: req.user.username,
      userCount: users.length 
    });
    
    res.json({
      success: true,
      users,
      total: users.length
    });
    
  } catch (error) {
    logger.error('Error fetching users:', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Could not fetch users'
    });
  }
});

// Token validation endpoint
router.post('/validate', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    success: true,
    valid: true,
    user: {
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
