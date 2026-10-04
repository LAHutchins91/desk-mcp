const KNOWN = [
  "Desk not found",
  "Revision conflict",
  "Refund rule needs a specific situation phrase",
  "Escalation tier is not on the ladder"
] as const;

export function publicError(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : "";
  const safe = KNOWN.find((item) => message.includes(item));
  if (safe === "Desk not found") return { status: 404, error: safe };
  if (safe === "Revision conflict") return { status: 409, error: safe };
  if (safe) return { status: 400, error: safe };
  return { status: 500, error: "Desk could not complete this request. Your changes may not have been saved." };
}
