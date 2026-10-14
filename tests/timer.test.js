/**
 * The countdown itself. Both the worker and the fallback interval tick about
 * once a second, a few milliseconds late. The display has to show the second
 * that is running (24:59 after the first tick, not 24:58) and the session must
 * not end before the full time is up.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";
import { loadApp } from "./harness.js";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "timer-worker.js");
const T0 = 1_800_000_000_000;
const POMODORO_MS = 25 * 60 * 1000;

function loadWorker() {
  const clock = { now: T0 };
  const posted = [];
  let tick = null;
  const self = { postMessage: (message) => posted.push(message) };
  const context = vm.createContext({
    self,
    Date: { now: () => clock.now },
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  vm.runInContext(readFileSync(WORKER, "utf8"), context, { filename: "timer-worker.js" });

  return {
    posted,
    start: (endTime) => self.onmessage({ data: { action: "start", data: { endTime } } }),
    tickAt: (ms) => {
      clock.now = T0 + ms;
      tick();
    },
    running: () => tick !== null,
  };
}

describe("timer worker", () => {
  it("shows 24:59 after the first second, even a few ms late", () => {
    const worker = loadWorker();
    worker.start(T0 + POMODORO_MS);

    worker.tickAt(1002);
    worker.tickAt(1005);
    expect(worker.posted).toEqual([
      { type: "tick", remaining: 1499 },
      { type: "tick", remaining: 1499 },
    ]);
    worker.tickAt(2001);
    expect(worker.posted.at(-1)).toEqual({ type: "tick", remaining: 1498 });
  });

  it("does not complete while time is left", () => {
    const worker = loadWorker();
    worker.start(T0 + POMODORO_MS);

    worker.tickAt(POMODORO_MS - 1);
    expect(worker.posted).toEqual([{ type: "tick", remaining: 1 }]);
    expect(worker.running()).toBe(true);
  });

  it("completes once the end time is reached", () => {
    const worker = loadWorker();
    worker.start(T0 + POMODORO_MS);

    worker.tickAt(POMODORO_MS + 3);
    expect(worker.posted).toEqual([{ type: "tick", remaining: 0 }, { type: "complete" }]);
    expect(worker.running()).toBe(false);
  });
});

describe("startTimer", () => {
  it("leaves the ticking to the worker when there is one", () => {
    const { window, evaluate } = loadApp({ now: T0 });
    window.document.getElementById("start-btn").click();

    expect(evaluate("timerInterval")).toBe(null);
    expect(evaluate("timerWorker").posted).toEqual([{ action: "start", data: { endTime: T0 + POMODORO_MS } }]);
  });

  describe("without a worker", () => {
    function startFallback() {
      const app = loadApp({ now: T0, worker: false });
      const { window, evaluate } = app;
      const clock = { now: T0 };
      window.Date.now = () => clock.now;
      let tick = null;
      window.setInterval = (fn) => {
        tick = fn;
        return 1;
      };

      window.document.getElementById("start-btn").click();
      expect(evaluate("timerWorker")).toBe(null);

      return {
        ...app,
        tickAt: (ms) => {
          clock.now = T0 + ms;
          tick();
        },
        display: () => window.document.getElementById("timer-display").textContent,
      };
    }

    it("counts down from 25:00 one second at a time", () => {
      const timer = startFallback();
      timer.tickAt(1002);
      expect(timer.display()).toBe("24:59");
      timer.tickAt(2001);
      expect(timer.display()).toBe("24:58");
    });

    it("completes at the end time, not a second early", () => {
      const timer = startFallback();
      timer.tickAt(POMODORO_MS - 1);
      expect(timer.display()).toBe("00:01");
      expect(timer.evaluate("stats").totalSessions).toBe(0);

      timer.tickAt(POMODORO_MS + 2);
      expect(timer.evaluate("stats").totalSessions).toBe(1);
      expect(timer.evaluate("isRunning")).toBe(false);
    });
  });
});
