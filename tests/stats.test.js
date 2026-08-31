/**
 * The bookkeeping behind the tiles, the streak and the charts.
 *
 * Two representations of "which day" live side by side in app.js: dailyHistory
 * is keyed by localDateKey() ("2026-08-31") while the streak compares
 * toDateString() ("Mon Aug 31 2026"). Both are local-time, so they agree on the
 * day -- and they have to keep agreeing, because a session that the tile counts
 * as today but the heatmap draws on yesterday is the bug this pins down.
 */

import { describe, it, expect } from "vitest";
import { loadApp } from "./harness.js";

const VIENNA_SUMMER_OFFSET_HOURS = 2;

describe("formatTime", () => {
  it("pads both halves to two digits", () => {
    const { window } = loadApp();
    expect(window.formatTime(0)).toBe("00:00");
    expect(window.formatTime(9)).toBe("00:09");
    expect(window.formatTime(65)).toBe("01:05");
  });

  it("shows a full pomodoro as 25:00", () => {
    const { window } = loadApp();
    expect(window.formatTime(25 * 60)).toBe("25:00");
  });

  it("keeps counting minutes past an hour rather than rolling over", () => {
    const { window } = loadApp();
    expect(window.formatTime(3600)).toBe("60:00");
    expect(window.formatTime(5400)).toBe("90:00");
  });
});

