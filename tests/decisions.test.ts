import { describe, expect, it } from "vitest";
import {
  applyChannelLimit,
  assertSpecificMatchTerms,
  evaluateEscalation,
  evaluateRefund,
  evaluateStatement,
  proposalAddsUnapprovedDetail,
  termIsSpecific
} from "../src/lib/desk.js";
import type { CommitmentRecord, EscalationLimitRecord, RefundRuleRecord } from "../src/lib/store.js";

const refund = (partial: Partial<RefundRuleRecord>): RefundRuleRecord => ({
  id: "rule-1",
  deskId: "desk",
  name: "Duplicate charge",
  matchTerms: ["duplicate charge"],
  decision: "ALLOW",
  remedy: "A duplicate charge may be refunded after the charge is confirmed.",
  windowDays: 30,
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const limit = (partial: Partial<EscalationLimitRecord> = {}): EscalationLimitRecord => ({
  id: "limit-1",
  deskId: "desk",
  name: "Chat",
  channel: "chat",
  tierLadder: ["frontline", "specialist"],
  maxTier: "specialist",
  allowRefundPromise: false,
  allowFeaturePromise: false,
  allowTimelinePromise: false,
  notes: "",
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z",
  ...partial
});

const feature = (statement: string): CommitmentRecord => ({
  id: "commit-1",
  deskId: "desk",
  kind: "FEATURE",
  name: "Dark mode",
  statement,
  status: "APPROVED",
  revision: 1,
  updatedAt: "2026-10-04T00:00:00.000Z"
});

describe("refund decisions", () => {
  it("refuses a refund that is not in the approved set", () => {
    const verdict = evaluateRefund("Please refund the shipping", [refund({})]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.grantsRefund).toBe(false);
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses invented wording even when the situation matches", () => {
    const verdict = evaluateRefund("We will refund the duplicate charge tomorrow", [refund({})]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBe("A duplicate charge may be refunded after the charge is confirmed.");
    expect(verdict.grantsRefund).toBe(false);
  });

  it("approves only the stored remedy", () => {
    const remedy = "A duplicate charge may be refunded after the charge is confirmed.";
    const verdict = evaluateRefund(remedy, [refund({})]);
    expect(verdict.decision).toBe("APPROVED");
    expect(verdict.grantsRefund).toBe(true);
    expect(verdict.sayOnly).toBe(remedy);
  });

  it("does not let a generic refund word authorize anything", () => {
    expect(termIsSpecific("refund")).toBe(false);
    expect(() => assertSpecificMatchTerms(["refund"])).toThrow(/specific situation/);
    const verdict = evaluateRefund("Please refund this", [refund({ matchTerms: ["refund"], remedy: "Refund everything." })]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses a refund when the matching rule denies it", () => {
    const verdict = evaluateRefund("Please refund the duplicate charge", [
      refund({ decision: "DENY", remedy: "Duplicate charges are not refunded. We can investigate the charge." })
    ]);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.grantsRefund).toBe(false);
    expect(verdict.sayOnly).toContain("not refunded");
  });
});

describe("feature and timeline decisions", () => {
  it("approves an exact feature statement and refuses a dated variant", () => {
    const statement = "Dark mode is on the public roadmap with no delivery date.";
    expect(evaluateStatement("FEATURE", statement, [feature(statement)]).decision).toBe("APPROVED");
    const refused = evaluateStatement("FEATURE", `${statement} It ships Friday.`, [feature(statement)]);
    expect(refused.decision).toBe("REFUSED");
    expect(refused.sayOnly).toBeNull();
    expect(proposalAddsUnapprovedDetail(`${statement} It ships Friday.`, statement)).toBe(true);
  });

  it("refuses a timeline that was never approved", () => {
    const verdict = evaluateStatement("TIMELINE", "We will ship this next Tuesday.", []);
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.approvedStatements).toEqual([]);
  });
});

describe("escalation", () => {
  it("refuses a promise the channel is not allowed to make", () => {
    const policy = evaluateRefund("A duplicate charge may be refunded after the charge is confirmed.", [refund({})]);
    const verdict = applyChannelLimit(policy, "chat", limit());
    expect(verdict.decision).toBe("REFUSED");
    expect(verdict.sayOnly).toBeNull();
  });

  it("refuses a tier above the limit and approves one on the ladder", () => {
    const saved = limit({ allowRefundPromise: true });
    expect(evaluateEscalation("ESCALATE", "director", saved).decision).toBe("REFUSED");
    expect(evaluateEscalation("ESCALATE", "frontline", saved).decision).toBe("APPROVED");
  });

  it("refuses escalation when no limit exists", () => {
    expect(evaluateEscalation("PROMISE_TIMELINE", undefined, null).decision).toBe("REFUSED");
  });
});
