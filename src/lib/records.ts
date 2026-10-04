import { assertSpecificMatchTerms } from "./desk.js";
import type {
  AnswerRecord,
  CommitmentKind,
  CommitmentRecord,
  DeskStore,
  EscalationLimitRecord,
  RecordStatus,
  RefundDecision,
  RefundRuleRecord
} from "./store.js";

type SaveAnswer = {
  deskId: string;
  topic: string;
  question: string;
  answer: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveRefund = {
  deskId: string;
  name: string;
  matchTerms: string[];
  decision: RefundDecision;
  remedy: string;
  windowDays?: number | null;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveEscalation = {
  deskId: string;
  name: string;
  channel: string;
  tierLadder: string[];
  maxTier: string;
  allowRefundPromise: boolean;
  allowFeaturePromise: boolean;
  allowTimelinePromise: boolean;
  notes?: string;
  status: RecordStatus;
  expectedRevision?: number;
};

type SaveCommitment = {
  deskId: string;
  kind: CommitmentKind;
  name: string;
  statement: string;
  status: RecordStatus;
  expectedRevision?: number;
};

function sameTerms(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameLadder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function requireDesk(store: DeskStore, deskId: string) {
  const desk = await store.getDesk(deskId);
  if (!desk) throw new Error("Desk not found");
  return desk;
}

export async function saveAnswer(store: DeskStore, input: SaveAnswer): Promise<AnswerRecord> {
  await requireDesk(store, input.deskId);
  const existing = await store.findAnswer(input.deskId, input.topic, input.question);
  const next = { topic: input.topic.trim(), question: input.question.trim(), answer: input.answer.trim(), status: input.status };
  if (existing && existing.topic === next.topic && existing.question === next.question && existing.answer === next.answer && existing.status === next.status) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateAnswer({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchDesk(input.deskId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertAnswer({ id: crypto.randomUUID(), deskId: input.deskId, ...next, revision: 1, updatedAt: now });
  await store.touchDesk(input.deskId);
  return created;
}

export async function saveRefundRule(store: DeskStore, input: SaveRefund): Promise<RefundRuleRecord> {
  await requireDesk(store, input.deskId);
  const matchTerms = input.matchTerms.map((term) => term.trim()).filter(Boolean);
  assertSpecificMatchTerms(matchTerms);
  const existing = await store.findRefundRule(input.deskId, input.name);
  const next = {
    name: input.name.trim(),
    matchTerms,
    decision: input.decision,
    remedy: input.remedy.trim(),
    windowDays: input.windowDays ?? null,
    status: input.status
  };
  if (
    existing &&
    existing.name === next.name &&
    sameTerms(existing.matchTerms, next.matchTerms) &&
    existing.decision === next.decision &&
    existing.remedy === next.remedy &&
    existing.windowDays === next.windowDays &&
    existing.status === next.status
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateRefundRule({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchDesk(input.deskId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertRefundRule({ id: crypto.randomUUID(), deskId: input.deskId, ...next, revision: 1, updatedAt: now });
  await store.touchDesk(input.deskId);
  return created;
}

export async function saveEscalationLimit(store: DeskStore, input: SaveEscalation): Promise<EscalationLimitRecord> {
  await requireDesk(store, input.deskId);
  const tierLadder = input.tierLadder.map((tier) => tier.trim()).filter(Boolean);
  const maxTier = input.maxTier.trim();
  if (!tierLadder.length || !tierLadder.includes(maxTier)) throw new Error("Escalation tier is not on the ladder");
  const existing = await store.findEscalation(input.deskId, input.channel);
  const next = {
    name: input.name.trim(),
    channel: input.channel.trim().toLocaleLowerCase(),
    tierLadder,
    maxTier,
    allowRefundPromise: input.allowRefundPromise,
    allowFeaturePromise: input.allowFeaturePromise,
    allowTimelinePromise: input.allowTimelinePromise,
    notes: input.notes?.trim() ?? "",
    status: input.status
  };
  if (
    existing &&
    existing.name === next.name &&
    existing.channel === next.channel &&
    sameLadder(existing.tierLadder, next.tierLadder) &&
    existing.maxTier === next.maxTier &&
    existing.allowRefundPromise === next.allowRefundPromise &&
    existing.allowFeaturePromise === next.allowFeaturePromise &&
    existing.allowTimelinePromise === next.allowTimelinePromise &&
    existing.notes === next.notes &&
    existing.status === next.status
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateEscalation({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchDesk(input.deskId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertEscalation({ id: crypto.randomUUID(), deskId: input.deskId, ...next, revision: 1, updatedAt: now });
  await store.touchDesk(input.deskId);
  return created;
}

export async function saveCommitment(store: DeskStore, input: SaveCommitment): Promise<CommitmentRecord> {
  await requireDesk(store, input.deskId);
  const existing = await store.findCommitment(input.deskId, input.kind, input.name);
  const next = { kind: input.kind, name: input.name.trim(), statement: input.statement.trim(), status: input.status };
  if (existing && existing.kind === next.kind && existing.name === next.name && existing.statement === next.statement && existing.status === next.status) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing) {
    if (input.expectedRevision !== existing.revision) throw new Error("Revision conflict");
    const saved = await store.updateCommitment({ ...existing, ...next, revision: existing.revision + 1, updatedAt: now }, existing.revision);
    if (!saved) throw new Error("Revision conflict");
    await store.touchDesk(input.deskId);
    return saved;
  }
  if (input.expectedRevision) throw new Error("Revision conflict");
  const created = await store.insertCommitment({ id: crypto.randomUUID(), deskId: input.deskId, ...next, revision: 1, updatedAt: now });
  await store.touchDesk(input.deskId);
  return created;
}
