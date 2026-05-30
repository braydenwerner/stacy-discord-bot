# Use Node.js LTS (Long Term Support) version with Alpine Linux
# Node 22+ is required by @discordjs/voice >= 0.19.
FROM node:22-alpine

# Install FFmpeg using apk
RUN apk add --no-cache ffmpeg

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