describe("localDateKey", () => {
  it("formats a date as YYYY-MM-DD", () => {
    const { window } = loadApp();
    expect(window.localDateKey(new Date(2026, 7, 31, 12, 0))).toBe("2026-08-31");
  });

  it("pads single-digit months and days", () => {
    const { window } = loadApp();
    expect(window.localDateKey(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("uses the local day, not the UTC one", () => {
    // This is the whole reason the function exists. At 00:30 local in a UTC+2
    // zone it is still 22:30 of the previous day in UTC, so toISOString()
    // would file the session under yesterday while the streak, which compares
    // toDateString(), calls it today.
    const { window } = loadApp();
    const justAfterMidnight = new Date(2026, 7, 31, 0, 30);

    expect(justAfterMidnight.getTimezoneOffset()).toBe(-60 * VIENNA_SUMMER_OFFSET_HOURS);
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-08-30");
    expect(window.localDateKey(justAfterMidnight)).toBe("2026-08-31");
  });

  it("agrees with the streak's own idea of the day", () => {
    const { window } = loadApp();
    const lateEvening = new Date(2026, 7, 31, 23, 45);
    const fromDateString = new Date(lateEvening.toDateString());
    expect(window.localDateKey(lateEvening)).toBe(window.localDateKey(fromDateString));
  });

  it("defaults to now", () => {
    const { window } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    expect(window.localDateKey()).toBe("2026-08-31");
  });
});

describe("loadStats", () => {
  it("starts from zero when nothing is stored", () => {
    const { window } = loadApp();
    const stats = window.loadStats();
    expect(stats).toMatchObject({
      sessionsToday: 0,
      totalSessions: 0,
      totalMinutes: 0,
      streak: 0,
      lastSessionDate: null,
      lastStreakDate: null,
    });
    expect(stats.dailyHistory).toEqual({});
  });

  it("reads back what was stored", () => {
    const stored = JSON.stringify({
      lastSessionDate: "Mon Aug 31 2026",
      sessionsToday: 3,
      totalSessions: 40,
      totalMinutes: 1000,
      streak: 7,
      lastStreakDate: "Mon Aug 31 2026",
      dailyHistory: { "2026-08-31": { sessions: 3, minutes: 75 } },
    });
    const { window } = loadApp({ storage: { pomodoroStats: stored } });
    expect(window.loadStats().streak).toBe(7);
    expect(window.loadStats().dailyHistory["2026-08-31"].minutes).toBe(75);
  });
});

describe("recordSessionLocally", () => {
  it("books the session into today's bucket", () => {
    const { window, evaluate } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    window.recordSessionLocally(25);

    const stats = evaluate("stats");
    expect(stats.dailyHistory["2026-08-31"]).toEqual({ sessions: 1, minutes: 25 });
    expect(stats.sessionsToday).toBe(1);
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalMinutes).toBe(25);
  });

  it("adds to an existing day rather than replacing it", () => {
    const { window, evaluate } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    window.recordSessionLocally(25);
    window.recordSessionLocally(15);

    expect(evaluate("stats").dailyHistory["2026-08-31"]).toEqual({ sessions: 2, minutes: 40 });
    expect(evaluate("stats").totalMinutes).toBe(40);
  });

  it("persists to localStorage", () => {
    const { window } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    window.recordSessionLocally(25);

    const stored = JSON.parse(window.localStorage.getItem("pomodoroStats"));
    expect(stored.dailyHistory["2026-08-31"].sessions).toBe(1);
  });

  it("books a session just after local midnight under the new day", () => {
    // The counterpart to the localDateKey test, through the real entry point.
    const { window, evaluate } = loadApp({ now: new Date(2026, 7, 31, 0, 15) });
    window.recordSessionLocally(25);

    const history = evaluate("stats").dailyHistory;
    expect(Object.keys(history)).toEqual(["2026-08-31"]);
  });
});

describe("checkAndUpdateStreak", () => {
  function statsWith(overrides) {
    return JSON.stringify({
      lastSessionDate: null,
      sessionsToday: 0,
      totalSessions: 0,
      totalMinutes: 0,
      streak: 0,
      lastStreakDate: null,
      dailyHistory: {},
      ...overrides,
    });
  }

  it("starts a streak at one", () => {
    const { window, evaluate } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    window.checkAndUpdateStreak();
    expect(evaluate("stats").streak).toBe(1);
  });

  it("continues a streak from yesterday", () => {
    const yesterday = new Date(2026, 7, 30).toDateString();
    const { window, evaluate } = loadApp({
      now: new Date(2026, 7, 31, 10, 0),
      storage: { pomodoroStats: statsWith({ streak: 4, lastStreakDate: yesterday }) },
    });
    window.checkAndUpdateStreak();
    expect(evaluate("stats").streak).toBe(5);
  });

  it("resets a streak after a missed day", () => {
    const threeDaysAgo = new Date(2026, 7, 28).toDateString();
    const { window, evaluate } = loadApp({
      now: new Date(2026, 7, 31, 10, 0),
      storage: { pomodoroStats: statsWith({ streak: 9, lastStreakDate: threeDaysAgo }) },
    });
    window.checkAndUpdateStreak();
    expect(evaluate("stats").streak).toBe(1);
  });

  it("does not grow the streak twice on the same day", () => {
    const { window, evaluate } = loadApp({ now: new Date(2026, 7, 31, 10, 0) });
    window.checkAndUpdateStreak();
    window.checkAndUpdateStreak();
    window.checkAndUpdateStreak();
    expect(evaluate("stats").streak).toBe(1);
  });

  it("clears the per-day count when the day turns over", () => {
    const yesterday = new Date(2026, 7, 30).toDateString();
    const { window, evaluate } = loadApp({
      now: new Date(2026, 7, 31, 10, 0),
      storage: {
        pomodoroStats: statsWith({
          sessionsToday: 6,
          lastSessionDate: yesterday,
          lastStreakDate: yesterday,
          streak: 2,
        }),
      },
    });
    window.checkAndUpdateStreak();
    expect(evaluate("stats").sessionsToday).toBe(0);
  });

  it("leaves the per-day count alone within the same day", () => {
    const today = new Date(2026, 7, 31).toDateString();
    const { window, evaluate } = loadApp({
      now: new Date(2026, 7, 31, 10, 0),
      storage: {
        pomodoroStats: statsWith({ sessionsToday: 3, lastSessionDate: today, lastStreakDate: today, streak: 2 }),
      },
    });
    window.checkAndUpdateStreak();
    expect(evaluate("stats").sessionsToday).toBe(3);
    expect(evaluate("stats").streak).toBe(2);
  });
});
