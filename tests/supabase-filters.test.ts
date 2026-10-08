import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createDeskServer } from "../src/desk-tools.js";
import { saveAnswer, saveCommitment, saveEscalationLimit, saveRefundRule } from "../src/lib/records.js";
import { SupabaseDeskStore, type DeskDb } from "../src/lib/store.js";

/**
 * PostgREST bare filters (`column=ilike.value`) keep double quotes as data.
 * Quotes are removed only inside `in()`, `or()`, and `and()`. `*` in a LIKE
 * pattern is rewritten to `%` before SQL, and `\` is the LIKE escape.
 * This fake applies those rules so a quoted pattern cannot match the saved text.
 */
function postgrestDb(): DeskDb {
  const tables = new Map<string, Array<Record<string, unknown>>>();

  return async (pathname, options) => {
    const method = (options?.method ?? "GET").toUpperCase();
    const url = new URL(pathname, "http://db.local");
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    if (!table || table.includes("/")) throw new Error(`unexpected path ${pathname}`);
    const rows = tables.get(table) ?? [];
    if (!tables.has(table)) tables.set(table, rows);

    if (method === "POST") {
      const body = JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>;
      const row = { ...body, id: typeof body.id === "string" && body.id ? body.id : crypto.randomUUID() };
      rows.push(row);
      return [row];
    }

    const matched = rows.filter((row) => rowMatches(row, url));
    if (method === "PATCH") {
      const patch = JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>;
      for (const row of matched) Object.assign(row, patch);
      return matched.map((row) => ({ ...row }));
    }
    if (method === "DELETE") {
      const remaining = rows.filter((row) => !matched.includes(row));
      tables.set(table, remaining);
      return [];
    }
    if (method !== "GET") throw new Error(`unexpected method ${method}`);

    const offset = numberParam(url, "offset");
    const limit = numberParam(url, "limit");
    return matched.slice(offset, limit == null ? undefined : offset + limit).map((row) => ({ ...row }));
  };
}

function numberParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rowMatches(row: Record<string, unknown>, url: URL): boolean {
  for (const [key, raw] of url.searchParams.entries()) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset") continue;
    if (key === "or") {
      if (!logicOrMatches(row, raw)) return false;
      continue;
    }
    if (!bareFilterMatches(row, key, raw)) return false;
  }
  return true;
}

function bareFilterMatches(row: Record<string, unknown>, column: string, raw: string): boolean {
  const dot = raw.indexOf(".");
  if (dot < 0) throw new Error(`filter without operator: ${column}=${raw}`);
  const op = raw.slice(0, dot);
  const value = raw.slice(dot + 1);
  return compare(row[column], op, value, false);
}

function logicOrMatches(row: Record<string, unknown>, clause: string): boolean {
  const inner = clause.startsWith("(") && clause.endsWith(")") ? clause.slice(1, -1) : clause;
  const parts = splitLogic(inner);
  return parts.some((part) => {
    const columnDot = part.indexOf(".");
    if (columnDot < 0) return false;
    const column = part.slice(0, columnDot);
    return bareQuotedFilterMatches(row, column, part.slice(columnDot + 1));
  });
}

function bareQuotedFilterMatches(row: Record<string, unknown>, column: string, raw: string): boolean {
  const dot = raw.indexOf(".");
  if (dot < 0) return false;
  const op = raw.slice(0, dot);
  let value = raw.slice(dot + 1);
  if (value.startsWith('"') && value.endsWith('"')) value = unquote(value);
  return compare(row[column], op, value, true);
}

function compare(cell: unknown, op: string, pattern: string, quoted: boolean): boolean {
  if (op === "eq") return String(cell ?? "") === pattern;
  if (op === "ilike") return typeof cell === "string" && ilike(pattern, cell, quoted);
  throw new Error(`unsupported filter op ${op}`);
}

