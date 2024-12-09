# Use Node.js LTS (Long Term Support) version with Alpine Linux
FROM node:20-alpine

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
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/index.js"]
