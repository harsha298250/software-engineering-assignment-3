import { firebaseConfig } from '../../lib/firebase-admin.ts';
import { AppError, ForbiddenError } from '../errors.ts';

export const SERVER_TIMESTAMP = Symbol('SERVER_TIMESTAMP');
export type ServerTimestampSentinel = typeof SERVER_TIMESTAMP;
export type FieldInputValue = unknown | ServerTimestampSentinel;

export interface WhereFilter {
  field: string;
  op: 'EQUAL' | 'NOT_EQUAL' | 'LESS_THAN' | 'GREATER_THAN' | 'IN';
  value: unknown;
}

export interface QueryOptions {
  where?: WhereFilter[];
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' };
  limit?: number;
}

export interface DocSnapshot<T = Record<string, unknown>> {
  exists: boolean;
  id: string;
  data: T | null;
  updateTime?: string;
}

export interface FirestoreTransaction {
  getDoc<T = Record<string, unknown>>(collection: string, id: string): Promise<DocSnapshot<T>>;
  query<T = Record<string, unknown>>(
    collection: string,
    options?: QueryOptions
  ): Promise<Array<{ id: string; data: T }>>;
  set(collection: string, id: string, data: Record<string, FieldInputValue>): void;
  update(collection: string, id: string, patch: Record<string, FieldInputValue>): void;
  delete(collection: string, id: string): void;
}

export interface FirestoreClient {
  getDoc<T = Record<string, unknown>>(
    collection: string,
    id: string,
    authToken?: string
  ): Promise<DocSnapshot<T>>;
  query<T = Record<string, unknown>>(
    collection: string,
    options?: QueryOptions,
    authToken?: string
  ): Promise<Array<{ id: string; data: T }>>;
  set(
    collection: string,
    id: string,
    data: Record<string, FieldInputValue>,
    authToken?: string
  ): Promise<void>;
  update(
    collection: string,
    id: string,
    patch: Record<string, FieldInputValue>,
    authToken?: string
  ): Promise<void>;
  delete(collection: string, id: string, authToken?: string): Promise<void>;
  commitBatch(
    ops: Array<
      | { type: 'set'; collection: string; id: string; data: Record<string, FieldInputValue> }
      | { type: 'update'; collection: string; id: string; data: Record<string, FieldInputValue> }
      | { type: 'delete'; collection: string; id: string }
    >,
    authToken?: string
  ): Promise<void>;
  runTransaction<R>(
    fn: (tx: FirestoreTransaction) => Promise<R>,
    authToken?: string
  ): Promise<R>;
}

class TransactionAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionAbortedError';
  }
}

interface FirestoreRestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreRestValue>;
  createTime?: string;
  updateTime?: string;
}

function encodeValue(val: unknown): FirestoreRestValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreRestValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function decodeValue(val: FirestoreRestValue): unknown {
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map((item) => decodeValue(item));
  }
  if ('mapValue' in val) {
    return decodeFields(val.mapValue?.fields || {});
  }
  return null;
}

function decodeFields(fields: Record<string, FirestoreRestValue> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

type RestPrecondition = { exists: boolean } | { updateTime: string };

type RestBatchOp =
  | {
      type: 'set';
      collection: string;
      id: string;
      data: Record<string, FieldInputValue>;
      precondition?: RestPrecondition;
    }
  | {
      type: 'update';
      collection: string;
      id: string;
      data: Record<string, FieldInputValue>;
      precondition?: RestPrecondition;
    }
  | {
      type: 'delete';
      collection: string;
      id: string;
      precondition?: RestPrecondition;
    };

function buildRestWrite(
  docName: string,
  opType: 'set' | 'update' | 'delete',
  data?: Record<string, FieldInputValue>,
  precondition?: RestPrecondition
) {
  if (opType === 'delete') {
    const delWrite: Record<string, unknown> = { delete: docName };
    if (precondition) {
      delWrite.currentDocument = precondition;
    }
    return delWrite;
  }

  const fields: Record<string, FirestoreRestValue> = {};
  const updateTransforms: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }> = [];
  const maskPaths: string[] = [];

  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined) continue;
    maskPaths.push(k);
    if (v === SERVER_TIMESTAMP) {
      updateTransforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
    } else {
      fields[k] = encodeValue(v);
    }
  }

  const write: Record<string, unknown> = {
    update: {
      name: docName,
      fields,
    },
  };

  if (opType === 'update') {
    write.updateMask = { fieldPaths: maskPaths };
    write.currentDocument = precondition ?? { exists: true };
  } else if (precondition) {
    write.currentDocument = precondition;
  }

  if (updateTransforms.length > 0) {
    write.updateTransforms = updateTransforms;
  }

  return write;
}

