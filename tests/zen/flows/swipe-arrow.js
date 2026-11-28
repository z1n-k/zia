// The swipe arrow, driven as Firefox drives it from a trackpad swipe (its animation's start,
// updates and stop): a small swipe back shows Zia's arrow part way; swiped far enough and held,
// it opens into a card of the pages back, which stays after the fingers lift; clicking the
// second page goes back two. A swipe let go early just leaves.
// (no haptic taps from a test)
Services.prefs.setBoolPref("zen.haptic-feedback.enabled", false);
const [tab] = await addTabs(["P1"]);
gBrowser.selectedTab = tab;
await until(() => tab.linkedBrowser.docShellIsActive);
await atRest();
for (const name of ["P2", "P3"]) {
  gBrowser.selectedBrowser.loadURI(Services.io.newURI(`data:text/html,<title>${name}</title>${name}`), { triggeringPrincipal: SYSTEM });
  await until(() => tab.label === name && !gBrowser.selectedBrowser.webProgress.isLoadingDocument);
  await atRest();
}
const swipe = gHistorySwipeAnimation;
// (what a trackpad's swipe update carries: the event, for the gesture's command, and how far)
const update = (delta) => swipe.updateAnimation({ event: {}, delta });
const arrow = () => {
  const el = document.getElementById("zia-swipe");
  return el && {
    side: el.getAttribute("side"),
    marks: ["will", "open", "settled", "leaving", "commit"].filter((name) => el.hasAttribute(name)),
    progress: el.style.getPropertyValue("--p"),
    count: el.style.getPropertyValue("--zia-swipe-n"),
    pages: [...el.querySelectorAll(".zia-swipe-page")].map((row) => `${row.textContent}${row.hasAttribute("selected") ? " (selected)" : ""}`),
    inStack: !!el.closest(".browserStack"),
  };
};
const marked = document.documentElement.hasAttribute("zia-swipe-arrow");

swipe.startAnimation();
update(0.1);
const partWay = await until(arrow);
update(0.3);
const far = await until(() => arrow()?.marks.includes("will") && arrow());
// (held there, it opens a moment on, and settles a moment after that)
await until(() => arrow()?.marks.includes("settled"));
const held = { ...arrow(), backdrop: !!document.getElementById("zia-swipe-backdrop") };
swipe.stopAnimation();
// (and a moment after the lift, still open)
await wait(100);
const lifted = arrow();
const row = document.querySelectorAll("#zia-swipe .zia-swipe-page")[1];
// (read as the click lands: the card's on its way out, and goes a moment later)
EU.synthesizeMouseAtCenter(row, {}, window);
const clicked = arrow();
await until(() => !arrow() && gBrowser.selectedTab.label !== "P3" && !gBrowser.selectedBrowser.webProgress.isLoadingDocument);
const page = gBrowser.selectedTab.label;
const gone = arrow();

swipe.startAnimation();
update(-0.1);
const early = await until(() => arrow()?.side === "forward" && arrow());
swipe.stopAnimation();
const earlyLeaving = arrow();
await until(() => !arrow());

done({
  marked,
  partWay,
  far,
  held,
  lifted,
  clicked,
  page,
  gone,
  early,
  earlyLeaving,
  earlyGone: arrow(),
  checks: {
    "a small swipe shows the arrow part way": partWay?.side === "back" && partWay.progress === "0.4" && !partWay.marks.includes("will"),
    "far enough, it will go": far?.marks.includes("will") && far.progress === "1",
    "held, it opens into the pages back": held.marks.includes("open") && held.pages.join() === "P2 (selected),P1" && held.backdrop,
    "it stays after the lift": lifted?.marks.includes("open"),
    "the second page goes back two": clicked?.marks.includes("leaving") && page === "P1" && !gone,
    "a swipe let go early just leaves": early?.side === "forward" && earlyLeaving?.marks.includes("leaving") && !earlyLeaving.marks.includes("commit"),
  },
  ziaErrors: ziaErrors(),
});
