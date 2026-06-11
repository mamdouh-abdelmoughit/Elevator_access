FROM node:20-slim

WORKDIR /app

# openssl is required by Prisma's query engine
RUN apt-get update -y && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install all deps (prisma CLI needed for generate)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY . .

# Cloud Run injects PORT automatically; default to 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

COPY start.sh ./
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

CMD ["./start.sh"]
