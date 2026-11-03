import { createScorer, notScorable } from '@mastra/core/evals';
import { extractAgentResponseMessages, extractToolCalls } from '@mastra/evals/scorers/utils';

export type ClarificationGroundTruth = {
  /** true: the request lacks city or dates and the agent must ask instead of searching. false: the agent must search. */
  expectsClarification: boolean;
};

function hasClarificationGroundTruth(value: unknown): value is ClarificationGroundTruth {
  return typeof value === 'object' && value !== null && typeof (value as ClarificationGroundTruth).expectsClarification === 'boolean';
}

/**
 * Checks the "ask, don't guess" rule. Driven by groundTruth so the same scorer verifies both
 * sides: incomplete requests get a question and no search; complete requests get a search.
 */
export const clarifiesMissingInfoScorer = createScorer({
  id: 'clarifies-missing-info',
  description: 'Asks for missing city/dates instead of guessing, and searches when the request is complete.',
  type: 'agent',
})
  .preprocess(({ run }) => {
    if (!hasClarificationGroundTruth(run.groundTruth)) return notScorable('groundTruth.expectsClarification not set');
    const searched = extractToolCalls(run.output).tools.includes('search_hotels');
    const responses = extractAgentResponseMessages(run.output);
    const lastResponse = responses.at(-1) ?? '';
    return {
      expectsClarification: run.groundTruth.expectsClarification,
      searched,
      askedQuestion: lastResponse.includes('?'),
    };
  })
  .generateScore(({ results }) => {
    const { expectsClarification, searched, askedQuestion } = results.preprocessStepResult;
    if (expectsClarification) return !searched && askedQuestion ? 1 : 0;
    return searched ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const { expectsClarification, searched, askedQuestion } = results.preprocessStepResult;
    if (expectsClarification) {
      return score === 1
        ? 'Required info was missing: the agent asked a question and did not search.'
        : `Required info was missing but the agent ${searched ? 'searched anyway' : 'did not ask a question'}.`;
    }
    return score === 1 ? 'Request was complete and the agent searched.' : 'Request was complete but the agent did not call search_hotels.';
  });
