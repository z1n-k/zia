  // The node a dragged item moves as, and the drag's listeners added in order.
  // Used elsewhere: nodeToMove, moveTabsLikeDia.

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

  // Tabs dragged the way Dia drags them: the rows slide out of the dragged tab's way and it
  // lands where it's let go, in place of Zen's drop line (28-tab-drag-*.js). Listeners are
  // added in this order, the order they run in.
  function moveTabsLikeDia() {
    watchDragImage();
    watchDragStart();
    watchEssentialStart();
    watchEssentialDrop();
    watchZenHooks();
    watchSettle();
  }

