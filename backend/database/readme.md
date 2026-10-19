Drony - Team Database, Migration, and Access Guide

1. OVERVIEW & PROJECT STRUCTURE
- Database configuration, schema, and migration files are centralized inside the backend/database/ folder.
- Folder layout:
  backend/
  ├── database/
  │   ├── prisma
  │   │   ├── schema.prisma
  │   │   └── migrations
  │   └── prisma7.config.ts
  └── .env

2. ENVIRONMENT SETUP (.ENV)
- Create a .env file inside the backend/ folder.
- You need two PostgreSQL connection strings from Neon (pooled for app queries, unpooled for migrations):
  DATABASE_URL=""
  DATABASE_URL_UNPOOLED=""

3. APPLYING DATABASE MIGRATIONS (TEAMMATES)
- When pulling the latest repository updates, teammates do not need to create new migrations.
- Navigate to the backend folder and run the deploy command with your custom config path:
  npx prisma migrate deploy --config=database/prisma7.config.ts
- This will automatically update their database to the latest version based on the tracked migration files.

4. CHECKING DATABASE MIGRATION STATUS
- To verify if your local environment is fully in sync with Neon, run:
  npx prisma migrate status --config=database/prisma7.config.ts

5. ACCESSING NEON DATABASE
- Project administrators can grant project permissions (Editor/Viewer) in the Neon Console dashboard under Settings > Project permissions, or share connection strings securely for local development.
- To visually explore tables and logs locally using Prisma Studio:
  npx prisma studio --config=database/prisma7.config.ts