import type { CommitmentRecord, EscalationLimitRecord, RefundRuleRecord } from "./store.js";

export type PolicyKind = "REFUND" | "FEATURE" | "TIMELINE";

export type CommitmentVerdict = {
  kind: PolicyKind;
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  grantsRefund: boolean;
  sayOnly: string | null;
  eligibilityWindowDays: number | null;
  matchedRuleId: string | null;
  matchedName: string | null;
  approvedStatements?: string[];
  moreApprovedMayExist?: boolean;
  escalationChecked: boolean;
  escalationDecision?: "APPROVED" | "REFUSED";
  instruction: string;
};

export type EscalationAction = "PROMISE_REFUND" | "PROMISE_FEATURE" | "PROMISE_TIMELINE" | "ESCALATE";

export type EscalationVerdict = {
  decision: "APPROVED" | "REFUSED";
  allowed: boolean;
  action: EscalationAction;
  maxTier: string | null;
  tierLadder: string[];
  instruction: string;
};

const GENERIC_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "of", "in", "on", "at", "by", "with",
  "refund", "refunds", "refunded", "money", "feature", "features", "timeline", "timelines",
  "promise", "promised", "customer", "please", "thanks", "hello", "order", "item", "product",
  "support", "team", "we", "you", "your", "our", "can", "cannot", "will", "would"
]);

const EXTRA_COMMITMENT_WORDS = new Set([
  "tomorrow", "today", "tonight", "asap", "immediately", "guarantee", "guaranteed",
  "lifetime", "forever", "free", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"
]);

export function normalizeStatement(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
}

