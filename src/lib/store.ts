import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type RecordStatus = "APPROVED" | "RETIRED";
export type RefundDecision = "ALLOW" | "DENY";
export type CommitmentKind = "FEATURE" | "TIMELINE";

export type DeskRecord = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export type AnswerRecord = {
  id: string;
  deskId: string;
  topic: string;
  question: string;
  answer: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type RefundRuleRecord = {
  id: string;
  deskId: string;
  name: string;
  matchTerms: string[];
  decision: RefundDecision;
  remedy: string;
  windowDays: number | null;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type EscalationLimitRecord = {
  id: string;
  deskId: string;
  name: string;
  channel: string;
  tierLadder: string[];
  maxTier: string;
  allowRefundPromise: boolean;
  allowFeaturePromise: boolean;
  allowTimelinePromise: boolean;
  notes: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type CommitmentRecord = {
  id: string;
  deskId: string;
  kind: CommitmentKind;
  name: string;
  statement: string;
  status: RecordStatus;
  revision: number;
  updatedAt: string;
};

export type DeskExport = {
  desk: DeskRecord;
  answers: AnswerRecord[];
  refundRules: RefundRuleRecord[];
  escalationLimits: EscalationLimitRecord[];
  commitments: CommitmentRecord[];
};

export type DeskDb = <T>(pathname: string, options?: RequestInit) => Promise<T>;

export interface DeskStore {
  listDesks(offset: number): Promise<DeskRecord[]>;
  createDesk(name: string, description: string | null): Promise<DeskRecord>;
  getDesk(deskId: string): Promise<DeskRecord | null>;
  touchDesk(deskId: string): Promise<void>;
  deleteDesk(deskId: string): Promise<boolean>;
  exportDesk(deskId: string): Promise<DeskExport | null>;
  findAnswer(deskId: string, topic: string, question: string): Promise<AnswerRecord | null>;
  insertAnswer(row: AnswerRecord): Promise<AnswerRecord>;
  updateAnswer(row: AnswerRecord, expectedRevision: number): Promise<AnswerRecord | null>;
  listAnswers(deskId: string, offset: number, query: string, includeRetired: boolean): Promise<AnswerRecord[]>;
  listAnswersForRank(deskId: string): Promise<AnswerRecord[]>;
  findRefundRule(deskId: string, name: string): Promise<RefundRuleRecord | null>;
  insertRefundRule(row: RefundRuleRecord): Promise<RefundRuleRecord>;
  updateRefundRule(row: RefundRuleRecord, expectedRevision: number): Promise<RefundRuleRecord | null>;
  listRefundRules(deskId: string, includeRetired: boolean): Promise<RefundRuleRecord[]>;
  findEscalation(deskId: string, channel: string): Promise<EscalationLimitRecord | null>;
  insertEscalation(row: EscalationLimitRecord): Promise<EscalationLimitRecord>;
  updateEscalation(row: EscalationLimitRecord, expectedRevision: number): Promise<EscalationLimitRecord | null>;
  listEscalations(deskId: string, includeRetired: boolean): Promise<EscalationLimitRecord[]>;
  findCommitment(deskId: string, kind: CommitmentKind, name: string): Promise<CommitmentRecord | null>;
  insertCommitment(row: CommitmentRecord): Promise<CommitmentRecord>;
  updateCommitment(row: CommitmentRecord, expectedRevision: number): Promise<CommitmentRecord | null>;
  listCommitments(deskId: string, kind: CommitmentKind | undefined, includeRetired: boolean): Promise<CommitmentRecord[]>;
}

type FileShape = {
  desks: DeskRecord[];
  answers: AnswerRecord[];
  refundRules: RefundRuleRecord[];
  escalationLimits: EscalationLimitRecord[];
  commitments: CommitmentRecord[];
};

const emptyFile = (): FileShape => ({ desks: [], answers: [], refundRules: [], escalationLimits: [], commitments: [] });

function sameText(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function ownerFile(ownerId: string): string {
  const safe = /^[a-zA-Z0-9_-]{1,80}$/.test(ownerId) ? ownerId : "local";
  return `${safe}.json`;
}

export class FileDeskStore implements DeskStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly directory: string, private readonly ownerId: string) {}

  private async locked<T>(fn: (data: FileShape) => Promise<T> | T): Promise<T> {
    const run = this.chain.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = path.join(this.directory, ownerFile(this.ownerId));
      let data = emptyFile();
      try {
        const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<FileShape>;
        data = {
          desks: parsed.desks ?? [],
          answers: parsed.answers ?? [],
          refundRules: parsed.refundRules ?? [],
          escalationLimits: parsed.escalationLimits ?? [],
          commitments: parsed.commitments ?? []
        };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "ENOENT") throw error;
      }
      const result = await fn(data);
      const next = path.join(this.directory, `${ownerFile(this.ownerId)}.tmp`);
      await writeFile(next, JSON.stringify(data));
      await rename(next, file);
      return result;
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  listDesks(offset: number) {
    return this.locked((data) => data.desks.slice().sort(byUpdated).slice(offset, offset + 50).map(clone));
  }
  createDesk(name: string, description: string | null) {
    return this.locked((data) => {
      const row: DeskRecord = { id: crypto.randomUUID(), name, description, updatedAt: new Date().toISOString() };
      data.desks.push(row);
      return clone(row);
    });
  }
  getDesk(deskId: string) {
    return this.locked((data) => clone(data.desks.find((desk) => desk.id === deskId) ?? null));
  }
  touchDesk(deskId: string) {
    return this.locked((data) => {
      const desk = data.desks.find((item) => item.id === deskId);
      if (desk) desk.updatedAt = new Date().toISOString();
    });
  }
  deleteDesk(deskId: string) {
    return this.locked((data) => {
      const before = data.desks.length;
      data.desks = data.desks.filter((desk) => desk.id !== deskId);
      data.answers = data.answers.filter((row) => row.deskId !== deskId);
      data.refundRules = data.refundRules.filter((row) => row.deskId !== deskId);
      data.escalationLimits = data.escalationLimits.filter((row) => row.deskId !== deskId);
      data.commitments = data.commitments.filter((row) => row.deskId !== deskId);
      return data.desks.length !== before;
    });
  }
  exportDesk(deskId: string) {
    return this.locked((data) => {
      const desk = data.desks.find((item) => item.id === deskId);
      if (!desk) return null;
      return {
        desk: clone(desk),
        answers: data.answers.filter((row) => row.deskId === deskId).map(clone),
        refundRules: data.refundRules.filter((row) => row.deskId === deskId).map(clone),
        escalationLimits: data.escalationLimits.filter((row) => row.deskId === deskId).map(clone),
        commitments: data.commitments.filter((row) => row.deskId === deskId).map(clone)
      };
    });
  }
  findAnswer(deskId: string, topic: string, question: string) {
    return this.locked((data) => clone(data.answers.find((row) => row.deskId === deskId && sameText(row.topic, topic) && sameText(row.question, question)) ?? null));
  }
  insertAnswer(row: AnswerRecord) {
    return this.locked((data) => { data.answers.push(clone(row)); return clone(row); });
  }
  updateAnswer(row: AnswerRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.answers, row, expectedRevision));
  }
  listAnswers(deskId: string, offset: number, query: string, includeRetired: boolean) {
    return this.locked((data) => sliceMatches(data.answers, deskId, includeRetired, query, ["topic", "question", "answer"], offset));
  }
  listAnswersForRank(deskId: string) {
    return this.locked((data) => data.answers.filter((row) => row.deskId === deskId && row.status === "APPROVED").slice(0, 1000).map(clone));
  }
  findRefundRule(deskId: string, name: string) {
    return this.locked((data) => clone(data.refundRules.find((row) => row.deskId === deskId && sameText(row.name, name)) ?? null));
  }
  insertRefundRule(row: RefundRuleRecord) {
    return this.locked((data) => { data.refundRules.push(clone(row)); return clone(row); });
  }
  updateRefundRule(row: RefundRuleRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.refundRules, row, expectedRevision));
  }
  listRefundRules(deskId: string, includeRetired: boolean) {
    return this.locked((data) => data.refundRules.filter((row) => row.deskId === deskId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  findEscalation(deskId: string, channel: string) {
    return this.locked((data) => clone(data.escalationLimits.find((row) => row.deskId === deskId && sameText(row.channel, channel)) ?? null));
  }
  insertEscalation(row: EscalationLimitRecord) {
    return this.locked((data) => { data.escalationLimits.push(clone(row)); return clone(row); });
  }
  updateEscalation(row: EscalationLimitRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.escalationLimits, row, expectedRevision));
  }
  listEscalations(deskId: string, includeRetired: boolean) {
    return this.locked((data) => data.escalationLimits.filter((row) => row.deskId === deskId && (includeRetired || row.status === "APPROVED")).map(clone));
  }
  findCommitment(deskId: string, kind: CommitmentKind, name: string) {
    return this.locked((data) => clone(data.commitments.find((row) => row.deskId === deskId && row.kind === kind && sameText(row.name, name)) ?? null));
  }
  insertCommitment(row: CommitmentRecord) {
    return this.locked((data) => { data.commitments.push(clone(row)); return clone(row); });
  }
  updateCommitment(row: CommitmentRecord, expectedRevision: number) {
    return this.locked((data) => replace(data.commitments, row, expectedRevision));
  }
  listCommitments(deskId: string, kind: CommitmentKind | undefined, includeRetired: boolean) {
    return this.locked((data) => data.commitments.filter((row) => row.deskId === deskId && (!kind || row.kind === kind) && (includeRetired || row.status === "APPROVED")).map(clone));
  }
}

