# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install PM2 globally
RUN npm install pm2 -g

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Create necessary directories
RUN mkdir -p logs/pm2

# Set environment variables
ENV NODE_ENV=production

# Expose port (if needed)
EXPOSE 3000

# Start the application using PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
