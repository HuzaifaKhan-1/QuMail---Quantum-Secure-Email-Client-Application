import 'dotenv/config';
import { pool, db } from './server/db';
import { sql } from 'drizzle-orm';

async function fix() {
    console.log("Dropping stale 'email' column from 'users' table...");
    try {
        await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS email;`);
        console.log("Success!");
    } catch (err) {
        console.error("Failed to drop column:", err);
    } finally {
        await pool.end();
    }
}

fix();
