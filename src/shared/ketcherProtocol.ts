export const FRAME_CHANNEL = 'chemscutter-ketcher-v1';

export interface FrameStructure {
  molfile: string;
  smiles: string;
  ket: string;
}

export type FrameRequest =
  | { channel: typeof FRAME_CHANNEL; type: 'load'; id: number; input: string }
  | { channel: typeof FRAME_CHANNEL; type: 'export'; id: number };

export type FrameResponse =
  | { channel: typeof FRAME_CHANNEL; type: 'ready' | 'changed' }
  | { channel: typeof FRAME_CHANNEL; type: 'loaded'; id: number }
  | { channel: typeof FRAME_CHANNEL; type: 'structure'; id: number; structure: FrameStructure }
  | { channel: typeof FRAME_CHANNEL; type: 'error'; id: number | null; message: string };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const requestId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function isFrameStructure(value: unknown): value is FrameStructure {
  return record(value) && typeof value.molfile === 'string'
    && typeof value.smiles === 'string' && typeof value.ket === 'string';
}

export function isFrameRequest(value: unknown): value is FrameRequest {
  if (!record(value) || value.channel !== FRAME_CHANNEL || !requestId(value.id)) return false;
  return value.type === 'export' || (value.type === 'load' && typeof value.input === 'string');
}

export function isFrameResponse(value: unknown): value is FrameResponse {
  if (!record(value) || value.channel !== FRAME_CHANNEL) return false;
  if (value.type === 'ready' || value.type === 'changed') return true;
  if (value.type === 'error') return (value.id === null || requestId(value.id)) && typeof value.message === 'string';
  if (!requestId(value.id)) return false;
  return value.type === 'loaded' || (value.type === 'structure' && isFrameStructure(value.structure));
}

export function fromExpectedWindow(
  event: { origin: string; source: unknown }, origin: string, expectedWindow: unknown
): boolean {
  return expectedWindow != null && event.origin === origin && event.source === expectedWindow;
}
