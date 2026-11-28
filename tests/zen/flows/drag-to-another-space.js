// A tab dragged down onto another space's icon, which Zen switches to, and back up into that
// space's list: it follows into the new space and lands there, inside the sidebar
// (Zen 1.24's gBrowser.tabs holds only the open space's tabs, so B is kept hold of here)
const [a, b] = await addTabs(["A", "B"]);
const home = gZenWorkspaces.activeWorkspace;
const other = await gZenWorkspaces.createAndSaveWorkspace("Two", undefined, true);
const icon = await until(() => gZenWorkspaces.workspaceIcons.querySelector(`[zen-workspace-id="${other.uuid}"]`));
await atRest();
const from = centre(a);
const over = centre(icon);
const back = { x: from.x, y: from.y + 30 };
const seen = await drag(a, [...path(from, over, 8), over, over, ...path(over, back, 8)], {
  landed: () => a.getAttribute("zen-workspace-id") === other.uuid,
  during: async (step) => {
    // (held over the icon till Zen has switched to its space, and that's come to rest)
    if (step === 9) {
      await until(() => gZenWorkspaces.activeWorkspace === other.uuid);
      await atRest();
    }
  },
});
done({
  inOther: a.getAttribute("zen-workspace-id") === other.uuid,
  stayedHome: b.getAttribute("zen-workspace-id") === home,
  active: gZenWorkspaces.activeWorkspace === other.uuid,
  seen,
  checks: { "hovering the icon switched space": gZenWorkspaces.activeWorkspace === other.uuid, "A moved to Two": a.getAttribute("zen-workspace-id") === other.uuid },
  ziaErrors: ziaErrors(),
});
