// ============================================================================
//  VeeBoard
// ============================================================================

/* Live sync echo guard */
const Sync = {
  suppressEchoUntil: 0,
  muteNext(ms = 900) {
    this.suppressEchoUntil = Date.now() + ms
  },
  shouldIgnore() {
    return Date.now() < this.suppressEchoUntil
  },
}
//  Modules:
//  - Utils: Helper functions (qs, qsa, uid, etc.)
//  - Store: State management (data and persistence)
//  - UI:    DOM manipulation and rendering
//  - Dnd:   Drag and Drop logic for cards and columns
//  - App:   Main application controller (initialization, event handling)
// ============================================================================

/**
 * @module Utils
 * General helper functions.
 */
const Utils = {
  qs: (selector, scope = document) => scope.querySelector(selector),
  qsa: (selector, scope = document) => [...scope.querySelectorAll(selector)],
  uid: () => Math.random().toString(36).slice(2, 10),
  colorFromString: (str) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) % 360
    }
    return `hsl(${hash}, 70%, 50%)`
  },
  isoPlusDays: (n) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  },
  // Return current UTC time in ISO 8601 format
  nowIso: () => new Date().toISOString(),
}

/**
 * @module Meta
 * Client identity and monotonic sequence for conflict resolution in future syncs.
 */
const Meta = {
  CLIENT_ID_KEY: "vee-board-client-id",
  get clientId() {
    let id = localStorage.getItem(this.CLIENT_ID_KEY)
    if (!id) {
      id = "c_" + Math.random().toString(36).slice(2, 10)
      localStorage.setItem(this.CLIENT_ID_KEY, id)
    }
    return id
  },
  nextSeq() {
    const key = "vee-board-seq"
    const current = parseInt(localStorage.getItem(key) || "0", 10) || 0
    const next = current + 1
    localStorage.setItem(key, String(next))
    return next
  },
}

// --- Database Settings & Backends ------------------------------------------
const DbSettings = {
  KEY: "vee-board-db-settings",
  get() {
    try {
      return (
        JSON.parse(localStorage.getItem(this.KEY)) || {
          useFirebase: false,
          firebaseConfig: null,
        }
      )
    } catch {
      return { useFirebase: false, firebaseConfig: null }
    }
  },
  set(v) {
    localStorage.setItem(this.KEY, JSON.stringify(v))
  },
}

const LocalBackend = {
  async load() {
    const raw = localStorage.getItem(Store.STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  },
  async save(state) {
    localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(state))
  },
}

// ---- Realtime Database backend ----
const FirebaseBackend = (() => {
  let _app = null,
    _db = null,
    _ref = null

  async function ensureInit(firebaseConfig) {
    if (_db) return
    const [{ initializeApp }, { getDatabase, ref, get, set, onValue, off }] =
      await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
        import(
          "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"
        ),
      ])
    _app = initializeApp(firebaseConfig)
    _db = getDatabase(_app)
    _ref = ref(_db, "boards/default")
    FirebaseBackend._get = get
    FirebaseBackend._set = set
    FirebaseBackend._onValue = onValue
    FirebaseBackend._off = off
  }

  return {
    _get: null,
    _set: null,
    _onValue: null,
    _off: null,
    async load(firebaseConfig) {
      await ensureInit(firebaseConfig)
      const snap = await this._get(_ref)
      return snap.exists() ? snap.val() : null
    },
    async save(state, firebaseConfig) {
      await ensureInit(firebaseConfig)
      await this._set(_ref, state)
    },
    async subscribe(firebaseConfig, handler) {
      await ensureInit(firebaseConfig)
      const unsubscribe = FirebaseBackend._onValue(_ref, (snap) => {
        if (!snap) return
        const exists =
          typeof snap.exists === "function" ? snap.exists() : !!snap.val
        if (exists) handler(snap.val ? snap.val() : snap)
      })
      FirebaseBackend._unsubscribe = () => {
        try {
          FirebaseBackend._off(_ref)
        } catch (_e) {}
        if (typeof unsubscribe === "function") unsubscribe()
        FirebaseBackend._unsubscribe = null
      }
      return FirebaseBackend._unsubscribe
    },
  }
})()

/**
 * @module Store
 * Manages the application state and persistence to LocalStorage.
 */
