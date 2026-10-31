// A muted, endless video popped out into picture-in-picture: Zia's script dresses the player
// (zia-pip.js), the tuck button tucks it into the screen's side, a click on the strip brings
// it out, the picker tucks it where chosen (and can make that the default), a window thrown
// past a side tucks itself, and Dia's look comes off with its setting
const page =
  "data:text/html," +
  encodeURIComponent(`<title>Video</title><video id=v muted loop autoplay width=320 height=180></video><canvas id=c width=320 height=180></canvas><script>
const c = document.getElementById("c");
const x = c.getContext("2d");
let i = 0;
setInterval(() => { x.fillStyle = "hsl(" + (i++ % 360) + ", 60%, 50%)"; x.fillRect(0, 0, 320, 180); }, 40);
const v = document.getElementById("v");
v.srcObject = c.captureStream(25);
v.play();
</script>`);
// (waits on what it's waiting for, polled, up to a limit; the window's moves as well, till
// it's been still for a few looks)
const pollFor = async (ok, ms = 4000) => {
  for (let waited = 0; waited < ms && !ok(); waited += 50) {
    await wait(50);
  }
};
const settled = async (ok) => {
  const seen = [];
  for (let waited = 0; waited < 4000; waited += 100) {
    seen.push(`${player.screenX},${player.screenY}`);
    if (ok() && seen.length >= 3 && seen.slice(-3).every((at) => at === seen.at(-1))) {
      return;
    }
    await wait(100);
  }
};
const tab = gBrowser.addTab(page, { triggeringPrincipal: SYSTEM });
gBrowser.selectedTab = tab;
await pollFor(() => tab.label === "Video" && !tab.hasAttribute("busy"));
await wait(1000);
tab.linkedBrowser.focus();
await wait(300);
document.getElementById("View:PictureInPicture").doCommand();
let player = null;
for (let i = 0; i < 40 && !player?.__ziaPipLoaded; i++) {
  await wait(250);
  player = [...Services.wm.getEnumerator("Toolkit:PictureInPicture")][0];
}
await wait(800);
const doc = player.document;
const proot = doc.documentElement;
const ATTRS = ["zia-dia", "zia-tuck-on", "zia-live", "zia-tucked", "zia-no-tuck", "zia-picking", "zia-leaving", "zia-emerging", "zia-nudged"];
const look = () => ({
  attrs: ATTRS.filter((name) => proot.hasAttribute(name)).map((name) => `${name}=${proot.getAttribute(name)}`),
  at: [player.screenX, player.screenY, player.outerWidth, player.outerHeight],
  turn: proot.style.getPropertyValue("--zia-tuck-button-turn"),
  veil: proot.style.getPropertyValue("--zia-veil"),
});
const opened = {
  ...look(),
  pills: [...doc.querySelectorAll(".zia-pip-top .zia-pip-pill")].map((pill) => pill.textContent || pill.className.split(" ")[1]),
  sound: [...doc.querySelectorAll(".zia-pip-sound > *")].map((el) => el.id),
  spots: [...doc.querySelectorAll(".zia-pip-spot")].map((button) => button.dataset.spot),
};
const tuckButton = doc.querySelector(".zia-pip-tuck-button");
tuckButton.click();
await settled(() => proot.hasAttribute("zia-tucked"));
const tucked = look();
// a click on the strip: out again
EU.synthesizeMouseAtCenter(doc.querySelector(".zia-pip-sliver"), {}, player);
await settled(() => !proot.hasAttribute("zia-tucked"));
const out = look();
// the picker, from a right-click on the tuck button
tuckButton.dispatchEvent(new player.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await pollFor(() => proot.hasAttribute("zia-picking"));
const picking = { ...look(), disabled: [...doc.querySelectorAll(".zia-pip-spot")].filter((b) => b.disabled).map((b) => b.dataset.spot) };
doc.querySelector(".zia-pip-spot[data-spot='left']").click();
await settled(() => proot.getAttribute("zia-tucked") === "left");
const left = look();
// tucked, a spot picked with "Make this the default" only becomes the default
tuckButton.dispatchEvent(new player.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await pollFor(() => proot.hasAttribute("zia-picking"));
doc.querySelector(".zia-pip-picker-row input").checked = true;
doc.querySelector(".zia-pip-spot[data-spot='bottom']").click();
await pollFor(() => Services.prefs.getStringPref("zia.pip.tuck-spot", "") === "bottom" && !proot.hasAttribute("zia-picking"));
const defaulted = { ...look(), spot: Services.prefs.getStringPref("zia.pip.tuck-spot", "") };
// a right-click anywhere else brings it out
doc.querySelector(".zia-pip-sliver").dispatchEvent(new player.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await settled(() => !proot.hasAttribute("zia-tucked"));
const broughtOut = look();
// thrown past the right side (moved as a drag would), it tucks itself there once still
player.moveTo(1366 - 140, 300);
// (fixed waits here: the first catches it on its way, before it tucks; the second lets the
// strip's nudge, under the pointer, land too)
await wait(150);
const leaving = look();
await wait(1200);
const thrown = look();
// the tuck button tucks into the default spot now
EU.synthesizeMouseAtCenter(doc.querySelector(".zia-pip-sliver"), {}, player);
await settled(() => !proot.hasAttribute("zia-tucked"));
tuckButton.click();
await settled(() => proot.getAttribute("zia-tucked") === "bottom");
const bottom = look();
Services.prefs.clearUserPref("zia.pip.tuck-spot");
Services.prefs.setBoolPref("zia.pip.dia-style", false);
await pollFor(() => !proot.hasAttribute("zia-dia"));
const plain = { ...look(), sound: [...doc.querySelectorAll(".zia-pip-sound > *")].map((el) => el.id) };
Services.prefs.clearUserPref("zia.pip.dia-style");
await pollFor(() => proot.hasAttribute("zia-dia"));
const dia = { ...look(), sound: [...doc.querySelectorAll(".zia-pip-sound > *")].map((el) => el.id) };
player.close();
await wait(500);
done({
  opened,
  tucked,
  out,
  picking,
  left,
  defaulted,
  broughtOut,
  leaving,
  thrown,
  bottom,
  plain,
  dia,
  checks: {
    "Zia's script dressed the player": opened.pills.length === 4 && opened.attrs.includes("zia-dia="),
    "the tuck button tucks it": tucked.attrs.some((a) => a.startsWith("zia-tucked=")) && tucked.at[0] !== opened.at[0],
    "a click on the strip brings it out": !out.attrs.some((a) => a.startsWith("zia-tucked=")),
    "the picker opens": picking.attrs.includes("zia-picking="),
    "a picked spot tucks it there": left.attrs.includes("zia-tucked=left"),
    "a default only becomes the default while tucked": defaulted.spot === "bottom" && defaulted.attrs.includes("zia-tucked=left"),
    "thrown past a side, it tucks": thrown.attrs.includes("zia-tucked=right"),
    "the default spot is used": bottom.attrs.includes("zia-tucked=bottom"),
    "Dia's look comes off and back": !plain.attrs.includes("zia-dia=") && dia.attrs.includes("zia-dia="),
  },
  ziaErrors: ziaErrors(),
});
