import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The harness builds its own JSDOM per test, so node is the right base.
    environment: "node",
    include: ["tests/**/*.test.js"],
    // Fixed, and deliberately not UTC. Half of what these tests check is that
    // the day a session belongs to is worked out in local time; under TZ=UTC
    // the local and UTC dates never disagree and those tests would pass
    // whatever the code did. Vienna is UTC+2 in summer.
    env: { TZ: "Europe/Vienna" },
  },
});