const Store = {
  STORAGE_KEY: "vee-board-state-v1",
  state: {
    columns: [],
  },

  loadState: async function () {
    const cfg = DbSettings.get()
    let data = null

    if (cfg.useFirebase && cfg.firebaseConfig) {
      try {
        data = await FirebaseBackend.load(cfg.firebaseConfig)
        if (!data) {
          // Remote порожній → засіваємо локальним станом (або демо)
          const local = await LocalBackend.load()
          data = local || this.getDemoState()
          await FirebaseBackend.save(data, cfg.firebaseConfig)
        }
      } catch (e) {
        console.warn(
          "Firebase (RTDB) load failed, fallback to LocalStorage:",
          e
        )
        data = await LocalBackend.load()
      }
    } else {
      data = await LocalBackend.load()
    }

    if (!data) data = this.getDemoState()
    try {
      this.validateState(data)
    } catch {
      data = this.getDemoState()
    }
    this.state = data

    // Гарантуємо наявність archive-колонки
    if (!this.state.columns.some((c) => c.isArchive)) {
      this.state.columns.push({
        id: "archive",
        title: "Archive",
        cards: [],
        isArchive: true,
      })
    }
    return this.state
  },

  saveState: async function () {
    const cfg = DbSettings.get()
    if (cfg.useFirebase && cfg.firebaseConfig) {
      try {
        Sync.muteNext(900)
        await FirebaseBackend.save(this.state, cfg.firebaseConfig)
        return
      } catch (e) {
        console.warn("Firebase (RTDB) save failed; also saving locally:", e)
      }
    }
    await LocalBackend.save(this.state)
  },

  findColumn(colId) {
    return this.state.columns.find((c) => c.id === colId)
  },

  findCard(cardId) {
    for (const col of this.state.columns) {
      const card = col.cards.find((c) => c.id === cardId)
      if (card) return { card, col }
    }
    return { card: null, col: null }
  },

  addColumn(title) {
    const newColumn = { id: Utils.uid(), title, cards: [], isDone: false }
    // Add new column before the archive column
    const archiveIndex = this.state.columns.findIndex((c) => c.isArchive)
    this.state.columns.splice(archiveIndex, 0, newColumn)
    this.saveState()
    return newColumn
  },

  updateColumn(colId, { title, isDone }) {
    const col = this.findColumn(colId)
    if (col && !col.isArchive) {
      col.title = title

      // Rule: Only one column can be the "Done" column.
      if (isDone) {
        this.state.columns.forEach((c) => {
          c.isDone = false
        })
      }
      col.isDone = isDone

      this.saveState()
    }
  },

  deleteColumn(colId) {
    const col = this.findColumn(colId)
    if (col && !col.isArchive) {
      this.state.columns = this.state.columns.filter((c) => c.id !== colId)
      this.saveState()
    }
  },

  addCard(colId, cardData) {
    const col = this.findColumn(colId)
    if (col) {
      const newCard = {
        id: Utils.uid(),
        title: cardData.title,
        description: cardData.description || "",
        tags: cardData.tags || [],
        due: cardData.due || "",
        reminder: cardData.reminder,
        createdAt: Utils.nowIso(), // when the card was created (UTC ISO)
        lastChanged: Utils.nowIso(), // last modification timestamp (UTC ISO)
        lastChangedBy: Meta.clientId, // stable client identifier
        seq: Meta.nextSeq(), // per-client monotonic sequence
        contentChangedAt: Utils.nowIso(), // content modification timestamp (UTC ISO)
        positionChangedAt: Utils.nowIso(), // position (column/order) change timestamp (UTC ISO)
      }
      col.cards.push(newCard)
      this.saveState()
      return newCard
    }
  },

  updateCard(cardId, cardData) {
    const { card } = this.findCard(cardId)
    if (card) {
      card.title = cardData.title
      card.description = cardData.description
      card.tags = cardData.tags
      card.due = cardData.due
      card.reminder = cardData.reminder // >>> MODIFIED
      // Update modification metadata
      card.lastChanged = Utils.nowIso()
      card.lastChangedBy = Meta.clientId
      card.seq = Meta.nextSeq()
      card.contentChangedAt = card.lastChanged
      this.saveState()
      return card
    }
  },

  deleteCard(cardId) {
    let colToUpdate = null
    for (const col of this.state.columns) {
      const cardIndex = col.cards.findIndex((c) => c.id === cardId)
      if (cardIndex !== -1) {
        col.cards.splice(cardIndex, 1)
        colToUpdate = col
        break
      }
    }
    if (colToUpdate) this.saveState()
  },

  moveCard(cardId, fromColId, toColId, toIndex) {
    const fromCol = this.findColumn(fromColId)
    const toCol = this.findColumn(toColId)
    if (!fromCol || !toCol) return

    const cardIndex = fromCol.cards.findIndex((c) => c.id === cardId)
    if (cardIndex === -1) return

    const [card] = fromCol.cards.splice(cardIndex, 1)
    // Mark move as a modification for future sync/merge logic
    if (card) {
      card.lastChanged = Utils.nowIso()
      card.lastChangedBy = Meta.clientId
      card.seq = Meta.nextSeq()
      card.positionChangedAt = card.lastChanged
    }

    if (toIndex < 0 || toIndex > toCol.cards.length) {
      toCol.cards.push(card)
    } else {
      toCol.cards.splice(toIndex, 0, card)
    }

    this.saveState()
  },

  reorderColumns(columnOrder) {
    this.state.columns.sort(
      (a, b) => columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id)
    )
    this.saveState()
  },

  validateState(data) {
    if (!data || !Array.isArray(data.columns)) throw new Error("Bad state")
    for (const c of data.columns) {
      if (
        typeof c.id !== "string" ||
        typeof c.title !== "string" ||
        !Array.isArray(c.cards)
      )
        throw new Error("Bad column")
      for (const k of c.cards) {
        if (typeof k.id !== "string" || typeof k.title !== "string")
          throw new Error("Bad card")
      }
    }
  },

  getDemoState() {
    const createFutureDate = (days, hours, minutes) => {
      const d = new Date()
      d.setDate(d.getDate() + days)
      d.setHours(hours, minutes, 0, 0)
      return d.toISOString()
    }

    return {
      columns: [
        {
          id: Utils.uid(),
          title: "Change the column title here ––––>",
          cards: [
            {
              id: Utils.uid(),
              title: "Welcome to VeeBoard! 👋",
              description:
                "This is a demo board to showcase features. You can find the source code on <a href='https://github.com/busha/VeeBoard' target='_blank'>GitHub</a>.",
              tags: ["guide", "welcome"],
              due: "",
            },
            {
              id: Utils.uid(),
              title: "Drag & drop",
              description:
                "Try dragging this card to another column or reordering columns by dragging the grip icon <b>⠿</b> in the header.",
              tags: ["guide", "welcome"],
              due: "",
            },
            {
              id: Utils.uid(),
              title: "Rich text & links",
              description: `The description supports basic rich text hotkeys, like <b>bold</b> or <i>italic</i> text. You can also create <a href="https://github.com/busha/VeeBoard" target="_blank">links</a> by selecting text and pasting a URL. Try removing the link – select it and press <b>Cmd/Ctrl + K</b>.`,
              tags: ["feature", "editor"],
              due: createFutureDate(4, 18, 0),
            },
          ],
        },
        {
          id: Utils.uid(),
          title: "In progress",
          cards: [
            {
              id: Utils.uid(),
              title: "Due date reminders",
              description:
                "This card is due soon and has a reminder set for 15 minutes before its due time. The app will send a browser notification 🔔 even if the tab is closed.",
              tags: ["notifications", "ux", "feature"],
              due: createFutureDate(1, 10, 0),
              reminder: { enabled: true, offset: 15 },
            },
            {
              id: Utils.uid(),
              title: "Handle overdue cards",
              description:
                "This card was due yesterday and is now marked as <b>overdue</b>. This status is ignored for cards in the 'Done' column.",
              tags: ["ui", "ux", "design"],
              due: Utils.isoPlusDays(-1),
            },
          ],
        },
        {
          id: Utils.uid(),
          title: "Done",
          isDone: true,
          cards: [
            {
              id: Utils.uid(),
              title: "Dark theme toggle",
              description:
                "A classic feature. Check it out using the ☾ / ☼ button in the top right!",
              tags: ["theme"],
              due: "",
            },
          ],
        },
        {
          id: Utils.uid(),
          title: "Archive",
          isDone: false,
          isArchive: true,
          cards: [
            {
              id: Utils.uid(),
              title: `"Archive" column`,
              description:
                "You don't have to delete outdated cards right away, who knows when you'll need them!",
              tags: ["theme"],
              due: "",
            },
          ],
        },
      ],
    }
  },
  startRealtime(firebaseConfig) {
    try {
      if (!firebaseConfig || !FirebaseBackend.subscribe) return
      FirebaseBackend.subscribe(firebaseConfig, (incoming) => {
        if (Sync.shouldIgnore()) return
        if (!incoming || typeof incoming !== "object") return
        this.state = incoming
        if (typeof UI !== "undefined" && UI.renderBoard) UI.renderBoard()
      })
    } catch (e) {
      console.warn("Realtime subscribe failed:", e)
    }
  },
}
DOMPurify.addHook("afterSanitizeAttributes", function (node) {
  if ("target" in node) {
    node.setAttribute("target", "_blank")
    node.setAttribute("rel", "noopener noreferrer")
  }
})

/**
 * @module UI
 * Handles all direct DOM manipulation and rendering.
 */
