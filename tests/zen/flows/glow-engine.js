// The music player's glow engine (src/js/28t*.js, Ultra's glow) on its own, through its
// public API: playing, colours, light and dark, motion, the loop dropping to half rate on a
// slow device, stopping and destroy. The engine's files run in a sandbox of the window whose
// animation frames and random numbers the flow hands out, so every frame is drawn at a fixed
// time with the same "music" and the same pixels on every run.
const dir = PathUtils.join(PathUtils.profileDir, "chrome", "sine-mods", "zia", "src", "js");
const parts = (await IOUtils.getChildren(dir)).filter((file) => /^28t[^/]*\.js$/.test(PathUtils.filename(file))).sort();
const code = (await Promise.all(parts.map((file) => IOUtils.readUTF8(file)))).join("");
const box = Cu.Sandbox(window, { sandboxPrototype: window, wantXrays: false });
let clock = 1000;
let frames = [];
box.requestAnimationFrame = (callback) => frames.push(callback);
box.cancelAnimationFrame = (id) => (frames[id - 1] = null);
// (a fixed sequence of "random" numbers, mulberry32 from a fixed seed, for the engine's Math)
const seeded = `let seed = 7;
const Math = Object.create(globalThis.Math, { random: { value: () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
} } });`;
const engine = Cu.evalInSandbox(`(() => {${seeded}\n${code}\nreturn { ziaGlow };})()`, box);
const tick = (ms) => {
  clock += ms;
  const due = frames.filter(Boolean);
  frames = [];
  for (const callback of due) {
    callback(clock);
  }
};
const run = (count, ms) => {
  for (let i = 0; i < count; i++) {
    tick(ms);
  }
};
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16);
};
const pixels = (canvas) => (canvas.width && canvas.height ? hash(String(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)) : "empty");
const describe = (el) => `${el.localName}${el.getAttribute("class") ? `.${el.getAttribute("class").trim().replace(/\s+/g, ".")}` : ""}`;
const structure = (el, depth = 0) => [
  `${"  ".repeat(depth)}${describe(el)} ${[...el.attributes].filter((a) => !["class", "style"].includes(a.name)).map((a) => `${a.name}=${a.value}`).join(" ")}`.trimEnd(),
  ...[...el.children].flatMap((child) => structure(child, depth + 1)),
];

// (all in one go, so nothing else, a resize or an intersection, lands between the steps)
const host = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
host.style.cssText = "position:fixed;left:0;top:0;width:300px;height:90px;border-radius:14px;overflow:hidden;z-index:2147483647";
document.documentElement.append(host);
const glow = engine.ziaGlow(host, { dark: true, cornerShape: "squircle" });
const root = host.querySelector(".zia-glow");
const built = structure(root);
const seen = [];
const look = (label) => {
  const props = [...root.style].filter((p) => p.startsWith("--zg-")).sort();
  const layers = [...root.children].map((el) => `${describe(el)} ${hash(el.getAttribute("style") || "")}`);
  seen.push({
    label,
    attributes: [...root.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).sort(),
    // (the values that move every frame, rounded to show where they are, with all of them hashed)
    values: Object.fromEntries(["--zg-glow", "--zg-h", "--zg-w", "--zg-cx", "--zg-hue", "--zg-x0", "--zg-l0"].map((p) => [p, root.style.getPropertyValue(p)])),
    allValues: hash(props.map((p) => `${p}:${root.style.getPropertyValue(p)}`).join(";")),
    layers,
    filter: [...root.querySelector("filter").attributes].map((a) => `${a.name}=${a.value}`).join(" "),
    displace: root.querySelector("feDisplacementMap").getAttribute("scale"),
    canvas: `${root.querySelector("canvas").width}x${root.querySelector("canvas").height} ${pixels(root.querySelector("canvas"))}`,
    queued: frames.filter(Boolean).length,
  });
};
look("made");
glow.setPlaying(true);
run(30, 16);
look("playing half a second");
run(40, 33);
look("on a slow device for over a second");
run(150, 33);
look("five seconds on");
glow.setColors(["rgb(230, 40, 60)", "rgb(40, 90, 230)", "rgb(250, 190, 30)"]);
run(10, 16);
look("the artwork's colours");
glow.setDark(false);
run(10, 16);
look("light");
glow.setMotion({ gather: 0.8, offset: 0.3, stretch: 1, heldLevel: 0.5, cornerFollow: 1 });
run(20, 16);
look("gathered");
glow.setMotion(() => ({ gather: 0.1, offset: -0.4 }));
run(20, 16);
look("motion from a function");
glow.setColors(null);
glow.setDark(true);
glow.setMotion(null);
host.style.width = "200px";
run(20, 16);
look("narrower, theme colours, dark");
glow.setPlaying(false);
run(20, 16);
look("paused a moment");
run(40, 16);
look("paused past the fade");
glow.destroy();
seen.push({ label: "destroyed", left: host.children.length, queued: frames.filter(Boolean).length });
host.remove();
done({
  built,
  seen,
  checks: {
    "it drew while playing": seen[1].canvas !== seen[0].canvas,
    "it stopped after the fade": seen.at(-2).queued === 0,
    "destroy took it away": host.children.length === 0,
  },
  ziaErrors: ziaErrors(),
});
