import type { Interface } from 'node:readline/promises';
import type { ReadStream } from 'node:tty';

/**
 * readline's question() drops pending prompts once a piped stdin closes, so for non-TTY input we read
 * every line up front and answer prompts from that queue. Returns undefined when the input is exhausted.
 */
export function createPrompter(rl: Interface, input: NodeJS.ReadStream & Partial<ReadStream>) {
  if (input.isTTY) {
    return async (prompt: string): Promise<string | undefined> => {
      try {
        return await rl.question(prompt);
      } catch {
        return undefined; // Ctrl+D
      }
    };
  }

  const queue: string[] = [];
  let closed = false;
  const waiters: Array<() => void> = [];
  rl.on('line', (line) => {
    queue.push(line);
    waiters.shift()?.();
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()?.();
  });

  return async (prompt: string): Promise<string | undefined> => {
    while (queue.length === 0 && !closed) await new Promise<void>((resolve) => waiters.push(resolve));
    const line = queue.shift();
    if (line !== undefined) process.stdout.write(`${prompt}${line}\n`);
    return line;
  };
}
