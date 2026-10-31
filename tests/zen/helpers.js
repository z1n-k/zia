// Helpers every flow runs with (tests/zen/run.py puts them before the flow, in the test
// Zen's browser window). A flow is the body of an async function: it ends with done(result),
// result being what it saw, the same on every run of an unchanged Zia.

// (the flow's own servers, see serve(), are closed as it ends, however it ends)
const servers = [];
const finish = arguments[arguments.length - 1];
const done = (result) => {
  for (const server of servers.splice(0)) {
    server.close();
  }
  finish(result);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
// Waits for a state rather than a fixed time: resolves with test()'s value as soon as it's
// truthy (a test that throws counts as not yet), and past `timeout` throws, naming what it
// waited for (`what`, or else the test's own code). A busy Mac only makes it slower, never wrong.
async function until(test, { what = "", timeout = 10000, every = 50 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    let value;
    let threw = null;
    try {
      value = await test();
    } catch (e) {
      threw = e;
    }
    if (value) {
      return value;
    }
    if (Date.now() >= end) {
      const named = what || String(test).replace(/\s+/g, " ");
      throw new Error(`waited ${timeout / 1000}s for ${named}, in vain${threw ? ` (it last threw ${threw})` : ""}`);
    }
    await wait(every);
  }
}
// Waits for read() to give the same answer (as JSON) for `quiet` ms on end, and resolves with
// it: for a state reached in steps (a card dressed bit by bit, a page's styles), where no one
// step says it's all there. (A first answer that's falsy never counts.)
async function steady(read, { quiet = 300, what = "", timeout = 10000, every = 50 } = {}) {
  let last;
  let since = Date.now();
  return until(
    async () => {
      const value = await read();
      const text = JSON.stringify(value);
      if (text !== last) {
        last = text;
        since = Date.now();
        return false;
      }
      return value && Date.now() - since >= quiet && value;
    },
    { what: what || `${String(read).replace(/\s+/g, " ")} to hold still`, timeout, every }
  );
}
// Whether nothing in the window is moving: no animation or transition that has an end is still
// running (an endless one, a loading spinner or Ultra's drift, doesn't count)
const still = () => document.getAnimations().every((a) => a.playState !== "running" || !Number.isFinite(a.effect?.getComputedTiming().endTime));
// Waits for the window to come to rest: still, and staying so for `quiet` ms (so a motion
// that starts a frame or a timer later isn't missed)
const atRest = ({ quiet = 150, what = "the window to come to rest", timeout = 10000 } = {}) => steady(still, { quiet, what, timeout });
// Firefox's own test helpers (EventUtils.js, handed in by run.py), for faking clicks, keys and
// the mouse; run in a sandbox over the window, as Firefox's own tests run them
const EU = Cu.Sandbox(window, { sandboxPrototype: window, wantXrays: false });
Object.assign(EU, { _EU_Ci: Ci, _EU_Cc: Cc });
Cu.evalInSandbox(arguments[0], EU);
const SYSTEM = Services.scriptSecurityManager.getSystemPrincipal();

async function ready() {
  // (half a minute: Zia is in within seconds even on a busy Mac; past that, Sine never loaded,
  // which run.py tries again in a fresh profile, so it says so in its own words)
  await until(() => window.__ziaLoaded, { timeout: 30000, every: 250 }).catch(() => {});
  if (!window.__ziaLoaded) {
    // (with the browser's own start-up errors, to say why)
    const errors = Services.console
      .getMessageArray()
      .filter((message) => message instanceof Ci.nsIScriptError && !(message.flags & Ci.nsIScriptError.warningFlag))
      .map((message) => `${message.errorMessage} (${message.sourceName.split("/").pop()})`)
      .slice(-5);
    const state = {
      delayedStartup: !!window.gBrowserInit?.delayedStartupFinished,
      sineLoaded: Object.keys(window).filter((key) => /^(UC_API|_ucUtils|SineAPI|Sine)/i.test(key)).join(",") || "no",
      ziaSheet: [...document.styleSheets].some((sheet) => /sine-mods\/zia|zia\/chrome\.css/.test(sheet.href || "")),
    };
    throw new Error(`Zia didn't load (${JSON.stringify(state)}). Start-up errors: ${errors.join(" | ") || "none"}`);
  }
  // (and its start, which waits for the window's own: it has run once its last part is in)
  await until(() => window.gBrowserInit?.delayedStartupFinished && document.getElementById("zia-copy-link-button"), { what: "Zia to start", timeout: 20000 });
  // (the hidden window's first click only wakes it, so it goes to a spot of the harness's own)
  const primer = document.createXULElement("box");
  primer.style.cssText = "position:fixed;left:0;bottom:0;width:4px;height:4px;z-index:2147483647";
  document.documentElement.append(primer);
  EU.synthesizeMouseAtCenter(primer, {}, window);
  primer.remove();
  // (and a moment more, as some of its start-up is on timers, up to a second or two in)
  await wait(1500);
}

// Zia's own complaints since start-up: console.error and noteError's console.debug lines
function ziaErrors() {
  const storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage);
  return storage
    .getEvents()
    .filter((event) => ["error", "debug"].includes(event.level))
    .map((event) => event.arguments.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "))
    .filter((text) => text.startsWith("[Zia]"))
    // (the hidden window can't always take a snapshot of the page to read its colour from)
    .filter((text) => !text.includes("site colour: updateColor") || !text.includes("NS_ERROR_LOSS_OF_SIGNIFICANT_DATA"));
}

// Tabs named by a test attribute, so results read the same on every run
async function addTabs(names, options = {}) {
  const tabs = [];
  for (const name of names) {
    const tab = gBrowser.addTab(`data:text/html,<title>${name}</title>${name}`, { triggeringPrincipal: SYSTEM, ...options });
    tab.setAttribute("zia-test", name);
    tabs.push(tab);
  }
  // (each loaded, with its title, and grown in)
  await until(() => tabs.every((tab) => tab.label === tab.getAttribute("zia-test") && !tab.hasAttribute("busy")), { what: `the tabs ${names.join(", ")} to load` });
  await atRest();
  return tabs;
}

const nameOf = (tab) => tab?.getAttribute?.("zia-test") || (tab?.hasAttribute?.("zen-empty-tab") ? "(empty)" : tab?.label || "?");
// (by its title too: a tab moved to another space can come back as a new tab element)
const named = (name) => gBrowser.tabs.find((tab) => tab.getAttribute("zia-test") === name) || gBrowser.tabs.find((tab) => tab.label === name);
const listOrder = () => gBrowser.visibleTabs.filter((tab) => !tab.pinned && !tab.hasAttribute("zen-empty-tab")).map(nameOf);
const pinnedOrder = () => gBrowser.visibleTabs.filter((tab) => tab.pinned && !tab.hasAttribute("zen-essential") && !tab.hasAttribute("zen-empty-tab")).map(nameOf);
const essentials = () => gBrowser.tabs.filter((tab) => tab.hasAttribute("zen-essential")).map(nameOf);
const centre = (el) => {
  const box = el.getBoundingClientRect();
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
};
const round = (n) => Math.round(n * 2) / 2;

// The slide each tab is shown at (Zia moves them with translate or transform)
function slides() {
  const out = {};
  for (const tab of gBrowser.visibleTabs) {
    const style = tab.style.translate || tab.style.transform;
    if (style && !/^(none|translateY\(0px\)|0px( 0px)?)$/.test(style)) {
      out[nameOf(tab)] = style;
    }
  }
  return out;
}

// A drag as Firefox makes one in its own tests: a drag session, one DataTransfer for every
// event, dragstart on the source and dragover at each point (on whatever is under it).
// `during(step)` runs between points; `drop: false` lets it go without dropping; `landed` says
// when what the drop does has happened.
async function drag(source, points, { during = null, drop = true, landed = () => true } = {}) {
  const service = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  service.startDragSessionForTests(window, Ci.nsIDragService.DRAGDROP_ACTION_MOVE);
  const session = window.windowUtils.dragSession;
  const transfer = new DataTransfer();
  const fire = (type, target, x, y) => {
    const event = document.createEvent("DragEvent");
    event.initDragEvent(type, true, true, window, 0, window.mozInnerScreenX + x, window.mozInnerScreenY + y, x, y, false, false, false, false, 0, null, transfer);
    return target.dispatchEvent(event);
  };
  const start = centre(source);
  const box = source.getBoundingClientRect();
  EU.synthesizeMouse(source, box.width / 2, box.height / 2, { type: "mousedown" }, window);
  fire("dragstart", source, start.x, start.y);
  // (Zen reads the drop's data from the session, as from a real drag)
  session.dataTransfer = transfer;
  let last = start;
  const seen = {};
  for (let i = 0; i < points.length; i++) {
    last = points[i];
    const target = document.elementFromPoint(last.x, last.y) || source;
    fire("dragover", target, last.x, last.y);
    await frame();
    await frame();
    if (during) {
      await during(i, seen);
    }
  }
  await wait(300);
  seen.slides = slides();
  seen.dragging = document.documentElement.hasAttribute("zia-dragging-tab");
  const target = document.elementFromPoint(last.x, last.y) || source;
  if (drop) {
    fire("drop", target, last.x, last.y);
  }
  fire("dragend", source, last.x, last.y);
  // (a drop that ended the drag itself has ended the session already)
  window.windowUtils.dragSession?.endDragSession(true);
  EU.synthesizeMouse(target, 2, 2, { type: "mouseup" }, window);
  // (landed: the drag's marks gone and what the drop does done, which Zen can take its time
  // over, then all come to rest and held still a while, as a drop lands in steps, a timer or a
  // frame apart. A drop that never does what it should is left to the flow's checks to say.)
  await until(() => !document.querySelector("[zia-dragging-tab], [zia-landing], [zia-settling], [zia-drop-lock]") && landed()).catch(() => {});
  await atRest({ quiet: 300 });
  return seen;
}

// Points from a to b, `steps` of them, the last on b
function path(a, b, steps = 12) {
  return Array.from({ length: steps }, (_, i) => ({
    x: Math.round(a.x + ((b.x - a.x) * (i + 1)) / steps),
    y: Math.round(a.y + ((b.y - a.y) * (i + 1)) / steps),
  }));
}

// Every animation started while `action` runs: element, properties, length
async function animationsDuring(action, ms = 900) {
  const seen = [];
  const describe = (el) => (el.localName === "tab" ? `tab:${nameOf(el)}` : el.localName + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ""));
  const spy = (el) => {
    for (const animation of el.getAnimations({ subtree: true })) {
      const effect = animation.effect;
      const target = effect?.target;
      if (!target || animation.__seen) {
        continue;
      }
      animation.__seen = true;
      const frames = effect.getKeyframes();
      const props = [...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !["offset", "easing", "composite", "computedOffset", "simulateComputeValuesFailure"].includes(k))))].sort();
      // (where each property starts, goes furthest and ends, so a spring that travels a
      // different way, overshoots differently or ends elsewhere shows, not only its length)
      const values = props.map((prop) => {
        const list = frames.map((f) => f[prop]).filter((v) => v !== undefined && v !== "");
        const numbers = list.map(parseFloat).filter(Number.isFinite);
        const extreme = numbers.length ? numbers.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : "";
        return `${prop}:${list[0] ?? ""}>${extreme}>${list.at(-1) ?? ""}`;
      });
      seen.push(`${describe(target)} ${values.join(" ")} ${effect.getTiming().duration}`);
    }
  };
  await action();
  for (let t = 0; t < ms; t += 30) {
    spy(document.getElementById("navigator-toolbox"));
    await wait(30);
  }
  return [...new Set(seen)].sort();
}

