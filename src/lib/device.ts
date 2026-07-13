// Input-type detection. Scores from touchscreens are not comparable to
// mouse scores (touch adds hardware latency), so every attempt records
// how it was played.
import type { DeviceType } from './storage';

/** Best guess before any input happens (used for display only). */
export function guessDeviceType(): DeviceType {
  if (typeof matchMedia === 'undefined') return 'unknown';
  if (matchMedia('(pointer: coarse)').matches) return 'touch';
  if (matchMedia('(pointer: fine)').matches) return 'mouse';
  return 'unknown';
}

/** Authoritative type from an actual input event. */
export function deviceTypeFromEvent(e: PointerEvent): DeviceType {
  switch (e.pointerType) {
    case 'touch':
      return 'touch';
    case 'mouse':
      return 'mouse';
    case 'pen':
      return 'pen';
    default:
      return 'unknown';
  }
}
