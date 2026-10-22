import type { FragmentCandidate } from '../../engine/types';

export const selectAll = (items: readonly FragmentCandidate[]) => new Set(items.map((item) => item.id));
export function toggleCandidate(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
export const selectedCandidates = (items: readonly FragmentCandidate[], selected: ReadonlySet<string>) => items.filter((item) => selected.has(item.id));
export function hiddenSelectionCount(items: readonly FragmentCandidate[], filtered: readonly FragmentCandidate[], selected: ReadonlySet<string>): number {
  const visible = selectAll(filtered);
  return items.filter((item) => selected.has(item.id) && !visible.has(item.id)).length;
}
