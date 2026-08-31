/**
 * Loads public/app.js the way a browser would, and hands back its globals.
 *
 * app.js is a single script in global scope with no exports: it queries the DOM
 * and calls updateUI(), fetchTodos() and requestNotificationPermission() at the
 * bottom of the file. So the harness gives it the real index.html to query and
 * stubs the browser APIs it reaches for, rather than the tests reaching into a
 * copy of the logic that could drift away from the shipped file.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "public");

export function loadApp({ now = null, storage = {} } = {}) {
  const dom = new JSDOM(readFileSync(join(PUBLIC, "index.html"), "utf8"), {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }

  // Nothing here should reach the network, ask for permissions, play a sound or
  // register a worker. Each stub records what it was asked to do so a test can
  // assert on it.
  const calls = { fetch: [], notifications: [], sounds: [], downloads: [] };

  window.fetch = (...args) => {
    calls.fetch.push(args);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(""),
    });
  };
  window.Notification = class {
    constructor(title, options) {
      calls.notifications.push({ title, options });
    }
    static permission = "granted";
    static requestPermission() {
      return Promise.resolve("granted");
    }
  };
  window.Audio = class {
    constructor(src) {
      this.src = src;
    }
    play() {
      calls.sounds.push(this.src);
      return Promise.resolve();
    }
    pause() {}
  };
  window.AudioContext = class {
    createOscillator() {
      return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } };
    }
    createGain() {
      return { connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
    }
    get destination() {
      return {};
    }
    get currentTime() {
      return 0;
    }
    close() {}
  };
  window.Worker = class {
    constructor() {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { register: () => Promise.resolve({}), ready: Promise.resolve({}) },
  });
  window.URL.createObjectURL = () => "blob:stub";
  window.URL.revokeObjectURL = () => {};
  window.print = () => {};
  window.alert = () => {};
  window.confirm = () => true;
  window.scrollTo = () => {};

  // A clicked <a download> is how the app saves a file. Record instead.
  const realCreate = window.document.createElement.bind(window.document);
  window.document.createElement = (tag) => {
    const element = realCreate(tag);
    if (String(tag).toLowerCase() === "a") {
      element.click = () => calls.downloads.push({ name: element.download, href: element.href });
    }
    return element;
  };

  if (now !== null) {
    const fixed = now instanceof Date ? now : new Date(now);
    const RealDate = window.Date;
    class FrozenDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed.getTime()]));
      }
      static now() {
        return fixed.getTime();
      }
    }
    window.Date = FrozenDate;
  }

  const source = readFileSync(join(PUBLIC, "app.js"), "utf8");
  vm.createContext(window);
  // The script ends in top-level calls that render the initial page. Anything
  // it throws is a real failure and should surface, not be swallowed here.
  vm.runInContext(source, window, { filename: "app.js" });

  /**
   * Evaluate an expression inside app.js's own scope.
   *
   * Function declarations become properties of the global object and can be
   * reached as window.foo. Top-level `let` and `const` do not -- `stats` lives
   * in the script's global lexical environment. runInContext shares that
   * environment, so this is how a test reads or replaces it.
   */
  const evaluate = (expression) => vm.runInContext(expression, window);

  return { window, calls, dom, evaluate };
}
