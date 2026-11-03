import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mastra } from '../src/mastra/index';
import { createPrompter } from './prompter';

/**
 * Terminal demo. Plain messages go to the concierge agent (with per-session memory).
 * `/book <request>` runs the booking workflow and resumes it with your confirmation.
 */
const agent = mastra.getAgent('conciergeAgent');
const workflow = mastra.getWorkflow('bookingWorkflow');
const memory = { thread: `cli-${randomUUID().slice(0, 8)}`, resource: 'cli-user' };
const rl = createInterface({ input: stdin, output: stdout });
// Works interactively and with piped input (e.g. `printf 'hotels in Lisbon…\n/exit\n' | npm run chat`).
const ask = createPrompter(rl, stdin);

const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

async function chat(message: string): Promise<void> {
  const stream = await agent.stream(message, { memory });
  for await (const chunk of stream.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        stdout.write(chunk.payload.text);
        break;
      case 'tool-call':
        stdout.write(dim(`\n→ ${chunk.payload.toolName}(${JSON.stringify(chunk.payload.args)})\n`));
        break;
      case 'tool-result': {
        const result = chunk.payload.result as { results?: unknown[]; error?: string } | undefined;
        const summary = result?.error ?? (Array.isArray(result?.results) ? `${result.results.length} result(s)` : 'ok');
        stdout.write(dim(`← ${chunk.payload.toolName}: ${summary}\n`));
        break;
      }
      case 'error':
        stdout.write(`\n[error] ${JSON.stringify(chunk.payload)}\n`);
        break;
      default:
        break;
    }
  }
  stdout.write('\n');
}

async function book(request: string): Promise<void> {
  const guestName = (await ask('Guest name for the booking: '))?.trim() || 'Guest';
  const run = await workflow.createRun();
  stdout.write(dim(`workflow run ${run.runId}: parsing → searching → shortlisting…\n`));
  let result = await run.start({ inputData: { request, guestName } });

  if (result.status === 'suspended') {
    const payload = result.suspendPayload?.['confirm-booking'] as
      | { message: string; proposal: { hotelId: string }; alternatives: Array<{ id: string; name: string; pricePerNight: number; totalPrice: number; rating: number; reason: string }> }
      | undefined;
    stdout.write(`\n${bold('Proposal:')} ${payload?.message ?? JSON.stringify(result.suspendPayload)}\n`);
    if (payload?.alternatives.length) {
      stdout.write('Alternatives on the shortlist:\n');
      for (const alt of payload.alternatives) {
        stdout.write(`  ${alt.id}  ${alt.name}  €${alt.pricePerNight}/night (€${alt.totalPrice} total), rating ${alt.rating} — ${alt.reason}\n`);
      }
    }
    const answer = ((await ask('Confirm? [y / n / <hotelId>]: ')) ?? 'n').trim();
    const resumeData =
      answer.toLowerCase() === 'y' ? { confirmed: true }
      : answer.toLowerCase() === 'n' || answer === '' ? { confirmed: false }
      : { confirmed: true, hotelId: answer };
    stdout.write(dim('resuming workflow…\n'));
    result = await run.resume({ step: result.suspended[0], resumeData });
  }

  if (result.status === 'success') {
    const outcome = result.result;
    switch (outcome.status) {
      case 'booked':
        stdout.write(`\n${bold('Booked!')} ${outcome.booking.id}: ${outcome.booking.hotelName}, ${outcome.booking.checkIn} → ${outcome.booking.checkOut}, ${outcome.booking.guests} guest(s), €${outcome.booking.totalPrice} total for ${outcome.booking.guestName}.\n\n`);
        break;
      case 'cancelled':
        stdout.write(`\nNot booked: ${outcome.reason}\n\n`);
        break;
      case 'needs_info':
        stdout.write(`\n${outcome.message}\n\n`);
        break;
      case 'no_results':
        stdout.write(`\n${outcome.message}\n\n`);
        break;
    }
  } else {
    stdout.write(`\nWorkflow ended with status "${result.status}"${'error' in result ? `: ${result.error.message}` : ''}\n\n`);
  }
}

stdout.write(`${bold('Hotel concierge')} ${dim(`(model: ${process.env.MODEL ?? 'anthropic/claude-sonnet-5-5'}, thread: ${memory.thread})`)}\n`);
stdout.write(dim('Ask for hotels in Lisbon, Barcelona, Prague or Amsterdam. Commands: /book <request>, /exit\n\n'));

for (;;) {
  const line = (await ask(bold('you> ')))?.trim();
  if (line === undefined || line === '/exit' || line === '/quit') break;
  if (!line) continue;
  if (line.startsWith('/book')) {
    const request = line.slice('/book'.length).trim();
    if (!request) {
      stdout.write('Usage: /book <request>, e.g. /book 2 nights in Lisbon from 2027-05-10, 2 guests, with breakfast\n');
      continue;
    }
    await book(request);
    continue;
  }
  stdout.write(bold('concierge> '));
  await chat(line);
}

rl.close();
process.exit(0);
