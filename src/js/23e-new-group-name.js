  // A tab group made from a tab's menu ("Add Tab to Group", "New Group") is named
  // where it is, as a new folder is: its name field opens in the sidebar, ready to
  // type in. Firefox's own naming box for it didn't show in Zen, so the group was
  // left nameless (a bare checkbox) until renamed from its menu.
  function nameNewGroupsInPlace() {
    window.addEventListener(
      "TabGroupCreateByUser",
      (event) => {
        const group = event.target;
        if (group?.localName !== "tab-group" || group.isZenFolder || group.hasAttribute("split-view-group")) {
          return;
        }
        const label = group.labelElement || group.querySelector(".tab-group-label");
        const renamer = window.gZenTabRenamer;
        if (!label || typeof renamer?.start !== "function") {
          return;
        }
        // (in its place, Firefox's box: opening as well, it took the typing away)
        event.stopPropagation();
        label.onRenameFinished ??= (name) => {
          group.label = name || "";
        };
        requestAnimationFrame(() => {
          try {
            renamer.start({ target: label, explicit: true });
          } catch (err) {
            noteError("new group: name", err);
          }
        });
      },
      true
    );
  }

  // In compact mode the sidebar stays out while a name in it is being typed (a tab's,
  // a folder's, a group's): it slid away as the pointer left it, the name half typed.
  function keepSidebarWhileRenaming() {
    const toolbox = document.getElementById("navigator-toolbox");
    if (!toolbox) {
      return;
    }
    const ACTIVE = "zen-compact-mode-active";
    let held = false;
    const sync = () => {
      const renaming = root.hasAttribute("zen-renaming-tab") && root.getAttribute("zen-compact-mode") === "true";
      if (renaming && !toolbox.hasAttribute(ACTIVE)) {
        toolbox.setAttribute(ACTIVE, "true");
        held = true;
      } else if (!renaming && held) {
        held = false;
        // (only if nothing else in it, a menu or the address pop-up, still holds it out)
        if (!toolbox.querySelector(":where([panelopen], [open], [breakout-extend]):not(tab)")) {
          toolbox.removeAttribute(ACTIVE);
        }
      }
    };
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["zen-renaming-tab", "zen-compact-mode"] });
    new MutationObserver(sync).observe(toolbox, { attributes: true, attributeFilter: [ACTIVE] });
  }
