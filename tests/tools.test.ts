import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createDeskServer } from "../src/desk-tools.js";
import { FileDeskStore } from "../src/lib/store.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function connected() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desk-test-"));
  const store = new FileDeskStore(dir, "local");
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
  const payload = text && "text" in text ? JSON.parse(text.text) : null;
  return { result, payload };
}

describe("desk tools", () => {
  it("lists the support policy tools", async () => {
    const client = await connected();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "create_support_desk",
      "evaluate_commitment",
      "evaluate_escalation",
      "get_desk_context",
      "list_approved_commitments",
      "list_escalation_limits",
      "list_refund_rules",
      "list_support_desks",
      "save_approved_answer",
      "save_approved_commitment",
      "save_escalation_limit",
      "save_refund_rule",
      "search_approved_answers"
    ]);
  });

  it("stores policy and refuses an unapproved refund, feature, and timeline", async () => {
    const client = await connected();
    const desk = await call(client, "create_support_desk", { name: "Acme support" });
    const deskId = desk.payload.id as string;
    await call(client, "save_approved_answer", {
      deskId,
      topic: "Password reset",
      question: "How do I reset a password?",
      answer: "Use the account page to send a reset link. Do not promise a refund."
    });
    await call(client, "save_refund_rule", {
      deskId,
      name: "Duplicate charge",
      matchTerms: ["duplicate charge"],
      decision: "ALLOW",
      remedy: "A duplicate charge may be refunded after the charge is confirmed."
    });
    await call(client, "save_escalation_limit", {
      deskId,
      name: "Chat limit",
      channel: "chat",
      tierLadder: ["frontline", "specialist"],
      maxTier: "frontline",
      allowRefundPromise: false
    });

    const lookup = await call(client, "search_approved_answers", { deskId, query: "reset a password" });
    expect(lookup.payload.answers).toHaveLength(1);
    expect(lookup.payload.gap).toBeNull();

    const missing = await call(client, "search_approved_answers", { deskId, query: "satellite warranty" });
    expect(missing.payload.answers).toHaveLength(0);
    expect(missing.payload.gap).toMatch(/Do not invent/);

    const refund = await call(client, "evaluate_commitment", {
      deskId,
      kind: "REFUND",
      proposal: "We can refund this order in full tomorrow."
    });
    expect(refund.payload.decision).toBe("REFUSED");
    expect(refund.payload.grantsRefund).toBe(false);

    const feature = await call(client, "evaluate_commitment", {
      deskId,
      kind: "FEATURE",
      proposal: "Offline mode ships next month."
    });
    expect(feature.payload.decision).toBe("REFUSED");

    const timeline = await call(client, "evaluate_commitment", {
      deskId,
      kind: "TIMELINE",
      proposal: "This will be fixed by Friday."
    });
    expect(timeline.payload.decision).toBe("REFUSED");

    const escalation = await call(client, "evaluate_escalation", {
      deskId,
      channel: "chat",
      action: "ESCALATE",
      targetTier: "specialist"
    });
    expect(escalation.payload.decision).toBe("REFUSED");

    const context = await call(client, "get_desk_context", { deskId, question: "How do I reset a password?" });
    expect(context.payload.approved_answers).toHaveLength(1);
    expect(context.payload.guidance).toMatch(/REFUSED/);
  });
});
