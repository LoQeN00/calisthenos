import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import postgres from "postgres";
import { getEnv } from "~/lib/env";
import * as schema from "./schema";

const { DATABASE_URL, NODE_ENV } = getEnv();

const client = postgres(DATABASE_URL, { max: 10, idle_timeout: 20 });
export const db = drizzle(client, { schema, logger: NODE_ENV === "development" });

/**
 * Either the top-level postgres-js drizzle instance OR a transaction-scoped tx.
 * Use this as the parameter type for repository functions so callers can pass
 * the global `db` outside a transaction OR the `tx` argument from inside one.
 */
export type Db =
  | PostgresJsDatabase<typeof schema>
  | PgTransaction<
      PostgresJsQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >;
