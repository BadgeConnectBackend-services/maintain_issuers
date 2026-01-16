# ===============================
# Base image
# ===============================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# ===============================
# Install dependencies
# ===============================
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ===============================
# Copy source
# ===============================
COPY src ./src

# ===============================
# Runtime
# ===============================
EXPOSE 5000

CMD ["node", "src/server.js"]
