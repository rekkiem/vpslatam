#!/bin/sh
set -e

echo "▶ Running database migrations..."
# FIX BUG-16: prisma binary is in node_modules, schema at project root
cd /app
npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "▶ Starting API server..."
exec node apps/api/dist/index.js
