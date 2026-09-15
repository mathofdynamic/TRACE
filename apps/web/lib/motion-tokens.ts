/**
 * TRACE Motion Design Tokens & Physical Constants
 *
 * Physical Contract:
 * - Entrance duration: 200ms
 * - Entrance lead step: 66.66666666666667ms (ENTRANCE_DURATION_MS / 3)
 * - Entrance distance: 20px
 * - Entrance easing: cubic-bezier(.16, 1, .3, 1)
 * - Exit duration: 66ms
 * - Exit distance: 8px
 * - Exit easing: cubic-bezier(.4, 0, 1, 1)
 */

export const ENTRANCE_DURATION_MS = 200;
export const ENTRANCE_LEAD_MS = ENTRANCE_DURATION_MS / 3;
export const ENTRANCE_DISTANCE_PX = 20;
export const ENTRANCE_EASING = 'cubic-bezier(.16, 1, .3, 1)';

export const EXIT_DURATION_MS = 66;
export const EXIT_DISTANCE_PX = 8;
export const EXIT_EASING = 'cubic-bezier(.4, 0, 1, 1)';

// Backward compatibility alias for item staggering
export const STAGGER_DELAY_MS = ENTRANCE_LEAD_MS;