function buildStructuredQuery(collection: string, options?: QueryOptions) {
  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collection }],
  };

  if (options?.where && options.where.length > 0) {
    const filters = options.where.map((w) => ({
      fieldFilter: {
        field: { fieldPath: w.field },
        op: w.op,
        value: encodeValue(w.value),
      },
    }));
    structuredQuery.where =
      filters.length === 1
        ? filters[0]
        : { compositeFilter: { op: 'AND', filters } };
  }

  if (options?.orderBy) {
    structuredQuery.orderBy = [
      {
        field: { fieldPath: options.orderBy.field },
        direction: options.orderBy.direction || 'ASCENDING',
      },
    ];
  }

  if (options?.limit) {
    structuredQuery.limit = options.limit;
  }

  return structuredQuery;
}

export class RestFirestoreClient implements FirestoreClient {
  private readonly projectId = firebaseConfig.projectId;
  private readonly databaseId = firebaseConfig.firestoreDatabaseId;
  private readonly apiKey = firebaseConfig.apiKey;

  private get docRootPath() {
    return `projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }

  private get baseUrl() {
    return `https://firestore.googleapis.com/v1/${this.docRootPath}`;
  }

  private headers(authToken?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
    if (authToken) {
      h.Authorization = `Bearer ${authToken}`;
    }
    return h;
  }

  private async parseError(res: Response, context?: string): Promise<Error> {
    let text = '';
    let statusStr = '';
    let msg = `Firestore request failed (${res.status})`;
    try {
      text = await res.text();
      const parsed = JSON.parse(text);
      const errObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
      if (errObj?.message) msg = errObj.message;
      if (errObj?.status) statusStr = errObj.status;
    } catch {
      if (text) msg = text;
    }

    if (context) {
      console.error(`[Firestore REST ${res.status}] ${context}: ${msg}`);
    }

    if (
      res.status === 409 ||
      statusStr === 'ABORTED' ||
      statusStr === 'FAILED_PRECONDITION' ||
      statusStr === 'ALREADY_EXISTS'
    ) {
      return new TransactionAbortedError(msg);
    }
    if (res.status === 403 || statusStr === 'PERMISSION_DENIED') {
      return new ForbiddenError(context ? `${context}: ${msg}` : msg);
    }
    return new Error(context ? `${context}: ${msg}` : msg);
  }