export function termIsSpecific(term: string): boolean {
  const words = normalizeStatement(term).split(" ").filter(Boolean);
  return words.some((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
}

export function assertSpecificMatchTerms(terms: string[]): void {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (!cleaned.some(termIsSpecific)) {
    throw new Error("Refund rule needs a specific situation phrase");
  }
}

function usableRules(rules: RefundRuleRecord[]): RefundRuleRecord[] {
  return rules.filter((rule) => rule.status === "APPROVED" && rule.remedy.trim() && rule.matchTerms.some(termIsSpecific));
}

function specificity(rule: RefundRuleRecord): number {
  return rule.matchTerms.filter(termIsSpecific).reduce((total, term) => total + normalizeStatement(term).length, 0);
}

function situationMatches(rule: RefundRuleRecord, proposal: string): boolean {
  const haystack = normalizeStatement(proposal);
  const terms = rule.matchTerms.filter(termIsSpecific).map(normalizeStatement);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function baseVerdict(kind: PolicyKind, instruction: string, partial: Partial<CommitmentVerdict> = {}): CommitmentVerdict {
  return {
    kind,
    decision: "REFUSED",
    allowed: false,
    grantsRefund: false,
    sayOnly: null,
    eligibilityWindowDays: null,
    matchedRuleId: null,
    matchedName: null,
    escalationChecked: false,
    instruction,
    ...partial
  };
}

export function evaluateRefund(proposal: string, rules: RefundRuleRecord[]): CommitmentVerdict {
  const usable = usableRules(rules);
  const exact = usable
    .filter((rule) => normalizeStatement(rule.remedy) === normalizeStatement(proposal))
    .sort((a, b) => Number(b.decision === "DENY") - Number(a.decision === "DENY"));
  if (exact[0]) {
    const rule = exact[0];
    const grantsRefund = rule.decision === "ALLOW";
    return baseVerdict(
      "REFUND",
      grantsRefund
        ? "APPROVED. Say sayOnly verbatim. This is the approved refund wording. Do not add an amount, a date, a feature, or an extra condition."
        : "APPROVED. Say sayOnly verbatim. This script does not grant a refund. Do not add a refund, a feature, or a timeline.",
      {
        decision: "APPROVED",
        allowed: true,
        grantsRefund,
        sayOnly: rule.remedy,
        eligibilityWindowDays: rule.windowDays,
        matchedRuleId: rule.id,
        matchedName: rule.name
      }
    );
  }

  const matched = usable
    .filter((rule) => situationMatches(rule, proposal))
    .sort((a, b) => specificity(b) - specificity(a) || Number(b.decision === "DENY") - Number(a.decision === "DENY"));
  const rule = matched[0];
  if (!rule) {
    return baseVerdict(
      "REFUND",
      "REFUSED. Do not promise a refund. No approved refund rule covers this proposal. Draft for human review. Do not invent a refund, a partial refund, a feature, or a timeline."
    );
  }
  return baseVerdict(
    "REFUND",
    rule.decision === "ALLOW"
      ? "REFUSED. Do not say the proposal. The only approved wording for this situation is sayOnly. Say that verbatim, or draft for human review and do not mention a refund. Do not invent an amount, a date, or an extra condition."
      : "REFUSED. Do not promise a refund. The matched rule denies one. The only approved wording is sayOnly. Draft for human review if you cannot say that verbatim. Do not invent a replacement offer that is not in sayOnly.",
    {
      sayOnly: rule.remedy,
      eligibilityWindowDays: rule.windowDays,
      matchedRuleId: rule.id,
      matchedName: rule.name
    }
  );
}

export function evaluateStatement(kind: "FEATURE" | "TIMELINE", proposal: string, rows: CommitmentRecord[]): CommitmentVerdict {
  const usable = rows.filter((row) => row.status === "APPROVED" && row.kind === kind && row.statement.trim());
  const exact = usable.find((row) => normalizeStatement(row.statement) === normalizeStatement(proposal));
  if (exact) {
    return baseVerdict(
      kind,
      kind === "FEATURE"
        ? "APPROVED. Repeat sayOnly verbatim. Do not add a ship date, a refund, or any feature that is not in sayOnly."
        : "APPROVED. Repeat sayOnly verbatim. Do not add a date, a refund, or a feature that is not in sayOnly.",
      {
        decision: "APPROVED",
        allowed: true,
        sayOnly: exact.statement,
        matchedRuleId: exact.id,
        matchedName: exact.name
      }
    );
  }
  const listed = usable.slice(0, 20).map((row) => row.statement);
  const noun = kind === "FEATURE" ? "feature" : "timeline";
  return baseVerdict(
    kind,
    usable.length
      ? `REFUSED. This ${noun} is not an approved statement. Do not promise it and do not invent a similar one. Draft for human review. You may only say a statement in approvedStatements, verbatim, after evaluate_commitment returns APPROVED for that exact text.`
      : `REFUSED. No approved ${noun} statements exist. Draft for human review. Do not promise a ${noun}.`,
    {
      approvedStatements: listed,
      moreApprovedMayExist: usable.length > listed.length
    }
  );
}

function promiseAllowed(limit: EscalationLimitRecord, kind: PolicyKind): boolean {
  if (kind === "REFUND") return limit.allowRefundPromise;
  if (kind === "FEATURE") return limit.allowFeaturePromise;
  return limit.allowTimelinePromise;
}

/** A channel limit can only tighten a verdict. It never turns a refusal into permission. */
export function applyChannelLimit(
  verdict: CommitmentVerdict,
  channel: string | undefined,
  limit: EscalationLimitRecord | null
): CommitmentVerdict {
  if (!channel) {
    return {
      ...verdict,
      escalationChecked: false,
      instruction: `${verdict.instruction} Escalation was not checked. Call evaluate_escalation before sending.`
    };
  }
  if (!limit || limit.status !== "APPROVED") {
    return {
      ...verdict,
      decision: "REFUSED",
      allowed: false,
      grantsRefund: false,
      sayOnly: null,
      escalationChecked: true,
      escalationDecision: "REFUSED",
      instruction: "REFUSED. No approved escalation limit covers this channel. Draft for human review. Do not promise a refund, a feature, or a timeline, and do not invent an escalation path."
    };
  }
  if (!promiseAllowed(limit, verdict.kind)) {
    return {
      ...verdict,
      decision: "REFUSED",
      allowed: false,
      grantsRefund: false,
      sayOnly: null,
      escalationChecked: true,
      escalationDecision: "REFUSED",
      instruction: `REFUSED. The approved escalation limit for this channel does not allow a ${verdict.kind.toLowerCase()} promise. Draft for human review. Do not offer one. The highest approved tier on this limit is ${limit.maxTier}.`
    };
  }
  return {
    ...verdict,
    escalationChecked: true,
    escalationDecision: "APPROVED",
    instruction: `${verdict.instruction} This channel's escalation limit allows this kind of promise only when decision is APPROVED.`
  };
}

export function evaluateEscalation(action: EscalationAction, targetTier: string | undefined, limit: EscalationLimitRecord | null): EscalationVerdict {
  if (!limit || limit.status !== "APPROVED") {
    return {
      decision: "REFUSED",
      allowed: false,
      action,
      maxTier: null,
      tierLadder: [],
      instruction: "REFUSED. No approved escalation limit covers this channel. Draft for human review. Do not promise a refund, a feature, or a timeline, and do not invent an escalation path."
    };
  }
  const ladder = limit.tierLadder;
  if (action === "ESCALATE") {
    const target = targetTier?.trim() ?? "";
    const maxIndex = ladder.indexOf(limit.maxTier);
    const targetIndex = ladder.indexOf(target);
    if (!target || targetIndex < 0 || maxIndex < 0 || targetIndex > maxIndex) {
      return {
        decision: "REFUSED",
        allowed: false,
        action,
        maxTier: limit.maxTier,
        tierLadder: ladder,
        instruction: "REFUSED. That tier is not within the approved escalation limit. Draft for human review. Do not invent a destination. Stay on the recorded ladder at or below maxTier."
      };
    }
    return {
      decision: "APPROVED",
      allowed: true,
      action,
      maxTier: limit.maxTier,
      tierLadder: ladder,
      instruction: `APPROVED. You may escalate to ${target}. Do not promise a refund, feature, or timeline unless a separate evaluate_commitment call returns APPROVED.`
    };
  }
  const kind: PolicyKind = action === "PROMISE_REFUND" ? "REFUND" : action === "PROMISE_FEATURE" ? "FEATURE" : "TIMELINE";
  if (!promiseAllowed(limit, kind)) {
    return {
      decision: "REFUSED",
      allowed: false,
      action,
      maxTier: limit.maxTier,
      tierLadder: ladder,
      instruction: `REFUSED. This channel cannot promise a ${kind.toLowerCase()}. Draft for human review. Do not offer one. The highest approved tier is ${limit.maxTier}.`
    };
  }
  return {
    decision: "APPROVED",
    allowed: true,
    action,
    maxTier: limit.maxTier,
    tierLadder: ladder,
    instruction: `APPROVED. This channel may make a ${kind.toLowerCase()} promise only when evaluate_commitment returns APPROVED for the exact wording. Do not invent wording.`
  };
}

export type RankedAnswer = { id: string; topic: string; question: string; answer: string; revision: number };

export function selectAnswers<T extends { status: string; topic: string; question: string; answer: string }>(
  query: string,
  rows: T[],
  limit: number
): T[] {
  const words = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return rows
    .filter((row) => row.status === "APPROVED")
    .map((row, index) => {
      const hay = new Set(`${row.topic} ${row.question} ${row.answer}`.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
      let score = 0;
      for (const word of words) if (word.length > 2 && hay.has(word)) score += 3;
      if (row.question.length > 8 && query.toLocaleLowerCase().includes(row.question.toLocaleLowerCase())) score += 20;
      return { row, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}

export function proposalAddsUnapprovedDetail(proposal: string, approved: string): boolean {
  const extraWords = new Set(normalizeStatement(proposal).split(" ").filter((word) => EXTRA_COMMITMENT_WORDS.has(word)));
  const approvedWords = new Set(normalizeStatement(approved).split(" "));
  for (const word of extraWords) if (!approvedWords.has(word)) return true;
  const proposalNumbers = proposal.match(/\d+/g) ?? [];
  const approvedNumbers = new Set(approved.match(/\d+/g) ?? []);
  return proposalNumbers.some((value) => !approvedNumbers.has(value));
}
