import { expect, it } from 'vitest';
import type { FragmentCandidate } from '../../src/engine/types';
import { selectAll, toggleCandidate, selectedCandidates, hiddenSelectionCount } from '../../src/ui/results/selection';

const items = Array.from({ length: 45 }, (_, i) => ({ id: String(i) }) as FragmentCandidate);
it('以候選編號保留跨頁、排序、篩選的勾選；新分析重新全選', () => {
  const selected = toggleCandidate(selectAll(items), '0');
  expect(selectedCandidates([...items].reverse(), selected)).toHaveLength(44);
  expect(selectedCandidates(items.slice(20, 40), selected)).toHaveLength(20);
  expect(hiddenSelectionCount(items, items.slice(0, 5), selected)).toBe(40);
  expect(selected.has('0')).toBe(false);
  expect(selectAll(items).has('0')).toBe(true);
});
it('全選、全不選與取代為目前篩選結果', () => {
  expect(selectedCandidates(items, selectAll(items))).toHaveLength(45);
  expect(selectedCandidates(items, new Set())).toEqual([]);
  expect(selectedCandidates(items, selectAll([items[3], items[21]]))).toEqual([items[3], items[21]]);
  expect(toggleCandidate(new Set(), '3').has('3')).toBe(true);
});
