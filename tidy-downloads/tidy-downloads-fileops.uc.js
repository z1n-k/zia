// ==UserScript==
// @include   main
// @ignorecache
// ==/UserScript==

// tidy-downloads-fileops.uc.js
// File operations: open, erase from history, content-type, rename/undo (createRenameHandlers)
// Receives context from tidy-downloads.uc.js
(function () {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  const { classes: Cc, interfaces: Ci } = Components;

  window.zenTidyDownloadsFileOps = {
    /**
     * Write the new on-disk path back into Firefox's download record so
     * DownloadHistory (and Zen Library) still find the file after a restart.
     * Assigning download.target.path only updates the live object.
     */
    async persistDownloadTargetPath(download, newPath, debugLog) {
      if (!download?.target || !newPath) return;
      download.target.path = newPath;

      try {
        if (typeof download.refresh === "function") {
          await download.refresh();
        }
      } catch (e) {
        debugLog?.("[PersistTarget] refresh failed", e);
      }

      // refresh() on a finished download does not notify views when only the
      // path changed, so the native stack and library section would keep the
      // old name. Force the change the public list views already listen for.
      try {
        if (typeof download._notifyChange === "function") {
          download._notifyChange();
        }
      } catch (e) {
        debugLog?.("[PersistTarget] change notification failed", e);
      }

      const url = download.source?.url;
      if (!url || download.source?.isPrivate) return;

      try {
        const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
        const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
        const { DownloadHistory } = ChromeUtils.importESModule("resource://gre/modules/DownloadHistory.sys.mjs");

        if (!PlacesUtils.history.canAddURI(PlacesUtils.toURI(url))) return;

        const targetFile = new FileUtils.File(newPath);
        const targetUri = Services.io.newFileURI(targetFile);
        const pageInfo = await PlacesUtils.history.fetch(url);
        if (!pageInfo) return;

        await PlacesUtils.history.update({
          annotations: new Map([["downloads/destinationFileURI", targetUri.spec]]),
          guid: pageInfo.guid,
          url: pageInfo.url
        });

        if (typeof DownloadHistory.updateMetaData === "function") {
          await DownloadHistory.updateMetaData(download);
        }
        debugLog?.("[PersistTarget] Updated download history destination", { url, newPath });
      } catch (e) {
        debugLog?.("[PersistTarget] history update failed", e);
      }
    },

    /**
     * Initialize file ops module. Called by tidy-downloads.uc.js with context.
     * @param {Object} ctx - Context from main script
     * @param {Object} ctx.SecurityUtils - Path validation utilities
     * @param {function} ctx.debugLog - debugLog
     * @returns {{ openDownloadedFile, eraseDownloadFromHistory, getContentTypeFromFilename }}
     */
    init(ctx) {
      const { SecurityUtils, debugLog } = ctx;

      /**
       * Open a downloaded file with the default system application
       * @param {Object} download - Download object with target path
       */
      function openDownloadedFile(download) {
        if (!download || !download.target || !download.target.path) {
          debugLog("openDownloadedFile: Invalid download object or path", { download });
          return;
        }

        const filePath = download.target.path;

        const validation = SecurityUtils.validateFilePath(filePath, { strict: false });
        if (!validation.valid) {
          debugLog("openDownloadedFile: Path validation failed", {
            filePath,
            error: validation.error,
            code: validation.code
          });
          return;
        }

        debugLog("openDownloadedFile: Attempting to open file", { filePath });

        try {
          const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          file.initWithPath(filePath);

          if (file.exists() && file.isReadable()) {
            file.launch();
            debugLog("openDownloadedFile: File launched successfully", { filePath });
          } else {
            debugLog("openDownloadedFile: File does not exist or is not readable", { filePath });
          }
        } catch (ex) {
          const errorInfo = {
            filePath,
            error: ex.message || ex.toString(),
            name: ex.name || "Error",
            stack: ex.stack
          };
          debugLog("openDownloadedFile: Error launching file", errorInfo);
          console.error("openDownloadedFile failed:", errorInfo);
        }
      }

      /**
       * Erase download from Firefox history
       * @param {Object} download - Download object to remove
       * @throws {Error} If download object is invalid or operation fails
       */
      async function eraseDownloadFromHistory(download) {
        if (!download) {
          debugLog("eraseDownloadFromHistory: Invalid download object", { download });
          throw new Error("Invalid download object");
        }

        if (download.target?.path) {
          const pathValidation = SecurityUtils.validateFilePath(download.target.path, { strict: false });
          if (!pathValidation.valid) {
            debugLog("eraseDownloadFromHistory: Path validation warning", {
              path: download.target.path,
              error: pathValidation.error,
              code: pathValidation.code
            });
          }
        }

        try {
          debugLog("eraseDownloadFromHistory: Attempting to erase download", {
            id: download.id,
            path: download.target?.path,
            state: download.state
          });

          const list = await window.Downloads.getList(window.Downloads.ALL);
          const downloads = await list.getAll();
          const targetDownload = downloads.find(dl => {
            if (download.id && dl.id === download.id) return true;

            if (download.target?.path && dl.target?.path) {
              const downloadPathValid = SecurityUtils.validateFilePath(download.target.path, { strict: false });
              const dlPathValid = SecurityUtils.validateFilePath(dl.target.path, { strict: false });
              if (downloadPathValid.valid && dlPathValid.valid &&
                dl.target.path === download.target.path) return true;
            }

            if (download.source?.url && dl.source?.url &&
              dl.source.url === download.source.url &&
              download.startTime && dl.startTime &&
              Math.abs(new Date(download.startTime) - new Date(dl.startTime)) < 5000) return true;

            return false;
          });

          if (targetDownload) {
            await list.remove(targetDownload);
            debugLog("eraseDownloadFromHistory: Successfully removed download from list", {
              id: targetDownload.id,
              originalId: download.id,
              path: targetDownload.target?.path
            });
          } else {
            debugLog("eraseDownloadFromHistory: Download not found in list", {
              id: download.id,
              path: download.target?.path,
              availableDownloads: downloads.length
            });
          }
        } catch (error) {
          debugLog("eraseDownloadFromHistory: Error erasing download", {
            id: download.id,
            path: download.target?.path,
            error: error.message,
            stack: error.stack
          });
          throw error;
        }
      }

      /**
       * Get MIME type from filename extension
       * @param {string} filename - Filename with extension
       * @returns {string} MIME type or application/octet-stream
       */
      function getContentTypeFromFilename(filename) {
        if (!filename) return "application/octet-stream";

        const ext = filename.toLowerCase().split(".").pop();
        const mimeTypes = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
          svg: "image/svg+xml", ico: "image/x-icon",

          pdf: "application/pdf", doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xls: "application/vnd.ms-excel",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ppt: "application/vnd.ms-powerpoint",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

          txt: "text/plain", html: "text/html", css: "text/css",
          js: "text/javascript", json: "application/json",
          xml: "text/xml", csv: "text/csv",

          mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
          flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",

          mp4: "video/mp4", avi: "video/x-msvideo", mov: "video/quicktime",
          wmv: "video/x-ms-wmv", flv: "video/x-flv", webm: "video/webm",
          mkv: "video/x-matroska",

          zip: "application/zip", rar: "application/x-rar-compressed",
          "7z": "application/x-7z-compressed", tar: "application/x-tar",
          gz: "application/gzip",

          exe: "application/x-msdownload", msi: "application/x-msi",
          deb: "application/x-debian-package", rpm: "application/x-rpm"
        };

        return mimeTypes[ext] || "application/octet-stream";
      }

      return {
        openDownloadedFile,
        eraseDownloadFromHistory,
        getContentTypeFromFilename
      };
    },

    /**
     * Rename on disk + update download record and card maps. Call after scheduleCardRemoval /
     * performAutohideSequence exist (same scope as main script), and before init() if load is synchronous.
     * @param {Object} ctx
     * @param {Object} ctx.store - zenTidyDownloadsStore.createStore() result (activeDownloadCards, orderedPodKeys, focusedKeyRef, renamedFiles)
     * @param {Object} ctx.deps - shared callbacks/utils (SecurityUtils, debugLog, sanitizeFilename, PATH_SEPARATOR, Cc, Ci, scheduleCardRemoval, performAutohideSequence, updateUIForFocusedDownload, getMasterTooltip, migrateAIRenameKeys, fireCustomEvent)
     * @returns {{ renameDownloadFileAndUpdateRecord: Function, undoRename: Function }}
     */
    createRenameHandlers(ctx) {
      const { store, deps } = ctx;
      const {
        SecurityUtils,
        debugLog,
        sanitizeFilename,
        PATH_SEPARATOR,
        Cc,
        Ci,
        scheduleCardRemoval,
        performAutohideSequence,
        updateUIForFocusedDownload,
        getMasterTooltip,
        migrateAIRenameKeys,
        fireCustomEvent
      } = deps;
      const {
        activeDownloadCards,
        orderedPodKeys,
        focusedKeyRef,
        renamedFiles,
        stickyPods,
        cardUpdateThrottle,
        dismissedPodsData,
        dismissedDownloads,
        progressPileListeners,
        progressPileKeyByDownload
      } = store;

      /**
       * @param {{ kind: string, oldKey?: string, podData?: Object }} payload
       */
      function notifyProgressPileRenameRekey(payload) {
        window.zenTidyDownloadsUtils.notifyListeners(
          progressPileListeners,
          payload,
          " (disk rename rekey)"
        );
      }

      /**
       * Pile row payload after on-disk rename (completed download, not in-progress pie row).
       * @param {Object} cardData
       * @param {string} newPath
       * @param {Object} download
       * @param {string} basenameForDisplay
       */
      function buildCompletedPilePodDataForRekey(cardData, newPath, download, basenameForDisplay) {
        const podElement = cardData.podElement;
        const filename =
          download.aiName || basenameForDisplay || cardData.originalFilename || "";
        const data = {
          key: newPath,
          filename,
          originalFilename: cardData.originalFilename,
          fileSize: download.currentBytes || download.totalBytes || 0,
          contentType: download.contentType,
          targetPath: newPath,
          downloadId: download.id != null ? download.id : undefined,
          sourceUrl: download.source?.url,
          startTime: download.startTime,
          endTime: download.endTime,
          dismissTime: Date.now(),
          inProgress: false,
          wasRenamed: !!download.aiName,
          previewData: null,
          dominantColor: podElement?.dataset?.dominantColor || null
        };
        if (podElement) {
          const previewContainer = podElement.querySelector(".card-preview-container");
          if (previewContainer) {
            const img = previewContainer.querySelector("img");
            data.previewData =
              window.zenTidyDownloadsUtils?.capturePilePreviewData?.(img) || { type: "icon" };
          }
        }
        return data;
      }

      function refreshCardSystemIcon(cardData, path) {
        const img = cardData?.podElement?.querySelector(".card-preview-container img");
        if (!img || !path) return;
        const src = img.src || "";
        if (src && !src.startsWith("moz-icon:")) return;
        const url = window.zenTidyDownloadsUtils?.fileIconUrl?.(path, 25);
        if (url) img.src = url;
      }

      /**
       * @param {string} oldKey
       * @param {string} newPath
       * @param {Object} download
       * @param {string} basenameForDisplay
       */
      function migrateDismissedSidecarKeys(oldKey, newPath, download, basenameForDisplay) {
        if (dismissedPodsData?.has(oldKey)) {
          const d = dismissedPodsData.get(oldKey);
          dismissedPodsData.delete(oldKey);
          d.key = newPath;
          d.targetPath = newPath;
          d.filename = download.aiName || basenameForDisplay || d.filename;
          d.wasRenamed = !!download.aiName;
          window.zenTidyDownloadsUtils?.forgetStaleIconPreview?.(d);
          dismissedPodsData.set(newPath, d);
        }
        if (dismissedDownloads?.has(oldKey)) {
          dismissedDownloads.delete(oldKey);
          dismissedDownloads.add(newPath);
        }
      }

      /**
       * @param {Object} download
       * @param {string} newName
       * @param {string} key
       * @returns {Promise<boolean>}
       */
      async function renameDownloadFileAndUpdateRecord(download, newName, key) {
        try {
          const oldPath = download.target.path;
          if (!oldPath) throw new Error("No file path available");

          const oldPathValidation = SecurityUtils.validateFilePath(oldPath, { strict: false });
          if (!oldPathValidation.valid) {
            debugLog(`Path validation warning for old path (continuing anyway): ${oldPathValidation.error}`, {
              path: oldPath,
              code: oldPathValidation.code
            });
          }

          const directory = oldPath.substring(0, oldPath.lastIndexOf(PATH_SEPARATOR));
          const oldFileName = oldPath.split(PATH_SEPARATOR).pop();
          const fileExt = oldFileName.includes(".")
            ? oldFileName.substring(oldFileName.lastIndexOf("."))
            : "";

          let cleanNewName = sanitizeFilename(newName);
          if (fileExt && !cleanNewName.endsWith(fileExt)) {
            cleanNewName = sanitizeFilename(cleanNewName + fileExt);
          }

          let finalName = cleanNewName;
          let counter = 1;
          while (counter < 100) {
            const testPath = directory + PATH_SEPARATOR + finalName;
            let exists = false;
            try {
              const testValidation = SecurityUtils.validateFilePath(testPath, { strict: false });
              if (!testValidation.valid) {
                debugLog(`Path validation warning in duplicate check (treating as non-existent): ${testValidation.error}`);
                break;
              }
              const testFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
              testFile.initWithPath(testPath);
              exists = testFile.exists();
            } catch (e) {
              if (e.message && e.message.includes("Invalid file path")) {
                break;
              }
            }
            if (!exists) break;

            const baseName = cleanNewName.includes(".")
              ? cleanNewName.substring(0, cleanNewName.lastIndexOf("."))
              : cleanNewName;
            finalName = `${baseName}-${counter}${fileExt}`;
            counter++;
          }

          const newPath = directory + PATH_SEPARATOR + finalName;

          const newPathValidation = SecurityUtils.validateFilePath(newPath, { strict: false });
          if (!newPathValidation.valid) {
            debugLog(`Path validation warning for new path (continuing anyway): ${newPathValidation.error}`, {
              path: newPath,
              code: newPathValidation.code
            });
          }
          debugLog("Rename paths", { oldPath, newPath });

          const oldFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          oldFile.initWithPath(oldPath);

          if (!oldFile.exists()) throw new Error("Source file does not exist");

          oldFile.moveTo(null, finalName);

          await window.zenTidyDownloadsFileOps.persistDownloadTargetPath(download, newPath, debugLog);

          const cardData = activeDownloadCards.get(key);
          refreshCardSystemIcon(cardData, newPath);
          if (cardData) {
            activeDownloadCards.delete(key);
            activeDownloadCards.set(newPath, cardData);
            cardData.key = newPath;
            if (cardData.podElement) {
              cardData.podElement.dataset.downloadKey = newPath;
              debugLog(`[Rename] Updated podElement.dataset.downloadKey to ${newPath}`);
            }
            const oldKeyIndex = orderedPodKeys.indexOf(key);
            if (oldKeyIndex > -1) {
              orderedPodKeys.splice(oldKeyIndex, 1, newPath);
              debugLog(`[Rename] Updated key in orderedPodKeys from ${key} to ${newPath}`);
            } else {
              debugLog(`[Rename] Warning: Old key ${key} not found in orderedPodKeys during rename.`);
            }

            if (cardData.autohideTimeoutId) {
              window.zenTidyDownloadsUtils?.clearCardTimers?.(cardData, {
                autohide: true,
                deferredSticky: false
              });
              debugLog(`[Rename] Cleared old autohide timeout for ${key}, rescheduling for ${newPath}`);
              scheduleCardRemoval(newPath);
            }

            debugLog(`Updated card key mapping from ${key} to ${newPath}`);

            if (typeof migrateAIRenameKeys === "function") {
              migrateAIRenameKeys(key, newPath);
            }
            if (stickyPods?.has(key)) {
              stickyPods.delete(key);
              stickyPods.add(newPath);
            }
            const throttledAt = cardUpdateThrottle?.get(key);
            if (throttledAt != null && cardUpdateThrottle) {
              cardUpdateThrottle.delete(key);
              cardUpdateThrottle.set(newPath, throttledAt);
            }

            if (focusedKeyRef.current === key) {
              focusedKeyRef.current = newPath;
            }
            progressPileKeyByDownload?.set(download, newPath);
            notifyProgressPileRenameRekey({
              kind: "rekey",
              oldKey: key,
              podData: buildCompletedPilePodDataForRekey(cardData, newPath, download, finalName)
            });
          }

          const hadDismissedSidecar = dismissedPodsData?.has(key) === true;
          migrateDismissedSidecarKeys(key, newPath, download, finalName);
          if (
            hadDismissedSidecar &&
            typeof fireCustomEvent === "function" &&
            dismissedPodsData?.has(newPath)
          ) {
            const podData = dismissedPodsData.get(newPath);
            fireCustomEvent("pod-dismissed-updated", {
              oldKey: key,
              newKey: newPath,
              podData
            });
          }

          debugLog("File renamed successfully");
          return true;
        } catch (e) {
          const errorInfo = {
            name: e.name || "Error",
            message: e.message || e.toString() || "Unknown error",
            oldPath: download?.target?.path,
            newName,
            key
          };

          console.error(`Rename failed: ${errorInfo.name}: ${errorInfo.message}`, errorInfo);
          debugLog(`Rename failed: ${errorInfo.name}: ${errorInfo.message}`, {
            oldPath: errorInfo.oldPath,
            newName: errorInfo.newName
          });
          return false;
        }
      }

      /**
       * @param {string} keyOfAIRenamedFile
       * @param {{ skipAutohideAfterSuccess?: boolean }} [opts]
       * @returns {Promise<boolean>}
       */
      async function undoRename(keyOfAIRenamedFile, opts = {}) {
        const { skipAutohideAfterSuccess = false } = opts;
        debugLog("[UndoRename] Attempting to undo rename for key:", keyOfAIRenamedFile);
        const cardData = activeDownloadCards.get(keyOfAIRenamedFile);

        if (!cardData || !cardData.download) {
          debugLog("[UndoRename] No cardData or download object found for key:", keyOfAIRenamedFile);
          return false;
        }

        const currentAIRenamedPath = cardData.download.target.path;
        const originalSimpleName = cardData.trueOriginalSimpleNameBeforeAIRename;
        const originalFullPath = cardData.trueOriginalPathBeforeAIRename;

        if (!currentAIRenamedPath || !originalSimpleName || !originalFullPath) {
          debugLog("[UndoRename] Missing path/name information for undo:", {
            currentAIRenamedPath,
            originalSimpleName,
            originalFullPath
          });
          return false;
        }

        const targetDirectory = currentAIRenamedPath.substring(
          0,
          currentAIRenamedPath.lastIndexOf(PATH_SEPARATOR)
        );
        const targetOriginalPath = targetDirectory + PATH_SEPARATOR + originalSimpleName;

        debugLog("[UndoRename] Details:", {
          currentPath: currentAIRenamedPath,
          originalSimple: originalSimpleName,
          originalFullPathStored: originalFullPath,
          targetOriginalPathForRename: targetOriginalPath
        });

        try {
          const undoPathValidation = SecurityUtils.validateFilePath(currentAIRenamedPath, { strict: false });
          if (!undoPathValidation.valid) {
            debugLog("[UndoRename] Path validation warning", {
              path: currentAIRenamedPath,
              error: undoPathValidation.error,
              code: undoPathValidation.code
            });
          }

          const fileToUndo = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          fileToUndo.initWithPath(currentAIRenamedPath);

          if (!fileToUndo.exists()) {
            debugLog("[UndoRename] File to undo does not exist at current path:", currentAIRenamedPath);
            const masterTooltipDOMElement = getMasterTooltip();
            if (masterTooltipDOMElement) {
              const undoBtn = masterTooltipDOMElement.querySelector(".card-undo-button");
              if (undoBtn) undoBtn.style.display = "none";
            }
            return false;
          }

          fileToUndo.moveTo(null, originalSimpleName);
          debugLog(
            `[UndoRename] File moved from ${currentAIRenamedPath} to ${targetOriginalPath} (using simple name ${originalSimpleName})`
          );

          await window.zenTidyDownloadsFileOps.persistDownloadTargetPath(
            cardData.download,
            targetOriginalPath,
            debugLog
          );
          refreshCardSystemIcon(cardData, targetOriginalPath);
          cardData.download.aiName = null;
          cardData.originalFilename = originalSimpleName;

          if (keyOfAIRenamedFile !== targetOriginalPath) {
            activeDownloadCards.delete(keyOfAIRenamedFile);
            activeDownloadCards.set(targetOriginalPath, cardData);
            cardData.key = targetOriginalPath;
            if (cardData.podElement) cardData.podElement.dataset.downloadKey = targetOriginalPath;

            const oldKeyIndex = orderedPodKeys.indexOf(keyOfAIRenamedFile);
            if (oldKeyIndex > -1) {
              orderedPodKeys.splice(oldKeyIndex, 1, targetOriginalPath);
            }

            if (focusedKeyRef.current === keyOfAIRenamedFile) {
              focusedKeyRef.current = targetOriginalPath;
            }
            debugLog(
              `[UndoRename] Updated activeDownloadCards map key from ${keyOfAIRenamedFile} to ${targetOriginalPath}`
            );

            if (typeof migrateAIRenameKeys === "function") {
              migrateAIRenameKeys(keyOfAIRenamedFile, targetOriginalPath);
            }
            if (stickyPods?.has(keyOfAIRenamedFile)) {
              stickyPods.delete(keyOfAIRenamedFile);
              stickyPods.add(targetOriginalPath);
            }
            const throttledUndo = cardUpdateThrottle?.get(keyOfAIRenamedFile);
            if (throttledUndo != null && cardUpdateThrottle) {
              cardUpdateThrottle.delete(keyOfAIRenamedFile);
              cardUpdateThrottle.set(targetOriginalPath, throttledUndo);
            }

            migrateDismissedSidecarKeys(keyOfAIRenamedFile, targetOriginalPath, cardData.download, originalSimpleName);
            progressPileKeyByDownload?.set(cardData.download, targetOriginalPath);
            notifyProgressPileRenameRekey({
              kind: "rekey",
              oldKey: keyOfAIRenamedFile,
              podData: buildCompletedPilePodDataForRekey(
                cardData,
                targetOriginalPath,
                cardData.download,
                originalSimpleName
              )
            });
          }

          renamedFiles.delete(originalFullPath);
          renamedFiles.delete(currentAIRenamedPath);

          const masterTooltipDOMElement = getMasterTooltip();
          if (focusedKeyRef.current === targetOriginalPath && masterTooltipDOMElement) {
            const titleEl = masterTooltipDOMElement.querySelector(".card-title");
            const statusEl = masterTooltipDOMElement.querySelector(".card-status");
            const originalFilenameEl = masterTooltipDOMElement.querySelector(".card-original-filename");
            const progressEl = masterTooltipDOMElement.querySelector(".card-progress");
            const undoBtn = masterTooltipDOMElement.querySelector(".card-undo-button");

            if (titleEl) titleEl.textContent = originalSimpleName;
            if (statusEl) {
              statusEl.textContent = "Download completed";
              statusEl.style.color = "#1dd1a1";
            }
            if (originalFilenameEl) originalFilenameEl.style.display = "none";
            if (progressEl) progressEl.style.display = "block";
            if (undoBtn) undoBtn.style.display = "none";
          }

          updateUIForFocusedDownload(focusedKeyRef.current || targetOriginalPath, true);

          const revertedCardData = activeDownloadCards.get(targetOriginalPath);

          if (revertedCardData) {
            window.zenTidyDownloadsUtils?.clearCardTimers?.(revertedCardData, {
              autohide: true,
              deferredSticky: false
            });
          }

          if (!skipAutohideAfterSuccess) {
            const shortDelay = 2000;

            debugLog(`[UndoRename] Scheduling immediate dismissal in ${shortDelay}ms`);
            if (revertedCardData) {
              revertedCardData.autohideTimeoutId = setTimeout(() => {
                performAutohideSequence(targetOriginalPath);
              }, shortDelay);
            }
          }

          debugLog("[UndoRename] Rename undone successfully.");
          return true;
        } catch (e) {
          debugLog("[UndoRename] Error during undo rename process:", e);
          const masterTooltipDOMElement = getMasterTooltip();
          if (masterTooltipDOMElement && focusedKeyRef.current === keyOfAIRenamedFile) {
            const statusEl = masterTooltipDOMElement.querySelector(".card-status");
            if (statusEl) {
              statusEl.textContent = "Undo rename failed";
              statusEl.style.color = "#ff6b6b";
            }
          }
          return false;
        }
      }

      return {
        renameDownloadFileAndUpdateRecord,
        undoRename
      };
    }
  };
})();
