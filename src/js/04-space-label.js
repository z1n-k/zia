  let workspaceSlot = null;
  let movedIndicator = null;
  let movedFromSpace = null;
  let spaceAttrObserver = null;
  const MIRRORED_SPACE_ATTRS = ["haspinnedtabs", "collapsedpinnedtabs"];
  // The space's name left where Zen puts it, above the tabs, rather than
  // moved up beside the window buttons
  const SPACE_NAME_IN_LIST_PREF = "zia.sidebar.space-name-in-list";
  const spaceNameInList = () => Services.prefs.getBoolPref(SPACE_NAME_IN_LIST_PREF, false);

  function createWorkspaceSlot() {
    const topButtons = document.getElementById("zen-sidebar-top-buttons");
    if (!topButtons || !window.gZenWorkspaces) {
      return;
    }
    workspaceSlot = document.createElementNS(XHTML_NS, "div");
    workspaceSlot.id = "zia-workspace-slot";
    const buttonBox = topButtons.querySelector(".titlebar-buttonbox-container");
    if (buttonBox) {
      buttonBox.after(workspaceSlot);
    } else {
      topButtons.prepend(workspaceSlot);
    }

    for (const type of ["ZenWorkspacesUIUpdate", "ZenWorkspaceDataChanged", "AfterWorkspacesSessionRestore"]) {
      window.addEventListener(type, () => setTimeout(placeWorkspaceIndicator, 0));
    }

    const onSpaceSwitch = () => setTimeout(placeWorkspaceIndicator, 0);
    Services.prefs.addObserver(SPACE_NAME_IN_LIST_PREF, onSpaceSwitch);
    window.addEventListener("unload", () => Services.prefs.removeObserver(SPACE_NAME_IN_LIST_PREF, onSpaceSwitch));
    Services.prefs.addObserver("zen.workspaces.active", onSpaceSwitch);
    window.addEventListener("unload", () => Services.prefs.removeObserver("zen.workspaces.active", onSpaceSwitch));
    gBrowser.tabContainer.addEventListener("TabSelect", onSpaceSwitch);
    placeWorkspaceIndicator();

    setTimeout(placeWorkspaceIndicator, 500);
    setTimeout(placeWorkspaceIndicator, 2000);
  }


  function syncSpaceLabel(indicator) {
    if (!indicator) {
      return;
    }
    let workspace = null;
    try {
      workspace = gZenWorkspaces.getActiveWorkspace();
    } catch (err) {
      return;
    }
    if (!workspace) {
      return;
    }

    let label = indicator.querySelector("#zia-space-label");
    if (!label) {
      label = document.createElementNS(XHTML_NS, "div");
      label.id = "zia-space-label";
      indicator.prepend(label);
    }

    const rawIcon = typeof workspace.icon === "string" ? workspace.icon : "";

    const visibleIcon = rawIcon.replace(/[\s\u200b-\u200f\u2060\ufe00-\ufe0f\p{Cf}]/gu, "");
    const hasIcon = visibleIcon !== "";
    const icon = hasIcon ? rawIcon.trim() : "";

    const blank = /^[\s\u200b-\u200f\u2060\ufe00-\ufe0f]+|[\s\u200b-\u200f\u2060\ufe00-\ufe0f]+$/gu;
    let text = label.querySelector(".zia-space-name");
    if (!text) {
      label.textContent = "";
      text = document.createElementNS(XHTML_NS, "span");
      text.className = "zia-space-name";
      label.appendChild(text);
    }
    text.textContent = (workspace.name || "").replace(blank, "");

    const mark = label.querySelector(".zia-space-svg");
    label.removeAttribute("zia-icon");
    label.removeAttribute("zia-has-icon");
    label.removeAttribute("zia-has-svg");

    if (!hasIcon) {
      mark?.remove();
      return;
    }
    if (!icon.endsWith(".svg")) {
      mark?.remove();
      label.setAttribute("zia-icon", icon);
      label.setAttribute("zia-has-icon", "true");
      return;
    }
    // Only the browser's and mods' own icon files: never a web address or a
    // file elsewhere on the computer.
    if (!isOwnIconUrl(icon)) {
      mark?.remove();
      return;
    }
    label.setAttribute("zia-has-svg", "true");
    let svgSlot = mark;
    if (!svgSlot) {
      svgSlot = document.createElementNS(XHTML_NS, "span");
      svgSlot.className = "zia-space-svg";
      label.prepend(svgSlot);
    }
    if (svgSlot.dataset.src === icon && svgSlot.firstChild) {
      return;
    }
    svgSlot.dataset.src = icon;
    svgSlot.replaceChildren();
    fetch(icon)
      .then((response) => response.text())
      .then((source) => {
        if (svgSlot.dataset.src !== icon) {
          return;
        }
        // (only a real SVG is parsed: anything else, or a file still
        // carrying the build's # lines, logged an XML parsing error for
        // every space)
        const svgText = svgSourceOf(source);
        if (!svgText) {
          return;
        }
        const colored = svgText
          .replace(/context-fill-opacity/g, "1")
          .replace(/context-stroke-opacity/g, "1")
          .replace(/context-fill/g, "currentColor")
          .replace(/context-stroke/g, "currentColor")
          .replace(/\bfill="(?:#000(?:000)?|black)"/gi, 'fill="currentColor"')
          .replace(/\bstroke="(?:#000(?:000)?|black)"/gi, 'stroke="currentColor"')
          .replace(/fill\s*:\s*(?:#000(?:000)?|black)/gi, "fill:currentColor")
          .replace(/stroke\s*:\s*(?:#000(?:000)?|black)/gi, "stroke:currentColor");
        const parsed = new DOMParser().parseFromString(colored, "image/svg+xml");
        const node = parsed.documentElement;
        if (!node || node.localName !== "svg") {
          return;
        }
        cleanSvg(node);
        svgSlot.replaceChildren(document.importNode(node, true));
      })
      .catch(() => {});
  }

  const OWN_ICON_SCHEMES = ["chrome:", "resource:"];

  function isOwnIconUrl(icon) {
    try {
      return OWN_ICON_SCHEMES.includes(new URL(icon, "chrome://browser/content/browser.xhtml").protocol);
    } catch (err) {
      return false;
    }
  }

  // An icon is only shapes: drop anything that could run or load something
  // before it goes into the browser's own window.
  function cleanSvg(svg) {
    for (const node of svg.querySelectorAll("script, foreignObject, iframe, embed, object, audio, video")) {
      node.remove();
    }
    for (const node of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        const isLink = name === "href" || name.endsWith(":href") || name === "src";
        if (name.startsWith("on") || (isLink && !value.startsWith("#")) || value.startsWith("javascript:")) {
          node.removeAttributeNode(attr);
        }
      }
    }
  }

  function removeSpaceLabel(indicator) {
    indicator?.querySelector("#zia-space-label")?.remove();
  }

  function mirrorSpaceAttributes(space) {
    for (const name of MIRRORED_SPACE_ATTRS) {
      if (space?.hasAttribute(name)) {
        workspaceSlot.setAttribute(name, space.getAttribute(name));
      } else {
        workspaceSlot.removeAttribute(name);
      }
    }
  }

  function placeWorkspaceIndicator() {
    if (!workspaceSlot) {
      return;
    }
    let space = null;
    let indicator = null;
    try {
      space = gZenWorkspaces.activeWorkspaceElement;
      indicator = space?.indicator;
    } catch (err) {
      return;
    }

    const inList = spaceNameInList();
    setFlag("zia-space-name-in-list", inList);
    if (inList) {
      indicator = null;
      spaceAttrObserver?.disconnect();
      mirrorSpaceAttributes(null);
    }

    if (movedIndicator && movedIndicator !== indicator && movedFromSpace?.isConnected) {
      removeSpaceLabel(movedIndicator);
      movedFromSpace.prepend(movedIndicator);
      movedIndicator = null;
      movedFromSpace = null;
    }

    if (indicator && indicator.parentNode !== workspaceSlot) {
      workspaceSlot.append(indicator);
      movedIndicator = indicator;
      movedFromSpace = space;
    }

    if (inList) {
      setFlag("zia-workspace-slot", false);
      return;
    }

    syncSpaceLabel(indicator);

    spaceAttrObserver?.disconnect();
    mirrorSpaceAttributes(space);
    if (space) {
      spaceAttrObserver = new MutationObserver(() => mirrorSpaceAttributes(space));
      spaceAttrObserver.observe(space, { attributes: true, attributeFilter: MIRRORED_SPACE_ATTRS });
    }
    setFlag("zia-workspace-slot", !!indicator);
  }

