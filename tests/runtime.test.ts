import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function runServer(env: NodeJS.ProcessEnv, timeoutMs: number, stopWhenListening: boolean) {
  return new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: "0", ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000);
    }, timeoutMs);
    const onChunk = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (stopWhenListening && output.includes("Desk listening")) {
        child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => finish(code));
  });
}

describe("process startup", () => {
  it("does not listen or open stdio when Vercel imports the app", async () => {
    const result = await runServer({ VERCEL: "1" }, 8000, false);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.output).not.toContain("Desk listening");
  }, 15000);

  it("still listens for a local or Glama start", async () => {
    const result = await runServer({ VERCEL: "" }, 8000, true);
    expect(result.timedOut).toBe(false);
    expect(result.output).toContain("Desk listening");
  }, 15000);
});
