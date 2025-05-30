const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { validateTerraformConfig, securityCheck } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Job status tracking
const jobs = new Map();

// Cleanup old jobs (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      // Clean up temp directory
      if (job.tempDir && fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      }
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Create isolated temp directory for Terraform
const createTerraformWorkspace = async (jobId, config, variables = {}) => {
  const tempDir = path.join(__dirname, '..', 'temp', jobId);
  
  // Create directory structure
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  // Write main.tf file
  const configPath = path.join(tempDir, 'main.tf');
  await fs.promises.writeFile(configPath, config, 'utf8');
  
  // Write terraform.tfvars if variables provided
  if (Object.keys(variables).length > 0) {
    const tfvarsContent = Object.entries(variables)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key} = "${value}"`;
        }
        return `${key} = ${JSON.stringify(value)}`;
      })
      .join('\n');
    
    const tfvarsPath = path.join(tempDir, 'terraform.tfvars');
    await fs.promises.writeFile(tfvarsPath, tfvarsContent, 'utf8');
  }
  
  // Write provider configuration with AWS credentials
  const providerConfig = `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "${process.env.AWS_DEFAULT_REGION || 'us-east-1'}"
}
`;
  
  const providerPath = path.join(tempDir, 'providers.tf');
  await fs.promises.writeFile(providerPath, providerConfig, 'utf8');
  
  return tempDir;
};

// Execute Docker command with timeout and security
const executeDockerCommand = (command, tempDir, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const dockerCommand = `docker run --rm \
      -v "${tempDir}:/workspace" \
      -w /workspace \
      -e AWS_ACCESS_KEY_ID="${process.env.AWS_ACCESS_KEY_ID}" \
      -e AWS_SECRET_ACCESS_KEY="${process.env.AWS_SECRET_ACCESS_KEY}" \
      -e AWS_DEFAULT_REGION="${process.env.AWS_DEFAULT_REGION}" \
      --network none \
      --memory="512m" \
      --cpus="1.0" \
      ${process.env.DOCKER_IMAGE || 'hashicorp/terraform:latest'} \
      ${command}`;
    
    logger.info('Executing Docker command', { 
      command: command,
      tempDir: path.basename(tempDir),
      timeout 
    });
    
    const child = exec(dockerCommand, {
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: code });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
};

// Stream command output using Server-Sent Events
const streamCommandOutput = (res, command, tempDir, jobId) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  const sendEvent = (eventType, data) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Update job status
  const job = jobs.get(jobId);
  if (job) {
    job.status = 'running';
    job.startedAt = Date.now();
  }
  
  sendEvent('start', { message: 'Starting Terraform operation...', timestamp: new Date().toISOString() });
  
  const dockerCommand = `docker run --rm \
    -v "${tempDir}:/workspace" \
    -w /workspace \
    -e AWS_ACCESS_KEY_ID="${process.env.AWS_ACCESS_KEY_ID}" \
    -e AWS_SECRET_ACCESS_KEY="${process.env.AWS_SECRET_ACCESS_KEY}" \
    -e AWS_DEFAULT_REGION="${process.env.AWS_DEFAULT_REGION}" \
    --network none \
    --memory="512m" \
    --cpus="1.0" \
    ${process.env.DOCKER_IMAGE || 'hashicorp/terraform:latest'} \
    ${command}`;
  
  const child = exec(dockerCommand, {
    timeout: parseInt(process.env.EXECUTION_TIMEOUT_MS) || 60000,
    maxBuffer: 1024 * 1024 * 10,
  });
  
  child.stdout.on('data', (data) => {
    sendEvent('output', { message: data.toString(), type: 'stdout' });
  });
  
  child.stderr.on('data', (data) => {
    sendEvent('output', { message: data.toString(), type: 'stderr' });
  });
  
  child.on('close', (code) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = code === 0 ? 'completed' : 'failed';
      job.exitCode = code;
      job.completedAt = Date.now();
    }
    
    sendEvent('complete', { 
      exitCode: code, 
      success: code === 0,
      message: code === 0 ? 'Operation completed successfully' : 'Operation failed',
      timestamp: new Date().toISOString()
    });
    
    res.end();
    
    // Clean up temp directory after streaming
    setTimeout(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        logger.info('Temp directory cleaned up', { tempDir: path.basename(tempDir) });
      }
    }, 5000); // Wait 5 seconds before cleanup
  });
  
  child.on('error', (error) => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = error.message;
      job.completedAt = Date.now();
    }
    
    sendEvent('error', { 
      message: error.message,
      timestamp: new Date().toISOString()
    });
    
    res.end();
  });
  
  // Handle client disconnect
  req.on('close', () => {
    if (!child.killed) {
      child.kill('SIGTERM');
      logger.info('Client disconnected, killing process', { jobId });
    }
  });
};

// POST /terraform/plan
router.post('/plan', validateTerraformConfig, async (req, res) => {
  const jobId = uuidv4();
  const { config, variables = {} } = req.validatedData;
  
  try {
    logger.info('Terraform plan requested', { 
      jobId,
      username: req.user.username,
      configLength: config.length,
      variableCount: Object.keys(variables).length
    });
    
    // Security check
    const securityWarnings = securityCheck(config);
    if (securityWarnings.length > 0) {
      logger.warn('Security warnings for plan', { jobId, warnings: securityWarnings });
    }
    
    // Create job tracking
    jobs.set(jobId, {
      id: jobId,
      type: 'plan',
      status: 'initializing',
      user: req.user.username,
      createdAt: Date.now(),
      securityWarnings
    });
    
    // Create workspace
    const tempDir = await createTerraformWorkspace(jobId, config, variables);
    jobs.get(jobId).tempDir = tempDir;
    
    // Initialize Terraform first
    logger.info('Initializing Terraform', { jobId });
    await executeDockerCommand('init -no-color', tempDir, 30000);
    
    // Stream the plan output
    streamCommandOutput(res, 'plan -no-color -detailed-exitcode', tempDir, jobId);
    
  } catch (error) {
    logger.error('Terraform plan error', { 
      jobId,
      error: error.message,
      username: req.user.username 
    });
    
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = error.message;
      job.completedAt = Date.now();
      
      // Clean up temp directory
      if (job.tempDir && fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Plan execution failed',
        message: error.message,
        jobId
      });
    }
  }
});

// POST /terraform/apply
router.post('/apply', validateTerraformConfig, async (req, res) => {
  const jobId = uuidv4();
  const { config, variables = {} } = req.validatedData;
  
  try {
    logger.info('Terraform apply requested', { 
      jobId,
      username: req.user.username,
      configLength: config.length,
      variableCount: Object.keys(variables).length
    });
    
    // Security check
    const securityWarnings = securityCheck(config);
    if (securityWarnings.length > 0) {
      logger.warn('Security warnings for apply', { jobId, warnings: securityWarnings });
    }
    
    // Create job tracking
    jobs.set(jobId, {
      id: jobId,
      type: 'apply',
      status: 'initializing',
      user: req.user.username,
      createdAt: Date.now(),
      securityWarnings
    });
    
    // Create workspace
    const tempDir = await createTerraformWorkspace(jobId, config, variables);
    jobs.get(jobId).tempDir = tempDir;
    
    // Initialize Terraform first
    logger.info('Initializing Terraform', { jobId });
    await executeDockerCommand('init -no-color', tempDir, 30000);
    
    // Stream the apply output
    streamCommandOutput(res, 'apply -auto-approve -no-color', tempDir, jobId);
    
  } catch (error) {
    logger.error('Terraform apply error', { 
      jobId,
      error: error.message,
      username: req.user.username 
    });
    
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = error.message;
      job.completedAt = Date.now();
      
      // Clean up temp directory
      if (job.tempDir && fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Apply execution failed',
        message: error.message,
        jobId
      });
    }
  }
});

// GET /terraform/status/:jobId
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      message: 'The specified job ID does not exist or has expired'
    });
  }
  
  // Only allow users to see their own jobs (or admins to see all)
  if (job.user !== req.user.username && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You can only view your own jobs'
    });
  }
  
  res.json({
    success: true,
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      user: job.user,
      createdAt: new Date(job.createdAt).toISOString(),
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
      duration: job.completedAt ? job.completedAt - job.createdAt : null,
      exitCode: job.exitCode,
      error: job.error,
      securityWarnings: job.securityWarnings
    }
  });
});

// GET /terraform/jobs (list all jobs for current user)
router.get('/jobs', (req, res) => {
  const userJobs = Array.from(jobs.values())
    .filter(job => job.user === req.user.username || req.user.role === 'admin')
    .map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      user: job.user,
      createdAt: new Date(job.createdAt).toISOString(),
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
      duration: job.completedAt ? job.completedAt - job.createdAt : null
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    success: true,
    jobs: userJobs,
    total: userJobs.length
  });
});

module.exports = router;