const UI = {
  // Element selectors
  board: Utils.qs("#board"),
  columnTpl: Utils.qs("#columnTemplate"),
  cardTpl: Utils.qs("#cardTemplate"),
  // Dialogs
  editor: Utils.qs("#editor"),
  colDialog: Utils.qs("#colDialog"),
  renameDialog: Utils.qs("#renameDialog"),
  confirmDialog: Utils.qs("#confirmDialog"),
  importChoiceDialog: Utils.qs("#importChoice"),
  // Templates
  columnTemplate: Utils.qs("#columnTemplate"),
  cardTemplate: Utils.qs("#cardTemplate"),
  // Menu
  menuBtn: Utils.qs("#menuBtn"),
  menuContent: Utils.qs("#menuContent"),
  toggleArchiveBtn: Utils.qs("#toggleArchiveBtn"),

  // State for filtering
  activeTagFilters: new Set(),
  searchQuery: "",

  showDialog(dialog) {
    document.body.classList.add("dialog-open")
    dialog.showModal()
  },

  // --- Card Rendering ---
  createCardElement(card, column) {
    const node = this.cardTemplate.content.firstElementChild.cloneNode(true)
    node.dataset.id = card.id

    // Add pointerdown listener on the whole card for drag-and-drop
    node.addEventListener("pointerdown", Dnd.startCardPotentialDrag)

    this.updateCardElement(node, card, column)

    return node
  },

  updateCardElement(node, card, column) {
    Utils.qs(".card-title", node).textContent = card.title
    const sanitizedHtml = DOMPurify.sanitize(card.description || "", {
      ADD_ATTR: ["target"],
    })
    Utils.qs(".card-desc", node).innerHTML = sanitizedHtml

    const dueEl = Utils.qs(".card-due", node)

    // --- CHANGES HERE ---
    // First, reset all custom classes
    dueEl.classList.remove("due-badge", "due-badge--soon", "due-badge--overdue")

    if (card.due) {
      const d = new Date(card.due)
      const formattedDate = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      // Always set the formatted date first
      dueEl.textContent = formattedDate
      dueEl.dateTime = d.toISOString()

      const now = new Date()
      const hoursLeft = (d.getTime() - now.getTime()) / (1000 * 60 * 60)

      const isCompletedColumn = column.isDone || column.isArchive

      // Add classes only if the card is NOT in a completed column
      if (!isCompletedColumn) {
        if (hoursLeft < 0) {
          // Overdue cards
          dueEl.textContent = `${formattedDate} (Overdue)`
          dueEl.classList.add("due-badge", "due-badge--overdue")
        } else if (hoursLeft < 48) {
          // Cards that are due soon
          dueEl.classList.add("due-badge", "due-badge--soon")
        }
      }
    } else {
      dueEl.textContent = ""
    }

    const tagsBox = Utils.qs(".tags", node)
    tagsBox.innerHTML = ""
    ;(card.tags || []).forEach((t) => tagsBox.append(this.createTagBadge(t)))
  },

  createTagBadge(tag) {
    const el = document.createElement("span")
    el.className = "tag"
    const dot = document.createElement("span")
    dot.className = "dot"
    dot.style.background = Utils.colorFromString(tag)
    el.append(dot, document.createTextNode(tag))
    return el
  },

  // --- Column Rendering ---
  createColumnElement(column) {
    const node = this.columnTemplate.content.firstElementChild.cloneNode(true)
    node.dataset.id = column.id
    Utils.qs(".column-title", node).textContent = column.title

    if (column.isArchive) {
      node.classList.add("column--archive")
      Utils.qs(".column-actions", node).remove()
      Utils.qs('[data-action="add-card"]', node).remove()
      Utils.qs(".drag-handle", node).remove()
    }

    const cardsList = Utils.qs(".cards", node)
    for (const card of column.cards) {
      cardsList.append(this.createCardElement(card, column))
    }

    if (!column.isArchive) {
      Utils.qs(".drag-handle", node).addEventListener("pointerdown", (e) =>
        Dnd.startColumnDrag(e, node)
      )
    }

    return node
  },

  // --- Board Rendering ---
  renderBoard() {
    this.board.innerHTML = ""
    Store.state.columns.forEach((col) => {
      this.board.append(this.createColumnElement(col))
    })
    this.updateTagFilters()
    this.applyFilters()
  },

  toggleArchiveVisibility() {
    this.board.classList.toggle("board--archive-visible")

    const isVisible = this.board.classList.contains("board--archive-visible")

    if (isVisible) {
      this.toggleArchiveBtn.innerHTML = "Hide Archive"
    } else {
      this.toggleArchiveBtn.innerHTML = "Show Archive"
    }

    if (isVisible) {
      const archiveColumn = this.board.querySelector(".column--archive")
      if (archiveColumn) {
        setTimeout(() => {
          archiveColumn.scrollIntoView({
            behavior: "smooth",
            inline: "end",
            block: "nearest",
          })
        }, 50)
      }
    } else {
      this.board.scrollTo({
        left: 0,
        behavior: "smooth",
      })
    }
  },

  // --- Targeted DOM Updates ---
  addColumn(column) {
    const archiveCol = this.board.querySelector(".column--archive")
    this.board.insertBefore(this.createColumnElement(column), archiveCol)
  },

  renameColumn(colId, newTitle) {
    const colEl = Utils.qs(`.column[data-id="${colId}"]`)
    if (colEl) {
      Utils.qs(".column-title", colEl).textContent = newTitle
    }
    // Re-render all cards to reflect potential 'isDone' status change
    this.renderBoard()
  },

  deleteColumn(colId) {
    const colEl = Utils.qs(`.column[data-id="${colId}"]`)
    if (colEl) colEl.remove()
  },

  addCard(colId, card) {
    const colEl = Utils.qs(`.column[data-id="${colId}"]`)
    const colData = Store.findColumn(colId)
    if (colEl && colData) {
      const cardEl = this.createCardElement(card, colData)
      Utils.qs(".cards", colEl).append(cardEl)
      this.applyFiltersToCard(cardEl)
    }
    this.updateTagFilters()
  },

  updateCard(card) {
    const cardEl = Utils.qs(`.card[data-id="${card.id}"]`)
    const { col } = Store.findCard(card.id)
    if (cardEl && col) {
      this.updateCardElement(cardEl, card, col)
      this.applyFiltersToCard(cardEl)
    }
    this.updateTagFilters()
  },

  deleteCard(cardId) {
    const cardEl = Utils.qs(`.card[data-id="${cardId}"]`)
    if (cardEl) cardEl.remove()
    this.updateTagFilters()
  },

  // --- Dialogs ---
  showCardEditor(card, colId) {
    const form = Utils.qs("#editorForm")
    form.dataset.colId = colId
    form.dataset.cardId = card ? card.id : ""

    Utils.qs("#editorTitle").textContent = card ? "Edit card" : "Create card"
    form.elements.title.value = card ? card.title : ""
    Utils.qs("#descriptionEditor", form).innerHTML = card
      ? card.description || ""
      : ""
    form.elements.tags.value = card ? (card.tags || []).join(", ") : ""

    if (card?.due) {
      const dateObj = new Date(card.due)
      const localDate = new Date(
        dateObj.getTime() - dateObj.getTimezoneOffset() * 60000
      )
      form.elements.due.value = localDate.toISOString().slice(0, 16)
    } else {
      form.elements.due.value = ""
    }
    if (card && card.reminder) {
      form.elements.reminderEnabled.checked = card.reminder.enabled
      form.elements.reminderOffset.value = card.reminder.offset
    } else {
      form.elements.reminderEnabled.checked = false
      form.elements.reminderOffset.value = "30" // Default value
    }

    this.showDialog(this.editor)
    this.toggleReminderOffsetVisibility(form)
    this.toggleReminderOffsetVisibility(form)
    this.checkAndDisplayNotificationWarning(form)
  },

  showColumnDialog() {
    const form = Utils.qs("#colForm")
    form.reset()
    this.showDialog(this.colDialog)
  },

  showRenameDialog(col, currentTitle) {
    const form = Utils.qs("#renameForm")
    form.dataset.colId = col.id
    form.elements.title.value = currentTitle
    form.elements.isDoneColumn.checked = col.isDone || false
    this.showDialog(this.renameDialog)
  },

  showConfirm(message, context = {}) {
    return new Promise((resolve) => {
      const dialog = this.confirmDialog
      const titleEl = dialog.querySelector("#confirmTitle")
      const archiveButton = dialog.querySelector('button[value="archive"]')
      const deleteButton = dialog.querySelector("#confirmOk")
      const actionsContainer = deleteButton.parentElement

      const showArchive = context.showArchiveButton !== false
      const title = context.title || "Manage Card"
      const deleteText = context.deleteText || "Delete"

      titleEl.textContent = title
      deleteButton.textContent = deleteText

      if (showArchive) {
        archiveButton.style.display = ""
        actionsContainer.style.gridTemplateColumns = "1fr 1fr 1fr"
      } else {
        archiveButton.style.display = "none"
        actionsContainer.style.gridTemplateColumns = "1fr 1fr"
      }

      Utils.qs("#confirmText", dialog).textContent = message

      const closeHandler = () => {
        dialog.removeEventListener("close", closeHandler)
        resolve(dialog.returnValue)
      }
      dialog.addEventListener("close", closeHandler)

      this.showDialog(dialog)
    })
  },

  showImportChoice() {
    return new Promise((resolve) => {
      const closeHandler = () => {
        this.importChoiceDialog.removeEventListener("close", closeHandler)
        resolve(this.importChoiceDialog.returnValue)
      }
      this.importChoiceDialog.addEventListener("close", closeHandler)
      this.showDialog(this.importChoiceDialog)
    })
  },

  // --- Filtering & Searching ---
  updateTagFilters() {
    const box = Utils.qs("#tagFilters")
    const allTags = new Set()

    Store.state.columns
      .filter((c) => !c.isArchive)
      .forEach((c) =>
        c.cards.forEach((k) => (k.tags || []).forEach((t) => allTags.add(t)))
      )

    box.innerHTML = ""
    ;[...allTags].sort().forEach((tag) => {
      const chip = document.createElement("button")
      chip.className = "tag-chip"
      chip.dataset.tag = tag
      chip.innerHTML = `<span class="tag-dot" style="background:${Utils.colorFromString(
        tag
      )}"></span> ${tag}`
      chip.setAttribute(
        "aria-pressed",
        this.activeTagFilters.has(tag) ? "true" : "false"
      )
      if (this.activeTagFilters.has(tag)) chip.classList.add("active")
      box.appendChild(chip)
    })
  },

  toggleTagFilter(tag) {
    if (this.activeTagFilters.has(tag)) {
      this.activeTagFilters.delete(tag)
    } else {
      this.activeTagFilters.add(tag)
    }
    const chip = Utils.qs(`.tag-chip[data-tag="${tag}"]`)
    if (chip) {
      chip.classList.toggle("active")
      chip.setAttribute(
        "aria-pressed",
        this.activeTagFilters.has(tag) ? "true" : "false"
      )
    }
    this.applyFilters()
  },

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase()
    this.applyFilters()
  },

  applyFilters() {
    Utils.qsa(".card").forEach((cardEl) => this.applyFiltersToCard(cardEl))
  },

  applyFiltersToCard(cardEl) {
    const { card, col } = Store.findCard(cardEl.dataset.id)
    if (!card || !col) return

    if (col.isArchive) {
      cardEl.style.display = ""
      return
    }

    const searchMatch =
      !this.searchQuery ||
      card.title.toLowerCase().includes(this.searchQuery) ||
      card.description.toLowerCase().includes(this.searchQuery) ||
      card.tags.join(" ").toLowerCase().includes(this.searchQuery)

    const tagsMatch =
      this.activeTagFilters.size === 0 ||
      [...this.activeTagFilters].every((filterTag) =>
        card.tags.includes(filterTag)
      )

    cardEl.style.display = searchMatch && tagsMatch ? "" : "none"
  },

  toggleReminderOffsetVisibility(form) {
    const checkbox = form.elements.reminderEnabled
    const select = form.elements.reminderOffset
    const afterLabel = form.querySelector("#afterLabel")
    if (checkbox && select) {
      if (checkbox.checked) {
        select.classList.remove("hidden")
        afterLabel.classList.remove("hidden")
      } else {
        select.classList.add("hidden")
        afterLabel.classList.add("hidden")
      }
    }
  },
  checkAndDisplayNotificationWarning(form) {
    const warningEl = form.querySelector("#notification-permission-warning")
    const checkbox = form.elements.reminderEnabled

    if (!warningEl || !checkbox) return

    if (!checkbox.checked) {
      warningEl.classList.add("hidden")
      return
    }

    if (Notification.permission === "denied") {
      warningEl.textContent =
        "⚠️ Notifications are blocked in your browser settings. To receive reminders, you need to enable them"
      warningEl.classList.remove("hidden")
    } else if (Notification.permission === "default") {
      warningEl.textContent =
        "To receive reminders, please enable browser notifications when prompted"
      warningEl.classList.remove("hidden")
    } else {
      // 'granted'
      warningEl.classList.add("hidden")
    }
  },
}

