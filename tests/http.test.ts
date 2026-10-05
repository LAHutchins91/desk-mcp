import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/server.js";

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("streamable HTTP", () => {
  it("returns Desk tools from tools/list without an API key", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { result?: { tools?: Array<{ name: string; description?: string }> } };
    const tools = body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("evaluate_commitment");
    expect(names).toContain("save_refund_rule");
    expect(names).toContain("list_escalation_limits");
    expect(names).toContain("search_approved_answers");
    const text = JSON.stringify(tools);
    expect(text).not.toMatch(/\$\d/);
  });

  it("rejects a tool call that presents an API key header instead of OAuth", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, "x-api-key": "secret-key" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_support_desks", arguments: {} }
      })
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Sign in to Desk/);
  });

  it("serves connect, health, and OAuth metadata", async () => {
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    const healthBody = await health.json() as { service: string };
    expect(healthBody.service).toBe("desk");

    const connect = await fetch(`${base}/connect`);
    const html = await connect.text();
    expect(connect.status).toBe(200);
    for (const name of ["ChatGPT", "Claude", "Gemini", "Grok", "Cursor"]) expect(html).toContain(name);
    expect(html).not.toMatch(/\$\d/);

    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    const oauth = await metadata.json() as { resource: string; bearer_methods_supported: string[]; authorization_servers: string[] };
    expect(oauth.resource).toMatch(/\/mcp$/);
    expect(oauth.bearer_methods_supported).toEqual(["header"]);
    expect(oauth.authorization_servers[0]).toMatch(/\/auth\/v1$/);

    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    expect(homeHtml).toContain("14-day trial, then Pro");
    expect(homeHtml).not.toMatch(/\$\d/);
    expect(homeHtml).toContain("Do not promise what was never approved.");

    const privacy = await fetch(`${base}/privacy`);
    const policy = await privacy.text();
    expect(privacy.status).toBe(200);
    for (const phrase of [
      "Effective October 5, 2026",
      "Ouroboros Apps / Lawrence Hutchins",
      "approved answers",
      "refund rules",
      "escalation limits",
      "commitments",
      "Supabase",
      "Vercel",
      "Google",
      "Stripe",
      "ChatGPT",
      "private support form"
    ]) expect(policy).toContain(phrase);
    expect(policy).not.toMatch(/\$\s*\d/);

    const configured = process.env.OPENAI_APPS_CHALLENGE;
    delete process.env.OPENAI_APPS_CHALLENGE;
    const missing = await fetch(`${base}/.well-known/openai-apps-challenge`);
    expect(missing.status).toBe(404);
    process.env.OPENAI_APPS_CHALLENGE = "directory-review-token";
    const challenge = await fetch(`${base}/.well-known/openai-apps-challenge`);
    expect(challenge.status).toBe(200);
    expect(await challenge.text()).toBe("directory-review-token");
    expect(challenge.headers.get("content-type")).toMatch(/text\/plain/);
    if (configured === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
    else process.env.OPENAI_APPS_CHALLENGE = configured;
  });

  it("rejects a browser origin that is not an assistant", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })
    });
    expect(response.status).toBe(403);
  });
});
