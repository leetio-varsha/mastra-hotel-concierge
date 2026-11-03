import { createScorer, notScorable } from '@mastra/core/evals';
import { extractToolResults } from '@mastra/evals/scorers/utils';

export type ExpectedToolCall = {
  tool: string;
  /** Subset of arguments that must appear in at least one call to `tool`. Strings compare case-insensitively; arrays as subsets. */
  args?: Record<string, unknown>;
};

export type ToolCallGroundTruth = { expectedTools: ExpectedToolCall[] };

function hasToolCallGroundTruth(value: unknown): value is ToolCallGroundTruth {
  return typeof value === 'object' && value !== null && Array.isArray((value as ToolCallGroundTruth).expectedTools);
}

function valueMatches(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') return expected.toLowerCase() === actual.toLowerCase();
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => actual.some((candidate) => valueMatches(item, candidate)));
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function argsMatch(expected: Record<string, unknown> | undefined, actual: Record<string, unknown>): boolean {
  return Object.entries(expected ?? {}).every(([key, value]) => valueMatches(value, actual[key]));
}

/**
 * Tool-call correctness on fixed scenarios: each expected call must appear with the expected
 * (subset of) arguments. Score is the fraction of expectations met, so partial credit is visible.
 */
export const toolCallCorrectnessScorer = createScorer({
  id: 'tool-call-correctness',
  description: 'Expected tools were called with the expected arguments (city, dates, guests, filters, hotel id).',
  type: 'agent',
})
  .preprocess(({ run }) => {
    if (!hasToolCallGroundTruth(run.groundTruth)) return notScorable('groundTruth.expectedTools not set');
    const calls = extractToolResults(run.output).map(({ toolName, args }) => ({ toolName, args: args ?? {} }));
    const checks = run.groundTruth.expectedTools.map((expected) => ({
      expected,
      matched: calls.some((call) => call.toolName === expected.tool && argsMatch(expected.args, call.args)),
    }));
    return { calls, checks };
  })
  .generateScore(({ results }) => {
    const { checks } = results.preprocessStepResult;
    if (checks.length === 0) return 1;
    return checks.filter((check) => check.matched).length / checks.length;
  })
  .generateReason(({ results }) => {
    const { calls, checks } = results.preprocessStepResult;
    const missed = checks.filter((check) => !check.matched);
    if (missed.length === 0) return `All ${checks.length} expected tool call(s) matched.`;
    const actual = calls.map((call) => `${call.toolName}(${JSON.stringify(call.args)})`).join(', ') || 'none';
    const wanted = missed.map((check) => `${check.expected.tool}(${JSON.stringify(check.expected.args ?? {})})`).join(', ');
    return `Missing expected call(s): ${wanted}. Actual calls: ${actual}.`;
  });
