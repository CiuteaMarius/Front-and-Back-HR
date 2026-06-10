import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { hashPassword } from "../src/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const frontendEnvPath = path.resolve(backendRoot, "..", "bilateralhr", ".env.local");
const backendEnvPath = path.resolve(backendRoot, ".env");

dotenv.config({ path: frontendEnvPath });
dotenv.config({ path: backendEnvPath, override: true });

type TableName =
  | "profiles"
  | "departments"
  | "employees"
  | "employment_contracts"
  | "salary_history"
  | "leave_balances"
  | "requests"
  | "request_attachments"
  | "request_approved_dates"
  | "leave_days"
  | "work_time_exceptions"
  | "employee_documents"
  | "announcements"
  | "announcement_targets"
  | "notifications"
  | "report_exports";

type DbRow = Record<string, unknown>;

const tableOrder: TableName[] = [
  "profiles",
  "departments",
  "employees",
  "employment_contracts",
  "salary_history",
  "leave_balances",
  "requests",
  "request_attachments",
  "request_approved_dates",
  "leave_days",
  "work_time_exceptions",
  "employee_documents",
  "announcements",
  "announcement_targets",
  "notifications",
  "report_exports",
];

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const localDefaultPassword = process.env.LOCAL_DEFAULT_PASSWORD ?? "Parola123!";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL/key. Keep NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in bilateralhr/.env.local or set SUPABASE_URL/SUPABASE_ANON_KEY in backend/.env.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in backend/.env.");
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseKey = supabaseKey;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchTable(table: TableName): Promise<DbRow[]> {
  const response = await fetch(`${resolvedSupabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: resolvedSupabaseKey,
      Authorization: `Bearer ${resolvedSupabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table} from Supabase: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as DbRow[];
}

function withoutManagerReferences(table: TableName, rows: DbRow[]) {
  if (table === "employees") {
    return rows.map((row) => ({ ...row, manager_id: null }));
  }

  if (table === "departments") {
    return rows.map((row) => ({ ...row, manager_id: null }));
  }

  return rows;
}

async function insertRows(table: TableName, rows: DbRow[]) {
  if (rows.length === 0) {
    return 0;
  }

  await pool.query(
    `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify(withoutManagerReferences(table, rows))],
  );

  return rows.length;
}

async function restoreManagerReferences(employees: DbRow[], departments: DbRow[]) {
  for (const employee of employees) {
    if (employee.manager_id) {
      await pool.query("UPDATE employees SET manager_id = $2 WHERE id = $1", [employee.id, employee.manager_id]);
    }
  }

  for (const department of departments) {
    if (department.manager_id) {
      await pool.query("UPDATE departments SET manager_id = $2 WHERE id = $1", [department.id, department.manager_id]);
    }
  }
}

async function seedLocalAuthUsers(profiles: DbRow[]) {
  let count = 0;

  for (const profile of profiles) {
    if (!profile.id || !profile.email) {
      continue;
    }

    const { passwordHash, passwordSalt } = hashPassword(localDefaultPassword);
    await pool.query(
      `
        INSERT INTO local_auth_users (id, profile_id, email, password_hash, password_salt, password_reset_required)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (profile_id) DO UPDATE
        SET email = EXCLUDED.email,
            updated_at = now()
      `,
      [randomUUID(), profile.id, String(profile.email).toLowerCase(), passwordHash, passwordSalt],
    );
    count += 1;
  }

  return count;
}

async function main() {
  const exported = new Map<TableName, DbRow[]>();

  for (const table of tableOrder) {
    const rows = await fetchTable(table);
    exported.set(table, rows);
  }

  const client = await pool.connect();
  client.release();

  for (const table of tableOrder) {
    const rows = exported.get(table) ?? [];
    const inserted = await insertRows(table, rows);
    console.log(`${table}: imported ${inserted} row(s)`);
  }

  await restoreManagerReferences(exported.get("employees") ?? [], exported.get("departments") ?? []);
  const authCount = await seedLocalAuthUsers(exported.get("profiles") ?? []);
  console.log(`local_auth_users: ready for ${authCount} profile account(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