// A tiny web server of the flow's own, on localhost, so a flow can show real http pages
// (a site, to Zia) without the network. `pages` maps a path to its HTML; anything else is a
// 404. The port is the system's pick, so results leave it out (see `unported`). It's closed
// when the flow calls done().
function serve(pages) {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
  server.init(-1, true, -1);
  servers.push(server);
  server.asyncListen({
    onSocketAccepted(socket, transport) {
      const input = transport.openInputStream(0, 0, 0);
      const output = transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
      input.asyncWait(
        {
          onInputStreamReady(stream) {
            const reader = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
            reader.init(stream);
            let request = "";
            try {
              request = reader.read(stream.available());
            } catch (e) {
              // (the browser let go before asking)
            }
            const body = pages[request.split(" ")[1]];
            const head = body === undefined ? "HTTP/1.1 404 Not Found\r\nContent-Length: 0" : `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.length}`;
            const response = `${head}\r\nConnection: close\r\n\r\n${body ?? ""}`;
            output.write(response, response.length);
            output.close();
            input.close();
          },
        },
        0,
        0,
        Services.tm.mainThread
      );
    },
    onStopListening() {},
  });
  const base = `http://localhost:${server.port}`;
  return base;
}
const unported = (text) => String(text ?? "").replace(/localhost:\d+/g, "localhost:PORT");

// The variables and zia-* marks Zia has set on the window for the toolbar's colour
function toolbarColour() {
  const style = document.documentElement.style;
  const props = {};
  for (let i = 0; i < style.length; i++) {
    if (/^--zia-(site-bg|ink-|light-ink|dark-ink|urlbar-hover-bg)/.test(style[i])) {
      props[style[i]] = style.getPropertyValue(style[i]);
    }
  }
  const marks = [...document.documentElement.attributes].map((a) => a.name).filter((n) => /^zia-(site-|theme-toolbar)/.test(n)).sort();
  return { props, marks };
}
