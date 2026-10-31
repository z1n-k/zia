// The swipe arrow, driven as Firefox drives it from a trackpad swipe (its animation's start,
// updates and stop): a small swipe back shows Zia's arrow part way; swiped far enough and held,
// it opens into a card of the pages back, which stays after the fingers lift; clicking the
// second page goes back two. A swipe let go early just leaves.
// (no haptic taps from a test)
Services.prefs.setBoolPref("zen.haptic-feedback.enabled", false);
const [tab] = await addTabs(["P1"]);
gBrowser.selectedTab = tab;
await wait(300);
for (const name of ["P2", "P3"]) {
  gBrowser.selectedBrowser.loadURI(Services.io.newURI(`data:text/html,<title>${name}</title>${name}`), { triggeringPrincipal: SYSTEM });
  await wait(600);
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
await wait(50);
const partWay = arrow();
update(0.3);
await wait(50);
const far = arrow();
await wait(700);
const held = { ...arrow(), backdrop: !!document.getElementById("zia-swipe-backdrop") };
swipe.stopAnimation();
await wait(100);
const lifted = arrow();
const row = document.querySelectorAll("#zia-swipe .zia-swipe-page")[1];
EU.synthesizeMouseAtCenter(row, {}, window);
await wait(50);
const clicked = arrow();
await wait(1000);
const page = gBrowser.selectedTab.label;
const gone = arrow();

swipe.startAnimation();
update(-0.1);
await wait(50);
const early = arrow();
swipe.stopAnimation();
await wait(50);
const earlyLeaving = arrow();
await wait(500);

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
