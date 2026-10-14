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

describe("recurring todos", () => {
  const NOW = new Date(2026, 9, 13, 10, 0);

  function todo(overrides) {
    return {
      id: 1,
      text: "Wäsche",
      category: "personal",
      priority: "medium",
      completed: 0,
      due_date: "2026-10-13",
      recurrence: "daily",
      recurrence_end_date: null,
      created_at: "2026-10-01T08:00:00.000Z",
      ...overrides,
    };
  }

  function stored(window) {
    return JSON.parse(window.localStorage.getItem("pomodoroTodos"));
  }

  function openOnes(window) {
    return stored(window).filter((entry) => !entry.completed);
  }

  it("creates the next instance when a daily todo is ticked off", async () => {
    const { window } = loadApp({ now: NOW, storage: { pomodoroTodos: JSON.stringify([todo()]) } });
    await window.updateTodo(1, { completed: true });

    const next = openOnes(window);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 2, text: "Wäsche", due_date: "2026-10-14", recurrence: "daily" });
  });

  it("does not create a second instance when ticked off again", async () => {
    const { window } = loadApp({ now: NOW, storage: { pomodoroTodos: JSON.stringify([todo()]) } });
    await window.updateTodo(1, { completed: true });
    await window.updateTodo(1, { completed: false });
    await window.updateTodo(1, { completed: true });

    expect(stored(window)).toHaveLength(2);
  });

  it("catches up on load for todos completed before the fix", () => {
    const { window } = loadApp({
      now: NOW,
      storage: { pomodoroTodos: JSON.stringify([todo({ completed: 1, recurrence: "weekly" })]) },
    });

    expect(openOnes(window).map((entry) => entry.due_date)).toEqual(["2026-10-20"]);
  });

  it("counts from the due date when ticked off early", async () => {
    const { window } = loadApp({
      now: NOW,
      storage: { pomodoroTodos: JSON.stringify([todo({ due_date: "2026-10-16", recurrence: "weekly" })]) },
    });
    await window.updateTodo(1, { completed: true });

    expect(openOnes(window)[0].due_date).toBe("2026-10-23");
  });

  it("skips missed days when ticked off late", async () => {
    const { window } = loadApp({
      now: NOW,
      storage: { pomodoroTodos: JSON.stringify([todo({ due_date: "2026-10-09" })]) },
    });
    await window.updateTodo(1, { completed: true });

    expect(openOnes(window)[0].due_date).toBe("2026-10-13");
  });

  it("stops after the recurrence end date", async () => {
    const { window } = loadApp({
      now: NOW,
      storage: { pomodoroTodos: JSON.stringify([todo({ recurrence_end_date: "2026-10-13" })]) },
    });
    await window.updateTodo(1, { completed: true });

    expect(openOnes(window)).toHaveLength(0);
    expect(stored(window)).toHaveLength(1);
  });

  it("leaves todos without recurrence alone", async () => {
    const { window } = loadApp({
      now: NOW,
      storage: { pomodoroTodos: JSON.stringify([todo({ recurrence: null })]) },
    });
    await window.updateTodo(1, { completed: true });

    expect(stored(window)).toHaveLength(1);
  });

  it("stores the next due date as the local day west of UTC", async () => {
    inTimeZone("America/New_York");
    const { window } = loadApp({
      now: new Date(2026, 9, 13, 21, 0),
      storage: { pomodoroTodos: JSON.stringify([todo()]) },
    });
    await window.updateTodo(1, { completed: true });

    const next = openOnes(window)[0];
    expect(next.due_date).toBe("2026-10-14");
    expect(window.getDueDateStatus(next.due_date)).toBe("soon");
  });
});
