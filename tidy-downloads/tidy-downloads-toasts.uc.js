// ==UserScript==
// @include   main
// @ignorecache
// ==/UserScript==

// tidy-downloads toasts module
// Toast notifications for Zen Tidy Downloads - requires #zen-toast-container (from Zen theme)
(function () {
    "use strict";
  
    if (location.href !== "chrome://browser/content/browser.xhtml") return;
  
    function showSimpleToast(message) {
      const container = document.getElementById('zen-toast-container');
      if (!container) return;
  
      const wrapper = document.createXULElement('hbox');
      wrapper.classList.add('zen-toast');
      wrapper.style.alignItems = "center";
      wrapper.style.padding = "10px 16px";
  
      const label = document.createXULElement('label');
      label.textContent = message;
      label.style.margin = "0";
      wrapper.appendChild(label);
  
      container.removeAttribute('hidden');
      container.appendChild(wrapper);
  
      if (!wrapper.style.transform) wrapper.style.transform = 'scale(0)';
      if (window.gZenUIManager && window.gZenUIManager.motion) {
        window.gZenUIManager.motion.animate(wrapper, { scale: 1 }, { type: 'spring', bounce: 0.2, duration: 0.5 });
      } else {
        wrapper.style.transform = 'scale(1)';
      }
  
      const remove = () => {
        if (window.gZenUIManager && window.gZenUIManager.motion) {
          window.gZenUIManager.motion.animate(wrapper, { opacity: [1, 0], scale: [1, 0.5] }, { duration: 0.2, bounce: 0 })
            .then(() => {
              wrapper.remove();
              if (container.children.length === 0) container.setAttribute('hidden', true);
            });
        } else {
          wrapper.remove();
          if (container.children.length === 0) container.setAttribute('hidden', true);
        }
      };
  
      setTimeout(remove, 3000);
    }
  
    function showRenameToast(newName, oldName, onUndo) {
      const container = document.getElementById('zen-toast-container');
      if (!container) return null;
  
      const wrapper = document.createXULElement('hbox');
      wrapper.style.position = "relative";
      wrapper.style.overflow = "visible";
      wrapper.style.alignItems = "start";
      wrapper.style.height = "auto";
      wrapper.style.minHeight = "fit-content";
  
      const contentBox = document.createXULElement('vbox');
      contentBox.style.padding = "4px";
      contentBox.style.width = "100%";
      contentBox.style.maxWidth = "100%";
  
      const titleLabel = document.createXULElement('label');
      titleLabel.textContent = "Download renamed !";
      titleLabel.style.fontSize = "0.85em";
      titleLabel.style.opacity = "0.7";
      titleLabel.style.marginBottom = "2px";
  
      const newNameLabel = document.createXULElement('label');
      newNameLabel.textContent = newName;
      newNameLabel.style.fontWeight = "bold";
      newNameLabel.style.fontSize = "1.1em";
      newNameLabel.style.marginBottom = "1px";
      newNameLabel.style.whiteSpace = "nowrap";
      newNameLabel.style.overflow = "hidden";
      newNameLabel.style.textOverflow = "ellipsis";
      newNameLabel.style.width = "100%";
      newNameLabel.style.display = "block";
  
      const oldNameLabel = document.createXULElement('label');
      oldNameLabel.textContent = oldName;
      oldNameLabel.style.textDecoration = "line-through";
      oldNameLabel.style.opacity = "0.6";
      oldNameLabel.style.fontSize = "0.9em";
      oldNameLabel.style.whiteSpace = "nowrap";
      oldNameLabel.style.overflow = "hidden";
      oldNameLabel.style.textOverflow = "ellipsis";
      oldNameLabel.style.width = "90%";
      oldNameLabel.style.display = "block";
  
      contentBox.appendChild(titleLabel);
      contentBox.appendChild(newNameLabel);
      contentBox.appendChild(oldNameLabel);
      wrapper.appendChild(contentBox);
  
      let dismissToast = null;
  
      if (onUndo) {
        const pill = document.createElement('div');
        pill.style.cssText = `
          position: absolute;
          bottom: -28px;
          right: 0;
          background: var(--zen-primary-color, #0060df);
          color: white;
          border-radius: 9999px;
          padding: 4px 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s;
          font-size: 12px;
          font-weight: 600;
        `;
  
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 52 52");
        icon.style.width = "14px";
        icon.style.height = "14px";
        icon.style.fill = "currentColor";
  
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M30.3,12.6c10.4,0,18.9,8.4,18.9,18.9s-8.5,18.9-18.9,18.9h-8.2c-0.8,0-1.3-0.6-1.3-1.4v-3.2c0-0.8,0.6-1.5,1.4-1.5h8.1c7.1,0,12.8-5.7,12.8-12.8s-5.7-12.8-12.8-12.8H16.4c0,0-0.8,0-1.1,0.1c-0.8,0.4-0.6,1,0.1,1.7l4.9,4.9c0.6,0.6,0.5,1.5-0.1,2.1L18,29.7c-0.6,0.6-1.3,0.6-1.9,0.1l-13-13c-0.5-0.5-0.5-1.3,0-1.8L16,2.1c0.6-0.6,1.6-0.6,2.1,0l2.1,2.1c0.6,0.6,0.6,1.6,0,2.1l-4.9,4.9c-0.6,0.6-0.6,1.3,0.4,1.3c0.3,0,0.7,0,0.7,0L30.3,12.6z");
        icon.appendChild(path);
  
        const text = document.createElement('span');
        text.textContent = "Undo";
  
        pill.appendChild(icon);
        pill.appendChild(text);
  
        const btnWrapper = document.createXULElement('box');
        btnWrapper.appendChild(pill);
  
        pill.addEventListener('mouseover', () => {
          pill.style.transform = "scale(1.05)";
          pill.style.filter = "brightness(1.1)";
        });
        pill.addEventListener('mouseout', () => {
          pill.style.transform = "scale(1)";
          pill.style.filter = "brightness(1)";
        });
  
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          onUndo(dismissToast);
        });
  
        wrapper.appendChild(btnWrapper);
      }
  
      wrapper.classList.add('zen-toast');
      wrapper.style.cssText = `
        height: 85px !important;
        max-height: none !important;
        min-height: fit-content !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        padding: 8px !important;
        width: 300px !important; 
        max-width: 300px !important;
      `;
  
      container.style.height = "auto";
      container.style.maxHeight = "none";
      container.removeAttribute("hidden");
      container.appendChild(wrapper);
  
      if (!wrapper.style.transform) wrapper.style.transform = 'scale(0)';
  
      if (window.gZenUIManager && window.gZenUIManager.motion) {
        window.gZenUIManager.motion.animate(wrapper, { scale: 1 }, { type: 'spring', bounce: 0.2, duration: 0.5 });
      } else {
        wrapper.style.transform = 'scale(1)';
      }
  
      const timeoutDuration = 5000;
      let isDismissed = false;
  
      dismissToast = () => {
        if (isDismissed) return;
        isDismissed = true;
        if (timeoutId) clearTimeout(timeoutId);
  
        if (window.gZenUIManager && window.gZenUIManager.motion) {
          window.gZenUIManager.motion.animate(wrapper, { opacity: [1, 0], scale: [1, 0.5] }, { duration: 0.2, bounce: 0 })
            .then(() => {
              wrapper.remove();
              if (container.children.length === 0) container.setAttribute('hidden', true);
            });
        } else {
          wrapper.remove();
          if (container.children.length === 0) container.setAttribute('hidden', true);
        }
      };
  
      const autoRemove = () => dismissToast();
      let timeoutId = setTimeout(autoRemove, timeoutDuration);
  
      wrapper.addEventListener('mouseover', () => clearTimeout(timeoutId));
      wrapper.addEventListener('mouseout', () => {
        if (!isDismissed) timeoutId = setTimeout(autoRemove, timeoutDuration);
      });
  
      return { dismiss: dismissToast };
    }
  
    window.zenTidyDownloadsToasts = { showSimpleToast, showRenameToast };
    console.log("[Zen Tidy Downloads] Toasts module loaded");
  })();
  