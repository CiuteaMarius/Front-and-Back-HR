import dotenv from "dotenv";
import { Pool } from "pg";
import { hashPassword } from "../src/security.js";

dotenv.config();

type PasswordAccount = {
  email: string;
  password: string;
};

const accounts = JSON.parse(process.env.LOCAL_PASSWORDS_JSON ?? "[]") as PasswordAccount[];

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in backend/.env.");
}

if (!accounts.length) {
  throw new Error("Set LOCAL_PASSWORDS_JSON to an array of { email, password } objects.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  for (const account of accounts) {
    const { passwordHash, passwordSalt } = hashPassword(account.password);
    const result = await pool.query(
      `
        UPDATE local_auth_users
        SET password_hash = $1,
            password_salt = $2,
            password_reset_required = false,
            updated_at = now()
        WHERE lower(email) = lower($3)
      `,
      [passwordHash, passwordSalt, account.email],
    );

    if (result.rowCount !== 1) {
      throw new Error(`Expected to update 1 local auth user for ${account.email}, updated ${result.rowCount}.`);
    }

    console.log(`${account.email} updated`);
  }
} finally {
  await pool.end();
}
