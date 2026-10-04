/** Stdio when stdin is not a terminal. Streamable HTTP otherwise. Same predicate as continuity-mcp. */
export function useStdioTransport(stdin: { isTTY?: boolean } = process.stdin): boolean {
  return stdin.isTTY !== true;
}
