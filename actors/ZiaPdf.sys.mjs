// Zia: Firefox's PDF viewer in Dia's look. ZiaPdfChild calls diaPdf() for each
// PDF viewer page; the styles are zia-pdf.css (loaded here, since the viewer
// is a page of its own, not part of Zen's window).
//
// Dia's toolbar is laid out from PDF.js's own controls, moved into place:
// the title on the left; the page, zoom, fit to page, rotate, the pen and
// undo/redo in the middle; download, print and more on the right. The pen
// opens a second row holding Firefox's tools (draw, highlight, text,
// signature, image, comment). Zia adds only what PDF.js doesn't have (the
// title, "/ 2", the zoom percentage, fit, rotate, the pen and undo/redo),
// and each drives PDF.js itself.
// Used elsewhere: diaPdf (ZiaPdfChild.sys.mjs).

// Same session-changing query as this module, so a Zia update is never
// shown with last session's styles.
const SHEET_URL = "chrome://sine/content/zia/zia-pdf.css" + new URL(import.meta.url).search;
const UPDATE_MS = 300;

export function diaPdf(win) {
  const doc = win.document;
  if (doc.documentElement.classList.contains("ziaPdf")) {
    return;
  }
  try {
    win.windowUtils.loadSheetUsingURIString(SHEET_URL, win.windowUtils.AUTHOR_SHEET);
  } catch (err) {
    console.error("[Zia] PDF view: stylesheet", err);
    return;
  }

  const $ = (id) => doc.getElementById(id);
  const toolbar = $("toolbarViewer");
  const left = $("toolbarViewerLeft");
  const middle = $("toolbarViewerMiddle");
  const right = $("toolbarViewerRight");
  const editorButtons = $("editorModeButtons");
  if (!toolbar || !left || !middle || !right) {
    return;
  }
  doc.documentElement.classList.add("ziaPdf");

  const app = () => {
    try {
      return win.wrappedJSObject?.PDFViewerApplication || null;
    } catch (err) {
      return null;
    }
  };
  const make = (tag, className, parent) => {
    const el = doc.createElement(tag);
    el.className = className;
    parent?.append(el);
    return el;
  };
  const button = (className, label, parent, onClick) => {
    const el = make("button", `toolbarButton ziaPdfButton ${className}`, parent);
    el.type = "button";
    el.title = label;
    el.setAttribute("aria-label", label);
    el.addEventListener("click", onClick);
    return el;
  };
  const separator = (parent) => make("span", "ziaPdfSep", parent);

  // Left: the document's name after the sidebar button.
  const title = make("span", "ziaPdfTitle");
  const sidebar = $("viewsManager");
  const toggle = $("viewsManagerToggleButton");
  (sidebar || toggle)?.after(title);

  // Middle, in Dia's order.
  const centre = make("div", "ziaPdfCentre");
  middle.prepend(centre);
  const pageInput = $("pageNumber");
  if (pageInput) {
    centre.append(pageInput.closest(".loadingInput") || pageInput);
  }
  const count = make("span", "ziaPdfCount", centre);
  separator(centre);
  const zoomOut = $("zoomOutButton");
  const zoomIn = $("zoomInButton");
  if (zoomOut) {
    centre.append(zoomOut);
  }
  const zoom = make("span", "ziaPdfZoom", centre);
  if (zoomIn) {
    centre.append(zoomIn);
  }
  separator(centre);
  button("ziaPdfFit", "Fit to page", centre, () => {
    const viewer = app()?.pdfViewer;
    if (viewer) {
      viewer.currentScaleValue = viewer.currentScaleValue === "page-fit" ? "page-width" : "page-fit";
    }
  });
  button("ziaPdfRotate", "Rotate counterclockwise", centre, () => $("pageRotateCcw")?.click());
  separator(centre);

  // The pen opens the tools row; closing it leaves whichever tool was on.
  const tools = make("div", "ziaPdfTools");
  if (editorButtons) {
    tools.append(editorButtons);
  }
  $("toolbarContainer")?.insertBefore(tools, toolbar.nextSibling);
  const pen = button("ziaPdfPen", "Annotate", centre, () => {
    const open = !doc.documentElement.classList.contains("ziaPdfToolsOpen");
    doc.documentElement.classList.toggle("ziaPdfToolsOpen", open);
    pen.setAttribute("aria-pressed", String(open));
    if (!open) {
      // PDF.js marks the tool in use "toggled"; pressing it again turns it off.
      for (const on of tools.querySelectorAll(".toolbarButton.toggled")) {
        on.click();
      }
    }
  });
  pen.setAttribute("aria-pressed", "false");
  if (!editorButtons) {
    pen.hidden = true;
  }
  separator(centre);
  const edit = (name) => () =>
    win.dispatchEvent(new win.CustomEvent("editingaction", { detail: win.JSON.parse(`{"name":"${name}"}`) }));
  button("ziaPdfUndo", "Undo", centre, edit("undo"));
  button("ziaPdfRedo", "Redo", centre, edit("redo"));

  // Right: download before print, like Dia.
  const print = $("printButton");
  const download = $("downloadButton");
  if (print && download && print.parentNode === download.parentNode) {
    print.before(download);
  }

  // Title, page count and zoom follow PDF.js as it changes them.
  const update = () => {
    const name = (doc.title || "").replace(/\.pdf$/i, "").trim();
    if (title.textContent !== name) {
      title.textContent = name;
    }
    const pages = pageInput?.max ? `/ ${pageInput.max}` : "";
    if (count.textContent !== pages) {
      count.textContent = pages;
    }
    const scale = app()?.pdfViewer?.currentScale;
    const percent = Number.isFinite(scale) ? `${Math.round(scale * 100)}%` : "";
    if (zoom.textContent !== percent) {
      zoom.textContent = percent;
    }
  };
  update();
  const timer = win.setInterval(() => {
    if (!doc.hidden) {
      update();
    }
  }, UPDATE_MS);
  win.addEventListener("unload", () => win.clearInterval(timer), { once: true });
}