function ilike(pattern: string, value: string, fromQuotedLogic: boolean): boolean {
  const translated = pattern.replaceAll("*", "%");
  let source = "";
  for (let index = 0; index < translated.length; index += 1) {
    const char = translated[index] ?? "";
    if (!fromQuotedLogic && char === "\\" && index + 1 < translated.length) {
      source += escapeRegExp(translated[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === "%") source += "[\\s\\S]*";
    else if (char === "_") source += "[\\s\\S]";
    else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`, "i").test(value);
}

function unquote(quoted: string): string {
  const inner = quoted.slice(1, -1);
  let out = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index] ?? "";
    if (char === "\\" && index + 1 < inner.length) {
      out += inner[index + 1] ?? "";
      index += 1;
      continue;
    }
    out += char;
  }
  return out;
}

function splitLogic(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    if (char === "\\" && quoted && index + 1 < input.length) {
      current += char + (input[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (char === "," && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function connected(store: SupabaseDeskStore) {
  const server = createDeskServer(store);
  const client = new Client({ name: "desk-test", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  servers.push(client, server);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((item) => item.type === "text");
  const payload = text && "text" in text ? JSON.parse(text.text) as Record<string, unknown> : null;
  return { result, payload };
}

const ladder = ["support agent", "support lead", "owner"];

describe("supabase ilike lookups", () => {
  it("finds saved escalation limits for evaluate_escalation and evaluate_commitment, ignoring channel case", async () => {
    const store = new SupabaseDeskStore("owner", postgrestDb());
    const client = await connected(store);
    const desk = await call(client, "create_support_desk", { name: "Brightloom Candles Support" });
    const deskId = String(desk.payload?.id);
    const remedy = "Free replacement, or a full refund if the customer prefers, with a photo within 30 days of delivery.";

    await call(client, "save_escalation_limit", {
      deskId,
      name: "Email support",
      channel: "email",
      tierLadder: ladder,
      maxTier: "support lead",
      allowRefundPromise: true,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      notes: "Agents may promise refunds that match an approved rule."
    });
    await call(client, "save_refund_rule", {
      deskId,
      name: "Cracked jar on arrival",
      matchTerms: ["cracked jar"],
      decision: "ALLOW",
      remedy,
      windowDays: 30
    });

    const listed = await call(client, "list_escalation_limits", { deskId });
    expect(listed.payload).toEqual([expect.objectContaining({ channel: "email" })]);

    const escalation = await call(client, "evaluate_escalation", {
      deskId,
      channel: "Email",
      action: "PROMISE_REFUND"
    });
    expect(escalation.payload).toMatchObject({
      decision: "APPROVED",
      allowed: true,
      action: "PROMISE_REFUND",
      maxTier: "support lead",
      tierLadder: ladder
    });
    expect(String(escalation.payload?.instruction)).not.toMatch(/No approved escalation limit/);

    const commitment = await call(client, "evaluate_commitment", {
      deskId,
      kind: "REFUND",
      proposal: remedy,
      channel: "EMAIL"
    });
    expect(commitment.payload).toMatchObject({
      decision: "APPROVED",
      allowed: true,
      grantsRefund: true,
      escalationChecked: true,
      escalationDecision: "APPROVED",
      matchedName: "Cracked jar on arrival"
    });

    const blocked = await call(client, "evaluate_commitment", {
      deskId,
      kind: "TIMELINE",
      proposal: "The Lavender Fields scent will be back in stock next week",
      channel: "email"
    });
    expect(blocked.payload).toMatchObject({
      decision: "REFUSED",
      escalationChecked: true,
      escalationDecision: "REFUSED"
    });
    expect(String(blocked.payload?.instruction)).toMatch(/does not allow a timeline promise/);
    expect(String(blocked.payload?.instruction)).not.toMatch(/No approved escalation limit/);

    const missing = await call(client, "evaluate_escalation", {
      deskId,
      channel: "chat",
      action: "PROMISE_REFUND"
    });
    expect(missing.payload).toMatchObject({ decision: "REFUSED", allowed: false, maxTier: null, tierLadder: [] });
    expect(String(missing.payload?.instruction)).toMatch(/No approved escalation limit/);
  });

  it("matches case-insensitively on every bare ilike lookup and keeps LIKE wildcards literal", async () => {
    const store = new SupabaseDeskStore("owner", postgrestDb());
    const desk = await store.createDesk("Brightloom", null);
    const answer = await saveAnswer(store, {
      deskId: desk.id,
      topic: "Damaged on arrival",
      question: "What if it is cracked, broken?",
      answer: 'Tell them to say "hi" and send a photo of the cracked, broken jar.',
      status: "APPROVED"
    });
    const rule = await saveRefundRule(store, {
      deskId: desk.id,
      name: 'Say "no"',
      matchTerms: ["duplicate charge"],
      decision: "DENY",
      remedy: "Duplicate charges are not refunded.",
      status: "APPROVED"
    });
    const decoy = await saveEscalationLimit(store, {
      deskId: desk.id,
      name: "Decoy",
      channel: "100xyoff",
      tierLadder: ["agent"],
      maxTier: "agent",
      allowRefundPromise: false,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      status: "APPROVED"
    });
    const limit = await saveEscalationLimit(store, {
      deskId: desk.id,
      name: "Percent",
      channel: "100%_off",
      tierLadder: ["agent"],
      maxTier: "agent",
      allowRefundPromise: false,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      status: "APPROVED"
    });
    const dotted = await saveEscalationLimit(store, {
      deskId: desk.id,
      name: "Dotted",
      channel: "e.mail",
      tierLadder: ["agent"],
      maxTier: "agent",
      allowRefundPromise: true,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      status: "APPROVED"
    });
    const star = await saveEscalationLimit(store, {
      deskId: desk.id,
      name: "Star",
      channel: "star",
      tierLadder: ["agent"],
      maxTier: "agent",
      allowRefundPromise: false,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      status: "APPROVED"
    });
    const commitment = await saveCommitment(store, {
      deskId: desk.id,
      kind: "FEATURE",
      name: "Gift notes",
      statement: "You can add a free handwritten gift note at checkout.",
      status: "APPROVED"
    });

    expect((await store.findAnswer(desk.id, "damaged on arrival", "What if it is cracked, broken?"))?.id).toBe(answer.id);
    expect((await store.findRefundRule(desk.id, 'say "no"'))?.id).toBe(rule.id);
    expect((await store.findEscalation(desk.id, "100%_off"))?.id).toBe(limit.id);
    expect((await store.findEscalation(desk.id, "100xyoff"))?.id).toBe(decoy.id);
    expect(await store.findEscalation(desk.id, "s*r")).toBeNull();
    expect((await store.findEscalation(desk.id, "STAR"))?.id).toBe(star.id);
    expect((await store.findEscalation(desk.id, "E.MAIL"))?.id).toBe(dotted.id);
    expect((await store.findCommitment(desk.id, "FEATURE", "GIFT NOTES"))?.id).toBe(commitment.id);

    const revised = await saveEscalationLimit(store, {
      deskId: desk.id,
      name: "Email support",
      channel: "E.MAIL",
      tierLadder: ladder,
      maxTier: "support lead",
      allowRefundPromise: true,
      allowFeaturePromise: false,
      allowTimelinePromise: false,
      notes: "Updated",
      status: "APPROVED",
      expectedRevision: dotted.revision
    });
    expect(revised.id).toBe(dotted.id);
    expect(revised.revision).toBe(dotted.revision + 1);
    expect(revised.channel).toBe("e.mail");
    expect(revised.notes).toBe("Updated");

    const searched = await store.listAnswers(desk.id, 0, 'cracked, broken', false);
    expect(searched.map((row) => row.id)).toEqual([answer.id]);
    const quotedSearch = await store.listAnswers(desk.id, 0, 'say "hi"', false);
    expect(quotedSearch.map((row) => row.id)).toEqual([answer.id]);
  });
});
