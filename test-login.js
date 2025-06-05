#!/usr/bin/env node

const http = require('http');

// Test login credentials
const testLogin = (username, password) => {
  const postData = JSON.stringify({
    username: username,
    password: password
  });

  const options = {
    hostname: 'localhost',
    port: 3003,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log('Response:', data);
      
      if (res.statusCode === 200) {
        const result = JSON.parse(data);
        console.log('✅ Login successful!');
        console.log('Token:', result.token ? 'Generated' : 'Missing');
        console.log('User:', result.user);
      } else {
        console.log('❌ Login failed');
      }
    });
  });

  req.on('error', (err) => {
    console.log('❌ Connection error:', err.message);
    console.log('Is the backend running on port 3003?');
  });

  req.write(postData);
  req.end();
};

// Test health endpoint first
const testHealth = () => {
  const options = {
    hostname: 'localhost',
    port: 3003,
    path: '/health',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('=== Health Check ===');
      console.log(`Status: ${res.statusCode}`);
      if (res.statusCode === 200) {
        console.log('✅ Backend is running');
        console.log('Response:', data);
        
        // Test login after health check passes
        console.log('\n=== Testing Login ===');
        console.log('Testing with admin / Admin123!@');
        testLogin('admin', 'Admin123!@');
      } else {
        console.log('❌ Backend health check failed');
      }
    });
  });

  req.on('error', (err) => {
    console.log('❌ Backend is not running on port 3003');
    console.log('Error:', err.message);
  });

  req.end();
};

// Run the test
console.log('Testing Terraform Backend Login...');
testHealth();
