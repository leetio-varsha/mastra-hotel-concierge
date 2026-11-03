import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';
import { conciergeAgent } from './agents/concierge-agent';
import { clarifiesMissingInfoScorer } from './scorers/clarifies-missing-info';
import { groundedHotelsScorer } from './scorers/grounded-hotels';
import { toolCallCorrectnessScorer } from './scorers/tool-call-correctness';
import { bookingWorkflow } from './workflows/booking-workflow';

export const mastra = new Mastra({
  agents: { conciergeAgent },
  workflows: { bookingWorkflow },
  // Registering scorers lets runEvals persist scores and makes them available for trace scoring in Studio.
  scorers: { groundedHotelsScorer, clarifiesMissingInfoScorer, toolCallCorrectnessScorer },
  // One local LibSQL file holds conversation memory, workflow snapshots (suspended runs), scores and traces.
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'hotel-concierge',
        // 'realtime' writes spans as they complete, so traces appear in Studio while a run is still going.
        exporters: [new MastraStorageExporter({ strategy: 'realtime' })],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
