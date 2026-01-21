FROM ghcr.io/puppeteer/puppeteer:23.0.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy your server.js and config
COPY . .

# Start the server
CMD ["node", "server.js"]
