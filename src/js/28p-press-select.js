  // Firefox selects a tab the moment it's pressed, so a tab dragged out to
  // the page (to a split) showed its own page while it was picked up, then
  // flashed back to the page you were on once it reached the page; its
  // stand-in also wore the chosen look (an essential's coloured glow). A
  // press on a tab that isn't the one shown waits: it's selected as the
  // button is let go, or once it's been held still a moment, and not at all
  // if it's dragged first, so dragging a tab leaves the page as it is.
  const PRESS_SELECT_HOLD_MS = 220;
  const PRESS_SELECT_SLOP = 3;

  function watchPressSelect() {
    const tabClass = customElements.get("tabbrowser-tab");
    const base = tabClass && Object.getPrototypeOf(tabClass.prototype);
    const select = base?.on_mousedown;
    if (typeof select !== "function" || select.ziaWrapped) {
      return;
    }

    let pending = null;
    const settle = (run) => {
      const press = pending;
      pending = null;
      if (!press) {
        return;
      }
      clearTimeout(press.timer);
      if (run && press.tab.isConnected && !press.tab.selected) {
        try {
          select.call(press.tab, press.event);
        } catch (err) {
          noteError("press select: select", err);
        }
      }
    };

    const wrapped = function (event) {
      const waits =
        this.localName === "tab" &&
        event.button === 0 &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !this.selected &&
        !this.multiselected &&
        this.closest?.("#tabbrowser-tabs, #zen-essentials, .zen-essentials-container");
      if (!waits) {
        return select.call(this, event);
      }
      settle(false);
      pending = {
        tab: this,
        event,
        x: event.screenX,
        y: event.screenY,
        moved: false,
        timer: setTimeout(() => {
          if (pending && !pending.moved) {
            settle(true);
          }
        }, PRESS_SELECT_HOLD_MS),
      };
      return undefined;
    };
    wrapped.ziaWrapped = true;
    base.on_mousedown = wrapped;

    window.addEventListener(
      "mousemove",
      (event) => {
        if (pending && Math.hypot(event.screenX - pending.x, event.screenY - pending.y) > PRESS_SELECT_SLOP) {
          pending.moved = true;
        }
      },
      true
    );
    // let go without a drag: a click, selected now
    window.addEventListener("mouseup", (event) => event.button === 0 && settle(true), true);
    // picked up: it stays where it is, and the page with it
    window.addEventListener("dragstart", () => settle(false), true);
    window.addEventListener("blur", () => settle(false));
  }
