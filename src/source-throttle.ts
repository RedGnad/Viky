/**
 * The pace the reading service keeps with the timing platforms that punish bursts (the founder, 27 Sep 2026, after
 * race result answered this machine 429 then 404 for hours, 26 Sep 2026, when a register run asked four times a
 * second). For each platform: a minimum interval between two readings, a ceiling per UTC day, and a pause after a
 * 429 during which nothing is asked of it. A reading refused by the pace is put off, never counted: the day's
 * ceiling is given back when the platform answered 429, and the person is told to try again later. Pure, with the
 * clock handed in, so the rules are tested as they run. The service keeps one of these per process.
 */

export type PlatformPace = Readonly<{ sources: readonly string[]; minIntervalMs: number; perDay: number; pauseAfter429Ms: number }>;

export const PLATFORM_PACE: Readonly<Record<string, PlatformPace>> = {
  "race-result": { sources: ["race-result-row"], minIntervalMs: 3_000, perDay: 400, pauseAfter429Ms: 30 * 60_000 },
  "mika-timing": { sources: ["mika-timing-runner"], minIntervalMs: 3_000, perDay: 400, pauseAfter429Ms: 30 * 60_000 },
};

/** A reading may start after `waitMs`, or is put off until `retryAfterMs` for a reason. */
export type PaceAnswer = Readonly<{ go: true; waitMs: number; platform: string | null }> | Readonly<{ go: false; reason: "PAUSED_AFTER_429" | "DAILY_CEILING"; retryAfterMs: number; platform: string }>;

const DAY_MS = 86_400_000;

export class SourcePace {
  private readonly next = new Map<string, number>();
  private readonly pausedUntil = new Map<string, number>();
  private readonly counted = new Map<string, { day: number; count: number }>();

  constructor(private readonly table: Readonly<Record<string, PlatformPace>> = PLATFORM_PACE) {}

  platformOf(sourceId: string): string | null {
    return Object.entries(this.table).find(([, pace]) => pace.sources.includes(sourceId))?.[0] ?? null;
  }

  /** Books a reading: when it may start, or why it is put off. A booked reading counts for the day. */
  take(sourceId: string, nowMs: number): PaceAnswer {
    const platform = this.platformOf(sourceId);
    if (!platform) return { go: true, waitMs: 0, platform: null };
    const pace = this.table[platform];
    const paused = this.pausedUntil.get(platform) ?? 0;
    if (nowMs < paused) return { go: false, reason: "PAUSED_AFTER_429", retryAfterMs: paused - nowMs, platform };
    const day = Math.floor(nowMs / DAY_MS);
    const counted = this.counted.get(platform);
    const count = counted && counted.day === day ? counted.count : 0;
    if (count >= pace.perDay) return { go: false, reason: "DAILY_CEILING", retryAfterMs: (day + 1) * DAY_MS - nowMs, platform };
    const start = Math.max(nowMs, this.next.get(platform) ?? 0);
    this.next.set(platform, start + pace.minIntervalMs);
    this.counted.set(platform, { day, count: count + 1 });
    return { go: true, waitMs: start - nowMs, platform };
  }

  /** The platform answered 429: nothing more is asked of it for a while, and this reading is not counted. */
  answered429(sourceId: string, nowMs: number): number {
    const platform = this.platformOf(sourceId);
    if (!platform) return 0;
    const pace = this.table[platform];
    this.pausedUntil.set(platform, nowMs + pace.pauseAfter429Ms);
    const day = Math.floor(nowMs / DAY_MS);
    const counted = this.counted.get(platform);
    if (counted && counted.day === day && counted.count > 0) this.counted.set(platform, { day, count: counted.count - 1 });
    return pace.pauseAfter429Ms;
  }
}

/** Whether a failure is the platform asking the reader to slow down. */
export function isTooManyRequests(message: string): boolean {
  return /HTTP response status 429|received HTTP 429|\b429\b.*too many|too many requests/i.test(message);
}
