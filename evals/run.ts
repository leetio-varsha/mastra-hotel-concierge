import 'dotenv/config';
import { runEvals } from '@mastra/core/evals';
import { checks } from '@mastra/evals/checks';
import { mastra } from '../src/mastra/index';
import { clarifiesMissingInfoScorer } from '../src/mastra/scorers/clarifies-missing-info';
import { groundedHotelsScorer } from '../src/mastra/scorers/grounded-hotels';
import { toolCallCorrectnessScorer } from '../src/mastra/scorers/tool-call-correctness';
import { CASES } from './cases';

/**
 * Runs the eval dataset against the concierge agent with runEvals and prints a per-case table.
 * Every scorer here is deterministic, so a run costs only the agent's own model calls.
 */
const agent = mastra.getAgent('conciergeAgent');
const scorers = [groundedHotelsScorer, clarifiesMissingInfoScorer, toolCallCorrectnessScorer, checks.noToolErrors(), checks.didNotCall('create_booking')];

type Row = { id: string; scores: Record<string, string>; reasons: string[] };
const rows: Row[] = [];
// runEvals reports items by their input, so map inputs back to case ids for the table.
const caseIdByInput = new Map(CASES.map((c) => [JSON.stringify(c.input), c.id]));

const result = await runEvals({
  target: agent,
  scorers,
  concurrency: 3,
  data: CASES.map((c) => ({
    ...(Array.isArray(c.input) ? { inputs: c.input } : { input: c.input }),
    groundTruth: c.groundTruth,
  })),
  onItemComplete: ({ item, scorerResults }) => {
    const caseId = caseIdByInput.get(JSON.stringify(item.inputs ?? item.input)) ?? '?';
    const scores: Record<string, string> = {};
    const reasons: string[] = [];
    for (const [id, scorerResult] of Object.entries(scorerResults)) {
      const r = scorerResult as { score?: number; reason?: string; notScorable?: boolean } | undefined;
      if (!r || r.score === undefined || r.score === null) {
        scores[id] = '—';
        continue;
      }
      scores[id] = r.score.toFixed(2);
      if (r.score < 1 && r.reason) reasons.push(`${id}: ${r.reason}`);
    }
    rows.push({ id: caseId, scores, reasons });
    process.stdout.write(`✓ ${caseId}\n`);
  },
});

const scorerIds = scorers.map((s) => s.id);
const header = ['case', ...scorerIds];
const table = [header, header.map(() => '---'), ...rows.map((row) => [row.id, ...scorerIds.map((id) => row.scores[id] ?? '—')])];
const widths = header.map((_, i) => Math.max(...table.map((r) => r[i]!.length)));
process.stdout.write('\n');
for (const r of table) process.stdout.write(`| ${r.map((cell, i) => cell.padEnd(widths[i]!)).join(' | ')} |\n`);
process.stdout.write('\n');

process.stdout.write('Averages (not-scorable items excluded):\n');
for (const id of scorerIds) {
  const avg = result.scores[id];
  process.stdout.write(`  ${id.padEnd(28)} ${typeof avg === 'number' ? avg.toFixed(2) : '—'}\n`);
}
process.stdout.write(`\n${result.summary.totalItems} cases.\n`);

const failures = rows.filter((row) => row.reasons.length > 0);
if (failures.length) {
  process.stdout.write('\nBelow-threshold details:\n');
  for (const row of failures) for (const reason of row.reasons) process.stdout.write(`  ${row.id} — ${reason}\n`);
}
process.exit(0);
