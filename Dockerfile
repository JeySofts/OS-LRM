FROM node:18-slim

WORKDIR /app

# Copy lockfile first for reproducible builds
COPY package-lock.json package.json ./

# Use npm ci for reproducible install (requires package-lock.json)
RUN npm ci --only=production

# Copy application source
COPY . .

# Run as unprivileged user
RUN addgroup --system app && adduser --system --ingroup app app && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "server.js"]
