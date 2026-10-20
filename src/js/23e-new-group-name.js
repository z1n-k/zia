  // A tab group made from a tab's menu ("Add Tab to Group", "New Group") is named
  // where it is, as a new folder is: its name field opens in the sidebar, ready to
  // type in, once the menu has gone. Firefox's own naming box for it didn't show in
  // Zen, so the group was left nameless (a bare checkbox) until renamed from its menu.
  // Advanced Tab Groups names a new group in a field of its own, so with it, its field
  // is the one opened: two at once, tidying its own away it took Zen's, which left
  // the sidebar out for good and no name taking.
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
        let named = false;
        const name = () => {
          // (already being named, in Advanced Tab Groups' field or Zen's)
          if (named || !group.isConnected || document.getElementById("tab-label-input") || root.hasAttribute("zen-renaming-tab")) {
            named = true;
            return;
          }
          named = true;
          try {
            if (typeof group._renameGroupFromContextMenu === "function") {
              group._renameGroupFromContextMenu();
            } else {
              renamer.start({ target: label, explicit: true });
            }
          } catch (err) {
            noteError("new group: name", err);
          }
        };
        // (the menu, closing, took the typing from a field opened under it)
        const menu = document.getElementById("tabContextMenu");
        if (menu && menu.state !== "closed") {
          const hidden = (e) => {
            if (e.target === menu) {
              menu.removeEventListener("popuphidden", hidden);
              setTimeout(name, 0);
            }
          };
          menu.addEventListener("popuphidden", hidden);
          setTimeout(() => {
            menu.removeEventListener("popuphidden", hidden);
            name();
          }, 1000);
        } else {
          requestAnimationFrame(name);
        }
      },
      true
    );
  }
