/**
 * Due dates and recurring todos.
 *
 * The date input hands over "YYYY-MM-DD". Read with new Date() that is UTC
 * midnight, which west of UTC is still the previous evening in local time --
 * so these tests run some cases in New York as well as in Vienna.
 */

import { describe, it, expect, afterEach } from "vitest";
import { loadApp } from "./harness.js";

const ORIGINAL_TZ = process.env.TZ;

function inTimeZone(tz) {
  process.env.TZ = tz;
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("due dates west of UTC", () => {
  it("shows today's date as due today, not overdue yesterday", () => {
    inTimeZone("America/New_York");
    const { window } = loadApp({ now: new Date(2026, 9, 13, 10, 0) });

    expect(window.getDueDateStatus("2026-10-13")).toBe("today");
    expect(window.formatDueDate("2026-10-13")).toBe("13.10.2026");
  });

  it("still counts yesterday as overdue and tomorrow as soon", () => {
    inTimeZone("America/New_York");
    const { window } = loadApp({ now: new Date(2026, 9, 13, 10, 0) });

    expect(window.getDueDateStatus("2026-10-12")).toBe("overdue");
    expect(window.getDueDateStatus("2026-10-14")).toBe("soon");
  });

  it("reads the date unchanged east of UTC too", () => {
    const { window } = loadApp({ now: new Date(2026, 9, 13, 10, 0) });
    expect(window.getDueDateStatus("2026-10-13")).toBe("today");
    expect(window.formatDueDate("2026-10-13")).toBe("13.10.2026");
  });

  it("keeps reading older follow-ups stored as a full ISO timestamp", () => {
    // checkRecurrence used to store local midnight via toISOString(), which in
    // Vienna is 22:00 UTC of the day before.
    const { window } = loadApp({ now: new Date(2026, 9, 13, 10, 0) });
    expect(window.formatDueDate("2026-10-12T22:00:00.000Z")).toBe("13.10.2026");
    expect(window.getDueDateStatus("2026-10-12T22:00:00.000Z")).toBe("today");
  });
});
