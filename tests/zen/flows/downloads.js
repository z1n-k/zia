// A download started in this window: Zia sends a row with the file's name flying to the Library
// button in place of Zen's circle (Zen's own animation stays patched to wait for a hidden
// downloads button). Then the ring on the downloads button as a download goes: Zia puts it on
// the button as a window starts, and the test profile starts without one, so the button's
// added to the toolbar and the ring read in a new window. The files come from a small server
// of the flow's own, into a folder in the test profile, removed after.
await addTabs(["A"]);
const dir = PathUtils.join(PathUtils.profileDir, "zia-test-downloads");
await IOUtils.makeDirectory(dir, { ignoreExisting: true });
Services.prefs.setIntPref("browser.download.folderList", 2);
Services.prefs.setStringPref("browser.download.dir", dir);
const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
server.init(-1, true, -1);
// (each file sent only when the flow says, a part at a time: a download is still running when
// it's listed, as a fresh one is; the connection's kept, or it's collected and closed)
const senders = [];
const held = [];
server.asyncListen({
  onSocketAccepted(socket, transport) {
    const output = transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
    held.push(socket, transport, output);
    let left = 2000;
    const head = `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${left}\r\nConnection: close\r\n\r\n`;
    output.write(head, head.length);
    senders.push((bytes = left) => {
      const part = "x".repeat(Math.min(bytes, left));
      output.write(part, part.length);
      left -= part.length;
      if (!left) {
        output.close();
      }
    });
  },
  onStopListening() {},
});
const patched = !!customElements.get("zen-download-animation")?.prototype.initializeAnimation?.__zia;
// (where Zen last saw a click, which the flight starts from)
gZenUIManager._lastClickPosition = { clientX: 600, clientY: 400 };
const list = await Downloads.getList(Downloads.ALL);
const download = await Downloads.createDownload({ source: `http://127.0.0.1:${server.port}/notes.txt`, target: PathUtils.join(dir, "notes.txt") });
const finished = download.start();
// (asked for, with the file held back)
await until(() => senders.length === 1);
const running = !download.stopped;
await list.add(download);
// (read as it starts: it's made all at once, its parts' animations all running a second or more)
const stage = await until(() => document.getElementById("zia-download-flight"));
const row = stage?.querySelector(".zia-df-row");
const flight = stage && {
  parts: [...stage.children].map((el) => el.className),
  name: row.textContent,
  icon: row.querySelector("img").getAttribute("src"),
  at: [row.style.left, row.style.top].map((v) => `${Math.round(parseFloat(v))}px`),
  animations: [...stage.querySelectorAll("*")].flatMap((el) => el.getAnimations().map((animation) => `${el.className} ${animation.effect.getTiming().duration}+${animation.effect.getTiming().delay}`)),
  // (every eighth frame of its path)
  path: row.getAnimations()[0].effect.getKeyframes().filter((frame, i) => i % 8 === 0).map((frame) => `${frame.offset.toFixed(3)} ${frame.transform} ${frame.opacity}`),
};
// (the button's nudge as it lands)
const landing = (await animationsDuring(() => {}, 1500)).filter((line) => line.includes("zen-library-button"));
senders[0]();
await finished;
await until(() => !document.getElementById("zia-download-flight"));
const gone = !document.getElementById("zia-download-flight");
await list.remove(download);
await download.finalize(true);

// The ring, in a new window with the downloads button in its toolbar
CustomizableUI.addWidgetToArea("downloads-button", CustomizableUI.AREA_NAVBAR);
const win = OpenBrowserWindow();
await until(() => win.__ziaLoaded && win.gBrowserInit?.delayedStartupFinished && win.document.getElementById("zia-download-ring"), { what: "Zia's ring in a new window", timeout: 30000 });
const button = win.document.getElementById("downloads-button");
const arc = win.document.querySelector("#zia-download-ring .zia-download-ring-arc");
// (how far round the arc is drawn, as a share of the whole)
const ring = () => ({
  downloading: button.getAttribute("zia-downloading"),
  drawn: Math.round((1 - parseFloat(arc.getAttribute("stroke-dashoffset")) / parseFloat(arc.getAttribute("stroke-dasharray"))) * 100) / 100,
});
const rings = { before: ring() };
const big = await Downloads.createDownload({ source: `http://127.0.0.1:${server.port}/big.txt`, target: PathUtils.join(dir, "big.txt") });
const bigFinished = big.start();
await until(() => senders.length === 2);
await list.add(big);
// (half of it sent: its size is only known once some of it has come)
senders[1](1000);
await until(() => ring().drawn > 0);
rings.half = await steady(ring);
senders[1]();
await bigFinished;
await until(() => !ring().downloading);
rings.done = ring();
await list.remove(big);
await big.finalize(true);
win.close();
await until(() => win.closed);
server.close();
await IOUtils.remove(dir, { recursive: true });
done({
  running,
  patched,
  flight,
  landing,
  gone,
  rings,
  checks: {
    "Zen's animation is patched": patched,
    "the row flies": !!flight && flight.name === "notes.txt",
    "and is gone after": gone && download.succeeded,
    "the ring shows the download going": rings.half.downloading === "true" && rings.half.drawn === 0.5 && !rings.done.downloading,
  },
  ziaErrors: ziaErrors(),
});
