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

async function main() {
  loadDotEnv();
  process.env.DATABASE_URL ||= 'file:./dev.db';
  process.env.JWT_SECRET ||= 'dev-secret';
  process.env.UPLOAD_DIR ||= path.resolve(serverRoot, 'uploads');

  ensureSqliteDirectory();
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