/**
 * @module Dnd
 * Drag and Drop functionality.
 */
const Dnd = {
  cardDrag: null,
  colDrag: null,
  autoScrollInterval: null,
  lastPointerX: null,
  lastPointerY: null,
  // Suppress click after drag to prevent unwanted card editing
  suppressClick: false,
  // Touch drag configuration
  touchLongPressMs: 300, // delay before drag can start on touch
  touchCancelThreshold: 10, // px of movement before long-press that cancels potential drag

  // --- AutoScroll ---
  startAutoScroll() {
    if (this.autoScrollInterval) return
    const edgeSize = 60 // activation zone near the viewport edge
    const speed = 18 // px per tick
    const tickMs = 30 // timer interval in milliseconds

    this.autoScrollInterval = setInterval(() => {
      // Do nothing if no drag is in progress
      if (!this.cardDrag && !this.colDrag) return
      if (this.lastPointerX == null || this.lastPointerY == null) return

      const board = UI.board
      const rect = board.getBoundingClientRect()

      // --- Horizontal board scrolling ---
      const atLeft = this.lastPointerX - rect.left
      const atRight = rect.right - this.lastPointerX

      // Check if there is room to scroll
      const canScrollLeft = board.scrollLeft > 0
      const canScrollRight =
        board.scrollLeft < board.scrollWidth - board.clientWidth

      if (atLeft < edgeSize && canScrollLeft) {
        // Use scrollBy; it plays nicer with CSS scroll-snap
        board.scrollBy({ left: -speed, behavior: "auto" })
      } else if (atRight < edgeSize && canScrollRight) {
        board.scrollBy({ left: speed, behavior: "auto" })
      }

      // --- Vertical window scrolling ---
      const atTop = this.lastPointerY
      const atBottom = window.innerHeight - this.lastPointerY
      if (atTop < edgeSize) {
        window.scrollBy(0, -speed)
      } else if (atBottom < edgeSize) {
        window.scrollBy(0, speed)
      }
    }, tickMs)
  },

  stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval)
      this.autoScrollInterval = null
    }
  },

  // --- Card DnD ---
  startCardPotentialDrag(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return

    const isTouch = e.pointerType !== "mouse"

    // Prevent drag from interactive elements (links, buttons, inputs, tags, etc.)
    const interactive = e.target.closest(
      "a, button, input, textarea, select, .tag, .card-actions"
    )
    if (interactive) return

    const cardEl = e.currentTarget.closest(".card")
    const rect = cardEl.getBoundingClientRect()

    Dnd.cardDrag = {
      pointerId: e.pointerId,
      cardEl,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      started: false,
      timerId: null,
      isTouch,
    }
    if (isTouch) {
      // Allow natural vertical/horizontal panning until drag actually begins
      cardEl.style.touchAction = "auto"
    }

    if (!isTouch) {
      cardEl.setPointerCapture(e.pointerId)
    }

    if (isTouch) {
      Dnd.cardDrag.timerId = setTimeout(() => {
        if (Dnd.cardDrag && !Dnd.cardDrag.started) {
          Dnd.beginCardDrag(e)
        }
      }, Dnd.touchLongPressMs)
    }

    document.addEventListener("pointermove", Dnd.onCardPotentialMove)
    document.addEventListener("pointerup", Dnd.onCardDragEnd)
    document.addEventListener("pointercancel", Dnd.onCardDragEnd)
  },

  onCardPotentialMove(e) {
    if (!Dnd.cardDrag || e.pointerId !== Dnd.cardDrag.pointerId) return
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY

    // For touch: if finger moves before long-press, cancel potential drag to allow page/board scrolling
    if (Dnd.cardDrag && !Dnd.cardDrag.started && Dnd.cardDrag.isTouch) {
      const dx0 = Math.abs(e.clientX - Dnd.cardDrag.startX)
      const dy0 = Math.abs(e.clientY - Dnd.cardDrag.startY)
      if (dx0 > Dnd.touchCancelThreshold || dy0 > Dnd.touchCancelThreshold) {
        clearTimeout(Dnd.cardDrag.timerId)
        // Do NOT preventDefault here; we want native scrolling/gestures
        document.removeEventListener("pointermove", Dnd.onCardPotentialMove)
        document.removeEventListener("pointerup", Dnd.onCardDragEnd)
        document.removeEventListener("pointercancel", Dnd.onCardDragEnd)
        Dnd.cardDrag = null
        return
      }
    }

    const dx = e.clientX - Dnd.cardDrag.startX
    const dy = e.clientY - Dnd.cardDrag.startY
    const dist = Math.hypot(dx, dy)
    const threshold = e.pointerType === "mouse" ? 6 : 8

    if (dist > threshold && !Dnd.cardDrag.started && !Dnd.cardDrag.isTouch) {
      clearTimeout(Dnd.cardDrag.timerId)
      Dnd.beginCardDrag(e)
    }

    if (Dnd.cardDrag.started) {
      e.preventDefault()
      Dnd.onCardPointerMove(e)
    }
  },

  beginCardDrag(e) {
    Dnd.cardDrag.started = true
    // Set flag to suppress click after drag
    Dnd.suppressClick = true
    document.body.classList.add("dragging-ui")

    const { cardEl } = Dnd.cardDrag
    // On drag start, capture pointer and disable native panning for this element
    if (Dnd.cardDrag.isTouch) {
      try {
        cardEl.setPointerCapture(e.pointerId)
      } catch (_) {}
      cardEl.style.touchAction = "none"
    }
    const ghost = cardEl.cloneNode(true)
    const rect = cardEl.getBoundingClientRect()

    ghost.classList.add("card-ghost")
    Object.assign(ghost.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
    })
    document.body.appendChild(ghost)

    const placeholder = document.createElement("div")
    placeholder.className = "card placeholder"
    placeholder.style.height = `${rect.height}px`

    cardEl.classList.add("dragging")
    cardEl.after(placeholder)

    Dnd.cardDrag.ghost = ghost
    Dnd.cardDrag.placeholder = placeholder

    Dnd.positionGhost(e.clientX, e.clientY)
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY
    Dnd.startAutoScroll()
  },

  onCardPointerMove(e) {
    if (!Dnd.cardDrag || !Dnd.cardDrag.started) return
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY
    Dnd.positionGhost(e.clientX, e.clientY)

    const el = document.elementFromPoint(e.clientX, e.clientY)
    const list = el ? el.closest(".cards") : null
    if (!list) return

    const siblings = Utils.qsa(".card:not(.dragging)", list)
    let placed = false
    for (const s of siblings) {
      const r = s.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        list.insertBefore(Dnd.cardDrag.placeholder, s)
        placed = true
        break
      }
    }
    if (!placed) list.appendChild(Dnd.cardDrag.placeholder)
  },

  onCardDragEnd(e) {
    if (!Dnd.cardDrag || e.pointerId !== Dnd.cardDrag.pointerId) return
    clearTimeout(Dnd.cardDrag.timerId)

    if (Dnd.cardDrag.started) {
      const { cardEl, ghost, placeholder } = Dnd.cardDrag
      const toList = placeholder.closest(".cards")

      if (toList) {
        const fromColId = cardEl.closest(".column").dataset.id
        const toColId = toList.closest(".column").dataset.id
        const cardId = cardEl.dataset.id
        const toIndex = [...toList.children].indexOf(placeholder)

        Store.moveCard(cardId, fromColId, toColId, toIndex)
        UI.updateTagFilters()

        toList.insertBefore(cardEl, placeholder)

        const { card, col } = Store.findCard(cardId)
        if (card && col) {
          UI.updateCardElement(cardEl, card, col)
        }
      }

      cardEl.classList.remove("dragging")
      ghost.remove()
      placeholder.remove()

      document.body.classList.remove("dragging-ui")
    }

    document.removeEventListener("pointermove", Dnd.onCardPotentialMove)
    document.removeEventListener("pointerup", Dnd.onCardDragEnd)
    document.removeEventListener("pointercancel", Dnd.onCardDragEnd)

    if (Dnd.cardDrag && Dnd.cardDrag.cardEl) {
      Dnd.cardDrag.cardEl.style.touchAction = ""
    }
    Dnd.cardDrag = null
    Dnd.stopAutoScroll()
    Dnd.lastPointerX = null
    Dnd.lastPointerY = null
    // Re-enable click after short delay to prevent accidental card editor opening
    setTimeout(() => {
      Dnd.suppressClick = false
    }, 120)
  },

  positionGhost(x, y) {
    if (!Dnd.cardDrag.ghost) return
    Dnd.cardDrag.ghost.style.left = `${x - Dnd.cardDrag.offsetX}px`
    Dnd.cardDrag.ghost.style.top = `${y - Dnd.cardDrag.offsetY}px`
  },

  // --- Column DnD ---
  startColumnDrag(e, colEl) {
    if (e.button !== 0 || colEl.classList.contains("column--archive")) return
    e.preventDefault()
    document.body.classList.add("dragging-ui")

    const rect = colEl.getBoundingClientRect()
    if (e.pointerType !== "touch") colEl.setPointerCapture(e.pointerId)

    const ghost = colEl.cloneNode(true)
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      pointerEvents: "none",
      opacity: ".95",
      transform: "scale(1.02)",
      zIndex: 9999,
    })
    ghost.classList.add("dragging")
    document.body.appendChild(ghost)

    const ph = document.createElement("section")
    ph.className = "column column-placeholder"
    ph.style.minWidth = `${rect.width}px`
    ph.style.height = `${rect.height}px`

    UI.board.replaceChild(ph, colEl)

    Dnd.colDrag = {
      pointerId: e.pointerId,
      ghost,
      placeholder: ph,
      srcEl: colEl,
      offsetX: e.clientX - rect.left,
    }

    document.addEventListener("pointermove", Dnd.onColMove)
    document.addEventListener("pointerup", Dnd.endColDrag)
    document.addEventListener("pointercancel", Dnd.endColDrag)
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY
    Dnd.startAutoScroll()
  },

  onColMove(e) {
    if (!Dnd.colDrag) return
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY
    if (!Dnd.colDrag) return
    const { ghost, placeholder, offsetX } = Dnd.colDrag
    const x = e.clientX - offsetX
    ghost.style.left = `${x}px`

    const items = Utils.qsa(
      ".column:not(.column-placeholder):not(.column--archive)",
      UI.board
    )
    const ghostCenter = x + ghost.getBoundingClientRect().width / 2

    let target = null
    for (const el of items) {
      const r = el.getBoundingClientRect()
      const center = r.left + r.width / 2
      if (ghostCenter < center) {
        target = el
        break
      }
    }

    if (target) UI.board.insertBefore(placeholder, target)
    else {
      const archiveCol = UI.board.querySelector(".column--archive")
      UI.board.insertBefore(placeholder, archiveCol)
    }
  },

  endColDrag() {
    if (!Dnd.colDrag) return
    const { ghost, placeholder, srcEl } = Dnd.colDrag

    ghost.remove()
    UI.board.replaceChild(srcEl, placeholder)

    const order = Utils.qsa(".column", UI.board).map((el) => el.dataset.id)
    Store.reorderColumns(order)

    document.removeEventListener("pointermove", Dnd.onColMove)
    document.removeEventListener("pointerup", Dnd.endColDrag)
    document.removeEventListener("pointercancel", Dnd.endColDrag)
    Dnd.colDrag = null
    document.body.classList.remove("dragging-ui")
    Dnd.stopAutoScroll()
    Dnd.lastPointerX = null
    Dnd.lastPointerY = null
  },
}

