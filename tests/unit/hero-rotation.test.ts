import { describe, expect, test } from "vitest";
import { canRotate, rotate, startRotation, tileOrder, upcoming, type RotationState } from "@/lib/hero-rotation";

function run(poolSize: number, tileCount: number, steps: number): { states: RotationState[]; tiles: (number | null)[] } {
  let state = startRotation(poolSize, tileCount);
  const states = [state];
  const tiles: (number | null)[] = [];
  for (let i = 0; i < steps; i += 1) {
    const next = rotate(state, poolSize);
    state = next.state;
    states.push(state);
    tiles.push(next.tile);
  }
  return { states, tiles };
}

describe("hero rotation", () => {
  test("starts with the newest products in order", () => {
    expect(startRotation(10, 6).tiles).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("does not rotate when every product already fits on screen", () => {
    expect(canRotate(6, 6)).toBe(false);
    expect(startRotation(4, 6).tiles).toEqual([0, 1, 2, 3]);
    const first = startRotation(6, 6);
    expect(rotate(first, 6)).toEqual({ state: first, tile: null });
    expect(upcoming(first, 6)).toBeNull();
  });

  test("swaps one tile at a time in a scattered order", () => {
    const { states, tiles } = run(12, 6, 6);
    expect(tiles).toEqual(tileOrder(6));
    for (let i = 1; i < states.length; i += 1) {
      const changed = states[i]!.tiles.filter((p, t) => p !== states[i - 1]!.tiles[t]);
      expect(changed).toHaveLength(1);
    }
  });

  test("never shows the same product twice at once and gives every product a turn", () => {
    const pool = 9;
    const { states } = run(pool, 6, 40);
    const seen = new Set<number>();
    for (const state of states) {
      expect(new Set(state.tiles).size).toBe(state.tiles.length);
      state.tiles.forEach((p) => seen.add(p));
    }
    expect(seen.size).toBe(pool);
  });

  test("upcoming names the product the next swap brings in", () => {
    const start = startRotation(10, 6);
    const next = upcoming(start, 10);
    const { state, tile } = rotate(start, 10);
    expect(state.tiles[tile!]).toBe(next);
    expect(next).toBe(6);
  });

  test("tile order covers every tile exactly once for any grid size", () => {
    for (const count of [1, 3, 6, 8]) {
      expect(tileOrder(count).toSorted((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });
});
