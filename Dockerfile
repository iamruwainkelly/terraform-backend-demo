FROM node:18-alpine

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create app directory with proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p logs temp uploads && \
    chown -R nodeapp:nodejs /app

# Switch to non-root user
USER nodeapp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { host: 'localhost', port: process.env.PORT || 3001, path: '/health', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Expose port
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
