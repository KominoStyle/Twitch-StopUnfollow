// ==UserScript==
// @name         Twitch: Stop Unfollow
// @namespace    http://tampermonkey.net/
// @version      1.54
// @description  Inserts “Stop Unfollow” under avatar→Settings. Disables “Unfollow” on saved channels without reloading!
// @match        https://www.twitch.tv/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.twitch.tv
// @connect      raw.githubusercontent.com
// @connect      passport.twitch.tv
// @updateURL    https://raw.githubusercontent.com/KominoStyle/Twitch-StopUnfollow/main/StopUnfollow.user.js
// @downloadURL  https://raw.githubusercontent.com/KominoStyle/Twitch-StopUnfollow/main/StopUnfollow.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict'

  const RAW_URL = 'https://raw.githubusercontent.com/KominoStyle/Twitch-StopUnfollow/main/StopUnfollow.user.js'
  let latestVersion = null

  function compareVersions(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na > nb) return 1
      if (na < nb) return -1
    }
    return 0
  }

  function checkForUpdates() {
    if (typeof GM?.xmlHttpRequest !== 'function' && typeof GM_xmlhttpRequest !== 'function') return
    const cur = GM_info?.script?.version
    if (!cur) return

    GM.xmlHttpRequest({
      method: 'GET',
      url: RAW_URL + '?_=' + Date.now(),
      anonymous: true,
      headers: { 'Cache-Control': 'no-cache' },
      onload(res) {
        if (res.status !== 200) return
        const match = res.responseText.match(/@version\s+([\d.]+)/)
        if (match && compareVersions(match[1], cur) > 0) {
          latestVersion = match[1]
          showUpdatePrompt()
        }
      }
    })
  }

  checkForUpdates()

  GM_addStyle(`
    button[data-a-target="unfollow-button"].tm-blocked:hover {
      filter: brightness(0.8);
    }
  `)

  function blockDisabledUnfollow(e) {
    const btn = e.target.closest && e.target.closest('button[data-a-target="unfollow-button"]')
    if (btn && btn.__tmBlocked) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }
  ;['pointerover', 'pointerdown', 'click'].forEach(ev => {
    window.addEventListener(ev, blockDisabledUnfollow, true)
  })

  function showUpdatePrompt() {
    const panel = document.getElementById('tm-lock-panel')
    const container = document.getElementById('tm-update-prompt')
    const link = document.getElementById('tm-update-link')
    if (!panel || !container || !link || !latestVersion) return
    link.textContent = `Install v${latestVersion}`
    link.href = RAW_URL
    container.style.display = 'block'
  }

  //////////////////////////////
  // 1) domObserver Helper
  //////////////////////////////
  const domObserver = {
    on(selector, callback) {
      if (document.querySelector(selector)) {
        callback()
      }
      const obs = new MutationObserver(function handleMutations(mutations) {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue
            if (node.matches(selector) || node.querySelector(selector)) {
              callback()
              return
            }
          }
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      return obs
    }
  }

  // Remove unfollow confirmation modal buttons
  domObserver.on('button[data-a-target="modal-unfollow-button"]', () => {
    document
      .querySelectorAll('button[data-a-target="modal-unfollow-button"]')
      .forEach(btn => {
        const modal = btn.closest('.tw-modal')
        if (modal) {
          modal.querySelectorAll('button').forEach(b => b.remove())
          const msg = document.createElement('div')
          msg.textContent = 'Not Today! U Use Stop-Unfollow.'
          msg.style.padding = '16px'
          msg.style.textAlign = 'center'
          modal.appendChild(msg)
        } else {
          btn.remove()
        }
      })
  })

  //////////////////////////////
  // 2) Storage Helpers
  //////////////////////////////
  const STORAGE_KEY_CHANNELS = 'lockedTwitchChannels'
  function getLockedChannels() {
    const raw = GM_getValue(STORAGE_KEY_CHANNELS)
    return Array.isArray(raw) ? raw : []
  }
  function setLockedChannels(list) {
    GM_setValue(STORAGE_KEY_CHANNELS, list)
  }

  // Helper to verify if a Twitch username exists
  function checkTwitchUser(username) {
    const clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
    return new Promise(resolve => {
      GM.xmlHttpRequest({
        method: 'GET',
        url: `https://passport.twitch.tv/usernames/${encodeURIComponent(username)}?client_id=${clientId}`,
        headers: { 'Client-ID': clientId },
        onload: res => {
          console.log('checkTwitchUser status', res.status, 'for', username)
          if (res.status === 200) {
            resolve(true) // Username exists
          } else if (res.status === 204) {
            resolve(false) // Username not found
          } else {
            console.warn('Unexpected status checking username:', res.status)
            resolve(null)
          }
        },
        onerror: err => {
          console.warn('Error checking username:', err)
          resolve(null)
        }
      })
    })
  }

  //////////////////////////////
  // 3) “Unfollow” Button Logic
  //////////////////////////////
  function getCurrentChannel() {
    const parts = window.location.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean)
    return parts.length ? parts[parts.length - 1].toLowerCase() : ''
  }

  function getButtonChannel(btn) {
    const label = btn.getAttribute('aria-label') || ''
    const match = label.match(/^([^\s]+)/)
    if (match) return match[1].toLowerCase()
    return getCurrentChannel()
  }

  function applyUnfollowDisabled(btn) {
    if (btn.__tmBlocked) return
    function handleBlockedClick(e) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    btn.__tmBlocked = handleBlockedClick
    btn.addEventListener('click', handleBlockedClick, true)
    btn.disabled = true
    btn.classList.add('tm-blocked')
    btn.setAttribute('title', 'Disabled to prevent unfollow.')
    btn.style.opacity = '0.5'
    btn.style.cursor = 'not-allowed'
  }

  function disableUnfollowIfSaved() {
    const saved = getLockedChannels().map(c => c.toLowerCase())
    const poll = setInterval(() => {
      const buttons = document.querySelectorAll('button[data-a-target="unfollow-button"]')
      if (!buttons.length) return
      let disabledAny = false
      buttons.forEach(btn => {
        const channel = getButtonChannel(btn)
        if (saved.includes(channel)) {
          applyUnfollowDisabled(btn)
          disabledAny = true
        }
      })
      if (disabledAny) clearInterval(poll)
    }, 200)
  }

  function enableUnfollowIfPresent() {
    const buttons = document.querySelectorAll('button[data-a-target="unfollow-button"]')
    buttons.forEach(btn => {
      if (btn.__tmBlocked) {
        btn.removeEventListener('click', btn.__tmBlocked, true)
        delete btn.__tmBlocked
      }
      btn.classList.remove('tm-blocked')
      btn.disabled = false
      btn.removeAttribute('title')
      btn.style.opacity = ''
      btn.style.cursor = ''
    })
  }


  //////////////////////////////
  // 4) Header Lock Icon
  //////////////////////////////
  function injectHeaderLockIcon() {
    const saved = getLockedChannels().map(c => c.toLowerCase())
    const buttons = document.querySelectorAll('button[data-a-target="unfollow-button"]')
    buttons.forEach(btn => {
      const channel = getButtonChannel(btn)
      const isSaved = saved.includes(channel)
      const lockIcon = btn.querySelector('#tm-header-lock-icon')
      const defaultIcon = btn.querySelector('svg:not(#tm-header-lock-icon)')
      if (!isSaved || !defaultIcon) {
        if (lockIcon) {
          lockIcon.remove()
          if (defaultIcon) defaultIcon.style.display = ''
        }
        return
      }
      if (lockIcon) return
      defaultIcon.style.display = 'none'
      const svgNS = 'http://www.w3.org/2000/svg'
      const icon = document.createElementNS(svgNS, 'svg')
      icon.id = 'tm-header-lock-icon'
      icon.setAttribute('width', defaultIcon.getAttribute('width') || '20')
      icon.setAttribute('height', defaultIcon.getAttribute('height') || '20')
      icon.setAttribute('viewBox', '0 0 20 20')
      icon.setAttribute('fill', '#efeff1')
      icon.title = 'Unfollow disabled for this channel'
      icon.innerHTML = `
        <path fill-rule="evenodd" d="M14.001 5.99A3.992 3.992 0 0 0 10.01 2h-.018a3.992 3.992 0 0 0-3.991 3.99V8H3.999v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8h-1.998V5.99zm-2 2.01V5.995A1.996 1.996 0 0 0 10.006 4h-.01a1.996 1.996 0 0 0-1.995 1.995V8h4z" clip-rule="evenodd"></path>
      `
      if (defaultIcon.parentNode) {
        defaultIcon.parentNode.insertBefore(icon, defaultIcon)
      }
    })
  }

  //////////////////////////////
  // 5) Build “Stop Unfollow” Modal
  //////////////////////////////
  let sortMode = 'latest'
  let selectionMode = false
  let settingsObserver
  let followObserver
  function buildPanel() {
    if (document.getElementById('tm-lock-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'tm-lock-panel';
    panel.classList.add('floating-lock-panel');
    panel.style.display = 'none';
    document.body.appendChild(panel);

    GM_addStyle(`
      /* Modal container */
      #tm-lock-panel.floating-lock-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 340px;
        max-height: 540px;
        background: rgba(0,0,0,0.90);
        color: #fff;
        font-family: sans-serif;
        font-size: 13px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .tm-version {
        position: absolute;
        top: 29px;
        left: 14px;
        font-size: 12px;
        pointer-events: none;
        font-family: 'Brush Script MT', serif;
      }
      /* Header */
      #tm-lock-panel .tm-header {
        background: #18181b;
        padding: 8px 12px;
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #tm-lock-panel .tm-header .tm-title {
        color: #fff;
        font-size: 14px;
        font-weight: 600;
      }
      #tm-lock-panel .tm-header .tm-close-btn {
        background: transparent;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
      }
      #tm-lock-panel .tm-header .tm-close-btn:hover {
        color: #fff;
      }
      /* Toast */
      #tm-toast {
        position: absolute;
        top: 44px;
        left: 50%;
        transform: translateX(-50%);
        min-width: 80px;
        max-width: 280px;
        padding: 6px 12px;
        border-radius: 4px;
        background: rgba(40,40,40,0.9);
        color: #fff;
        font-size: 13px;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        z-index: 10;
      }
      #tm-toast.red { background: #d73a49; }
      #tm-toast.green { background: #28a745; }
      #tm-toast.show { animation: fadeinout 2.5s forwards; }
      @keyframes fadeinout {
        0%   { opacity: 0; transform: translate(-50%,-10px); }
        10%  { opacity: 1; transform: translate(-50%,0); }
        85%  { opacity: 1; transform: translate(-50%,0); }
        100% { opacity: 0; transform: translate(-50%,-10px); }
      }
      /* Body */
      .tm-body {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        overflow: hidden;
      }
      /* Add Section */
      .tm-add-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 12px;
        background: #0e0e10;
        border-bottom: 1px solid #333;
      }
      .tm-add-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .tm-import-export {
        display: flex;
        gap: 6px;
      }
      #tm-import-btn {
        background: #1e69ff;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      #tm-import-btn:hover { background: #0d5fe4; }
      #tm-export-btn {
        background: #28a745;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      #tm-export-btn:hover { background: #218838; }
      .tm-add-controls {
        display: flex;
        gap: 6px;
      }
      .tm-add-controls input[type="text"] {
        flex-grow: 1;
        padding: 6px 8px;
        border: 1px solid #555;
        border-radius: 4px;
        background: #222;
        color: #fff;
        font-size: 13px;
      }
      .tm-add-controls button.add-btn {
        background: #28a745;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .tm-add-controls button.add-btn:hover {
        background: #218838;
      }
      .tm-add-controls button.import-btn {
        background: #555;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .tm-add-controls button.import-btn:hover {
        background: #666;
      }
      .tm-add-current {
        background: #444;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .tm-add-current.green { background: #28a745; }
      .tm-add-current.green:hover { background: #218838; }
      .tm-add-current.red { background: #d73a49; }
      .tm-add-current.red:hover { background: #c5303e; }
      /* List Header */
      .tm-list-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 12px;
        background: #0e0e10;
        border-bottom: 1px solid #333;
      }
      .tm-list-top {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tm-list-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .tm-search-wrapper {
        position: relative;
        flex-grow: 1;
      }
      .tm-search-wrapper svg {
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        width: 14px;
        height: 14px;
        fill: #888;
      }
      .tm-search-wrapper input[type="text"] {
        width: 100%;
        padding: 6px 28px 6px 28px;
        border: none;
        border-radius: 4px;
        background: rgba(255,255,255,0.08);
        color: #fff;
        font-size: 13px;
      }
      .tm-search-wrapper input::placeholder {
        color: rgba(255,255,255,0.65);
      }
      .tm-clear-btn {
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        font-size: 12px;
        color: rgba(255,255,255,0.65);
        cursor: pointer;
        display: none;
        user-select: none;
      }
      .tm-clear-btn:hover { color: #fff; }
      /* Sort select */
      #tm-sort-select {
        background: #222;
        border: 1px solid #555;
        color: #fff;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
      }
      /* Action mode toggle */
      #tm-action-toggle {
        background: #9147ff;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      #tm-action-toggle:hover { background: #772ce8; }
      #tm-action-toggle.cancel { background: #444; }
      #tm-action-toggle.cancel:hover { background: #555; }
      /* Delete selected button */
      #tm-delete-selected {
        background: #d73a49;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        align-self: flex-end;
      }
      #tm-delete-selected:hover { background: #c5303e; }
      /* Multi-select checkboxes */
      .tm-select-checkbox { display: none; margin-right: 6px; cursor: pointer; }
      #tm-locked-list.selection-mode .tm-select-checkbox { display: inline-block; }
      #tm-sort-select option { background: #0e0e10; color: #fff; }
      /* Channel List */
      .tm-list {
        flex-grow: 1;
        overflow-y: auto;
        padding: 8px 12px;
        background: #0e0e10;
      }
      .tm-list ul { list-style: none; padding: 0; margin: 0; }
      .tm-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid #333;
        font-size: 13px;
      }
      .tm-select-checkbox {
        margin-right: 6px;
        cursor: pointer;
      }
      .tm-list li button.remove-btn {
        background: transparent;
        border: none;
        color: #e07a5f;
        cursor: pointer;
        font-size: 12px;
      }
      .tm-list li button.remove-btn:hover { color: #f28482; }
      /* Under-construction overlay */
      .tm-add-controls.under-construction {
        position: relative;
        pointer-events: none;
      }
      .tm-add-controls.under-construction::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: repeating-linear-gradient(135deg, #ffff0080 0, #ffff0080 15px, black 15px, black 30px);
        opacity: 1;
        z-index: 1;
      }
      .tm-add-controls.under-construction::after {
        content: "UNDER CONSTRUCTION";
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        color: #fff;
        font-size: 20px;
        font-weight: bold;
        white-space: nowrap;
        z-index: 2;
      }
      /* Avatar dropdown menu styles (built in) */
      .tmMenuWrapper { padding: 2px 0; }
      .tmMenuItem { display: block; color: inherit; text-decoration: none; }
      .tmMenuItem:link,
      .tmMenuItem:visited,
      .tmMenuItem:hover,
      .tmMenuItem:active {
        color: inherit;
        text-decoration: none;
      }
      .tmMenuItem .tmMenuContainer {
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
        position: relative !important;
        padding: 0.5rem !important;
        border-radius: 4px;
      }
      .tmMenuItem:hover .tmMenuContainer {
        background: rgba(255,255,255,0.1);
      }
      .tmDropdownIconContainer {
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
        padding-inline-end: 0.5rem !important;
        flex-shrink: 0 !important;
      }
      .tmDropdownIcon,
      .tm-dropdown-icon-aspect,
      .tm-dropdown-icon-spacer,
      .tmStopUnfollowIcon {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tm-dropdown-label { font-size: 14px; }
    `);

    // Header
  const header = document.createElement('div'); header.className = 'tm-header';
  const title = document.createElement('span'); title.className = 'tm-title'; title.textContent = 'Saved Channels (Count: 0)';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tm-close-btn';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = '&times;';
  function handleClosePanel() { panel.style.display = 'none' }
  closeBtn.addEventListener('click', handleClosePanel);
  header.append(title, closeBtn);
  panel.append(header);
  const updatePrompt = document.createElement('div');
  updatePrompt.id = 'tm-update-prompt';
  updatePrompt.style.display = 'none';
  updatePrompt.style.background = '#1e69ff';
  updatePrompt.style.color = '#fff';
  updatePrompt.style.padding = '6px 10px';
  updatePrompt.style.fontSize = '13px';
  updatePrompt.style.textAlign = 'center';
  const updateLink = document.createElement('a');
  updateLink.id = 'tm-update-link';
  updateLink.target = '_blank';
  updateLink.style.color = '#fff';
  updateLink.style.textDecoration = 'underline';
  updatePrompt.append('Update available: ', updateLink);
  panel.append(updatePrompt);
  const versionDiv = document.createElement('div');
  versionDiv.className = 'tm-version';
  versionDiv.textContent = `v${GM_info?.script?.version}`;
  header.append(versionDiv);
  makeDraggable(panel, header);

    // Toast
    const toast = document.createElement('div'); toast.id = 'tm-toast'; panel.append(toast);

    // Body
    const body = document.createElement('div'); body.className = 'tm-body'; panel.append(body);

    // Add Section
    const addSection = document.createElement('div'); addSection.className = 'tm-add-section';
    const controls = document.createElement('div'); controls.className = 'tm-add-controls';
    const input = document.createElement('input'); input.type = 'text'; input.id = 'tm-channel-input'; input.placeholder = 'e.g. streamername';
    const addBtn = document.createElement('button'); addBtn.className = 'add-btn'; addBtn.id = 'tm-add-btn'; addBtn.textContent = 'Add';
    controls.append(input, addBtn);
    const addCurrent = document.createElement('button');
    addCurrent.className = 'tm-add-current';
    addCurrent.id = 'tm-add-current';
    addCurrent.textContent = '+ Add Current Channel';
    const actionToggle = document.createElement('button');
    actionToggle.id = 'tm-action-toggle';
    actionToggle.textContent = 'Action';
    const addActions = document.createElement('div');
    addActions.className = 'tm-add-actions';
    addActions.append(addCurrent, actionToggle);
    addSection.append(controls, addActions);
    body.append(addSection);

    // List Header
    const listHeader = document.createElement('div'); listHeader.className = 'tm-list-header';
    const searchWrapper = document.createElement('div'); searchWrapper.className = 'tm-search-wrapper';
    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('viewBox', '0 0 512 512');
    searchIcon.setAttribute('width', '14');
    searchIcon.setAttribute('height', '14');
    const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    searchPath.setAttribute(
      'd',
      'M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z'
    );
    searchIcon.appendChild(searchPath);
    const searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.id = 'tm-search-input'; searchInput.placeholder = 'Search…';
    const clearBtn = document.createElement('span'); clearBtn.id = 'tm-clear-btn'; clearBtn.className = 'tm-clear-btn'; clearBtn.textContent = '✕';
    searchWrapper.append(searchIcon, searchInput, clearBtn);
    const sortSelect = document.createElement('select'); sortSelect.id = 'tm-sort-select';
    ['latest','first','alpha-asc','alpha-desc'].forEach(val => {
      const opt = document.createElement('option'); opt.value = val;
      opt.textContent = val === 'latest' ? 'Latest' : val === 'first' ? 'First' : val === 'alpha-asc' ? 'A→Z' : 'Z→A';
      if (val === sortMode) opt.selected = true;
      sortSelect.append(opt);
    });
    const listTop = document.createElement('div');
    listTop.className = 'tm-list-top';
    listTop.append(searchWrapper, sortSelect);

    const deleteSelected = document.createElement('button');
    deleteSelected.id = 'tm-delete-selected';
    deleteSelected.textContent = 'Delete Selected';
    deleteSelected.style.display = 'none';

    const importBtn = document.createElement('button');
    importBtn.id = 'tm-import-btn';
    importBtn.textContent = 'Import';
    importBtn.style.display = 'none';
    const exportBtn = document.createElement('button');
    exportBtn.id = 'tm-export-btn';
    exportBtn.textContent = 'Export';
    exportBtn.style.display = 'none';

    const listActions = document.createElement('div');
    listActions.className = 'tm-list-actions';
    const importExport = document.createElement('div');
    importExport.className = 'tm-import-export';
    importExport.append(importBtn, exportBtn);
    listActions.append(importExport, deleteSelected);

    listHeader.append(listTop, listActions);
    body.append(listHeader);

    // List
    const listDiv = document.createElement('div'); listDiv.className = 'tm-list';
    const ul = document.createElement('ul'); ul.id = 'tm-locked-list'; listDiv.append(ul);
    body.append(listDiv);

    // Event bindings
    async function handleAddButtonClick() { await onAddByText() }
    async function handleAddCurrentClick() { await onAddCurrent() }
    function handleSearchInputChange() {
      clearBtn.style.display = searchInput.value ? 'block' : 'none'
      refreshListUI()
      applySearchFilter()
    }
    function handleClearSearchClick() {
      searchInput.value = ''
      clearBtn.style.display = 'none'
      refreshListUI()
      applySearchFilter()
      searchInput.focus()
    }
    function handleSortChange(e) {
      sortMode = e.target.value
      refreshListUI()
      applySearchFilter()
    }
    function enterSelectionMode() {
      selectionMode = true
      actionToggle.textContent = 'Cancel'
      actionToggle.classList.add('cancel')
      deleteSelected.style.display = 'inline-block'
      importBtn.style.display = 'inline-block'
      exportBtn.style.display = 'inline-block'
      refreshListUI()
      updateDeleteSelectedButtonState()
    }
    function exitSelectionMode() {
      selectionMode = false
      actionToggle.textContent = 'Action'
      actionToggle.classList.remove('cancel')
      deleteSelected.style.display = 'none'
      importBtn.style.display = 'none'
      exportBtn.style.display = 'none'
      refreshListUI()
      updateDeleteSelectedButtonState()
    }
    function handleActionToggleClick() {
      if (selectionMode) {
        exitSelectionMode()
      } else {
        if (getLockedChannels().length === 0) { showToast('List already empty', 'red'); return }
        enterSelectionMode()
      }
    }
    async function handleDeleteSelectedClick() {
      const checkboxes = Array.from(document.querySelectorAll('.tm-select-checkbox:checked'))
      let targets
      if (checkboxes.length === 0) {
        targets = getLockedChannels()
        if (targets.length === 0) { showToast('List already empty', 'red'); exitSelectionMode(); return }
        if (!confirm('Clear entire Saved Channels list?')) { exitSelectionMode(); return }
      } else {
        targets = checkboxes.map(cb => cb.dataset.name)
        if (!confirm(`Remove ${targets.length} selected channel(s)?`)) return
      }
      for (const name of targets) {
        await removeChannel(name)
      }
      showToast(`${targets.length} channel${targets.length===1?'':'s'} removed`, 'red')
      exitSelectionMode()
      updateAddCurrentButtonState()
      applySearchFilter()
    }
      function handleExportClick() {
        let list
        const checked = Array.from(document.querySelectorAll('.tm-select-checkbox:checked'))
        if (checked.length > 0) {
          list = checked.map(cb => cb.dataset.name)
        } else {
          list = getLockedChannels()
        }
        if (list.length === 0) { showToast('Nothing to export', 'red'); return }
        const json = JSON.stringify(list)
        navigator.clipboard.writeText(json).then(
          () => showToast('Copied to clipboard', 'green'),
          () => showToast('Failed to copy', 'red')
        )
      }
      async function handleImportClick() {
      const text = prompt('Paste channel list (JSON array):')
      if (!text) return
      let parts
      try {
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed) || !parsed.every(str => typeof str === 'string')) throw new Error()
        parts = parsed
      } catch {
        showToast('Invalid list format', 'red')
        return
      }
      showToast('Checking usernames…', 'green')
      let added = 0
      for (const name of parts) {
        const cleaned = name.trim().toLowerCase().replace(/^\/+|\/+$/g, '')
        if (!cleaned || !/^.{4,26}$/u.test(cleaned)) continue
        const exists = await checkTwitchUser(cleaned)
        if (exists) {
          if (await addChannel(cleaned)) added++
        }
      }
      showToast(added ? `${added} added` : 'No valid channels', added ? 'green' : 'red')
      updateAddCurrentButtonState(); refreshListUI(); applySearchFilter(); updateDeleteSelectedButtonState(); disableUnfollowIfSaved(); injectHeaderLockIcon()
    }
    addBtn.addEventListener('click', handleAddButtonClick)
    addCurrent.addEventListener('click', handleAddCurrentClick)
    searchInput.addEventListener('input', handleSearchInputChange)
    clearBtn.addEventListener('click', handleClearSearchClick)
    sortSelect.addEventListener('change', handleSortChange)
    actionToggle.addEventListener('click', handleActionToggleClick)
    deleteSelected.addEventListener('click', handleDeleteSelectedClick)
    importBtn.addEventListener('click', handleImportClick)
    exportBtn.addEventListener('click', handleExportClick)

    // Initialize state
    refreshListUI(); updateAddCurrentButtonState(); applySearchFilter(); updateDeleteSelectedButtonState();
  }
  // Drag & Drop already bound within buildPanel

  async function onAddByText() {
    const input = document.getElementById('tm-channel-input')
    const raw = input.value.trim().toLowerCase().replace(/^\/+|\/+$/g, '')
    if (!raw) { showToast('Please enter a channel name.', 'red'); return }
    // 3–26 characters, allow any letters or symbols
    if (!/^.{4,26}$/u.test(raw)) {
      showToast('Invalid username format', 'red')
      return
    }
    showToast('Checking username…', 'green')
    const exists = await checkTwitchUser(raw)
    if (exists === false) {
      showToast('User not found', 'red')
      return
    }
    if (exists === null) {
      showToast('Unable to verify username', 'red')
      return
    }
    const added = await addChannel(raw)
    showToast(added ? `${raw} added` : '✓ Already saved', added ? 'green' : 'red')

    updateAddCurrentButtonState(); refreshListUI(); applySearchFilter(); updateDeleteSelectedButtonState(); disableUnfollowIfSaved(); injectHeaderLockIcon()
}


