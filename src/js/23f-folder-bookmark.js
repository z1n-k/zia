  // ---------- A folder bookmarked whole, subfolders and all
  // Zen's folder menu has no way to bookmark a folder: its tabs selected and Firefox's
  // "Bookmark Tabs…" made one flat folder of them, the subfolders' tabs loose in it.
  // "Bookmark Folder" makes a bookmark folder of the same name where new bookmarks go
  // (Firefox's setting for it), with a bookmark folder for each subfolder, in their order.
  function bookmarkTreeOf(folder) {
    const link = (tab) => {
      const url = tab.linkedBrowser?.currentURI?.spec;
      return url && url !== "about:blank" ? { url, title: tab.label || url } : null;
    };
    const children = folder.allItems
      .flatMap((item) => {
        if (item.isZenFolder) {
          return [bookmarkTreeOf(item)];
        }
        // (a split: both its tabs)
        return gBrowser.isTab(item) ? [link(item)] : (item.tabs || []).map(link);
      })
      .filter(Boolean);
    return { type: PlacesUtils.bookmarks.TYPE_FOLDER, title: folder.label || "Folder", children };
  }

  async function bookmarkFolder(folder) {
    const parentGuid = (await PlacesUIUtils.defaultParentGuid) || PlacesUtils.bookmarks.toolbarGuid;
    await PlacesUtils.bookmarks.insertTree({ guid: parentGuid, children: [bookmarkTreeOf(folder)] });
    ConfirmationHint.show(folder.labelElement || folder, "confirmation-hint-page-bookmarked");
  }

  function addFolderBookmarkItem() {
    const menu = document.getElementById("zenFolderActions");
    if (!menu || document.getElementById("zia-folder-bookmark")) {
      return;
    }
    const item = document.createXULElement("menuitem");
    item.id = "zia-folder-bookmark";
    item.setAttribute("label", "Bookmark Folder");
    const share = menu.querySelector("#context_zenShareFolder");
    if (share) {
      share.before(item);
    } else {
      menu.append(item);
    }
    let folder = null;
    menu.addEventListener("popupshowing", (event) => {
      if (event.target === menu) {
        folder = folderFromNode(menu.triggerNode);
        item.hidden = !folder;
      }
    });
    item.addEventListener("command", () => {
      if (folder) {
        bookmarkFolder(folder).catch((err) => noteError("folder bookmark", err));
      }
    });
  }

