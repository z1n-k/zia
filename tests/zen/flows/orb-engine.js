// The thinking orb engine (src/js/28r*.js, Ultra's loading orb) on its own, through its
// public API: every state, dark and light, a tint and a label, destroy, a canvas taken out
// of the document. The engine's files run in a sandbox of the window whose clock and
// animation frames the flow steps by hand, so every frame is drawn at a fixed time and its
// pixels are the same on every run. Also each state's frame geometry at a fixed time and size.
const dir = PathUtils.join(PathUtils.profileDir, "chrome", "sine-mods", "zia", "src", "js");
const parts = (await IOUtils.getChildren(dir)).filter((file) => /^28r[^/]*\.js$/.test(PathUtils.filename(file))).sort();
const code = (await Promise.all(parts.map((file) => IOUtils.readUTF8(file)))).join("");
const box = Cu.Sandbox(window, { sandboxPrototype: window, wantXrays: false });
let clock = 1000;
let frames = [];
box.performance = { now: () => clock };
box.requestAnimationFrame = (callback) => frames.push(callback);
box.cancelAnimationFrame = (id) => (frames[id - 1] = null);
const engine = Cu.evalInSandbox(`(() => {${code}\nreturn { ziaOrb, orbResolve, ORB_FRAMES, ORB_STATE_MODE };})()`, box);
const tick = (ms) => {
  clock += ms;
  const due = frames;
  frames = [];
  for (const callback of due) {
    callback?.(clock);
  }
};
const hash = (canvas) => {
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h = Math.imul(h ^ data[i], 0x01000193) >>> 0;
  }
  return h.toString(16);
};
const states = Object.keys(engine.ORB_STATE_MODE);

// (each state's geometry, rounded: the engine's maths, without the canvas)
const geometry = {};
for (const state of states) {
  for (const size of [16, 20, 32, 44, 64, 90]) {
    const { mode, speed, opts } = engine.orbResolve(state, size);
    const frame = engine.ORB_FRAMES[mode](size, 2.75, opts);
    const marks = [...frame.dots.map((d) => [d.x, d.y, d.z, d.r, d.white, d.a ?? 1]), ...frame.lines.map((l) => [l.x1, l.y1, l.x2, l.y2, l.white, l.a ?? 1, l.w])];
    const text = JSON.stringify([speed, opts, marks], (key, value) => (typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value));
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    }
    geometry[`${state} ${size}`] = `${mode} ${frame.dots.length}/${frame.lines.length} ${h.toString(16)}`;
  }
}

// (all in one go, so nothing else, a resize or an intersection, lands between the steps)
const holder = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
holder.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;display:flex";
document.documentElement.append(holder);
const seen = [];
const look = (label, canvas) =>
  seen.push(`${label}: ${canvas.width}x${canvas.height} ${canvas.getAttribute("role") || "-"} "${canvas.getAttribute("aria-label") || ""}" ${canvas.getAttribute("style")} ${hash(canvas)} queued ${frames.length}`);
const orbs = states.map((state, i) => {
  const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
  holder.append(canvas);
  const orb = engine.ziaOrb(canvas, { state, size: [16, 20, 32, 64][i % 4], dark: i % 2 === 0 });
  look(`new ${state}`, canvas);
  return orb;
});
tick(16);
tick(17);
orbs.forEach((orb, i) => look(`two frames on ${states[i]}`, orb.canvas));
const first = orbs[0];
for (const state of states) {
  first.setState(state);
  look(`setState ${state}`, first.canvas);
}
first.setState("no such state");
look("setState unknown", first.canvas);
first.setDark(false);
look("setDark false", first.canvas);
first.setDark(null);
look("setDark null", first.canvas);
first.setDark(true);
tick(500);
look("half a second on", first.canvas);
const hidden = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
hidden.setAttribute("aria-hidden", "true");
holder.append(hidden);
const tinted = engine.ziaOrb(hidden, { state: "solving", size: 24, color: "#36c", speed: 2 });
look("tinted, aria-hidden", hidden);
const labelled = engine.ziaOrb(null, { state: "shaping", size: 40, color: "rgb(200, 80, 20)", label: "Loading" });
holder.append(labelled.canvas);
labelled.setState("shaping");
look("labelled", labelled.canvas);
const again = engine.ziaOrb(hidden, { state: "listening", size: 24 });
tinted.setState("working");
tick(16);
look("a new orb on the same canvas", hidden);
again.destroy();
tick(16);
const destroyed = hash(hidden);
tick(16);
seen.push(`destroyed: unchanged ${hash(hidden) === destroyed}, queued ${frames.length}`);
orbs[1].canvas.remove();
tick(16);
orbs[1].setState("working");
seen.push(`out of the document: queued ${frames.length}`);
holder.append(orbs[1].canvas);
orbs[1].setState("weaving");
look("back in the document", orbs[1].canvas);
for (const orb of [...orbs, labelled, tinted]) {
  orb.destroy();
}
tick(16);
seen.push(`all destroyed: queued ${frames.length}`);
holder.remove();
done({
  geometry,
  seen,
  checks: {
    "every state drew something": orbs.every((orb) => orb.canvas.getContext("2d").getImageData(0, 0, orb.canvas.width, orb.canvas.height).data.some((value) => value !== 0)),
    "the loop stops when every orb's gone": frames.length === 0,
  },
  ziaErrors: ziaErrors(),
});