  async getDoc<T = Record<string, unknown>>(
    collection: string,
    id: string,
    authToken?: string
  ): Promise<DocSnapshot<T>> {
    const url = `${this.baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(authToken),
    });

    if (res.status === 404) {
      return { exists: false, id, data: null };
    }
    if (!res.ok) {
      throw await this.parseError(res, `GET ${collection}/${id}`);
    }

    const doc = (await res.json()) as FirestoreRestDocument;
    return {
      exists: true,
      id,
      data: decodeFields(doc.fields) as T,
      updateTime: doc.updateTime,
    };
  }

  async query<T = Record<string, unknown>>(
    collection: string,
    options?: QueryOptions,
    authToken?: string
  ): Promise<Array<{ id: string; data: T }>> {
    const body: Record<string, unknown> = {
      structuredQuery: buildStructuredQuery(collection, options),
    };

    const res = await fetch(`${this.baseUrl}:runQuery`, {
      method: 'POST',
      headers: this.headers(authToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await this.parseError(res, `QUERY ${collection}`);
    }

    const rows = (await res.json()) as Array<{ document?: FirestoreRestDocument }>;
    const results: Array<{ id: string; data: T }> = [];
    for (const row of rows) {
      if (!row.document) continue;
      const parts = row.document.name.split('/');
      const id = parts[parts.length - 1];
      results.push({
        id,
        data: decodeFields(row.document.fields) as T,
      });
    }
    return results;
  }

  async commitBatch(ops: RestBatchOp[], authToken?: string): Promise<void> {
    if (ops.length === 0) return;

    const writes = ops.map((op) => {
      const docName = `${this.docRootPath}/${op.collection}/${op.id}`;
      return buildRestWrite(
        docName,
        op.type,
        'data' in op ? op.data : undefined,
        op.precondition
      );
    });

    const res = await fetch(`${this.baseUrl}:commit`, {
      method: 'POST',
      headers: this.headers(authToken),
      body: JSON.stringify({ writes }),
    });

    if (!res.ok) {
      const targetSummary = ops.map((o) => `${o.type}:${o.collection}/${o.id}`).slice(0, 5).join(', ');
      throw await this.parseError(res, `COMMIT (${ops.length} ops: ${targetSummary})`);
    }
  }

  async set(
    collection: string,
    id: string,
    data: Record<string, FieldInputValue>,
    authToken?: string
  ): Promise<void> {
    await this.commitBatch([{ type: 'set', collection, id, data }], authToken);
  }

  async update(
    collection: string,
    id: string,
    patch: Record<string, FieldInputValue>,
    authToken?: string
  ): Promise<void> {
    await this.commitBatch([{ type: 'update', collection, id, data: patch }], authToken);
  }

  async delete(collection: string, id: string, authToken?: string): Promise<void> {
    await this.commitBatch([{ type: 'delete', collection, id }], authToken);
  }

  async runTransaction<R>(
    fn: (tx: FirestoreTransaction) => Promise<R>,
    authToken?: string
  ): Promise<R> {
    const maxAttempts = 6;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const readSnapshots = new Map<string, DocSnapshot<unknown>>();
      const pendingOps: RestBatchOp[] = [];

      const tx: FirestoreTransaction = {
        getDoc: async <T = Record<string, unknown>>(col: string, id: string) => {
          const snap = await this.getDoc<T>(col, id, authToken);
          const key = `${col}/${id}`;
          if (!readSnapshots.has(key)) {
            readSnapshots.set(key, snap as DocSnapshot<unknown>);
          }
          return snap;
        },
        query: (col, opts) => this.query(col, opts, authToken),
        set: (col, id, data) => pendingOps.push({ type: 'set', collection: col, id, data }),
        update: (col, id, data) => pendingOps.push({ type: 'update', collection: col, id, data }),
        delete: (col, id) => pendingOps.push({ type: 'delete', collection: col, id }),
      };

      try {
        const result = await fn(tx);
        const opsWithPreconditions: RestBatchOp[] = pendingOps.map((op) => {
          const snap = readSnapshots.get(`${op.collection}/${op.id}`);
          if (!snap) return op;
          if (snap.exists && snap.updateTime) {
            return { ...op, precondition: { updateTime: snap.updateTime } };
          }
          if (!snap.exists && op.type === 'set') {
            return { ...op, precondition: { exists: false } };
          }
          return op;
        });

        await this.commitBatch(opsWithPreconditions, authToken);
        return result;
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        if (err instanceof TransactionAbortedError && attempt < maxAttempts) {
          const jitter = Math.floor(Math.random() * 40);
          await new Promise((r) => setTimeout(r, 30 * attempt + jitter));
          continue;
        }

        throw err;
      }
    }

    throw new TransactionAbortedError('Transaction failed after maximum contention retries.');
  }
}

/**
 * Optimistic Concurrency Control in-memory Firestore transport for deterministic
 * unit & concurrent transaction tests without external service-account keys.
 */
export class InMemoryFirestoreClient implements FirestoreClient {
  private collections = new Map<string, Map<string, { data: Record<string, unknown>; version: number }>>();
  private seq = 1;

  private getCol(name: string) {
    let col = this.collections.get(name);
    if (!col) {
      col = new Map();
      this.collections.set(name, col);
    }
    return col;
  }

  private resolveValue(val: unknown): unknown {
    if (val === SERVER_TIMESTAMP) return new Date().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val.map((v) => this.resolveValue(v));
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v !== undefined) out[k] = this.resolveValue(v);
      }
      return out;
    }
    return val;
  }

  private clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  private matchesFilters(data: Record<string, unknown>, where?: WhereFilter[]): boolean {
    if (!where || where.length === 0) return true;
    return where.every((f) => {
      const actual = data[f.field];
      switch (f.op) {
        case 'EQUAL':
          return actual === f.value;
        case 'NOT_EQUAL':
          return actual !== f.value;
        case 'LESS_THAN':
          return String(actual) < String(f.value);
        case 'GREATER_THAN':
          return String(actual) > String(f.value);
        case 'IN':
          return Array.isArray(f.value) && f.value.includes(actual);
        default:
          return true;
      }
    });
  }

  async getDoc<T = Record<string, unknown>>(collection: string, id: string): Promise<DocSnapshot<T>> {
    const entry = this.getCol(collection).get(id);
    if (!entry) return { exists: false, id, data: null };
    return { exists: true, id, data: this.clone(entry.data) as T };
  }

  async query<T = Record<string, unknown>>(
    collection: string,
    options?: QueryOptions
  ): Promise<Array<{ id: string; data: T }>> {
    const col = this.getCol(collection);
    let rows = Array.from(col.entries())
      .filter(([, entry]) => this.matchesFilters(entry.data, options?.where))
      .map(([id, entry]) => ({ id, data: this.clone(entry.data) as T }));

    if (options?.orderBy) {
      const field = options.orderBy.field;
      const dir = options.orderBy.direction === 'DESCENDING' ? -1 : 1;
      rows.sort((a, b) => {
        const av = String((a.data as Record<string, unknown>)[field] ?? '');
        const bv = String((b.data as Record<string, unknown>)[field] ?? '');
        return av.localeCompare(bv) * dir;
      });
    }

    if (options?.limit) {
      rows = rows.slice(0, options.limit);
    }

    return rows;
  }

  async commitBatch(
    ops: Array<
      | { type: 'set'; collection: string; id: string; data: Record<string, FieldInputValue> }
      | { type: 'update'; collection: string; id: string; data: Record<string, FieldInputValue> }
      | { type: 'delete'; collection: string; id: string }
    >
  ): Promise<void> {
    for (const op of ops) {
      const col = this.getCol(op.collection);
      if (op.type === 'delete') {
        col.delete(op.id);
      } else if (op.type === 'set') {
        col.set(op.id, {
          data: this.resolveValue(op.data) as Record<string, unknown>,
          version: this.seq++,
        });
      } else {
        const prev = col.get(op.id);
        if (!prev) throw new Error(`Document ${op.collection}/${op.id} does not exist.`);
        col.set(op.id, {
          data: {
            ...prev.data,
            ...(this.resolveValue(op.data) as Record<string, unknown>),
          },
          version: this.seq++,
        });
      }
    }
  }

  async set(collection: string, id: string, data: Record<string, FieldInputValue>): Promise<void> {
    await this.commitBatch([{ type: 'set', collection, id, data }]);
  }

  async update(collection: string, id: string, patch: Record<string, FieldInputValue>): Promise<void> {
    await this.commitBatch([{ type: 'update', collection, id, data: patch }]);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.commitBatch([{ type: 'delete', collection, id }]);
  }

  async runTransaction<R>(fn: (tx: FirestoreTransaction) => Promise<R>): Promise<R> {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const readVersions = new Map<string, number>();
      const pendingOps: Array<
        | { type: 'set'; collection: string; id: string; data: Record<string, FieldInputValue> }
        | { type: 'update'; collection: string; id: string; data: Record<string, FieldInputValue> }
        | { type: 'delete'; collection: string; id: string }
      > = [];

      const tx: FirestoreTransaction = {
        getDoc: async <T = Record<string, unknown>>(collection: string, id: string) => {
          // Yield to microtask/event-loop so concurrent transactions interleave realistically
          await Promise.resolve();
          const entry = this.getCol(collection).get(id);
          const key = `${collection}/${id}`;
          if (!readVersions.has(key)) {
            readVersions.set(key, entry ? entry.version : 0);
          }
          if (!entry) return { exists: false, id, data: null };
          return { exists: true, id, data: this.clone(entry.data) as T };
        },
        query: async <T = Record<string, unknown>>(collection: string, options?: QueryOptions) => {
          await Promise.resolve();
          const rows = await this.query<T>(collection, options);
          for (const row of rows) {
            const key = `${collection}/${row.id}`;
            const entry = this.getCol(collection).get(row.id);
            if (!readVersions.has(key)) {
              readVersions.set(key, entry ? entry.version : 0);
            }
          }
          return rows;
        },
        set: (col, id, data) => pendingOps.push({ type: 'set', collection: col, id, data }),
        update: (col, id, data) => pendingOps.push({ type: 'update', collection: col, id, data }),
        delete: (col, id) => pendingOps.push({ type: 'delete', collection: col, id }),
      };

      try {
        const result = await fn(tx);
        // Atomic conflict check & commit
        for (const [key, expectedVersion] of readVersions.entries()) {
          const [colName, docId] = key.split('/');
          const currentVersion = this.getCol(colName).get(docId)?.version ?? 0;
          if (currentVersion !== expectedVersion) {
            throw new TransactionAbortedError(`Concurrent write conflict on ${key}`);
          }
        }
        await this.commitBatch(pendingOps);
        return result;
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }
        if (err instanceof TransactionAbortedError && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 5 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new TransactionAbortedError('In-memory transaction contention limit exceeded.');
  }
}

let activeClient: FirestoreClient = new RestFirestoreClient();

export function getFirestoreClient(): FirestoreClient {
  return activeClient;
}

export function setFirestoreClientForTesting(client: FirestoreClient): void {
  activeClient = client;
}
