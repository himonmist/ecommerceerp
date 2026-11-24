/** Whole days remaining until `end` (negative when past). */
export function daysUntil(end: Date, now: Date = new Date()): number {
  return Math.ceil((end.getTime() - now.getTime()) / 864e5);
}
