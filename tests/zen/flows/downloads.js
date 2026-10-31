// A download started in this window: Zia sends a row with the file's name flying to the Library
// button in place of Zen's circle (Zen's own animation stays patched to wait for a hidden
// downloads button). The file comes from a small server of the flow's own, into a folder in the
// test profile, removed after.
await addTabs(["A"]);
const dir = PathUtils.join(PathUtils.profileDir, "zia-test-downloads");
await IOUtils.makeDirectory(dir, { ignoreExisting: true });
Services.prefs.setIntPref("browser.download.folderList", 2);
Services.prefs.setStringPref("browser.download.dir", dir);
const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
server.init(-1, true, -1);
// (the file sent only when the flow says: the download is still running when it's listed, as
// a fresh one is; the connection's kept, or it's collected and closed)
let sendFile = () => {};
const held = [];
server.asyncListen({
  onSocketAccepted(socket, transport) {
    const output = transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
    held.push(socket, transport, output);
    const body = "x".repeat(2000);
    const head = `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`;
    output.write(head, head.length);
    sendFile = () => {
      output.write(body, body.length);
      output.close();
    };
  },
  onStopListening() {},
});
const patched = !!customElements.get("zen-download-animation")?.prototype.initializeAnimation?.__zia;
// (where Zen last saw a click, which the flight starts from)
gZenUIManager._lastClickPosition = { clientX: 600, clientY: 400 };
const list = await Downloads.getList(Downloads.ALL);
const download = await Downloads.createDownload({ source: `http://127.0.0.1:${server.port}/notes.txt`, target: PathUtils.join(dir, "notes.txt") });
const finished = download.start();
await wait(300);
const running = !download.stopped;
await list.add(download);
await wait(100);
const stage = document.getElementById("zia-download-flight");
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
sendFile();
await finished;
await wait(300);
const gone = !document.getElementById("zia-download-flight");
await list.remove(download);
await download.finalize(true);
server.close();
await IOUtils.remove(dir, { recursive: true });
done({
  running,
  patched,
  flight,
  landing,
  gone,
  checks: {
    "Zen's animation is patched": patched,
    "the row flies": !!flight && flight.name === "notes.txt",
    "and is gone after": gone && download.succeeded,
  },
  ziaErrors: ziaErrors(),
});