/**
 * @module App
 * Main application controller. Initializes the app and handles events.
 */
const App = {
  async init() {
    this.registerServiceWorker()
    this.setupEventListeners()
    this.loadTheme()
    await Store.loadState() // тепер це законно
    UI.renderBoard()
    try {
      const cfg = DbSettings.get()
      if (cfg && cfg.useFirebase && cfg.firebaseConfig)
        Store.startRealtime(cfg.firebaseConfig)
    } catch (e) {
      console.warn("Failed to start realtime:", e)
    }
  },

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("service-worker.js")
        .then((registration) => {
          console.log("Service Worker has been registered:", registration)
        })
        .catch((error) => {
          console.log("Service Worker registration error:", error)
        })
    }
  },

  requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          console.log("Authorization for notification received.")
        }
      })
    }
  },

  setupEventListeners() {
    // --- Event Delegation for Board Actions ---
    UI.board.addEventListener("click", (e) => {
      // Prevent opening the editor after a drag
      if (Dnd.suppressClick) return

      const target = e.target
      const actionEl = target.closest("[data-action]")
      if (!actionEl) return

      const action = actionEl.dataset.action
      const colEl = target.closest(".column")
      const cardEl = target.closest(".card")
      const colId = colEl ? colEl.dataset.id : null
      const cardId = cardEl ? cardEl.dataset.id : null

      switch (action) {
        case "add-card":
          UI.showCardEditor(null, colId)
          break
        case "edit-card":
          if (target.closest("a")) {
            return
          }
          if (target.closest("button")) return
          const { card } = Store.findCard(cardId)
          UI.showCardEditor(card, colId)
          break
        case "delete-card":
          this.promptDeleteOrArchive(cardId)
          break
        case "rename-column":
          const col = Store.findColumn(colId)
          UI.showRenameDialog(col, col.title)
          break
        case "delete-column":
          this.handleDeleteColumn(colId)
          break
      }
    })

    // --- Form Submissions ---
    Utils.qs("#editorForm").addEventListener(
      "submit",
      this.handleSaveCard.bind(this)
    )

    Utils.qs("#editorForm").addEventListener("change", (e) => {
      const form = e.currentTarget

      if (e.target.name === "reminderEnabled") {
        UI.toggleReminderOffsetVisibility(form)

        UI.checkAndDisplayNotificationWarning(form)

        if (
          e.target.checked &&
          "Notification" in window &&
          Notification.permission === "default"
        ) {
          Notification.requestPermission().then((permission) => {
            UI.checkAndDisplayNotificationWarning(form)
          })
        }
      }
    })
    Utils.qs("#colForm").addEventListener(
      "submit",
      this.handleAddColumn.bind(this)
    )
    Utils.qs("#renameForm").addEventListener(
      "submit",
      this.handleRenameColumn.bind(this)
    )

    // --- Header & Global Actions ---
    Utils.qs("#addColumnBtn").addEventListener("click", () =>
      UI.showColumnDialog()
    )
    Utils.qs("#toggleArchiveBtn").addEventListener("click", () =>
      UI.toggleArchiveVisibility()
    )
    Utils.qs("#search").addEventListener("input", (e) =>
      UI.setSearchQuery(e.target.value)
    )
    Utils.qs("#tagFilters").addEventListener("click", (e) => {
      const chip = e.target.closest(".tag-chip")
      if (chip) UI.toggleTagFilter(chip.dataset.tag)
    })

    // --- Dropdown Menu ---
    UI.menuBtn.addEventListener("click", (e) => {
      e.stopPropagation() // Prevent the window click listener from firing immediately
      UI.menuContent.classList.toggle("show")
    })

    // Close menu if clicking outside of it
    window.addEventListener("click", (e) => {
      if (
        !UI.menuBtn.contains(e.target) &&
        UI.menuContent.classList.contains("show")
      ) {
        UI.menuContent.classList.remove("show")
      }
    })

    // --- Database & Sync (Firebase) ---
    const dbBtn = Utils.qs("#dbSettingsBtn")
    const dbDialog = Utils.qs("#dbDialog")
    const dbForm = Utils.qs("#dbForm")
    const useToggle = Utils.qs("#useFirebaseToggle", dbDialog)
    const area = Utils.qs("#firebaseArea", dbDialog)
    const help = Utils.qs("#firebaseHelp", dbDialog)
    const cfgInput = Utils.qs("#firebaseConfigInput", dbDialog)

    dbBtn.addEventListener("click", () => {
      const cfg = DbSettings.get()
      useToggle.checked = !!cfg.useFirebase
      cfgInput.value = cfg.firebaseConfig
        ? JSON.stringify(cfg.firebaseConfig, null, 2)
        : ""
      area.style.display = help.style.display = useToggle.checked ? "" : "none"
      UI.showDialog(dbDialog)
    })

    useToggle.addEventListener("change", () => {
      area.style.display = help.style.display = useToggle.checked ? "" : "none"
    })

    dbForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      const wasFirebase = DbSettings.get().useFirebase
      const wantFirebase = useToggle.checked
      let parsedConfig = null

      // Parse the firebaseConfig if toggle is ON
      if (wantFirebase) {
        const raw = cfgInput.value.trim()
        if (!raw) return dbDialog.close("cancel")
        try {
          // Accept JS-ish object or JSON
          parsedConfig = JSON.parse(raw) // works for JSON
        } catch (_) {
          // try to eval a const firebaseConfig = {...} string
          try {
            const wrapped = raw.includes("firebaseConfig")
              ? raw
              : "const firebaseConfig=" + raw
            // eslint-disable-next-line no-new-func
            const fn = new Function(wrapped + "; return firebaseConfig;")
            parsedConfig = fn()
          } catch (err) {
            alert(
              "Could not parse firebaseConfig. Please paste a valid object."
            )
            return
          }
        }
      }

      // Save settings early
      DbSettings.set({
        useFirebase: wantFirebase,
        firebaseConfig: parsedConfig,
      })

      if (wantFirebase && !wasFirebase) {
        // Switching Local -> Firebase: if remote empty, seed with local
        try {
          const remote = await FirebaseBackend.load(parsedConfig)
          if (!remote) {
            const local = await LocalBackend.load()
            await FirebaseBackend.save(local || Store.state, parsedConfig)
          }
        } catch (e) {
          console.error("Failed to switch to Firebase:", e)
          alert("Failed to initialize Firebase. Staying on Local Storage.")
          DbSettings.set({ useFirebase: false, firebaseConfig: null })
        }
      } else if (!wantFirebase && wasFirebase) {
        // Switching Firebase -> Local: copy remote into LocalStorage
        try {
          const prev = DbSettings.get().firebaseConfig // was saved above
          const remote = await FirebaseBackend.load(prev)
          if (remote) {
            await LocalBackend.save(remote)
          }
        } catch (e) {
          console.warn("Could not copy Firebase data back to LocalStorage:", e)
        }
      }

      // Reload state & UI from the selected backend
      await Store.loadState()
      UI.renderBoard()
      dbDialog.close()
    })

    // --- Theme ---
    Utils.qs("#themeToggle").addEventListener(
      "click",
      this.toggleTheme.bind(this)
    )

    // --- Import / Export ---
    Utils.qs("#exportBtn").addEventListener("click", this.exportJSON.bind(this))
    Utils.qs("#importInput").addEventListener(
      "change",
      this.importJSON.bind(this)
    )

    // --- Dialogs ---
    Utils.qsa("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close("cancel")
      })
      dialog.addEventListener("close", () => {
        document.body.classList.remove("dialog-open")
      })
    })

    Utils.qsa('dialog .btn.secondary[value="cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest("dialog").close()
      })
    })

    const descriptionEditor = Utils.qs("#descriptionEditor")

    descriptionEditor.addEventListener("keydown", (e) => {
      const isCtrlOrCmd = e.metaKey || e.ctrlKey

      if (isCtrlOrCmd && e.key === "b") {
        e.preventDefault()
        document.execCommand("bold", false, null)
      } else if (isCtrlOrCmd && e.key === "k") {
        e.preventDefault()
        document.execCommand("unlink", false, null)
      }
    })

    descriptionEditor.addEventListener("paste", (e) => {
      e.preventDefault()
      const text = (e.clipboardData || window.clipboardData).getData("text")
      try {
        new URL(text)
        const selection = window.getSelection()
        if (selection.rangeCount > 0 && selection.toString().length > 0) {
          document.execCommand("createLink", false, text)
        } else {
          document.execCommand(
            "insertHTML",
            false,
            `<a href="${text}" target="_blank">${text}</a>`
          )
        }
      } catch (_) {
        document.execCommand("insertText", false, text)
      }
    })
  },

  // --- Action Handlers ---
  handleAddColumn(e) {
    e.preventDefault()
    const form = e.target
    const title = form.elements.title.value.trim()
    if (title) {
      const newColumn = Store.addColumn(title)
      UI.addColumn(newColumn)
    }
    form.closest("dialog").close()
  },

  handleRenameColumn(e) {
    e.preventDefault()
    const form = e.target
    const colId = form.dataset.colId
    const newTitle = form.elements.title.value.trim()
    const isDone = form.elements.isDoneColumn.checked

    if (newTitle) {
      Store.updateColumn(colId, { title: newTitle, isDone })
      // Re-render the entire board to ensure all cards reflect the potential change
      // in the "Done" column status, which affects their "overdue" state.
      UI.renderBoard()
    }
    form.closest("dialog").close()
  },

  async handleDeleteColumn(colId) {
    const col = Store.findColumn(colId)
    const context = {
      title: "Delete column?",
      deleteText: "Delete",
      showArchiveButton: false,
    }
    const choice = await UI.showConfirm(
      `Delete column “${col.title}” with all its cards?`,
      context
    )

    if (choice === "delete") {
      Store.deleteColumn(colId)
      UI.deleteColumn(colId)
    }
  },

  handleSaveCard(e) {
    e.preventDefault()
    const form = e.target
    const colId = form.dataset.colId
    const cardId = form.dataset.cardId
    const title = form.elements.title.value.trim()

    if (!title) return

    //Get reminder data from form
    const cardData = {
      title,
      description: Utils.qs("#descriptionEditor", form).innerHTML.trim(),
      tags: form.elements.tags.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      due: form.elements.due.value
        ? new Date(form.elements.due.value).toISOString()
        : "",
      reminder: {
        enabled: form.elements.reminderEnabled.checked,
        offset: parseInt(form.elements.reminderOffset.value, 10),
      },
    }

    let savedCard
    if (cardId) {
      savedCard = Store.updateCard(cardId, cardData)
      UI.updateCard(savedCard)
    } else {
      savedCard = Store.addCard(colId, cardData)
      UI.addCard(colId, savedCard)
    }

    //Send message to Service Worker to schedule notification
    if (savedCard && savedCard.reminder.enabled && savedCard.due) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            registration.active.postMessage({
              action: "scheduleNotification",
              payload: {
                title: `VeeBoard: ${savedCard.title}`,
                body: `This task is due in ${savedCard.reminder.offset} minutes.`,
                due: savedCard.due,
                offsetMinutes: savedCard.reminder.offset,
                cardId: savedCard.id,
              },
            })
          })
          .catch((err) => {
            console.error("Service Worker not ready:", err)
          })
      }
    }

    form.closest("dialog").close()
  },

  async promptDeleteOrArchive(cardId) {
    const { card, col } = Store.findCard(cardId)
    if (!card) return

    const context = col.isArchive
      ? {
          title: "Archived card",
          deleteText: "Delete permanently",
          showArchiveButton: false,
        }
      : {
          title: "Delete or archive card?",
          deleteText: "Delete",
          showArchiveButton: true,
        }

    const choice = await UI.showConfirm(
      `Do you want to archive “${card.title}” card or permanently delete it?`,
      context
    )

    if (choice === "archive") {
      const archiveCol = Store.state.columns.find((c) => c.isArchive)
      if (col.id !== archiveCol.id) {
        Store.moveCard(cardId, col.id, archiveCol.id, -1)
        const cardEl = UI.board.querySelector(`.card[data-id="${cardId}"]`)
        const archiveColEl = UI.board.querySelector(".column--archive .cards")
        if (cardEl && archiveColEl) archiveColEl.append(cardEl)
        UI.updateTagFilters()
      }
    } else if (choice === "delete") {
      Store.deleteCard(cardId)
      UI.deleteCard(cardId)
    }
  },

  // --- Theme ---
  THEME_KEY: "vee-board-theme",
  loadTheme() {
    const theme = localStorage.getItem(this.THEME_KEY) || "light"
    this.applyTheme(theme)
  },
  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme)
    const themeBtn = Utils.qs("#themeToggle")
    themeBtn.textContent = theme === "light" ? "☾" : "☼"
    localStorage.setItem(this.THEME_KEY, theme)
  },
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme")
    const nextTheme = currentTheme === "dark" ? "light" : "dark"
    this.applyTheme(nextTheme)
  },

  // --- Import/Export ---
  exportJSON() {
    const stateString = JSON.stringify(Store.state, null, 2)
    const blob = new Blob([stateString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, "-")
    a.download = `veeboard_backup_${dateStr}_${timeStr}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  async importJSON(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const incomingState = JSON.parse(text)
      Store.validateState(incomingState)

      const choice = await UI.showImportChoice()
      if (choice === "cancel" || !choice) return

      if (choice === "replace") {
        Store.state = incomingState
      } else if (choice === "merge") {
        // --- Smart merge v2: column de-dup by title, field-wise content merge, and position-aware moves ---

        // Helpers
        const timeVal = (t) => (t ? Date.parse(t) || 0 : 0)
        const normTitle = (s) =>
          (s || "").toLowerCase().trim().replace(/\s+/g, " ")

        // Compare A vs B for content recency
        const isContentANewer = (A, B) => {
          const ta = Math.max(
            timeVal(A.contentChangedAt),
            timeVal(A.lastChanged),
            timeVal(A.createdAt)
          )
          const tb = Math.max(
            timeVal(B.contentChangedAt),
            timeVal(B.lastChanged),
            timeVal(B.createdAt)
          )
          if (ta !== tb) return ta > tb
          const sa = Number.isFinite(A.seq) ? A.seq : -Infinity
          const sb = Number.isFinite(B.seq) ? B.seq : -Infinity
          if (sa !== sb) return sa > sb
          const ca = A.lastChangedBy || ""
          const cb = B.lastChangedBy || ""
          return ca > cb
        }
        // Compare A vs B for position recency
        const isPositionANewer = (A, B) => {
          const ta = timeVal(A.positionChangedAt)
          const tb = timeVal(B.positionChangedAt)
          if (ta !== tb) return ta > tb
          // Fall back to generic lastChanged if positionChangedAt missing
          const fa = timeVal(A.lastChanged)
          const fb = timeVal(B.lastChanged)
          if (fa !== fb) return fa > fb
          // Tie-breakers
          const sa = Number.isFinite(A.seq) ? A.seq : -Infinity
          const sb = Number.isFinite(B.seq) ? B.seq : -Infinity
          if (sa !== sb) return sa > sb
          const ca = A.lastChangedBy || ""
          const cb = B.lastChangedBy || ""
          return ca > cb
        }

        // 1) Build maps for existing columns by id and by normalized title
        const existingById = new Map(Store.state.columns.map((c) => [c.id, c]))
        const existingByTitle = new Map(
          Store.state.columns.map((c) => [normTitle(c.title), c])
        )

        // 2) For each incoming column, decide its target column in current state
        const columnById = new Map() // final working map id -> target column
        incomingState.columns.forEach((incCol) => {
          let target = existingById.get(incCol.id)
          if (!target) {
            const byTitle = existingByTitle.get(normTitle(incCol.title))
            if (byTitle) {
              target = byTitle
            }
          }
          if (!target) {
            // None matched -> add the column as-is
            Store.state.columns.push(incCol)
            existingById.set(incCol.id, incCol)
            existingByTitle.set(normTitle(incCol.title), incCol)
            target = incCol
          }
          columnById.set(target.id, target)
        })

        // 3) Merge cards per (resolved) column target
        incomingState.columns.forEach((incCol) => {
          // Resolve the actual target column again using id->col or title->col
          let targetCol = existingById.get(incCol.id)
          if (!targetCol) {
            targetCol = existingByTitle.get(normTitle(incCol.title))
          }
          if (!targetCol) return // safety

          incCol.cards.forEach((incCard) => {
            // Try to find existing card anywhere in current state
            const found = Store.findCard(incCard.id)
            const exCard = found.card
            const exCol = found.col

            if (!exCard) {
              // New card -> append into resolved target column
              targetCol.cards.push(incCard)
              return
            }

            // Update content if incoming newer
            if (isContentANewer(incCard, exCard)) {
              exCard.title = incCard.title
              exCard.description = incCard.description
              exCard.tags = Array.isArray(incCard.tags) ? incCard.tags : []
              exCard.due = incCard.due || ""
              exCard.reminder = incCard.reminder
              // metadata copy without mutating timestamps on import
              if (incCard.createdAt) exCard.createdAt = incCard.createdAt
              if (incCard.lastChanged) exCard.lastChanged = incCard.lastChanged
              if (typeof incCard.seq !== "undefined") exCard.seq = incCard.seq
              if (incCard.lastChangedBy)
                exCard.lastChangedBy = incCard.lastChangedBy
              if (incCard.contentChangedAt)
                exCard.contentChangedAt = incCard.contentChangedAt
              if (incCard.positionChangedAt)
                exCard.positionChangedAt = incCard.positionChangedAt
            }

            // Move if incoming position is newer and column differs
            const shouldMove =
              exCol &&
              exCol.id !== targetCol.id &&
              isPositionANewer(incCard, exCard)
            if (shouldMove) {
              // Remove from previous column
              exCol.cards = exCol.cards.filter((c) => c.id !== exCard.id)
              // Append to end of target column (stable policy)
              targetCol.cards.push(exCard)
            }
          })
        })
      }

      Store.saveState()
      UI.renderBoard()
    } catch (err) {
      console.error(err)
      alert("JSON import failed: " + err.message)
    } finally {
      e.target.value = ""
    }
  },
}

// Initialize the application
App.init()
