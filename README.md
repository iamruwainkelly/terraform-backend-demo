# Terraform Backend API

A secure Node.js Express API for executing Terraform operations in isolated Docker containers with JWT authentication, rate limiting, and comprehensive logging.

## 🔒 Security Features

- **Docker Sandboxing**: Each Terraform operation runs in an isolated container
- **JWT Authentication**: Bearer token-based authentication system
- **Input Sanitization**: Prevents command injection and malicious input
- **Rate Limiting**: Configurable request limits per IP
- **AWS Credentials Protection**: Environment-based credential management
- **Execution Timeouts**: 60-second limits prevent resource exhaustion
- **Automatic Cleanup**: Temporary files are automatically removed
- **Comprehensive Logging**: All operations logged to files
- **Security Headers**: Helmet.js for HTTP security headers

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- AWS CLI configured or AWS credentials

### Installation

1. **Clone and setup**:
   ```bash
   cd terraform-backend
   cp .env.example .env
   ```

2. **Configure environment**:
   Edit `.env` file with your settings:
   ```bash
   # Required AWS credentials
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   AWS_DEFAULT_REGION=us-east-1
   
   # Required JWT secret (minimum 32 characters)
   JWT_SECRET=your_super_secure_jwt_secret_key_here_minimum_32_characters
   
   # Optional configuration
   PORT=3001
   NODE_ENV=development
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Or use Docker**:
   ```bash
   docker-compose up -d
   ```

## 📡 API Endpoints

### Authentication

#### POST `/auth/login`
Login and receive JWT token.

**Request**:
```json
{
  "username": "admin",
  "password": "Admin123!@#"
}
```

**Response**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "admin",
    "role": "admin",
    "email": "admin@terraform-api.local"
  },
  "expiresIn": "24h"
}
```

#### POST `/auth/register` (Admin Only)
Create new user account.

**Headers**: `Authorization: Bearer <token>`

**Request**:
```json
{
  "username": "newuser",
  "password": "SecurePass123!",
  "email": "user@example.com",
  "role": "user"
}
```

### Terraform Operations

#### POST `/terraform/plan`
Execute `terraform plan` in isolated container.

**Headers**: `Authorization: Bearer <token>`

**Request**:
```json
{
  "config": "resource \"aws_instance\" \"example\" {\n  ami = \"ami-0c02fb55956c7d316\"\n  instance_type = \"t2.micro\"\n}",
  "format": "hcl",
  "variables": {
    "region": "us-east-1",
    "environment": "dev"
  }
}
```

**Response**: Server-Sent Events stream with real-time output:
```
event: start
data: {"message":"Starting Terraform operation...","timestamp":"2025-05-30T20:30:00.000Z"}

event: output  
data: {"message":"Initializing the backend...\n","type":"stdout"}

event: complete
data: {"exitCode":0,"success":true,"message":"Operation completed successfully"}
```

#### POST `/terraform/apply`
Execute `terraform apply -auto-approve` in isolated container.

**Headers**: `Authorization: Bearer <token>`

**Request**: Same format as `/terraform/plan`

**Response**: Server-Sent Events stream with real-time output

#### GET `/terraform/status/:jobId`
Get status of a specific Terraform job.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "plan",
    "status": "completed",
    "user": "admin", 
    "createdAt": "2025-05-30T20:30:00.000Z",
    "completedAt": "2025-05-30T20:30:45.000Z",
    "duration": 45000,
    "exitCode": 0
  }
}
```

#### GET `/terraform/jobs`
List all jobs for current user.

**Headers**: `Authorization: Bearer <token>`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `3001` | No |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | - | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | - | Yes |
| `AWS_DEFAULT_REGION` | AWS region | `us-east-1` | No |
| `EXECUTION_TIMEOUT_MS` | Terraform timeout | `60000` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit max | `100` | No |
| `DOCKER_IMAGE` | Terraform image | `hashicorp/terraform:latest` | No |

### Default Users

- **Username**: `admin`
- **Password**: `Admin123!@#` (change in production!)
- **Role**: `admin`

