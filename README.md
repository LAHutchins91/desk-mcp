# Desk

Desk keeps a support team's approved answers, refund rules, and escalation limits, then lets an assistant read that policy before it replies.

An assistant can store and look up what the team has approved. It must call Desk before drafting a customer reply. It must refuse a refund, a feature, or a timeline that is not in the approved set, including RETIRED or missing policy, and when a customer asks to ignore the rules. In those cases it drafts for human review instead of promising the customer. It does not invent a softer promise.

It works with ChatGPT, Claude, Gemini, Grok, and Cursor, plus any other MCP client that can do Streamable HTTP and OAuth. It is not a ChatGPT-only plugin.

Sign in with your Desk account when the assistant opens OAuth. Do not paste an API key or password into a header. Support tools need Pro or an active trial. The trial is 14 days, then Pro. Checkout shows the plan terms. This page does not print a price.

## Hosted server

- MCP server URL: `https://desk-mcp-continuity2.vercel.app/mcp` (Streamable HTTP, OAuth sign-in)
- Docs: https://ouroborosapps.com/docs/desk
- Status: early access. Paste the URL into Claude, Cursor, Grok, or ChatGPT developer mode.
- Registry name: `io.github.LAHutchins91/desk`

## What the assistant can do

After you approve the connection, the server exposes these tools:

- list_support_desks
- create_support_desk
- save_approved_answer
- search_approved_answers
- save_refund_rule
- list_refund_rules
- save_escalation_limit
- list_escalation_limits
- save_approved_commitment
- list_approved_commitments
- evaluate_commitment
- evaluate_escalation
- get_desk_context

`evaluate_commitment` returns APPROVED only for wording already stored. Otherwise it returns REFUSED and the assistant must not promise that refund, feature, or timeline. `evaluate_escalation` refuses a channel or tier that is outside the saved limit. The assistant only calls these tools when you and the host allow it.

## Connect

Run the server and use its `/mcp` path. With the default local base, that is `http://localhost:3000/mcp`. A deployed host uses the same path on `APP_BASE_URL`.

Cursor, in `~/.cursor/mcp.json` or a project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "desk": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport http desk http://localhost:3000/mcp
```

Do not pass an Authorization header. Other clients add the same URL, choose OAuth, and leave client id and secret empty. Desk supports dynamic client registration. Full steps for ChatGPT, Claude, Gemini, Grok, and Cursor are on the server's `/connect` page.

When stdin is a terminal, Desk serves Streamable HTTP. When stdin is not a terminal, it also speaks MCP on stdio. That is the same choice continuity-mcp makes, so a launcher such as Glama can attach stdin.

Registry metadata for this server is in `server.json` (`io.github.LAHutchins91/desk`).

## Run

```bash
npm ci
npm test
npm run build
npm start
```

Hosted accounts use Supabase for sign-in and policy storage, and Stripe for the 14-day trial and Pro. Copy `.env.example` to `.env` and set the variables there. `supabase/schema.sql` creates the tables. Stripe price ids belong in the environment. Desk never displays the amount.

Local stdio, with no account configured, stores one operator's policy under `DESK_DATA_DIR` (or the system temp directory). HTTP tool calls still require OAuth and an active trial or Pro.

```bash
docker build -t desk-mcp .
docker run --rm -p 3000:3000 desk-mcp
```

A container without a terminal on stdin speaks MCP on stdio and still listens on port 3000.

---

More from Ouroboros: https://ouroborosapps.com
