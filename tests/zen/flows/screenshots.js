// Firefox's screenshot buttons drawn as Zia's tiles: its look is put inside each set of buttons
// as a screenshot starts
const [a] = await addTabs(["A"]);
gBrowser.selectedTab = a;
await wait(800);
document.getElementById("Browser:Screenshot").doCommand();
await wait(2000);
const buttons = [...document.querySelectorAll("screenshots-buttons")].map((el) => ({
  styled: !!el.shadowRoot?.ziaStyled,
  sheets: el.shadowRoot?.adoptedStyleSheets.length,
  gap: el.shadowRoot?.adoptedStyleSheets.at(-1)?.cssRules[0]?.style.getPropertyValue("gap"),
}));
EU.synthesizeKey("KEY_Escape", {}, window);
await wait(800);
done({
  buttons,
  checks: { "the buttons have Zia's look": buttons.length > 0 && buttons.every((b) => b.styled) },
  ziaErrors: ziaErrors(),
});
