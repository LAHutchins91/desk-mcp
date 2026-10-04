import type { Express, Request, Response } from "express";
import { z } from "zod";
import { publicError } from "./lib/errors.js";
import { saveAnswer, saveCommitment, saveEscalationLimit, saveRefundRule } from "./lib/records.js";
import type { DeskStore } from "./lib/store.js";

export type Account = { user: { id: string }; token: string };
export type SubscriptionState = "ok" | "inactive" | "error";

export type WorkspaceDeps = {
  appBaseUrl: string;
  authenticate: (req: Request) => Promise<Account>;
  subscriptionState: (userId: string, token: string) => Promise<SubscriptionState>;
  createStore: (userId: string, token: string) => DeskStore;
  allow: (key: string) => boolean;
};

const deskId = z.string().uuid();
const status = z.enum(["APPROVED", "RETIRED"]).default("APPROVED");

const answerBody = z.object({
  deskId,
  topic: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(8000),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const refundBody = z.object({
  deskId,
  name: z.string().trim().min(1).max(200),
  matchTerms: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  decision: z.enum(["ALLOW", "DENY"]),
  remedy: z.string().trim().min(1).max(4000),
  windowDays: z.number().int().min(0).max(3650).nullable().optional(),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const escalationBody = z.object({
  deskId,
  name: z.string().trim().min(1).max(200),
  channel: z.string().trim().min(1).max(80),
  tierLadder: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  maxTier: z.string().trim().min(1).max(80),
  allowRefundPromise: z.boolean().default(false),
  allowFeaturePromise: z.boolean().default(false),
  allowTimelinePromise: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional(),
  status,
  expectedRevision: z.number().int().positive().optional()
});
const commitmentBody = z.object({
  deskId,
  kind: z.enum(["FEATURE", "TIMELINE"]),
  name: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
  status,
  expectedRevision: z.number().int().positive().optional()
});

function sendFailure(res: Response, error: unknown) {
  const safe = publicError(error);
  res.status(safe.status).json({ error: safe.error });
}

export function installWorkspaceApi(app: Express, deps: WorkspaceDeps) {
  async function open(req: Request, res: Response): Promise<{ store: DeskStore } | null> {
    if (!deps.allow(`workspace:${req.ip}`)) {
      res.status(429).json({ error: "Too many requests. Retry in one minute." });
      return null;
    }
    let account: Account;
    try {
      account = await deps.authenticate(req);
    } catch {
      res.set("WWW-Authenticate", `Bearer resource_metadata="${deps.appBaseUrl}/.well-known/oauth-protected-resource/mcp"`);
      res.status(401).json({ error: "Sign in to Desk to use support tools." });
      return null;
    }
    const state = await deps.subscriptionState(account.user.id, account.token);
    if (state === "error") {
      res.status(503).json({ error: "Could not verify your subscription. Please retry." });
      return null;
    }
    if (state === "inactive") {
      res.status(403).json({ error: "A Desk Pro subscription or active trial is required.", access_information: `${deps.appBaseUrl}/access` });
      return null;
    }
    return { store: deps.createStore(account.user.id, account.token) };
  }

  app.get("/api/workspace/desks", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(req.query.offset);
    res.json({ data: await ctx.store.listDesks(offset) });
  });

  app.post("/api/workspace/desks", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Enter a desk name." });
    try {
      res.json({ data: await ctx.store.createDesk(body.data.name, body.data.description ?? null) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/export", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ deskId }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Desk not found" });
    const data = await ctx.store.exportDesk(parsed.data.deskId);
    if (!data) return res.status(404).json({ error: "Desk not found" });
    res.json({ data });
  });

  app.delete("/api/workspace/desks/:deskId", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ deskId }).safeParse(req.params);
    if (!parsed.success) return res.status(404).json({ error: "Desk not found" });
    const removed = await ctx.store.deleteDesk(parsed.data.deskId);
    if (!removed) return res.status(404).json({ error: "Desk not found" });
    res.json({ data: { deleted: true } });
  });

  app.get("/api/workspace/answers", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({
      deskId,
      query: z.string().max(200).optional(),
      offset: z.coerce.number().int().min(0).max(100000).optional(),
      includeRetired: z.enum(["true", "false"]).optional()
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Desk not found" });
    try {
      const rows = await ctx.store.listAnswers(parsed.data.deskId, parsed.data.offset ?? 0, parsed.data.query ?? "", parsed.data.includeRetired === "true");
      res.json({ data: rows });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.post("/api/workspace/answers", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = answerBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the approved answer and try again." });
    try {
      res.json({ data: await saveAnswer(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/refund-rules", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ deskId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Desk not found" });
    res.json({ data: await ctx.store.listRefundRules(parsed.data.deskId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/refund-rules", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = refundBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Refund rule needs a specific situation phrase" });
    try {
      res.json({ data: await saveRefundRule(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/escalation-limits", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({ deskId, includeRetired: z.enum(["true", "false"]).optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Desk not found" });
    res.json({ data: await ctx.store.listEscalations(parsed.data.deskId, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/escalation-limits", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = escalationBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Escalation tier is not on the ladder" });
    try {
      res.json({ data: await saveEscalationLimit(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  app.get("/api/workspace/commitments", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const parsed = z.object({
      deskId,
      kind: z.enum(["FEATURE", "TIMELINE"]).optional(),
      includeRetired: z.enum(["true", "false"]).optional()
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Desk not found" });
    res.json({ data: await ctx.store.listCommitments(parsed.data.deskId, parsed.data.kind, parsed.data.includeRetired === "true") });
  });

  app.post("/api/workspace/commitments", async (req, res) => {
    const ctx = await open(req, res);
    if (!ctx) return;
    const body = commitmentBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Check the approved statement and try again." });
    try {
      res.json({ data: await saveCommitment(ctx.store, body.data) });
    } catch (error) {
      sendFailure(res, error);
    }
  });
}
