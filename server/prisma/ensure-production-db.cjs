const { execFileSync } = require('child_process');
const { existsSync, mkdirSync, readFileSync } = require('fs');
const path = require('path');

const serverRoot = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(serverRoot, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]]) continue;

    const value = match[2].trim().replace(/^["']|["']$/g, '');
    process.env[match[1]] = value;
  }
}

function ensureSqliteDirectory() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith('file:')) return;

  const rawPath = databaseUrl.slice('file:'.length);
  const dbPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(serverRoot, 'prisma', rawPath);
  mkdirSync(path.dirname(dbPath), { recursive: true });
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: serverRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function migrateLegacyBorrowRequests() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'BorrowRequest'",
    );
    if (!tables.length) return;

    const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("BorrowRequest")');
    const columnNames = new Set(columns.map((column) => column.name));
    if (columnNames.has('requestedType') || !columnNames.has('deviceId')) return;

    console.log('Migrating legacy BorrowRequest.deviceId data to request/items structure...');

    const oldColumn = (name, fallback = 'NULL') =>
      columnNames.has(name) ? `"BorrowRequest"."${name}"` : fallback;

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    await prisma.$executeRawUnsafe('BEGIN TRANSACTION');
    try {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "BorrowRequest_new"');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "BorrowItem" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "borrowRequestId" TEXT NOT NULL,
          "deviceId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PICKED_UP',
          "pickedUpAt" DATETIME,
          "returnedAt" DATETIME,
          "returnCondition" TEXT,
          "returnRemark" TEXT,
          "returnLocation" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "BorrowItem_borrowRequestId_fkey" FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "BorrowItem_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO "BorrowItem" (
          "id",
          "borrowRequestId",
          "deviceId",
          "status",
          "pickedUpAt",
          "returnedAt",
          "returnCondition",
          "returnRemark",
          "returnLocation",
          "createdAt",
          "updatedAt"
        )
        SELECT
          'migrated-' || "BorrowRequest"."id" || '-' || "BorrowRequest"."deviceId",
          "BorrowRequest"."id",
          "BorrowRequest"."deviceId",
          CASE WHEN "BorrowRequest"."status" = 'RETURNED' THEN 'RETURNED' ELSE 'PICKED_UP' END,
          ${oldColumn('pickedUpAt')},
          ${oldColumn('returnedAt')},
          ${oldColumn('returnCondition')},
          ${oldColumn('returnRemark')},
          ${oldColumn('returnLocation')},
          ${oldColumn('createdAt', 'CURRENT_TIMESTAMP')},
          ${oldColumn('updatedAt', 'CURRENT_TIMESTAMP')}
        FROM "BorrowRequest"
        WHERE "BorrowRequest"."status" IN ('PICKED_UP', 'OVERDUE', 'RETURNED')
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "BorrowRequest_new" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "requestedName" TEXT NOT NULL,
          "requestedType" TEXT NOT NULL,
          "requestedBrand" TEXT,
          "requestedModel" TEXT,
          "quantity" INTEGER NOT NULL DEFAULT 1,
          "applicantId" TEXT NOT NULL,
          "departmentId" TEXT,
          "borrowStartAt" DATETIME NOT NULL,
          "borrowEndAt" DATETIME NOT NULL,
          "purpose" TEXT NOT NULL,
          "remark" TEXT,
          "attachmentNames" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
          "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
          "pickedUpAt" DATETIME,
          "returnedAt" DATETIME,
          "returnCondition" TEXT,
          "returnRemark" TEXT,
          "returnLocation" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "BorrowRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "BorrowRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "BorrowRequest_new" (
          "id",
          "requestedName",
          "requestedType",
          "requestedBrand",
          "requestedModel",
          "quantity",
          "applicantId",
          "departmentId",
          "borrowStartAt",
          "borrowEndAt",
          "purpose",
          "remark",
          "attachmentNames",
          "status",
          "approvalRequired",
          "pickedUpAt",
          "returnedAt",
          "returnCondition",
          "returnRemark",
          "returnLocation",
          "createdAt",
          "updatedAt"
        )
        SELECT
          "BorrowRequest"."id",
          COALESCE("Device"."name", '未知设备'),
          COALESCE("Device"."type", '未分类'),
          "Device"."brand",
          "Device"."model",
          1,
          "BorrowRequest"."applicantId",
          ${oldColumn('departmentId')},
          "BorrowRequest"."borrowStartAt",
          "BorrowRequest"."borrowEndAt",
          "BorrowRequest"."purpose",
          ${oldColumn('remark')},
          ${oldColumn('attachmentNames')},
          "BorrowRequest"."status",
          ${oldColumn('approvalRequired', 'true')},
          ${oldColumn('pickedUpAt')},
          ${oldColumn('returnedAt')},
          ${oldColumn('returnCondition')},
          ${oldColumn('returnRemark')},
          ${oldColumn('returnLocation')},
          ${oldColumn('createdAt', 'CURRENT_TIMESTAMP')},
          ${oldColumn('updatedAt', 'CURRENT_TIMESTAMP')}
        FROM "BorrowRequest"
        LEFT JOIN "Device" ON "Device"."id" = "BorrowRequest"."deviceId"
      `);
      await prisma.$executeRawUnsafe('DROP TABLE "BorrowRequest"');
      await prisma.$executeRawUnsafe('ALTER TABLE "BorrowRequest_new" RENAME TO "BorrowRequest"');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "BorrowRequest_status_idx" ON "BorrowRequest" ("status")');
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "BorrowItem_borrowRequestId_deviceId_key" ON "BorrowItem" ("borrowRequestId", "deviceId")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "BorrowItem_deviceId_idx" ON "BorrowItem" ("deviceId")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "BorrowItem_borrowRequestId_idx" ON "BorrowItem" ("borrowRequestId")');
      await prisma.$executeRawUnsafe('COMMIT');
    } catch (error) {
      await prisma.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch(() => undefined);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  loadDotEnv();
  process.env.DATABASE_URL ||= 'file:./dev.db';
  process.env.JWT_SECRET ||= 'dev-secret';
  process.env.UPLOAD_DIR ||= existsSync('/data') ? '/data/uploads' : path.resolve(serverRoot, 'uploads');

  ensureSqliteDirectory();
  mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
  await migrateLegacyBorrowRequests();
  run('npx', ['prisma', 'db', 'push', '--skip-generate']);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('Database is empty. Seeding clean demo data...');
      await prisma.$disconnect();
      run('npx', ['tsx', 'prisma/seed.ts']);
      return;
    }

    console.log(`Database is ready. Existing users: ${userCount}`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
