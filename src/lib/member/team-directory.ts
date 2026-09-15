interface TeamMembershipNode {
  id: string;
  parentId: string | null;
  self?: boolean;
  schemeId?: string;
  departmentId?: string;
}

/**
 * Select the signed-in member's branches by membership links, never by staff ID
 * or the broader "mine" department flag. The full map remains a separate view.
 */
export function selectOwnTeam<T extends TeamMembershipNode>(people: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const person of people) counts.set(person.id, (counts.get(person.id) ?? 0) + 1);
  // A parent link cannot identify which duplicate membership it belongs to.
  const unique = new Map(people.filter((person) => counts.get(person.id) === 1).map((person) => [person.id, person]));

  const cyclic = new Set<string>();
  const checked = new Set<string>();
  for (const start of unique.keys()) {
    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let id: string | null = start;
    while (id !== null && unique.has(id) && !checked.has(id)) {
      const loopStart = pathIndex.get(id);
      if (loopStart !== undefined) {
        for (const loopId of path.slice(loopStart)) cyclic.add(loopId);
        break;
      }
      pathIndex.set(id, path.length);
      path.push(id);
      id = unique.get(id)!.parentId;
    }
    for (const visited of path) checked.add(visited);
  }

  const children = new Map<string, T[]>();
  for (const person of unique.values()) {
    if (person.parentId === null || cyclic.has(person.id)) continue;
    const siblings = children.get(person.parentId) ?? [];
    siblings.push(person);
    children.set(person.parentId, siblings);
  }

  const included = new Set<string>();
  for (const root of unique.values()) {
    if (root.self !== true || cyclic.has(root.id)) continue;
    const queue = [{ person: root, schemeId: root.schemeId, departmentId: root.departmentId }];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      included.add(current.person.id);
      for (const child of children.get(current.person.id) ?? []) {
        if (current.schemeId !== undefined && child.schemeId !== undefined && current.schemeId !== child.schemeId) continue;
        if (current.departmentId !== undefined && child.departmentId !== undefined && current.departmentId !== child.departmentId) continue;
        queue.push({
          person: child,
          schemeId: child.schemeId ?? current.schemeId,
          departmentId: child.departmentId ?? current.departmentId,
        });
      }
    }
  }
  return people.filter((person) => included.has(person.id));
}
