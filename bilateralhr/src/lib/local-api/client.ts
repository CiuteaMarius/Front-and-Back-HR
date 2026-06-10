type QueryError = { message: string } | null;
type QueryResult<T = any> = { data: T | null; error: QueryError };
type Filter = { column: string; op: 'eq'; value: unknown };
type InFilter = { column: string; values: unknown[] };
type Order = { column: string; ascending?: boolean };
type Action = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const AUTH_TOKEN_KEY = 'bilateralhr_auth_token';

function authHeaders() {
  if (typeof window === 'undefined') {
    return {};
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || 'Local API request failed.');
  }

  return data as T;
}

class LocalQueryBuilder implements PromiseLike<QueryResult<any>> {
  private action: Action = 'select';
  private columns = '*';
  private filters: Filter[] = [];
  private inFilters: InFilter[] = [];
  private orExpression?: string;
  private orderBy?: Order;
  private rowLimit?: number;
  private maybeSingleResult = false;
  private values?: Record<string, unknown> | Array<Record<string, unknown>>;
  private onConflict?: string;

  constructor(private readonly table: string) {}

  select(columns = '*') {
    this.action = 'select';
    this.columns = columns;
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.action = 'insert';
    this.values = values;
    return this.execute();
  }

  update(values: Record<string, unknown>) {
    this.action = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(values: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.values = values;
    this.onConflict = options?.onConflict;
    return this.execute();
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push({ column, values });
    return this;
  }

  or(expression: string) {
    this.orExpression = expression;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending };
    return this;
  }

  limit(limit: number) {
    this.rowLimit = limit;
    return this;
  }

  maybeSingle() {
    this.maybeSingleResult = true;
    return this;
  }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      return await request<QueryResult>(`/api/db/${this.table}/query`, {
        method: 'POST',
        body: JSON.stringify({
          action: this.action,
          columns: this.columns,
          filters: this.filters,
          inFilters: this.inFilters,
          or: this.orExpression,
          order: this.orderBy,
          limit: this.rowLimit,
          maybeSingle: this.maybeSingleResult,
          values: this.values,
          onConflict: this.onConflict,
        }),
      });
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : 'Local API request failed.' },
      };
    }
  }
}

export function createClient() {
  return {
    from(table: string) {
      return new LocalQueryBuilder(table);
    },
    auth: {
      async getUser() {
        try {
          const data = await request<{ user: { profileId?: string; id: string; email: string } }>('/api/auth/me');
          const user = data.user;

          return {
            data: {
              user: {
                id: user.profileId || user.id,
                email: user.email,
              },
            },
            error: null,
          };
        } catch (error) {
          return {
            data: { user: null },
            error: { message: error instanceof Error ? error.message : 'Local API auth failed.' },
          };
        }
      },
    },
  };
}
