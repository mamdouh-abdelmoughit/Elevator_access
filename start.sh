#!/bin/sh
set -e
echo "Running Prisma schema push..."
node_modules/.bin/prisma db push
echo "Starting server..."
exec node index.js
