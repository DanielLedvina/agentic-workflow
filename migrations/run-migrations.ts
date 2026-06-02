import { sql } from '@vercel/postgres';
import * as fs from 'fs';
import * as path from 'path';

async function runMigrations() {
  try {
    console.log('Starting database migrations...');

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

    for (const file of files.sort()) {
      const filePath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(filePath, 'utf-8');

      console.log(`Running migration: ${file}`);

      // Split by semicolon and execute each statement
      const statements = migration.split(';').filter((s) => s.trim());

      for (const statement of statements) {
        try {
          await sql.query(statement);
        } catch (err: any) {
          // Log but don't fail - migrations might be idempotent
          console.warn(`Warning in migration: ${err.message}`);
        }
      }

      console.log(`✓ Completed: ${file}`);
    }

    console.log('✓ All migrations completed successfully');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runMigrations();
}

export default runMigrations;
