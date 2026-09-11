/**
 * Where every card, frame and line sits on the member app's team map.
 *
 * Pure geometry over `layoutTree` — the same tidy-tree the portal's Revenue
 * and People charts are placed with, so the three cannot disagree about who
 * stands under whom. Kept out of the component because the parts that can
 * quietly go wrong are arithmetic: a department stacked on top of the one
 * above it, a line drawn to the wrong end of a card, or somebody whose upline
 * is missing dropped off the map altogether.
 */

import { NODE_HEIGHT, NODE_WIDTH, layoutTree } from "../org-layout";
import type { MemberOrgDepartment, MemberOrgMap, MemberOrgPerson } from "./types";

export const FRAME_PADDING = 22;
export const FRAME_HEADER = 52;
export const FRAME_GAP = 44;

export interface PlacedCard {
  key: string;
  person: MemberOrgPerson | null;
  director?: { id: string; name: string };
  x: number;
  y: number;
  departmentId: string;
}
export interface PlacedFrame {
  department: MemberOrgDepartment;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
}
export interface PlacedLine {
  key: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  derived: boolean;
}

/**
 * Every department laid out, stacked one above the next.
 *
 * A department's heads stand in a row of their own and each top-of-tree
 * person is hung under the FIRST of them, exactly as `layoutParent` does on
 * the portal chart; the line to any further head is drawn as well, and dashed,
 * because two directors do not fit in one reporting column.
 */
export function placeMap(map: MemberOrgMap) {
  const cards: PlacedCard[] = [];
  const frames: PlacedFrame[] = [];
  const lines: PlacedLine[] = [];
  let cursor = 0;
  let widest = 0;

  for (const department of map.departments) {
    const people = map.people.filter((p) => p.departmentId === department.id);
    const directors = department.directors ?? [];
    const directorId = (id: string) => `dir:${department.id}:${id}`;
    const nodes = people.map((person) => ({
      id: person.id,
      parentId:
        person.parentId && people.some((p) => p.id === person.parentId)
          ? person.parentId
          : directors.length
            ? directorId(directors[0].id)
            : null,
      label: person.name,
    }));
    const layout = layoutTree(
      directors.length
        ? [
            ...directors.map((d) => ({ id: directorId(d.id), parentId: null, label: d.name })),
            ...nodes,
          ]
        : nodes,
    );
    const innerWidth = Math.max(layout.width, NODE_WIDTH);
    const innerHeight = Math.max(layout.height, NODE_HEIGHT);
    const frame: PlacedFrame = {
      department,
      x: 0,
      y: cursor,
      width: innerWidth + FRAME_PADDING * 2,
      height: innerHeight + FRAME_HEADER + FRAME_PADDING,
      count: people.length,
    };
    frames.push(frame);
    widest = Math.max(widest, frame.width);

    const offsetX = FRAME_PADDING;
    const offsetY = cursor + FRAME_HEADER;
    const at = (id: string) => {
      const position = layout.positions.get(id);
      return position && { x: position.x + offsetX, y: position.y + offsetY };
    };
    for (const director of directors) {
      const point = at(directorId(director.id));
      if (point) cards.push({ key: directorId(director.id), person: null, director, departmentId: department.id, ...point });
    }
    for (const person of people) {
      const point = at(person.id);
      if (point) cards.push({ key: person.id, person, departmentId: department.id, ...point });
    }
    for (const person of people) {
      const child = at(person.id);
      if (!child) continue;
      const parentKey =
        person.parentId && people.some((p) => p.id === person.parentId)
          ? person.parentId
          : directors.length
            ? directorId(directors[0].id)
            : null;
      const parent = parentKey && at(parentKey);
      if (parent)
        lines.push({
          key: `${person.id}-line`,
          from: { x: parent.x + NODE_WIDTH / 2, y: parent.y + NODE_HEIGHT },
          to: { x: child.x + NODE_WIDTH / 2, y: child.y },
          derived: !person.parentId,
        });
      // A second head gets its own dashed line to each top-of-tree person.
      if (!person.parentId)
        for (const extra of directors.slice(1)) {
          const point = at(directorId(extra.id));
          if (point)
            lines.push({
              key: `${person.id}-${extra.id}`,
              from: { x: point.x + NODE_WIDTH / 2, y: point.y + NODE_HEIGHT },
              to: { x: child.x + NODE_WIDTH / 2, y: child.y },
              derived: true,
            });
        }
    }
    cursor += frame.height + FRAME_GAP;
  }
  return {
    cards,
    frames: frames.map((f) => ({ ...f, width: widest })),
    lines,
    width: widest,
    height: Math.max(0, cursor - FRAME_GAP),
  };
}

