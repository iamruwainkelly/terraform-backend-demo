const Joi = require('joi');
const logger = require('./logger');

// Validation schemas
const terraformConfigSchema = Joi.object({
  config: Joi.string().required().min(1).max(50000), // HCL or JSON config
  format: Joi.string().valid('hcl', 'json').default('hcl'),
  variables: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())).optional(),
  backend: Joi.object({
    type: Joi.string().valid('local', 's3', 'gcs').default('local'),
    config: Joi.object().optional()
  }).optional()
});

const userSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required(),
  email: Joi.string().email().required(),
  role: Joi.string().valid('admin', 'user').default('user')
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
});

// Input sanitization
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove potentially dangerous characters and commands
  const dangerous = [
    ';', '&&', '||', '`', '$', '(', ')', '{', '}', '[', ']',
    'rm', 'sudo', 'su', 'chmod', 'chown', 'wget', 'curl',
    'eval', 'exec', 'system', 'shell_exec', 'passthru'
  ];
  
  let sanitized = input;
  dangerous.forEach(char => {
    sanitized = sanitized.replace(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  });
  
  return sanitized.trim();
};

// Validate Terraform configuration
const validateTerraformConfig = (req, res, next) => {
  const { error, value } = terraformConfigSchema.validate(req.body);
  
  if (error) {
    logger.warn('Terraform config validation failed:', { 
      error: error.details,
      ip: req.ip 
    });
    return res.status(400).json({
      error: 'Invalid configuration',
      details: error.details.map(detail => detail.message)
    });
  }
  
  // Sanitize config content
  value.config = sanitizeInput(value.config);
  if (value.variables) {
    Object.keys(value.variables).forEach(key => {
      if (typeof value.variables[key] === 'string') {
        value.variables[key] = sanitizeInput(value.variables[key]);
      }
    });
  }
  
  req.validatedData = value;
  next();
};

// Validate user data
const validateUser = (req, res, next) => {
  const { error, value } = userSchema.validate(req.body);
  
  if (error) {
    logger.warn('User validation failed:', { 
      error: error.details,
      ip: req.ip 
    });
    return res.status(400).json({
      error: 'Invalid user data',
      details: error.details.map(detail => detail.message)
    });
  }
  
  req.validatedData = value;
  next();
};

// Validate login data
const validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body);
  
  if (error) {
    logger.warn('Login validation failed:', { 
      error: error.details,
      ip: req.ip 
    });
    return res.status(400).json({
      error: 'Invalid login data',
      details: error.details.map(detail => detail.message)
    });
  }
  
  req.validatedData = value;
  next();
};

// Additional security checks
const securityCheck = (config) => {
  const securityPatterns = [
    /aws_access_key_id\s*=\s*["']?AKIA[A-Z0-9]{16}["']?/i,
    /aws_secret_access_key\s*=\s*["']?[A-Za-z0-9/+=]{40}["']?/i,
    /password\s*=\s*["']?[^"'\s]+["']?/i,
    /secret\s*=\s*["']?[^"'\s]+["']?/i,
    /token\s*=\s*["']?[^"'\s]+["']?/i
  ];
  
  const warnings = [];
  securityPatterns.forEach(pattern => {
    if (pattern.test(config)) {
      warnings.push('Potential sensitive data detected in configuration');
    }
  });
  
  return warnings;
};

module.exports = {
  validateTerraformConfig,
  validateUser,
  validateLogin,
  sanitizeInput,
  securityCheck,
  terraformConfigSchema,
  userSchema,
  loginSchema
};
