import { generateTile } from '../core/generate';
import { createSeededProject } from '../core/project';
import { generationKey } from './generationKey';
import type { EngineReply, EngineRequest } from './engineProtocol';
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage: (reply: EngineReply) => void;
};
worker.onmessage = ({ data }) => {
  const start = performance.now();
  try {
    if (data.input.kind === 'tile') {
      const tile = generateTile(data.input.config);
      worker.postMessage({
        id: data.id,
        ok: true,
        output: { kind: 'tile', key: data.input.key, tile, elapsedMs: performance.now() - start },
      });
    } else {
      const config = createSeededProject(data.input.seed, data.input.options);
      const tile = generateTile(config);
      worker.postMessage({
        id: data.id,
        ok: true,
        output: {
          kind: 'project',
          config,
          key: generationKey(config),
          tile,
          elapsedMs: performance.now() - start,
        },
      });
    }
  } catch (error) {
    worker.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Generierung fehlgeschlagen.',
    });
  }
};
