// src/db/prismaClient.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export default prisma; // Export the single instance