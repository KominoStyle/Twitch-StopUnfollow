// ==UserScript==
// @name         Twitch: Stop Unfollow
// @namespace    http://tampermonkey.net/
// @version      1.42
// @description  Inserts “Stop Unfollow” under avatar→Settings. Disables “Unfollow” on saved channels without reloading!
// @match        https://www.twitch.tv/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @connect      api.twitch.tv
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict'

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

  //////////////////////////////
  // 3) “Unfollow” Button Logic
  //////////////////////////////
  function disableUnfollowIfSaved() {
    const channel = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
    if (!channel) return
    const saved = getLockedChannels()
    if (!saved.includes(channel)) return
    const poll = setInterval(() => {
      const btn = document.querySelector('button[data-a-target="unfollow-button"]')
      if (!btn) return
      btn.disabled = true
      btn.setAttribute('title', 'Disabled to prevent unfollow.')
      btn.style.opacity = '0.5'
      btn.style.cursor = 'not-allowed'
      clearInterval(poll)
    }, 200)
  }

  function enableUnfollowIfPresent() {
    const btn = document.querySelector('button[data-a-target="unfollow-button"]')
    if (!btn) return
    btn.disabled = false
    btn.removeAttribute('title')
    btn.style.opacity = ''
    btn.style.cursor = ''
  }

  //////////////////////////////
  // 4) Header Lock Icon
  //////////////////////////////
  function injectHeaderLockIcon() {
    const channel = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
    if (!channel) return
    const anchor = document.querySelector(
      'button[data-a-target="follow-button"], button[data-a-target="unfollow-button"]'
    )
    if (!anchor) return
    if (document.getElementById('tm-header-lock-icon')) return

    const saved = getLockedChannels().includes(channel)
    const svgNS = 'http://www.w3.org/2000/svg'
    const icon = document.createElementNS(svgNS, 'svg')
    icon.id = 'tm-header-lock-icon'
    icon.setAttribute('width', '20')
    icon.setAttribute('height', '20')
    icon.setAttribute('viewBox', '0 0 20 20')
    icon.setAttribute('fill', saved ? '#9147ff' : '#aaa')
    icon.style.cursor = 'pointer'
    icon.style.marginLeft = '8px'
    icon.style.verticalAlign = 'middle'
    icon.innerHTML = `
      <path fill-rule="evenodd" d="M14.001 5.99A3.992 3.992 0 0 0 10.01 2h-.018a3.992 3.992 0 0 0-3.991 3.99V8H3.999v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8h-1.998V5.99zm-2 2.01V5.995A1.996 1.996 0 0 0 10.006 4h-.01a1.996 1.996 0 0 0-1.995 1.995V8h4z" clip-rule="evenodd"></path>
    `
    function handleHeaderIconClick() {
      let lockedChannels = getLockedChannels()
      if (lockedChannels.includes(channel)) {
        lockedChannels = lockedChannels.filter(savedChannel => savedChannel !== channel)
        setLockedChannels(lockedChannels)
        icon.setAttribute('fill', '#aaa')
        enableUnfollowIfPresent()
      } else {
        lockedChannels.push(channel)
        setLockedChannels(lockedChannels)
        icon.setAttribute('fill', '#9147ff')
        disableUnfollowIfSaved()
      }
    }
    icon.addEventListener('click', handleHeaderIconClick)
    anchor.parentNode.insertBefore(icon, anchor.nextSibling)
  }

  //////////////////////////////
  // 5) Build “Stop Unfollow” Modal
  //////////////////////////////
  let sortMode = 'latest'
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
        background: #9147ff;
        border: none;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .tm-add-controls button.add-btn:hover {
        background: #772ce8;
      }
      .tm-add-current {
        align-self: flex-start;
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
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #0e0e10;
        border-bottom: 1px solid #333;
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
    makeDraggable(panel, header);

    // Toast
    const toast = document.createElement('div'); toast.id = 'tm-toast'; panel.append(toast);

    // Body
    const body = document.createElement('div'); body.className = 'tm-body'; panel.append(body);

    // Add Section
    const addSection = document.createElement('div'); addSection.className = 'tm-add-section';
    const controls = document.createElement('div'); controls.className = 'tm-add-controls under-construction';
    const input = document.createElement('input'); input.type = 'text'; input.id = 'tm-channel-input'; input.placeholder = 'e.g. streamername'; input.disabled = true;
    const addBtn = document.createElement('button'); addBtn.className = 'add-btn'; addBtn.id = 'tm-add-btn'; addBtn.textContent = 'Add'; addBtn.disabled = true;
    controls.append(input, addBtn);
    const addCurrent = document.createElement('button'); addCurrent.className = 'tm-add-current'; addCurrent.id = 'tm-add-current'; addCurrent.textContent = '+ Add Current Channel';
    addSection.append(controls, addCurrent);
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
    listHeader.append(searchWrapper, sortSelect);
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

    addBtn.addEventListener('click', handleAddButtonClick)
    addCurrent.addEventListener('click', handleAddCurrentClick)
    searchInput.addEventListener('input', handleSearchInputChange)
    clearBtn.addEventListener('click', handleClearSearchClick)
    sortSelect.addEventListener('change', handleSortChange)

    // Initialize state
    refreshListUI(); updateAddCurrentButtonState(); applySearchFilter();
  }
  // Drag & Drop already bound within buildPanel

  async function onAddByText() {
    const input = document.getElementById('tm-channel-input')
    const raw = input.value.trim().toLowerCase().replace(/^\/+|\/+$/g, '')
    if (!raw) { showToast('Please enter a channel name.', 'red'); return }
    showToast('Checking username…', 'green')
    const added = await addChannel(raw)
    showToast(added ? `${raw} added` : '✓ Already saved', added ? 'green' : 'red')
    updateAddCurrentButtonState(); refreshListUI(); applySearchFilter(); disableUnfollowIfSaved()
}

