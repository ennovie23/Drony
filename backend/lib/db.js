import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkgPg from 'pg';

const { Pool } = pkgPg;
const { PrismaClient } = pkg;

// One shared pool with a capped connection limit for every route
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // limits concurrent connections to avoid hitting Neon limits
});

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