function byUpdated(a: { updatedAt: string }, b: { updatedAt: string }) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function clone<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

function replace<T extends { id: string; revision: number }>(rows: T[], row: T, expectedRevision: number): T | null {
  const index = rows.findIndex((item) => item.id === row.id && item.revision === expectedRevision);
  if (index < 0) return null;
  rows[index] = clone(row);
  return clone(row);
}

function sliceMatches<T extends { deskId: string; status: RecordStatus }>(
  rows: T[],
  deskId: string,
  includeRetired: boolean,
  query: string,
  fields: Array<keyof T>,
  offset: number
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows
    .filter((row) => row.deskId === deskId && (includeRetired || row.status === "APPROVED"))
    .filter((row) => !needle || fields.some((field) => String(row[field]).toLocaleLowerCase().includes(needle)))
    .slice(offset, offset + 50)
    .map(clone);
}

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : value == null ? null : Number(value);
}
function asBoolean(value: unknown): boolean {
  return value === true;
}
function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function asStatus(value: unknown): RecordStatus {
  return value === "RETIRED" ? "RETIRED" : "APPROVED";
}

function mapDesk(row: Row): DeskRecord {
  return { id: asString(row.id), name: asString(row.name), description: asStringOrNull(row.description), updatedAt: asString(row.updated_at) };
}
function mapAnswer(row: Row): AnswerRecord {
  return {
    id: asString(row.id), deskId: asString(row.desk_id), topic: asString(row.topic), question: asString(row.question),
    answer: asString(row.answer), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapRefund(row: Row): RefundRuleRecord {
  return {
    id: asString(row.id), deskId: asString(row.desk_id), name: asString(row.name), matchTerms: asStrings(row.match_terms),
    decision: row.decision === "DENY" ? "DENY" : "ALLOW", remedy: asString(row.remedy), windowDays: asNumberOrNull(row.window_days),
    status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapEscalation(row: Row): EscalationLimitRecord {
  return {
    id: asString(row.id), deskId: asString(row.desk_id), name: asString(row.name), channel: asString(row.channel),
    tierLadder: asStrings(row.tier_ladder), maxTier: asString(row.max_tier), allowRefundPromise: asBoolean(row.allow_refund_promise),
    allowFeaturePromise: asBoolean(row.allow_feature_promise), allowTimelinePromise: asBoolean(row.allow_timeline_promise),
    notes: asString(row.notes), status: asStatus(row.status), revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}
function mapCommitment(row: Row): CommitmentRecord {
  return {
    id: asString(row.id), deskId: asString(row.desk_id), kind: row.kind === "TIMELINE" ? "TIMELINE" : "FEATURE",
    name: asString(row.name), statement: asString(row.statement), status: asStatus(row.status),
    revision: asNumber(row.revision), updatedAt: asString(row.updated_at)
  };
}

function literalIlike(column: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  return `${column}=ilike.${encodeURIComponent(`"${escaped}"`)}`;
}

function searchOr(query: string, columns: string[]): string {
  if (!query) return "";
  const q = query.replace(/\\/g, "\\\\").replace(/[%_*]/g, "\\$&").replace(/"/g, '\\"');
  const clause = `(${columns.map((column) => `${column}.ilike."%${q}%"`).join(",")})`;
  return `&or=${encodeURIComponent(clause)}`;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("23505") || message.toLowerCase().includes("duplicate")) throw new Error("Revision conflict");
    throw error;
  }
}

const returning = { Prefer: "return=representation" };

export class SupabaseDeskStore implements DeskStore {
  constructor(private readonly ownerId: string, private readonly db: DeskDb) {}

  private async rows<T>(pathname: string, map: (row: Row) => T, options?: RequestInit): Promise<T[]> {
    const result = await this.db<Row[]>(pathname, options);
    return (result ?? []).map(map);
  }

  async listDesks(offset: number) {
    return this.rows(`/rest/v1/support_desks?select=id,name,description,updated_at&order=updated_at.desc,id&limit=50&offset=${offset}`, mapDesk);
  }
  async createDesk(name: string, description: string | null) {
    const rows = await guard(() => this.rows("/rest/v1/support_desks", mapDesk, {
      method: "POST", headers: returning,
      body: JSON.stringify({ owner_id: this.ownerId, name, description, updated_at: new Date().toISOString() })
    }));
    if (!rows[0]) throw new Error("Desk not found");
    return rows[0];
  }
  async getDesk(deskId: string) {
    const rows = await this.rows(`/rest/v1/support_desks?id=eq.${deskId}&select=id,name,description,updated_at`, mapDesk);
    return rows[0] ?? null;
  }
  async touchDesk(deskId: string) {
    await this.db(`/rest/v1/support_desks?id=eq.${deskId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() })
    });
  }
  async deleteDesk(deskId: string) {
    const desk = await this.getDesk(deskId);
    if (!desk) return false;
    await this.db(`/rest/v1/support_desks?id=eq.${deskId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return true;
  }
  async exportDesk(deskId: string) {
    const desk = await this.getDesk(deskId);
    if (!desk) return null;
    const [answers, refundRules, escalationLimits, commitments] = await Promise.all([
      this.rows(`/rest/v1/approved_answers?desk_id=eq.${deskId}&select=*&order=updated_at.desc,id&limit=1000`, mapAnswer),
      this.rows(`/rest/v1/refund_rules?desk_id=eq.${deskId}&select=*&order=name,id&limit=200`, mapRefund),
      this.rows(`/rest/v1/escalation_limits?desk_id=eq.${deskId}&select=*&order=channel,id&limit=100`, mapEscalation),
      this.rows(`/rest/v1/approved_commitments?desk_id=eq.${deskId}&select=*&order=name,id&limit=200`, mapCommitment)
    ]);
    return { desk, answers, refundRules, escalationLimits, commitments };
  }
  async findAnswer(deskId: string, topic: string, question: string) {
    const rows = await this.rows(`/rest/v1/approved_answers?desk_id=eq.${deskId}&${literalIlike("topic", topic)}&${literalIlike("question", question)}&select=*&limit=1`, mapAnswer);
    return rows[0] ?? null;
  }
  async insertAnswer(row: AnswerRecord) {
    const rows = await guard(() => this.rows("/rest/v1/approved_answers", mapAnswer, { method: "POST", headers: returning, body: JSON.stringify(answerPayload(row)) }));
    if (!rows[0]) throw new Error("Desk not found");
    return rows[0];
  }
  async updateAnswer(row: AnswerRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/approved_answers?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapAnswer, {
      method: "PATCH", headers: returning, body: JSON.stringify(answerPayload(row))
    });
    return rows[0] ?? null;
  }
  listAnswers(deskId: string, offset: number, query: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/approved_answers?desk_id=eq.${deskId}${status}&select=*&order=updated_at.desc,id&limit=50&offset=${offset}${searchOr(query, ["topic", "question", "answer"])}`, mapAnswer);
  }
  listAnswersForRank(deskId: string) {
    return this.rows(`/rest/v1/approved_answers?desk_id=eq.${deskId}&status=eq.APPROVED&select=*&order=updated_at.desc,id&limit=1000`, mapAnswer);
  }
  async findRefundRule(deskId: string, name: string) {
    const rows = await this.rows(`/rest/v1/refund_rules?desk_id=eq.${deskId}&${literalIlike("name", name)}&select=*&limit=1`, mapRefund);
    return rows[0] ?? null;
  }
  async insertRefundRule(row: RefundRuleRecord) {
    const rows = await guard(() => this.rows("/rest/v1/refund_rules", mapRefund, { method: "POST", headers: returning, body: JSON.stringify(refundPayload(row)) }));
    if (!rows[0]) throw new Error("Desk not found");
    return rows[0];
  }
  async updateRefundRule(row: RefundRuleRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/refund_rules?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapRefund, {
      method: "PATCH", headers: returning, body: JSON.stringify(refundPayload(row))
    });
    return rows[0] ?? null;
  }
  listRefundRules(deskId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/refund_rules?desk_id=eq.${deskId}${status}&select=*&order=name,id&limit=200`, mapRefund);
  }
  async findEscalation(deskId: string, channel: string) {
    const rows = await this.rows(`/rest/v1/escalation_limits?desk_id=eq.${deskId}&${literalIlike("channel", channel)}&select=*&limit=1`, mapEscalation);
    return rows[0] ?? null;
  }
  async insertEscalation(row: EscalationLimitRecord) {
    const rows = await guard(() => this.rows("/rest/v1/escalation_limits", mapEscalation, { method: "POST", headers: returning, body: JSON.stringify(escalationPayload(row)) }));
    if (!rows[0]) throw new Error("Desk not found");
    return rows[0];
  }
  async updateEscalation(row: EscalationLimitRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/escalation_limits?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapEscalation, {
      method: "PATCH", headers: returning, body: JSON.stringify(escalationPayload(row))
    });
    return rows[0] ?? null;
  }
  listEscalations(deskId: string, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    return this.rows(`/rest/v1/escalation_limits?desk_id=eq.${deskId}${status}&select=*&order=channel,id&limit=100`, mapEscalation);
  }
  async findCommitment(deskId: string, kind: CommitmentKind, name: string) {
    const rows = await this.rows(`/rest/v1/approved_commitments?desk_id=eq.${deskId}&kind=eq.${kind}&${literalIlike("name", name)}&select=*&limit=1`, mapCommitment);
    return rows[0] ?? null;
  }
  async insertCommitment(row: CommitmentRecord) {
    const rows = await guard(() => this.rows("/rest/v1/approved_commitments", mapCommitment, { method: "POST", headers: returning, body: JSON.stringify(commitmentPayload(row)) }));
    if (!rows[0]) throw new Error("Desk not found");
    return rows[0];
  }
  async updateCommitment(row: CommitmentRecord, expectedRevision: number) {
    const rows = await this.rows(`/rest/v1/approved_commitments?id=eq.${row.id}&revision=eq.${expectedRevision}`, mapCommitment, {
      method: "PATCH", headers: returning, body: JSON.stringify(commitmentPayload(row))
    });
    return rows[0] ?? null;
  }
  listCommitments(deskId: string, kind: CommitmentKind | undefined, includeRetired: boolean) {
    const status = includeRetired ? "" : "&status=eq.APPROVED";
    const kindFilter = kind ? `&kind=eq.${kind}` : "";
    return this.rows(`/rest/v1/approved_commitments?desk_id=eq.${deskId}${kindFilter}${status}&select=*&order=name,id&limit=200`, mapCommitment);
  }
}

function answerPayload(row: AnswerRecord) {
  return { id: row.id, desk_id: row.deskId, topic: row.topic, question: row.question, answer: row.answer, status: row.status, revision: row.revision, updated_at: row.updatedAt };
}
function refundPayload(row: RefundRuleRecord) {
  return {
    id: row.id, desk_id: row.deskId, name: row.name, match_terms: row.matchTerms, decision: row.decision,
    remedy: row.remedy, window_days: row.windowDays, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function escalationPayload(row: EscalationLimitRecord) {
  return {
    id: row.id, desk_id: row.deskId, name: row.name, channel: row.channel, tier_ladder: row.tierLadder, max_tier: row.maxTier,
    allow_refund_promise: row.allowRefundPromise, allow_feature_promise: row.allowFeaturePromise, allow_timeline_promise: row.allowTimelinePromise,
    notes: row.notes, status: row.status, revision: row.revision, updated_at: row.updatedAt
  };
}
function commitmentPayload(row: CommitmentRecord) {
  return { id: row.id, desk_id: row.deskId, kind: row.kind, name: row.name, statement: row.statement, status: row.status, revision: row.revision, updated_at: row.updatedAt };
}
