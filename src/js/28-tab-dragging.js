  // The drag's listeners added in order, and the node a dragged item moves as.
  // Used elsewhere: moveTabsLikeDia, nodeToMove.

  // Tabs dragged the way Dia drags them: the rows slide out of the dragged tab's way and it
  // lands where it's let go, in place of Zen's drop line (28-tab-drag-*.js). Listeners are
  // added in this order, the order they run in.
  //
  // Words used across the drag's files:
  //   room   space opened among the rows or tiles for what's dragged (makeRoom, topRoom)
  //   slot   an element holding a place: the drop slot in a folder, an empty folder's slot,
  //          a split's cell among the essentials
  //   proxy  the copy that follows the pointer over the essentials; copy, any cloned tab
  //   clear  undo a look for good (clearMoved, clearProxy); hide, fade it out (hideThumb);
  //          release, hand something back (releaseToZen, releaseHome)
  function moveTabsLikeDia() {
    watchDragImage();
    watchDragStart();
    watchEssentialStart();
    watchEssentialDrop();
    watchZenHooks();
    watchSettle();
  }

  function nodeToMove(element) {
    if (!element) {
      return null;
    }
    if (element.hasAttribute?.("split-view-group") || element.group?.hasAttribute?.("split-view-group")) {
      return element.group || element;
    }
    if (gBrowser.isTab(element)) {
      return element;
    }
    if (gBrowser.isTabGroupLabel?.(element)) {
      return element.closest(".tab-group-label-container") || element;
    }
    if (gBrowser.isTabGroup?.(element)) {
      return element.labelContainerElement || element;
    }
    return element;
  }
