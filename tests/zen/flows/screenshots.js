// Firefox's screenshot buttons drawn as Zia's tiles: its look is put inside each set of buttons
// as a screenshot starts
const [a] = await addTabs(["A"]);
gBrowser.selectedTab = a;
await until(() => a.linkedBrowser.docShellIsActive);
await atRest();
document.getElementById("Browser:Screenshot").doCommand();
const look = () =>
  [...document.querySelectorAll("screenshots-buttons")].map((el) => ({
    styled: !!el.shadowRoot?.ziaStyled,
    sheets: el.shadowRoot?.adoptedStyleSheets.length,
    gap: el.shadowRoot?.adoptedStyleSheets.at(-1)?.cssRules[0]?.style.getPropertyValue("gap"),
  }));
// (the buttons there and dressed, and no more coming)
await until(() => look().length && look().every((b) => b.styled));
const buttons = await steady(look);
EU.synthesizeKey("KEY_Escape", {}, window);
await atRest();
done({
  buttons,
  checks: { "the buttons have Zia's look": buttons.length > 0 && buttons.every((b) => b.styled) },
  ziaErrors: ziaErrors(),
});