async function onAddCurrent() {
    const current = getCurrentChannel()
    if (!current) { showToast('Not on a channel page.', 'red'); return }
    // Current channel should also respect the 3–26 character rule
    if (!/^.{4,26}$/u.test(current)) {
      showToast('Invalid channel', 'red')
      return
    }
    showToast('Checking username…', 'green')
    const exists = await checkTwitchUser(current)
    if (exists === false) {
      showToast('User not found', 'red')
      return
    }
    if (exists === null) {
      showToast('Unable to verify username', 'red')
      return
    }
    const added = await addChannel(current)
    showToast(added ? `${current} added` : '✓ Already saved', added ? 'green' : 'red')
    updateAddCurrentButtonState(); refreshListUI(); applySearchFilter(); updateDeleteSelectedButtonState(); disableUnfollowIfSaved(); injectHeaderLockIcon()
}

  function showToast(message, color) {
    const toast = document.getElementById('tm-toast')
    if (!toast) return
    toast.textContent = message
    toast.className = color // “red” or “green”
    toast.classList.remove('show')
    void toast.offsetWidth // restart animation
    toast.classList.add('show')
    function handleAnimationEnd() {
      toast.classList.remove('show')
    }
    toast.addEventListener('animationend', handleAnimationEnd, { once: true })
  }

  function makeDraggable(dragElement, handle) {
    let offsetX = 0, offsetY = 0, isDragging = false
    handle.style.cursor = 'move'
    function onMouseDown(e) {
      e.preventDefault()
      isDragging = true
      const rect = dragElement.getBoundingClientRect()
      offsetX = e.clientX - rect.left
      offsetY = e.clientY - rect.top
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
    handle.addEventListener('mousedown', onMouseDown)
    function onMouseMove(e) {
      if (!isDragging) return
      let newLeft = e.clientX - offsetX
      let newTop = e.clientY - offsetY
      const winW = window.innerWidth, winH = window.innerHeight
      const elW = dragElement.offsetWidth, elH = dragElement.offsetHeight
      if (newLeft < 0) newLeft = 0
      if (newLeft + elW > winW) newLeft = winW - elW
      if (newTop < 0) newTop = 0
      if (newTop + elH > winH) newTop = winH - elH
      dragElement.style.left = newLeft + 'px'
      dragElement.style.top = newTop + 'px'
      dragElement.style.transform = 'none'
    }
    function onMouseUp() {
      isDragging = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }

  function refreshListUI() {
    const ul = document.getElementById('tm-locked-list')
    if (!ul) return
    ul.innerHTML = ''
    if (selectionMode) ul.classList.add('selection-mode')
    else ul.classList.remove('selection-mode')
    const savedChannels = getLockedChannels().slice()

    let ordered
    switch (sortMode) {
      case 'alpha-asc':
        ordered = savedChannels.slice().sort((a, b) => a.localeCompare(b))
        break
      case 'alpha-desc':
        ordered = savedChannels.slice().sort((a, b) => b.localeCompare(a))
        break
      case 'first':
        ordered = savedChannels.slice()
        break
      case 'latest':
      default:
        ordered = savedChannels.slice().reverse()
    }

    ordered.forEach(channelName => {
      const li = document.createElement('li')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'tm-select-checkbox'
      checkbox.dataset.name = channelName
      checkbox.addEventListener('change', updateDeleteSelectedButtonState)
      const span = document.createElement('span')
      span.textContent = channelName
      li.appendChild(checkbox)
      li.appendChild(span)
      const removeBtn = document.createElement('button')
      removeBtn.textContent = '✕'
      removeBtn.className = 'remove-btn'
      removeBtn.title = `Remove "${channelName}" from Saved Channels`
      async function handleRemoveClick() {
        await removeChannel(channelName)
        showToast(`${channelName} removed from Saved Channels`, 'red')
        updateAddCurrentButtonState()
        refreshListUI()
        applySearchFilter()
      }
      removeBtn.addEventListener('click', handleRemoveClick)
      li.appendChild(removeBtn)
      ul.appendChild(li)
    })

    const titleEl = document.querySelector('#tm-lock-panel .tm-title')
    if (titleEl) {
      titleEl.textContent = `Saved Channels (Count: ${savedChannels.length})`
    }
    updateDeleteSelectedButtonState()
  }

  function applySearchFilter() {
    const query = document.getElementById('tm-search-input').value.trim().toLowerCase()
    document.querySelectorAll('#tm-locked-list li').forEach(li => {
      const text = li.querySelector('span').textContent.toLowerCase()
      li.style.display = text.includes(query) ? 'flex' : 'none'
    })
  }

  function updateAddCurrentButtonState() {
    const btn = document.getElementById('tm-add-current')
    if (!btn) return
    const currentChannel = getCurrentChannel()
    const saved = getLockedChannels()
    btn.classList.remove('green', 'red')
    if (currentChannel && saved.includes(currentChannel)) {
      btn.classList.add('red')
      btn.textContent = '✓ Already Saved'
      btn.disabled = true
      btn.style.cursor = 'not-allowed'
    } else {
      btn.classList.add('green')
      btn.textContent = 'Add Current Channel'
      btn.disabled = false
      btn.style.cursor = 'pointer'
    }
  }

  function updateDeleteSelectedButtonState() {
    const btn = document.getElementById('tm-delete-selected')
    const toggle = document.getElementById('tm-action-toggle')
    const importBtn = document.getElementById('tm-import-btn')
    const exportBtn = document.getElementById('tm-export-btn')
    if (btn) btn.disabled = getLockedChannels().length === 0
    if (toggle) toggle.disabled = getLockedChannels().length === 0
    if (importBtn) importBtn.disabled = false
    if (exportBtn) exportBtn.disabled = getLockedChannels().length === 0
  }

  async function addChannel(channelName) {
    let lockedChannels = getLockedChannels()
    if (lockedChannels.includes(channelName)) return false
    lockedChannels.push(channelName)
    setLockedChannels(lockedChannels)
    return true
  }

  async function removeChannel(channelName) {
    let lockedChannels = getLockedChannels()
    lockedChannels = lockedChannels.filter(savedChannel => savedChannel !== channelName)
    setLockedChannels(lockedChannels)
    const current = getCurrentChannel()
    if (current === channelName) {
      enableUnfollowIfPresent()
      injectHeaderLockIcon()
    }
  }

  //////////////////////////////
  // 6) “Stop Unfollow” in Avatar Dropdown
  //////////////////////////////
  function renderStopUnfollowMenuOption() {
    if (document.querySelector('#tm-stop-unfollow-wrapper')) return

    const settingsLink = document.querySelector(
      'a[data-a-target="settings-dropdown-link"], ' +
      'a[href="https://www.twitch.tv/settings/profile"], ' +
      'button[data-test-selector="user-menu-dropdown__settings-link"], ' +
      'a[data-test-selector="user-menu-dropdown__settings-link"]'
    )
    if (!settingsLink) return
    const wrapper = settingsLink.closest('div')
    if (!wrapper) return

    const container = document.createElement('div')
    container.id = 'tm-stop-unfollow-wrapper'
    container.classList.add('tmMenuWrapper')
    wrapper.after(container)

    const link = document.createElement('a')
    link.id = 'tm-stop-unfollow-menu-btn'
    link.classList.add('tmMenuItem')
    link.setAttribute('data-a-target', 'tm-stop-unfollow-dropdown-link')
    link.setAttribute('data-test-selector', 'user-menu-dropdown__tm-stop-unfollow-link')
    link.setAttribute('borderradius', 'border-radius-medium')
    link.setAttribute('href', '#')

    const menuContainer = document.createElement('div')
    menuContainer.classList.add('tmMenuContainer')

    // Icon area
    const dropdownIcon = document.createElement('div')
    dropdownIcon.classList.add('tmDropdownIcon')
    const dropdownIconContainer = document.createElement('div')
    dropdownIconContainer.classList.add('tmDropdownIconContainer')
    const dropdownIconAspect = document.createElement('div')
    dropdownIconAspect.classList.add('tm-dropdown-icon-aspect')
    const dropdownIconSpacer = document.createElement('div')
    dropdownIconSpacer.classList.add('tm-dropdown-icon-spacer')

    const fig = document.createElement('figure')
    fig.classList.add('tmStopUnfollowIcon')
    const svgNS = 'http://www.w3.org/2000/svg'
    const lockSvg = document.createElementNS(svgNS, 'svg')
    lockSvg.setAttribute('width', '20')
    lockSvg.setAttribute('height', '20')
    lockSvg.setAttribute('viewBox', '0 0 20 20')
    lockSvg.setAttribute('fill', 'currentColor')
    lockSvg.innerHTML = `
      <path fill-rule="evenodd" d="M14.001 5.99A3.992 3.992 0 0 0 10.01 2h-.018a3.992 3.992 0 0 0-3.991 3.99V8H3.999v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8h-1.998V5.99zm-2 2.01V5.995A1.996 1.996 0 0 0 10.006 4h-.01a1.996 1.996 0 0 0-1.995 1.995V8h4z" clip-rule="evenodd"></path>
    `
    fig.appendChild(lockSvg)

    dropdownIconAspect.appendChild(dropdownIconSpacer)
    dropdownIconAspect.appendChild(fig)
    dropdownIconContainer.appendChild(dropdownIconAspect)
    dropdownIcon.appendChild(dropdownIconContainer)

    // Label area
    const dropdownLabel = document.createElement('div')
    dropdownLabel.classList.add('tm-dropdown-label')
    dropdownLabel.textContent = 'Stop Unfollow'

    menuContainer.appendChild(dropdownIcon)
    menuContainer.appendChild(dropdownLabel)
    link.appendChild(menuContainer)

    // Click opens modal
    function handleMenuClick(e) {
      e.preventDefault()
      const panel = document.getElementById('tm-lock-panel')
      if (panel) {
        panel.style.display = 'flex'
        updateAddCurrentButtonState()
        refreshListUI()
        applySearchFilter()
        setTimeout(() => {
          const input = document.getElementById('tm-channel-input')
          if (input) input.focus()
        }, 100)
      }
    }
    link.addEventListener('click', handleMenuClick)

    container.appendChild(link)
  }

  function hookSettingsDropdown() {
    if (settingsObserver) settingsObserver.disconnect()
    settingsObserver = domObserver.on(
      'a[data-a-target="settings-dropdown-link"], ' +
      'a[href="https://www.twitch.tv/settings/profile"], ' +
      'button[data-test-selector="user-menu-dropdown__settings-link"], ' +
      'a[data-test-selector="user-menu-dropdown__settings-link"]',
      () => renderStopUnfollowMenuOption()
    )
  }

  function hookFollowButton() {
    if (followObserver) followObserver.disconnect()
    followObserver = domObserver.on(
      'button[data-a-target="unfollow-button"] svg',
      () => {
        injectHeaderLockIcon()
        disableUnfollowIfSaved()
      }
    )
  }

  //////////////////////////////
  // 7) Initialization
  //////////////////////////////
  buildPanel()
  disableUnfollowIfSaved()
  injectHeaderLockIcon()
  hookSettingsDropdown()
  hookFollowButton()

    //////////////////////////////
  // SPA-aware Navigation Hook
  ;(function() {
    function onLocationChange() {
      disableUnfollowIfSaved()
      injectHeaderLockIcon()
      if (settingsObserver) settingsObserver.disconnect()
      hookSettingsDropdown()
      if (followObserver) followObserver.disconnect()
      hookFollowButton()
      updateAddCurrentButtonState()
    }
    // Patch pushState only once
    if (!history.pushState.__stopUnfollowPatched) {
      const _push = history.pushState
      history.pushState = function() {
        _push.apply(this, arguments)
        onLocationChange()
      }
      history.pushState.__stopUnfollowPatched = true
    }
    // Patch replaceState only once
    if (!history.replaceState.__stopUnfollowPatched) {
      const _replace = history.replaceState
      history.replaceState = function() {
        _replace.apply(this, arguments)
        onLocationChange()
      }
      history.replaceState.__stopUnfollowPatched = true
    }
    // Listen to back/forward only once
    if (!window.__stopUnfollowRouteListenerAdded) {
      window.addEventListener('popstate', onLocationChange)
      window.addEventListener('load', onLocationChange)
      window.__stopUnfollowRouteListenerAdded = true
    }
  })()

})()
