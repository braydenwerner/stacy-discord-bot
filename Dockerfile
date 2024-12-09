# Use Node.js LTS (Long Term Support) version with Alpine Linux
# FROM node:20-alpine
FROM node:18-alpine as build

# Set working directory in container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose port 8080 
# EXPOSE 8080
EXPOSE  3000

# Command to run the application
CMD ["node", "dist/index.js"]

# # Setup Node
# FROM node:18-alpine as build

# # Dependency and Build
# WORKDIR /app
# COPY package*.json ./
# RUN npm install

# COPY . .

# # Create JS Build
# # RUN npm run build

# EXPOSE 3000

# CMD ["node", "index.js"]