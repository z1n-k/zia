// Real trackpad scrolls, for a flow with the line `// uses: trackpad.js` (and run with --show):
// macOS scroll events with a trackpad's phases, handed to Zen's own page view as macOS hands it
// a trackpad's, so APZ stretches the page past its ends, springs it back and coasts, as it does
// for fingers. (Firefox's own windowUtils.sendNativeTouchpadPan crashes Zen; events posted to
// Zen's process go to the window under the real pointer, wherever that is.)
//
//   trackpad(x, y, dy, phase, momentum)
//     x, y: a point on the screen, in points from its top left (as mozInnerScreenX/Y)
//     dy: pixels; positive scrolls up, so the page comes down (a pull at its top)
//     phase: 1 fingers down, 2 moving, 4 lifted (0 during a coast)
//     momentum: 1 coast begins, 2 coasts, 3 coast ends (0 while fingers are down)
const trackpad = (() => {
  const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
  const objc = ctypes.open("/usr/lib/libobjc.A.dylib");
  const cg = ctypes.open("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  const id = ctypes.voidptr_t;
  const getClass = objc.declare("objc_getClass", ctypes.default_abi, id, ctypes.char.ptr);
  const sel = objc.declare("sel_registerName", ctypes.default_abi, id, ctypes.char.ptr);
  const className = objc.declare("object_getClassName", ctypes.default_abi, ctypes.char.ptr, id);
  const send = objc.declare("objc_msgSend", ctypes.default_abi, id, id, id);
  const sendIndex = objc.declare("objc_msgSend", ctypes.default_abi, id, id, id, ctypes.unsigned_long);
  const sendNumber = objc.declare("objc_msgSend", ctypes.default_abi, ctypes.unsigned_long, id, id);
  const sendObject = objc.declare("objc_msgSend", ctypes.default_abi, id, id, id, id);
  const createScroll = cg.declare("CGEventCreateScrollWheelEvent2", ctypes.default_abi, id, id, ctypes.uint32_t, ctypes.uint32_t, ctypes.int32_t, ctypes.int32_t, ctypes.int32_t);
  const setInt = cg.declare("CGEventSetIntegerValueField", ctypes.default_abi, ctypes.void_t, id, ctypes.uint32_t, ctypes.int64_t);
  const setDouble = cg.declare("CGEventSetDoubleValueField", ctypes.default_abi, ctypes.void_t, id, ctypes.uint32_t, ctypes.double);
  // (a CGPoint goes in two float registers on arm64, as two doubles do: declared as a struct,
  // its x was lost)
  const setLocation = cg.declare("CGEventSetLocation", ctypes.default_abi, ctypes.void_t, id, ctypes.double, ctypes.double);
  const release = cg.declare("CFRelease", ctypes.default_abi, ctypes.void_t, id);

  // the page view (ChildView) of this window's NSWindow
  const findChildView = (view, depth = 0) => {
    if (className(view).readString() === "ChildView") {
      return view;
    }
    if (depth > 8) {
      return null;
    }
    const subviews = send(view, sel("subviews"));
    const count = sendNumber(subviews, sel("count"));
    for (let i = 0; i < count; i++) {
      const found = findChildView(sendIndex(subviews, sel("objectAtIndex:"), i), depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const app = send(getClass("NSApplication"), sel("sharedApplication"));
  const windows = send(app, sel("windows"));
  let childView = null;
  for (let i = 0, n = sendNumber(windows, sel("count")); i < n && !childView; i++) {
    const nsWindow = sendIndex(windows, sel("objectAtIndex:"), i);
    if (sendNumber(nsWindow, sel("isVisible")) & 0xff) {
      childView = findChildView(send(nsWindow, sel("contentView")));
    }
  }
  if (!childView) {
    throw new Error("trackpad.js: no visible page view (run with --show)");
  }
  const nsWindow = send(childView, sel("window"));
  const NSEvent = getClass("NSEvent");

  return (x, y, dy, phase, momentum = 0) => {
    const event = createScroll(null, 0, 1, Math.round(dy), 0, 0);
    setLocation(event, x, y);
    setInt(event, 88, 1); // continuous: a trackpad's precise deltas
    setInt(event, 99, phase);
    setInt(event, 123, momentum);
    setInt(event, 96, Math.round(dy)); // point delta
    setDouble(event, 93, dy); // fixed-point delta
    // (made against this window: Firefox places a scroll through the event's window, and one
    // with none landed at the screen's corner)
    const nsEvent = sendObject(sendObject(NSEvent, sel("eventWithCGEvent:"), event), sel("_eventRelativeToWindow:"), nsWindow);
    sendObject(childView, sel("scrollWheel:"), nsEvent);
    release(event);
  };
})();
