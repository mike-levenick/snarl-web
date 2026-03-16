import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import "dotenv/config";

const ADMINS = [
  { username: "thessarian", envVar: "ADMIN_THESSARIAN_PASSWORD" },
  { username: "marcus", envVar: "ADMIN_MARCUS_PASSWORD" },
  { username: "lyralei", envVar: "ADMIN_LYRALEI_PASSWORD" },
  { username: "kess", envVar: "ADMIN_KESS_PASSWORD" },
  { username: "velani", envVar: "ADMIN_VELANI_PASSWORD" },
];

async function main() {
  const sql = neon(process.env.POSTGRES_URL!);
  const db = drizzle(sql);

  for (const { username, envVar } of ADMINS) {
    const password = process.env[envVar];
    if (!password) {
      console.log(`Skipping ${username} — ${envVar} not set`);
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({ passwordHash, role: "admin" })
        .where(eq(users.username, username));
      console.log(`Updated ${username}`);
    } else {
      await db
        .insert(users)
        .values({ username, passwordHash, role: "admin" });
      console.log(`Created ${username}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
