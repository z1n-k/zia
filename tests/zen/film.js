// Filming for the promo (tests/zen/promo): Zen's clock is held and stepped one frame at a time,
// each frame a real screen capture, so GitHub's Macs, with no graphics card to keep up in real
// time, still give smooth 60fps footage of Zia's real animations. Frames land in captures/ as
// <shot>-0000.png …; ci/frames-to-video turns them into clips.
const FPS = 60;
const filmUtils = window.windowUtils;

// The window filling the screen, for every shot alike
async function stage() {
  // (Zen the app in front, so macOS draws its window buttons in colour, not inactive grey)
  try {
    Cc["@mozilla.org/widget/macdocksupport;1"].getService(Ci.nsIMacDockSupport).activateApplication(true);
  } catch (err) {
    // (not a Mac)
  }
  window.focus();
  window.moveTo(0, 0);
  window.resizeTo(screen.availWidth, screen.availHeight);
  // (as near as it gets: at a large zoom the window can't be made as wide as the screen)
  await until(() => Math.abs(window.outerWidth - screen.availWidth) < 4, { timeout: 3000 }).catch(() => {});
  await atRest();
}

// The pointer, as the film knows it: synthetic events never move the real one, so the edit
// draws a cursor where this says, frame by frame (<shot>-pointer.json beside the frames)
const pointer = { x: 0, y: 0, down: false, shown: false, dragging: null };

function pointTo(x, y) {
  pointer.x = x;
  pointer.y = y;
  pointer.shown = true;
  if (pointer.dragging) {
    const target = document.elementFromPoint(x, y) || pointer.dragging.source;
    pointer.dragging.fire("dragover", target, x, y);
  } else {
    EU.synthesizeMouseAtPoint(x, y, { type: "mousemove", buttons: pointer.down ? 1 : 0 }, window);
  }
}

function press() {
  pointer.down = true;
  EU.synthesizeMouseAtPoint(pointer.x, pointer.y, { type: "mousedown" }, window);
}

function release() {
  pointer.down = false;
  EU.synthesizeMouseAtPoint(pointer.x, pointer.y, { type: "mouseup" }, window);
}

function click() {
  press();
  release();
}

// A drag a frame at a time (the tests' drag() waits on frames, which a held clock never gives)
function dragFrom(source) {
  const service = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  service.startDragSessionForTests(window, Ci.nsIDragService.DRAGDROP_ACTION_MOVE);
  const transfer = new DataTransfer();
  const fire = (type, target, x, y) => {
    const event = document.createEvent("DragEvent");
    event.initDragEvent(type, true, true, window, 0, window.mozInnerScreenX + x, window.mozInnerScreenY + y, x, y, false, false, false, false, 0, null, transfer);
    return target.dispatchEvent(event);
  };
  press();
  fire("dragstart", source, pointer.x, pointer.y);
  window.windowUtils.dragSession.dataTransfer = transfer;
  pointer.dragging = { source, fire };
}

// A drop onto the essentials or a folder lands as a real one does: Zen reads the tab from the
// drag's data, which a synthetic drag can't carry, so the move it then makes is made here
function dropHere(drop = true, { land = null } = {}) {
  const { source, fire } = pointer.dragging;
  const target = document.elementFromPoint(pointer.x, pointer.y) || source;
  if (drop) {
    fire("drop", target, pointer.x, pointer.y);
  }
  fire("dragend", source, pointer.x, pointer.y);
  window.windowUtils.dragSession?.endDragSession(true);
  pointer.dragging = null;
  release();
  land?.();
}

// Where an element's centre is (or a point within it, as shares of its size)
function spot(el, fx = 0.5, fy = 0.5) {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width * fx, y: box.top + box.height * fy };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A glide of the pointer from where it is to `to` over `seconds`, as cues from `at`
function glide(cues, at, to, seconds) {
  let from = null;
  const steps = Math.max(1, Math.round(seconds * FPS));
  for (let i = 1; i <= steps; i++) {
    const t = at + (i - 1) / FPS;
    const prior = cues[t];
    cues[t] = async () => {
      await prior?.();
      from ??= { x: pointer.x, y: pointer.y };
      const k = ease(i / steps);
      pointTo(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    };
  }
  return at + seconds;
}

// `seconds` of film; `cues` maps a time in seconds to what happens then (awaited before that
// frame is stepped). `area` is what's captured, the whole window by default.
async function film(shot, seconds, cues = {}, area = null, { each = null, live = false } = {}) {
  const times = Object.keys(cues).map(Number).sort((a, b) => a - b);
  const frames = Math.round(seconds * FPS);
  const track = [];
  const started = performance.now();
  filmUtils.advanceTimeAndRefresh(0);
  try {
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      while (times.length && times[0] <= t + 1e-6) {
        await cues[times.shift()]();
      }
      await each?.(f);
      if (live) {
        // (live: the clock let run one frame's worth of real time, then held for the capture.
        // A page opened just now, as a glance's, is only put on screen while it runs)
        filmUtils.restoreNormalRefresh();
        await new Promise((resolve) => setTimeout(resolve, 1000 / FPS));
        filmUtils.advanceTimeAndRefresh(0);
      } else {
        filmUtils.advanceTimeAndRefresh(1000 / FPS);
      }
      // (the frame painted and on screen before it's captured)
      await new Promise((resolve) => setTimeout(resolve, 45));
      await capture(`${shot}-${String(f).padStart(4, "0")}`, area);
      track.push(pointer.shown ? [Math.round(pointer.x * 10) / 10, Math.round(pointer.y * 10) / 10, pointer.down ? 1 : 0] : null);
    }
  } finally {
    filmUtils.restoreNormalRefresh();
  }
  const out = PathUtils.join(Services.dirsvc.get("Home", Ci.nsIFile).path, "Library", "Caches", "zia-test", "out");
  const box = area?.getBoundingClientRect?.() ?? area ?? { x: 0, y: 0 };
  await IOUtils.writeJSON(PathUtils.join(out, `${shot}-pointer.json`), {
    fps: FPS,
    // (the pointer in the frames' pixels: CSS pixels from the area's corner, times this)
    scale: (window.devicePixelRatio || 1) / (window.desktopToDeviceScale || 1),
    origin: [box.x || 0, box.y || 0],
    track,
    realSecondsPerFrame: (performance.now() - started) / 1000 / frames,
  });
  return frames;
}

const browsers = (tabs) => tabs.map((tab) => tab.linkedBrowser?.browsingContext?.mediaController).filter(Boolean);
function mediaKey(controller, key) {
  // (this Zen's pause() wants a reason for losing audio focus; play() takes none)
  if (key === "play") {
    controller.play();
    return;
  }
  for (const reason of ["transient", "permanent", "other", "user"]) {
    try {
      controller.pause(reason);
      return;
    } catch (err) {
      // (not one this Zen knows: the next)
    }
  }
}
// A tab's media held still, for the film to move on a frame at a time
function mediaHold(...tabs) {
  browsers(tabs).forEach((c) => mediaKey(c, "pause"));
}

// A tab's media moved on one frame's worth (played a moment, then paused), so video and its
// progress keep true speed in the film however long a frame takes to capture
function mediaStep(...tabs) {
  return async () => {
    browsers(tabs).forEach((c) => mediaKey(c, "play"));
    await new Promise((resolve) => setTimeout(resolve, 1000 / FPS));
    browsers(tabs).forEach((c) => mediaKey(c, "pause"));
  };
}

// Real time passing with the clock held (a timer of Zia's, say a hover card's beat, coming due)
async function realWait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