async function onAddCurrent() {
    const current = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
    if (!current) { showToast('Not on a channel page.', 'red'); return }
    const added = await addChannel(current)
    showToast(added ? `${current} added` : '✓ Already saved', added ? 'green' : 'red')
    updateAddCurrentButtonState(); refreshListUI(); applySearchFilter(); disableUnfollowIfSaved()
}

function showToast(message, color) {
    const toast = document.getElementById('tm-toast')
    if (!toast) return
    toast.textContent = message
    toast.className = color // “red” or “green”
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
      const span = document.createElement('span')
      span.textContent = channelName
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
    const currentChannel = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
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
    const current = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
    if (current === channelName) {
      enableUnfollowIfPresent()
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
    container.classList.add('bttvSettingsDropDownWrapper')
    wrapper.after(container)

    const link = document.createElement('a')
    link.id = 'tm-stop-unfollow-menu-btn'
    link.classList.add('bttvSettingsDropDown')
    link.setAttribute('data-a-target', 'tm-stop-unfollow-dropdown-link')
    link.setAttribute('data-test-selector', 'user-menu-dropdown__tm-stop-unfollow-link')
    link.setAttribute('borderradius', 'border-radius-medium')
    link.setAttribute('href', '#')

    const dropdownContainer = document.createElement('div')
    dropdownContainer.classList.add('dropdownContainer')

    // Icon area
    const dropdownIcon = document.createElement('div')
    dropdownIcon.classList.add('dropdownIcon')
    const dropdownIconContainer = document.createElement('div')
    dropdownIconContainer.classList.add('dropdownIconContainer')
    const dropdownIconAspect = document.createElement('div')
    dropdownIconAspect.classList.add('dropdownIconAspect')
    const dropdownIconSpacer = document.createElement('div')
    dropdownIconSpacer.classList.add('dropdownIconSpacer')

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
    dropdownLabel.classList.add('dropdownLabel')
    dropdownLabel.textContent = 'Stop Unfollow'

    dropdownContainer.appendChild(dropdownIcon)
    dropdownContainer.appendChild(dropdownLabel)
    link.appendChild(dropdownContainer)

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
    domObserver.on(
      'a[data-a-target="settings-dropdown-link"], ' +
      'a[href="https://www.twitch.tv/settings/profile"], ' +
      'button[data-test-selector="user-menu-dropdown__settings-link"], ' +
      'a[data-test-selector="user-menu-dropdown__settings-link"]',
      () => renderStopUnfollowMenuOption()
    )
  }

  //////////////////////////////
  // 7) Initialization
  //////////////////////////////
  buildPanel()
  disableUnfollowIfSaved()
  injectHeaderLockIcon()
  hookSettingsDropdown()

    //////////////////////////////
  // SPA-aware Navigation Hook
  ;(function() {
    function onLocationChange() {
      disableUnfollowIfSaved()
      injectHeaderLockIcon()
      hookSettingsDropdown()
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
