# Use official MongoDB 6.0 as base
FROM mongo:6.0

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create MongoDB data directory with correct permissions
RUN mkdir -p /data/db && chown -R mongodb:mongodb /data/db

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy application code
COPY . .

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose app port
EXPOSE 3000

# Launch both MongoDB and Node via startup script
CMD ["/start.sh"]
