/**
 * Scheduling for the rotating hero product grid. Pure functions over product
 * indexes so the rules are easy to test:
 * - the grid starts with the first products in the pool (newest first);
 * - each step swaps exactly one tile, visiting tiles in a scattered order so
 *   changes do not sweep across the grid in a line;
 * - the incoming product is the next one in the pool that is not already on
 *   screen, so every product gets a turn and nothing shows twice at once.
 */

/** Tiles in the hero grid (3 × 2). Fewer products than this and the hero shows its banner photo instead. */
export const HERO_TILE_COUNT = 6;

export interface RotationState {
  /** Product index shown in each tile. */
  tiles: number[];
  /** Where to look for the next product in the pool. */
  cursor: number;
  /** How many swaps have happened; picks the next tile. */
  step: number;
}

/** Order in which the six tiles of a 3 × 2 grid change. */
const SCATTER = [0, 4, 2, 5, 1, 3];

export function tileOrder(tileCount: number): number[] {
  const order = SCATTER.filter((tile) => tile < tileCount);
  for (let tile = 0; tile < tileCount; tile += 1) if (!order.includes(tile)) order.push(tile);
  return order;
}

export function startRotation(poolSize: number, tileCount: number): RotationState {
  const count = Math.max(0, Math.min(tileCount, poolSize));
  return { tiles: Array.from({ length: count }, (_, i) => i), cursor: poolSize > 0 ? count % poolSize : 0, step: 0 };
}

/** Rotation needs more products than tiles; otherwise everything is already on show. */
export function canRotate(poolSize: number, tileCount: number): boolean {
  return tileCount > 0 && poolSize > tileCount;
}

function nextFree(state: RotationState, poolSize: number): number {
  let candidate = state.cursor % poolSize;
  while (state.tiles.includes(candidate)) candidate = (candidate + 1) % poolSize;
  return candidate;
}

/** The product the next swap will bring in, so its photo can load early. */
export function upcoming(state: RotationState, poolSize: number): number | null {
  return canRotate(poolSize, state.tiles.length) ? nextFree(state, poolSize) : null;
}

/** Swaps one tile for the next product. Returns the same state when there is nothing to rotate. */
export function rotate(state: RotationState, poolSize: number): { state: RotationState; tile: number | null } {
  if (!canRotate(poolSize, state.tiles.length)) return { state, tile: null };
  const order = tileOrder(state.tiles.length);
  const tile = order[state.step % order.length]!;
  const product = nextFree(state, poolSize);
  return {
    state: {
      tiles: state.tiles.map((current, i) => (i === tile ? product : current)),
      cursor: (product + 1) % poolSize,
      step: state.step + 1,
    },
    tile,
  };
}