## 🛡️ Security Best Practices

### Production Deployment

1. **Change default credentials**:
   ```bash
   # Set strong admin password
   ADMIN_PASSWORD=YourSecurePassword123!
   ```

2. **Use strong JWT secret**:
   ```bash
   # Generate secure secret
   openssl rand -base64 32
   ```

3. **Configure rate limiting**:
   ```bash
   RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
   RATE_LIMIT_MAX_REQUESTS=50   # 50 requests per window
   ```

4. **Use HTTPS in production**:
   - Configure SSL certificates
   - Set `NODE_ENV=production`
   - Use reverse proxy (nginx)

5. **Monitor logs**:
   ```bash
   tail -f logs/terraform.log
   npm run logs
   ```

### AWS Credentials Security

- **Never expose AWS credentials to frontend**
- Use IAM roles with minimal permissions
- Rotate credentials regularly
- Monitor AWS CloudTrail for API usage

### Docker Security

- Containers run with `--network none` (no network access)
- Memory limited to 512MB
- CPU limited to 1.0 core
- Automatic cleanup after execution
- Read-only filesystem where possible

## 🔌 Frontend Integration

### Vue.js Example

```javascript
// terraform-api.js
class TerraformAPI {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async login(username, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    if (data.success) {
      this.token = data.token;
      localStorage.setItem('terraform_token', data.token);
    }
    return data;
  }

  async executePlan(config, variables = {}) {
    const response = await fetch(`${this.baseURL}/terraform/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ config, variables })
    });

    // Handle Server-Sent Events
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *stream() {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              yield JSON.parse(line.slice(6));
            }
          }
        }
      }
    };
  }
}

// Usage in Vue component
export default {
  data() {
    return {
      api: new TerraformAPI('http://localhost:3001', null),
      output: [],
      isExecuting: false
    };
  },
  
  methods: {
    async executeTerraform() {
      this.isExecuting = true;
      this.output = [];
      
      try {
        const execution = await this.api.executePlan(this.terraformConfig);
        
        for await (const event of execution.stream()) {
          if (event.message) {
            this.output.push(event);
          }
        }
      } catch (error) {
        console.error('Terraform execution failed:', error);
      } finally {
        this.isExecuting = false;
      }
    }
  }
};
```

## 📊 Monitoring & Logging

### Log Files

- `logs/terraform.log` - All application logs
- `logs/error.log` - Error logs only

### Log Format

```json
{
  "level": "info",
  "message": "Terraform plan requested",
  "timestamp": "2025-05-30 20:30:00",
  "service": "terraform-backend",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin",
  "configLength": 150
}
```

### Health Check

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "healthy",
  "timestamp": "2025-05-30T20:30:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0"
}
```

## 🐳 Docker Commands

```bash
# Build image
npm run docker:build

# Start services
npm run docker:run

# Stop services  
npm run docker:stop

# View logs
docker-compose logs -f terraform-backend

# Shell into container
docker exec -it terraform-backend sh
```

## 🧪 Testing

```bash
# Run tests
npm test

# Test authentication
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!@#"}'

# Test Terraform plan
curl -X POST http://localhost:3001/terraform/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"config":"resource \"aws_instance\" \"test\" { ami = \"ami-12345\" }"}'
```

## 🚨 Troubleshooting

### Common Issues

1. **Docker permission denied**:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. **AWS credentials not working**:
   ```bash
   aws sts get-caller-identity  # Test credentials
   ```

3. **Rate limit exceeded**:
   ```bash
   # Wait for rate limit window to reset
   # Or increase limits in .env
   ```

4. **Container execution fails**:
   ```bash
   # Check Docker logs
   docker logs terraform-backend
   
   # Check Terraform image
   docker pull hashicorp/terraform:latest
   ```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Ensure security best practices
5. Submit pull request

---

**⚠️ Security Notice**: This API executes Terraform configurations with AWS credentials. Always validate configurations, use minimal IAM permissions, and monitor all activities in production environments.
