# Use Node.js 18
FROM node:18

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose Cloud Run port
EXPOSE 8080

# Start the app
CMD ["node", "index.js"]
