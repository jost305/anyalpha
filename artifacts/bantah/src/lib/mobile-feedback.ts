export function softHaptic(duration = 8) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  if (document.visibilityState !== 'visible') return;

  const vibrate = (navigator as unknown as { vibrate?: (pattern: number | number[]) => boolean }).vibrate;
  if (typeof vibrate !== 'function') return;

  try {
    vibrate.call(navigator, duration);
  } catch {
    // Vibration is optional and may be blocked by browser or device settings.
  }
}
