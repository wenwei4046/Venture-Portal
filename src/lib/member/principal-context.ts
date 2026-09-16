/** Read-only reporting branch. The selected person is never marked as the caller. */
export function selectViewedBranch<T extends { id: string; parentId: string | null; departmentId?: string; schemeId?: string }>(people: readonly T[], rootId: string): T[] {
  const root = people.find(person => person.id === rootId);
  if (!root) return [];
  const unique = new Map<string, T>();
  const duplicates = new Set<string>();
  for (const person of people) {
    if (unique.has(person.id)) duplicates.add(person.id);
    unique.set(person.id, person);
  }
  if (duplicates.has(root.id)) return [];
  // A selected root inside a loop has no meaningful descendant boundary.
  // Stop at a loop above the root: its own well-formed branch is still usable.
  const ancestry = new Set<string>();
  let parentId = root.parentId;
  while (parentId !== null && !ancestry.has(parentId) && !duplicates.has(parentId)) {
    if (parentId === root.id) return [];
    ancestry.add(parentId);
    const parent = unique.get(parentId);
    if (!parent || (root.departmentId !== undefined && parent.departmentId !== root.departmentId)
      || (root.schemeId !== undefined && parent.schemeId !== root.schemeId)) break;
    parentId = parent.parentId;
  }
  const selected = new Set<string>();
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (selected.has(current.id)) continue;
    selected.add(current.id);
    queue.push(...people.filter(person => person.parentId === current.id && !duplicates.has(person.id)
      && (root.departmentId === undefined || person.departmentId === root.departmentId)
      && (root.schemeId === undefined || person.schemeId === root.schemeId)));
  }
  return people.filter(person => selected.has(person.id));
}
