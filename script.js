// ============================================================================
//  VeeBoard
// ============================================================================

const CONFIG = {
  version: "0.4.1"
}

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
  // Process image: convert to webp (no resizing as per request)
  processImage: async (file, quality = 0.9) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(file)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext("2d")
          ctx.drawImage(img, 0, 0)

          canvas.toBlob((blob) => {
            if (blob) {
              const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp"
              resolve(new File([blob], newName, { type: "image/webp" }))
            } else {
              resolve(file)
            }
          }, "image/webp", quality)
        }
        img.onerror = () => resolve(file)
        img.src = e.target.result
      }
      reader.onerror = () => resolve(file)
      reader.readAsDataURL(file)
    })
  },
  // Return current UTC time in ISO 8601 format
  nowIso: () => new Date().toISOString(),
}

/**
 * @module I18n
 * Internationalization support.
 */
const I18n = {
  LANG_KEY: "vee-board-lang",
  current: "en",

  init() {
    const saved = localStorage.getItem(this.LANG_KEY)
    if (saved && TRANSLATIONS[saved]) {
      this.current = saved
    } else {
      const browserLang = navigator.language.split("-")[0]
      this.current = TRANSLATIONS[browserLang] ? browserLang : "uk"
    }
    this.updatePage()
    
    this.updateTabs()
    
    Utils.qsa(".lang-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        this.setLanguage(e.target.dataset.lang)
      })
    })
  },

  setLanguage(lang) {
    if (TRANSLATIONS[lang]) {
      this.current = lang
      localStorage.setItem(this.LANG_KEY, lang)
      this.updatePage()
      this.updateTabs()
      // Re-render board to update dynamic text like "(Overdue)"
      if (typeof UI !== "undefined" && UI.renderBoard) UI.renderBoard()
    }
  },

  updateTabs() {
    Utils.qsa(".lang-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.lang === this.current)
    })
  },

  t(key, params = {}) {
    let text = TRANSLATIONS[this.current][key] || key
    Object.keys(params).forEach(p => {
      text = text.replace(`{${p}}`, params[p])
    })
    return text
  },

  updatePage() {
    Utils.qsa("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n
      const translated = this.t(key)
      
      // If the element has children (like inputs inside labels), 
      // we only want to update the text part.
      if (el.children.length > 0) {
        // Find the first text node and update it
        let textNode = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE)
        if (textNode) {
          textNode.textContent = translated
        } else {
          // If no text node, prepend one
          el.prepend(document.createTextNode(translated))
        }
      } else {
        el.textContent = translated
      }
    })
    Utils.qsa("[data-i18n-placeholder]").forEach(el => {
      const key = el.dataset.i18nPlaceholder
      el.placeholder = this.t(key)
    })
    Utils.qsa("[data-i18n-title]").forEach(el => {
      const key = el.dataset.i18nTitle
      el.title = this.t(key)
    })
  }
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
      const defaults = {
        provider: "local", // 'local', 'cloudflare'
        cfWorkerUrl: "",
        cfBoardId: "default",
        cfApiKey: ""
      }
      const saved = JSON.parse(localStorage.getItem(this.KEY)) || {}
      
      // Fallback if it was firebase
      if (saved.provider === "firebase") {
        saved.provider = "local"
      }
      
      return { ...defaults, ...saved }
    } catch {
      return { provider: "local", cfWorkerUrl: "", cfBoardId: "default", cfApiKey: "" }
    }
  },
  set(v) {
    const { firebaseConfig, ...toSave } = v // Remove firebaseConfig
    localStorage.setItem(this.KEY, JSON.stringify(toSave))
  },
}

const IndexedDBBackend = {
  DB_NAME: "VeeBoardDB",
  STORE_NAME: "state",
  _db: null,

  async _getDB() {
    if (this._db) return this._db
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME)
        }
      }
      request.onsuccess = (e) => {
        this._db = e.target.result
        resolve(this._db)
      }
      request.onerror = (e) => reject(e.target.error)
    })
  },

  async load() {
    const db = await this._getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.get(Store.STORAGE_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = (e) => reject(e.target.error)
    })
  },

  async save(state) {
    const db = await this._getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.put(state, Store.STORAGE_KEY)
      request.onsuccess = () => resolve()
      request.onerror = (e) => reject(e.target.error)
    })
  }
}

const CloudflareBackend = {
  async load(config) {
    let { cfWorkerUrl, cfBoardId, cfApiKey } = config
    if (!cfWorkerUrl) return null
    cfWorkerUrl = cfWorkerUrl.replace(/\/+$/, "") // Remove trailing slashes

    const response = await fetch(`${cfWorkerUrl}/load`, {
      headers: { 
        "X-Board-ID": cfBoardId || "default",
        "X-API-Key": cfApiKey || ""
      }
    })
    if (!response.ok) throw new Error("Cloudflare load failed")
    const result = await response.json()
    // New format: { state, user }
    if (result && result.state !== undefined) {
      if (result.user) {
        this.currentUser = result.user
      }
      return result.state
    }
    return result // Old format fallback
  },
  currentUser: null,
  async save(state, config) {
    let { cfWorkerUrl, cfBoardId, cfApiKey } = config
    if (!cfWorkerUrl) return
    cfWorkerUrl = cfWorkerUrl.replace(/\/+$/, "") // Remove trailing slashes
    const response = await fetch(`${cfWorkerUrl}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Board-ID": cfBoardId || "default",
        "X-API-Key": cfApiKey || ""
      },
      body: JSON.stringify(state),
    })
    if (!response.ok) throw new Error("Cloudflare save failed")
  },
  async subscribe(config, handler) {
    // Cloudflare D1 doesn't support push.
    // Sync-on-focus (visibilitychange) is used instead in App.setupEventListeners.
    return () => {}
  },
  async uploadImage(file, config) {
    let { cfWorkerUrl, cfBoardId, cfApiKey } = config
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    cfWorkerUrl = cfWorkerUrl.replace(/\/+$/, "")
    const response = await fetch(`${cfWorkerUrl}/upload`, {
      method: "POST",
      headers: {
        "X-Board-ID": cfBoardId || "default",
        "X-API-Key": cfApiKey || "",
        "Content-Type": file.type
      },
      body: file
    })
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(txt || "Upload failed");
    }
    return await response.json()
  },
  async deleteImage(key, config) {
    let { cfWorkerUrl, cfBoardId, cfApiKey } = config
    if (!cfWorkerUrl) return
    cfWorkerUrl = cfWorkerUrl.replace(/\/+$/, "")
    await fetch(`${cfWorkerUrl}/delete-image?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: {
        "X-Board-ID": cfBoardId || "default",
        "X-API-Key": cfApiKey || ""
      }
    })
  }
}

/**
 * @module Store
 * Manages the application state and persistence to IndexedDB.
 */
const Store = {
  STORAGE_KEY: "vee-board-state-v1",
  state: {
    columns: [],
    users: [],
  },

  loadState: async function () {
    const cfg = DbSettings.get()
    let data = null

    if (cfg.provider === "cloudflare" && cfg.cfWorkerUrl) {
      try {
        data = await CloudflareBackend.load(cfg)
        if (!data) {
          const local = await this.loadLocal()
          data = local || this.getDemoState()
          await CloudflareBackend.save(data, cfg)
        }
      } catch (e) {
        console.warn("Cloudflare load failed, fallback to Browser Storage:", e)
        data = await this.loadLocal()
      }
    } else {
      data = await this.loadLocal()
    }

    if (!data) data = this.getDemoState()
    try {
      this.validateState(data)
    } catch {
      data = this.getDemoState()
    }
    this.state = data

    if (CloudflareBackend.currentUser) {
      this.addUser(CloudflareBackend.currentUser)
    }

    // Гарантуємо наявність archive-колонки
    if (!this.state.columns.some((c) => c.isArchive)) {
      this.state.columns.push({
        id: "archive",
        title: I18n.t("archive_col_title"),
        cards: [],
        isArchive: true,
      })
    }
    
    // Ensure users array exists
    if (!this.state.users) {
      this.state.users = []
    }
    
    return this.state
  },

  addUser(user) {
    if (!user) return
    if (!this.state.users.some(u => u.name === user.name || u.email === user.email)) {
      this.state.users.push(user)
      this.saveState()
    }
  },

  async loadLocal() {
    let data = await IndexedDBBackend.load()
    // Migration from localStorage
    if (!data) {
      const oldRaw = localStorage.getItem(this.STORAGE_KEY)
      if (oldRaw) {
        try {
          data = JSON.parse(oldRaw)
          if (data) {
            await IndexedDBBackend.save(data)
          }
        } catch (e) {
          console.error("Migration failed", e)
        }
      }
    }
    return data
  },

  saveState: async function () {
    const cfg = DbSettings.get()
    if (cfg.provider === "cloudflare" && cfg.cfWorkerUrl) {
      try {
        Sync.muteNext(900)
        await CloudflareBackend.save(this.state, cfg)
        return
      } catch (e) {
        console.warn("Cloudflare save failed; also saving locally:", e)
      }
    }
    await IndexedDBBackend.save(this.state)
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
        assignedUser: cardData.assignedUser || null,
        attachments: cardData.attachments || [],
        createdAt: Utils.nowIso(), // when the card was created (UTC ISO)
        lastChanged: Utils.nowIso(), // last modification timestamp (UTC ISO)
        lastChangedBy: Meta.clientId, // stable client identifier
        seq: Meta.nextSeq(), // per-client monotonic sequence
        contentChangedAt: Utils.nowIso(), // content modification timestamp (UTC ISO)
        positionChangedAt: Utils.nowIso(), // position (column/order) change timestamp (UTC ISO)
      }
      if (newCard.assignedUser) {
        this.addUser(newCard.assignedUser)
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
      card.assignedUser = cardData.assignedUser || null
      card.attachments = cardData.attachments || []
      
      if (card.assignedUser) {
        this.addUser(card.assignedUser)
      }

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
    let cardToDelete = null
    for (const col of this.state.columns) {
      const cardIndex = col.cards.findIndex((c) => c.id === cardId)
      if (cardIndex !== -1) {
        cardToDelete = col.cards[cardIndex]
        col.cards.splice(cardIndex, 1)
        colToUpdate = col
        break
      }
    }
    if (colToUpdate) {
      this.saveState()
      // Cleanup images from R2 if any
      if (cardToDelete && cardToDelete.attachments && cardToDelete.attachments.length > 0) {
        const cfg = DbSettings.get()
        if (cfg.provider === "cloudflare") {
          cardToDelete.attachments.forEach(att => {
            if (att.key) CloudflareBackend.deleteImage(att.key, cfg).catch(console.error)
          })
        }
      }
    }
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
    if (data.users && !Array.isArray(data.users)) throw new Error("Bad users")
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
          title: I18n.t("rename_col_demo_title"),
          cards: [
            {
              id: Utils.uid(),
              title: I18n.t("demo_welcome_title"),
              description: I18n.t("demo_welcome_desc"),
              tags: ["guide", "welcome"],
              due: "",
            },
            {
              id: Utils.uid(),
              title: I18n.t("demo_drag_title"),
              description: I18n.t("demo_drag_desc"),
              tags: ["guide", "welcome"],
              due: "",
            },
            {
              id: Utils.uid(),
              title: I18n.t("demo_rich_text_title"),
              description: I18n.t("demo_rich_text_desc"),
              tags: ["feature", "editor"],
              due: createFutureDate(4, 18, 0),
            },
          ],
        },
        {
          id: Utils.uid(),
          title: I18n.t("in_progress_col_title"),
          cards: [
            {
              id: Utils.uid(),
              title: I18n.t("demo_overdue_title"),
              description: I18n.t("demo_overdue_desc"),
              tags: ["ui", "ux", "design"],
              due: Utils.isoPlusDays(-1),
            },
          ],
        },
        {
          id: Utils.uid(),
          title: I18n.t("done_col_title"),
          isDone: true,
          cards: [
            {
              id: Utils.uid(),
              title: I18n.t("demo_theme_title"),
              description: I18n.t("demo_theme_desc"),
              tags: ["theme"],
              due: "",
            },
          ],
        },
        {
          id: Utils.uid(),
          title: I18n.t("archive_col_title"),
          isDone: false,
          isArchive: true,
          cards: [
            {
              id: Utils.uid(),
              title: I18n.t("demo_archive_col_title"),
              description: I18n.t("demo_archive_col_desc"),
              tags: ["theme"],
              due: "",
            },
          ],
        },
      ],
    }
  },
  startRealtime() {
    try {
      if (this._unsubscribe) {
        this._unsubscribe()
        this._unsubscribe = null
      }

      const cfg = DbSettings.get()
      if (cfg.provider === "firebase" && cfg.firebaseConfig) {
        FirebaseBackend.subscribe(cfg.firebaseConfig, (incoming) => {
          if (Sync.shouldIgnore()) return
          if (!incoming || typeof incoming !== "object") return
          this.state = incoming
          if (typeof UI !== "undefined" && UI.renderBoard) UI.renderBoard()
        }).then(unsub => {
          this._unsubscribe = unsub
        })
      }
      // Cloudflare sync is handled via visibilitychange in setupEventListeners
    } catch (e) {
      console.warn("Realtime sync failed to start:", e)
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
  activeUserFilters: new Set(),
  searchQuery: "",

  showDialog(dialog) {
    document.body.classList.add("dialog-open")
    dialog.showModal()
    dialog.focus()
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
    const descEl = Utils.qs(".card-desc", node)
    descEl.innerHTML = sanitizedHtml
    
    // Check if sanitized HTML has meaningful content
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = sanitizedHtml
    const hasContent = tempDiv.textContent.trim().length > 0 || tempDiv.querySelector("img, iframe, a, hr") !== null
    
    descEl.style.display = hasContent ? "" : "none"

    const dueEl = Utils.qs(".card-due", node)

    // --- CHANGES HERE ---
    // First, reset all custom classes
    dueEl.classList.remove("due-badge", "due-badge--soon", "due-badge--overdue")

    if (card.due) {
      dueEl.style.display = ""
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
          dueEl.textContent = `${formattedDate} ${I18n.t("overdue")}`
          dueEl.classList.add("due-badge", "due-badge--overdue")
        } else if (hoursLeft < 48) {
          // Cards that are due soon
          dueEl.classList.add("due-badge", "due-badge--soon")
        }
      }
    } else {
      dueEl.textContent = ""
      dueEl.style.display = "none"
    }

    const tagsBox = Utils.qs(".tags", node)
    tagsBox.innerHTML = ""
    ;(card.tags || []).forEach((t) => tagsBox.append(this.createTagBadge(t)))
    tagsBox.style.display = (card.tags && card.tags.length > 0) ? "" : "none"

    const userBox = Utils.qs(".card-user", node)
    if (userBox) {
      userBox.innerHTML = ""
      if (card.assignedUser) {
        userBox.style.display = ""
        userBox.append(this.createUserBadge(card.assignedUser))
      } else {
        userBox.style.display = "none"
      }
    }

    const attBox = Utils.qs(".card-attachments", node)
    if (attBox) {
      attBox.innerHTML = ""
      if (card.attachments && card.attachments.length > 0) {
        attBox.style.display = ""
        card.attachments.forEach((att) => {
          const item = document.createElement("div")
          item.className = "attachment-item"
          const img = document.createElement("img")
          img.src = att.url
          img.loading = "lazy"
          img.alt = "Attachment"
          item.append(img)
          
          item.addEventListener("pointerdown", (e) => {
            e.stopPropagation()
            this.showLightbox(att.url)
          })
          attBox.append(item)
        })
      } else {
        attBox.style.display = "none"
      }
    }
    
    // Hide card-meta if all its children are hidden
    const cardMeta = Utils.qs(".card-meta", node)
    if (cardMeta) {
      const footerRow = Utils.qs(".card-footer-row", node)
      if (footerRow) {
        footerRow.style.display = (dueEl.style.display !== "none" || (userBox && userBox.style.display !== "none")) ? "flex" : "none"
      }
      const hasVisibleChildren = [...cardMeta.children].some(child => child.style.display !== "none")
      cardMeta.style.display = hasVisibleChildren ? "" : "none"
    }
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

  createUserBadge(user) {
    const el = document.createDocumentFragment()
    const dot = document.createElement("span")
    dot.className = "avatar-dot"
    const initial = (user.name || user.email || "?")[0]
    dot.textContent = initial
    const nameText = document.createTextNode(user.name || user.email)
    
    // Wrap in a span for easier styling/container if needed, but the request says "not styled as a badge"
    const wrapper = document.createElement("span")
    wrapper.className = "card-assignee"
    wrapper.style.display = "inline-flex"
    wrapper.style.alignItems = "center"
    wrapper.style.gap = "6px"
    wrapper.append(dot, nameText)
    wrapper.title = user.email || ""
    return wrapper
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
    if (typeof I18n !== "undefined") I18n.updatePage()
  },

  toggleArchiveVisibility() {
    this.board.classList.toggle("board--archive-visible")

    const isVisible = this.board.classList.contains("board--archive-visible")

    if (isVisible) {
      this.toggleArchiveBtn.innerHTML = I18n.t("hide_archive")
    } else {
      this.toggleArchiveBtn.innerHTML = I18n.t("show_archive")
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

    Utils.qs("#editorTitle").textContent = card ? I18n.t("edit_card") : I18n.t("create_card")
    form.elements.title.value = card ? card.title : ""
    Utils.qs("#descriptionEditor", form).innerHTML = card
      ? card.description || ""
      : ""
    form.elements.tags.value = card ? (card.tags || []).join(", ") : ""
    
    let defaultUser = ""
    if (card?.assignedUser) {
      defaultUser = card.assignedUser.name || card.assignedUser.email
    } else if (!card && CloudflareBackend.currentUser) {
      defaultUser = CloudflareBackend.currentUser.name || CloudflareBackend.currentUser.email
    }
    form.elements.user.value = defaultUser

    if (card?.due) {
      const dateObj = new Date(card.due)
      const localDate = new Date(
        dateObj.getTime() - dateObj.getTimezoneOffset() * 60000
      )
      form.elements.due.value = localDate.toISOString().slice(0, 16)
    } else {
      form.elements.due.value = ""
    }

    const markDoneBtn = Utils.qs("#markDoneBtn", form)
    if (card) {
      const { col } = Store.findCard(card.id)
      markDoneBtn.style.display = ""
      markDoneBtn.textContent = col.isDone ? I18n.t("undone") : I18n.t("mark_as_done")
      form.querySelector(".editor-actions").style.gridTemplateColumns = "1fr 1fr 1fr"
    } else {
      markDoneBtn.style.display = "none"
      form.querySelector(".editor-actions").style.gridTemplateColumns = "1fr 1fr"
    }

    this.showDialog(this.editor)
    this.showDialog(this.editor)
    this.updateEditorAttachments(card ? card.attachments : [], card?.id)
  },

  updateEditorAttachments(attachments, cardId) {
    const container = Utils.qs("#editorAttachments")
    if (!container) return
    container.innerHTML = ""
    
    const section = container.parentElement
    section.style.display = "block"
    const label = section.querySelector("label")

    if (!attachments || attachments.length === 0) {
      container.style.display = "none"
      if (label) label.style.display = "none"
      return
    }
    
    if (label) label.style.display = "block"
    container.style.display = "flex"
    attachments.forEach(att => {
      const item = document.createElement("div")
      item.className = "editor-attachment"
      const img = document.createElement("img")
      img.src = att.url
      img.style.cursor = "zoom-in"
      img.addEventListener("click", () => this.showLightbox(att.url))
      item.append(img)

      const delBtn = document.createElement("button")
      delBtn.type = "button"
      delBtn.className = "editor-attachment-delete"
      delBtn.innerHTML = "&times;"
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault()
        const choice = await this.showConfirm(I18n.t("image_delete_confirm"), {
          title: I18n.t("delete"),
          showArchiveButton: false
        })
        if (choice === "delete") {
          this.deleteAttachment(cardId, att.key)
        }
      })
      item.append(delBtn)
      container.append(item)
    })
  },

  async deleteAttachment(cardId, key) {
    const { card } = Store.findCard(cardId)
    if (!card) return
    
    const cfg = DbSettings.get()
    if (cfg.provider === "cloudflare") {
      await CloudflareBackend.deleteImage(key, cfg).catch(console.error)
    }

    card.attachments = (card.attachments || []).filter(a => a.key !== key)
    Store.saveState()
    
    // Update UI
    this.updateCard(card)
    // If editor is open for this card, update it too
    const form = Utils.qs("#editorForm")
    if (form.dataset.cardId === cardId) {
      this.updateEditorAttachments(card.attachments, cardId)
    }
  },

  showLightbox(url) {
    const lb = Utils.qs("#lightbox")
    const img = Utils.qs("#lightboxImg")
    if (lb && img) {
      img.src = url
      this.showDialog(lb)
      const closeHandler = (e) => {
        if (e.target === lb || e.target.dataset.action === "close-lightbox" || e.target.closest('[data-action="close-lightbox"]')) {
           lb.close()
           lb.removeEventListener("click", closeHandler)
        }
      }
      lb.addEventListener("click", closeHandler)
    }
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
      const title = context.title || I18n.t("manage_card")
      const deleteText = context.deleteText || I18n.t("delete")

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

  showAlert(message, title = "Alert") {
    return new Promise((resolve) => {
      const dialog = this.confirmDialog
      const titleEl = dialog.querySelector("#confirmTitle")
      const archiveButton = dialog.querySelector('button[value="archive"]')
      const deleteButton = dialog.querySelector("#confirmOk")
      const cancelButton = dialog.querySelector('button[value="cancel"]')
      const actionsContainer = deleteButton.parentElement

      titleEl.textContent = title
      deleteButton.textContent = "Ok"
      archiveButton.style.display = "none"
      cancelButton.style.display = "none"
      actionsContainer.style.gridTemplateColumns = "1fr"

      Utils.qs("#confirmText", dialog).textContent = message

      const closeHandler = () => {
        dialog.removeEventListener("close", closeHandler)
        // Restore buttons
        archiveButton.style.display = ""
        cancelButton.style.display = ""
        resolve()
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
    const tagBox = Utils.qs("#tagFilters")
    const userBox = Utils.qs("#userFilters")
    const allTags = new Set()
    const allUsers = new Map() // email/name -> user object

    Store.state.columns
      .filter((c) => !c.isArchive)
      .forEach((c) =>
        c.cards.forEach((k) => {
          (k.tags || []).forEach((t) => allTags.add(t))
          if (k.assignedUser) {
            const key = k.assignedUser.email || k.assignedUser.name
            allUsers.set(key, k.assignedUser)
          }
        })
      )

    tagBox.innerHTML = ""
    userBox.innerHTML = ""
    
    // Populate User Filters
    if (allUsers.size > 0) {
      userBox.style.display = "flex"
      ;[...allUsers.values()].sort((a,b) => (a.name||a.email).localeCompare(b.name||b.email)).forEach((user) => {
        const chip = document.createElement("button")
        chip.className = "tag-chip user-chip"
        const userKey = user.email || user.name
        chip.dataset.userKey = userKey
        
        const initial = (user.name || user.email || "?")[0]
        chip.innerHTML = `<span class="tag-dot avatar-dot" style="background:var(--primary); color:white; display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; font-size:9px; text-transform:uppercase; font-weight:700;">${initial}</span> ${user.name || user.email}`
        
        chip.setAttribute(
          "aria-pressed",
          this.activeUserFilters.has(userKey) ? "true" : "false"
        )
        if (this.activeUserFilters.has(userKey)) chip.classList.add("active")
        userBox.appendChild(chip)
      })
    } else {
      userBox.style.display = "none"
    }

    // Populate Tag Filters
    if (allTags.size > 0) {
      tagBox.style.display = "flex"
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
        tagBox.appendChild(chip)
      })
    } else {
      tagBox.style.display = "none"
    }
  },

  toggleTagFilter(tag) {
    if (this.activeTagFilters.has(tag)) {
      this.activeTagFilters.delete(tag)
    } else {
      this.activeTagFilters.add(tag)
    }
    this.applyFilters()
    this.updateTagFilters()
  },

  toggleUserFilter(userKey) {
    if (this.activeUserFilters.has(userKey)) {
      this.activeUserFilters.delete(userKey)
    } else {
      this.activeUserFilters.add(userKey)
    }
    this.applyFilters()
    this.updateTagFilters()
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

    const userMatch =
      this.activeUserFilters.size === 0 ||
      (card.assignedUser && this.activeUserFilters.has(card.assignedUser.email || card.assignedUser.name))

    cardEl.style.display = searchMatch && tagsMatch && userMatch ? "" : "none"
  },


  updateTagAutocomplete(input, container) {
    const value = input.value
    const lastCommaIndex = value.lastIndexOf(",")
    const currentPrefix = value.slice(lastCommaIndex + 1).trim().toLowerCase()

    if (!currentPrefix || currentPrefix.length < 1) {
      container.classList.remove("show")
      return
    }

    // Collect all existing tags
    const allTags = new Set()
    Store.state.columns.forEach((c) =>
      c.cards.forEach((k) => (k.tags || []).forEach((t) => allTags.add(t)))
    )

    const matches = [...allTags]
      .filter((t) => t.toLowerCase().startsWith(currentPrefix))
      .sort()

    if (matches.length === 0) {
      container.classList.remove("show")
      return
    }

    container.innerHTML = ""
    matches.forEach((tag) => {
      const item = document.createElement("div")
      item.className = "suggestion-item"
      item.textContent = tag
      item.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectTagSuggestion(tag, input, container)
      })
      container.appendChild(item)
    })

    container.classList.add("show")
  },

  selectTagSuggestion(tag, input, container) {
    const value = input.value
    const lastCommaIndex = value.lastIndexOf(",")
    const prefix = value.slice(0, lastCommaIndex + 1)
    
    // Check if tag already exists in the list to avoid duplicates
    const existingTags = prefix.split(",").map(t => t.trim().toLowerCase())
    if (existingTags.includes(tag.toLowerCase())) {
        container.classList.remove("show")
        return
    }

    input.value = prefix + (prefix.length > 0 && !prefix.endsWith(" ") ? " " : "") + tag + ", "
    input.focus()
    container.classList.remove("show")
  },

  updateUserAutocomplete(input, container) {
    const query = input.value.trim().toLowerCase()
    if (!query || query.length < 1) {
      container.classList.remove("show")
      return
    }

    const matches = (Store.state.users || [])
      .filter(u => (u.name || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query))
      .slice(0, 5)

    if (matches.length === 0) {
      container.classList.remove("show")
      return
    }

    container.innerHTML = ""
    matches.forEach(user => {
      const item = document.createElement("div")
      item.className = "suggestion-item"
      item.textContent = user.name || user.email
      item.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectUserSuggestion(user, input, container)
      })
      container.appendChild(item)
    })
    container.classList.add("show")
  },

  selectUserSuggestion(user, input, container) {
    input.value = user.name || user.email
    container.classList.remove("show")
  },

  sortCardsByUser() {
    Store.state.columns.forEach(col => {
      col.cards.sort((a, b) => {
        const nameA = (a.assignedUser?.name || a.assignedUser?.email || "zzz").toLowerCase()
        const nameB = (b.assignedUser?.name || b.assignedUser?.email || "zzz").toLowerCase()
        return nameA.localeCompare(nameB)
      })
    })
    Store.saveState()
    this.renderBoard()
  },

  // --- Theme ---
  THEME_KEY: "vee-board-theme",
  loadTheme() {
    const theme = localStorage.getItem(this.THEME_KEY) || "light"
    this.applyTheme(theme)
  },
  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme)
    const btn = Utils.qs("#themeToggle")
    if (btn) {
      const nextTheme = theme === "dark" ? "light" : "dark"
      btn.textContent = I18n.t(`theme_${nextTheme}`)
    }
    if (typeof I18n !== "undefined") I18n.updatePage()
    localStorage.setItem(this.THEME_KEY, theme)
  },
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme")
    const nextTheme = currentTheme === "dark" ? "light" : "dark"
    this.applyTheme(nextTheme)
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
  init: async function () {
    this.setupEventListeners()
    I18n.init()
    UI.loadTheme()
    
    // Set current version from CONFIG
    const versionEl = Utils.qs("#appVersion")
    if (versionEl) versionEl.textContent = `v${CONFIG.version}`

    await Store.loadState()
    
    if (CloudflareBackend.currentUser) {
      const infoEl = Utils.qs("#currentUserInfo")
      const nameEl = Utils.qs("#currentUserName")
      const avatarEl = Utils.qs("#userAvatar")
      if (infoEl && nameEl) {
        infoEl.style.display = "block"
        const name = CloudflareBackend.currentUser.name || CloudflareBackend.currentUser.email
        nameEl.textContent = name
        if (avatarEl) {
          avatarEl.style.display = "flex"
          avatarEl.textContent = name[0]
        }
      }
    }

    UI.renderBoard()
    Store.startRealtime()
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

    Utils.qs("#markDoneBtn").addEventListener("click", (e) => {
      this.handleMarkAsDone(e.target.closest("form"))
    })

    Utils.qs("#editorForm").addEventListener("change", (e) => {
      // Form change logic here if needed
    })
    Utils.qs("#colForm").addEventListener(
      "submit",
      this.handleAddColumn.bind(this)
    )

    const tagsInput = Utils.qs('input[name="tags"]', Utils.qs("#editorForm"))
    const tagAutocomplete = Utils.qs("#tagAutocomplete")

    tagsInput.addEventListener("input", () => {
      UI.updateTagAutocomplete(tagsInput, tagAutocomplete)
    })

    const userInput = Utils.qs('input[name="user"]', Utils.qs("#editorForm"))
    const userAutocomplete = Utils.qs("#userAutocomplete")

    userInput.addEventListener("input", () => {
      UI.updateUserAutocomplete(userInput, userAutocomplete)
    })

    // Close autocomplete when clicking outside
    window.addEventListener("click", () => {
      tagAutocomplete.classList.remove("show")
      userAutocomplete.classList.remove("show")
    })

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
      if (chip && chip.dataset.tag) {
        UI.toggleTagFilter(chip.dataset.tag)
      }
    })

    Utils.qs("#userFilters").addEventListener("click", (e) => {
      const chip = e.target.closest(".tag-chip")
      if (chip && chip.dataset.userKey) {
        UI.toggleUserFilter(chip.dataset.userKey)
      }
    })

    const logoutBtn = Utils.qs("#logoutBtn")
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        // Just follow the link, Cloudflare Access handles it
      })
    }

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

    // --- Database & Sync ---
    const dbBtn = Utils.qs("#dbSettingsBtn")
    const dbDialog = Utils.qs("#dbDialog")
    const dbForm = Utils.qs("#dbForm")
    const localSettings = Utils.qs("#localSettings", dbDialog)
    const cloudflareSettings = Utils.qs("#cloudflareSettings", dbDialog)
    const cfUrlInput = Utils.qs("#cfWorkerUrl", dbDialog)
    const cfIdInput = Utils.qs("#cfBoardId", dbDialog)
    const cfKeyInput = Utils.qs("#cfApiKey", dbDialog)

    const updateDbSettingsVisibility = (provider) => {
      localSettings.style.display = provider === "local" ? "" : "none"
      cloudflareSettings.style.display = provider === "cloudflare" ? "" : "none"
      Utils.qsa(".db-provider-tab", dbDialog).forEach(tab => {
        tab.classList.toggle("active", tab.dataset.provider === provider)
      })
      Utils.qs("#dbProviderInput").value = provider
    }

    dbBtn.addEventListener("click", () => {
      const cfg = DbSettings.get()
      cfUrlInput.value = cfg.cfWorkerUrl || ""
      cfIdInput.value = cfg.cfBoardId || ""
      cfKeyInput.value = cfg.cfApiKey || ""
      
      updateDbSettingsVisibility(cfg.provider)
      UI.showDialog(dbDialog)
    })

    Utils.qsa(".db-provider-tab", dbDialog).forEach(tab => {
      tab.addEventListener("click", (e) => {
        updateDbSettingsVisibility(e.target.dataset.provider)
      })
    })

    dbForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      const prevCfg = DbSettings.get()
      const formData = new FormData(dbForm)
      const provider = formData.get("dbProvider")
      
      const newCfg = {
        provider,
        cfWorkerUrl: cfUrlInput.value.trim(),
        cfBoardId: cfIdInput.value.trim() || "default",
        cfApiKey: cfKeyInput.value.trim()
      }

      // Logic for seeding/migrating data when switching providers
      if (provider !== prevCfg.provider) {
        const choice = await UI.showConfirm(
          I18n.t("db_switch_confirm", { provider }) || `Switch database to ${provider}? This will sync with the new provider. Continue?`,
          { title: I18n.t("db_sync"), showArchiveButton: false, deleteText: I18n.t("save") }
        )
        if (choice !== "delete") return

        try {
          // If switching to a remote provider, we might want to seed it if it's empty
          if (provider === "cloudflare" && newCfg.cfWorkerUrl) {
             const remote = await CloudflareBackend.load(newCfg)
             if (!remote) await CloudflareBackend.save(Store.state, newCfg)
          }
        } catch (err) {
          console.error("Migration failed:", err)
          UI.showAlert(I18n.t("db_init_failed") || "Failed to initialize new provider. Staying on current one.")
          return
        }
      }

      DbSettings.set(newCfg)
      await Store.loadState()
      UI.renderBoard()
      dbDialog.close()
    })

    // --- Theme ---
    Utils.qs("#themeToggle").addEventListener(
      "click",
      UI.toggleTheme.bind(UI)
    )

    // --- Import / Export ---
    Utils.qs("#exportBtn").addEventListener("click", this.exportJSON.bind(this))
    Utils.qs("#importInput").addEventListener(
      "change",
      this.importJSON.bind(this)
    )

    // --- Image Upload UI ---
    const addAttBtn = Utils.qs("#addAttachmentBtn")
    const attInput = Utils.qs("#attachmentInput")
    if (addAttBtn && attInput) {
      addAttBtn.addEventListener("click", () => attInput.click())
      attInput.addEventListener("change", (e) => {
        const cardId = Utils.qs("#editorForm").dataset.cardId
        if (!cardId) {
          UI.showAlert("Please save the card first (not implemented for new cards yet, but actually my logic handles it if cardId exists)")
          // Actually, cardId is empty for new cards. 
          // I should probably warn about new cards or handle them.
          // But wait, cardId is empty if it's a new card.
          // Let's just say "Please save the card title first to enable attachments" or similar?
          // Actually it's better to just say it's only for existing cards for now per requirements.
          return
        }
        if (e.target.files && e.target.files.length > 0) {
          Array.from(e.target.files).forEach(file => {
            if (file.type.startsWith("image/")) {
              this.handleImageUpload(file, cardId)
            }
          })
          e.target.value = "" // Reset
        }
      })
    }

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

    // --- Focus Sync ---
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible") {
        const cfg = DbSettings.get()
        // Fetch updates whenever the tab becomes active
        if (cfg.provider !== "local") {
          await Store.loadState()
          UI.renderBoard()
        }
      }
    })
    
    // --- Image Upload (Paste & Drop) ---
    window.addEventListener("paste", this.handlePaste.bind(this))
    window.addEventListener("dragover", (e) => e.preventDefault()) // Required for drop to work
    window.addEventListener("drop", this.handleDrop.bind(this))
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
      title: I18n.t("delete_column") + "?",
      deleteText: I18n.t("delete"),
      showArchiveButton: false,
    }
    const choice = await UI.showConfirm(
      I18n.t("delete_col_confirm", { title: col.title }) || `Delete column “${col.title}” with all its cards?`,
      context
    )

    if (choice === "delete") {
      Store.deleteColumn(colId)
      UI.deleteColumn(colId)
    }
  },

  handleMarkAsDone(form) {
    const cardId = form.dataset.cardId
    if (!cardId) return

    const { card, col: fromCol } = Store.findCard(cardId)
    if (!card || !fromCol) return

    if (fromCol.isDone) {
      // If already in a Done column, we need to move it back to the first non-done, non-archive column
      const targetCol = Store.state.columns.find((c) => !c.isDone && !c.isArchive)
      if (targetCol) {
        Store.moveCard(cardId, fromCol.id, targetCol.id, -1)
      }
    } else {
      // Move to the first Done column
      const doneCol = Store.state.columns.find((c) => c.isDone && !c.isArchive)
      if (doneCol) {
        Store.moveCard(cardId, fromCol.id, doneCol.id, -1)
      } else {
        // If no Done column exists, alert the user or maybe create one? 
        // For now, let's just alert.
        UI.showAlert(I18n.t("no_done_col_error") || "No 'Done' column found. Please mark a column as for completed cards in column settings.")
        return
      }
    }

    UI.renderBoard()
    form.closest("dialog").close()
  },

  handleSaveCard(e) {
    e.preventDefault()
    const form = e.target
    const colId = form.dataset.colId
    const cardId = form.dataset.cardId
    const title = form.elements.title.value.trim()

    if (!title) return

    // Preserve existing attachments
    const { card: existingCard } = cardId ? Store.findCard(cardId) : { card: null }
    
    // Helper to check if HTML has meaningful content
    const hasMeaningfulContent = (html) => {
      const temp = document.createElement("div")
      temp.innerHTML = html
      return temp.textContent.trim().length > 0 || temp.querySelector("img, iframe, a, hr") !== null
    }

    const descHtml = Utils.qs("#descriptionEditor", form).innerHTML.trim()
    const description = hasMeaningfulContent(descHtml) ? descHtml : ""

    //Get reminder data from form
    const cardData = {
      title,
      description,
      tags: form.elements.tags.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      due: form.elements.due.value
        ? new Date(form.elements.due.value).toISOString()
        : "",
      assignedUser: null,
      attachments: existingCard ? existingCard.attachments : []
    }

    const userVal = form.elements.user.value.trim()
    if (userVal) {
      const existingUser = (Store.state.users || []).find(u => u.name === userVal || u.email === userVal)
      if (existingUser) {
        cardData.assignedUser = existingUser
      } else {
        cardData.assignedUser = { name: userVal }
      }
    }

    let savedCard
    if (cardId) {
      savedCard = Store.updateCard(cardId, cardData)
      UI.updateCard(savedCard)
    } else {
      savedCard = Store.addCard(colId, cardData)
      UI.addCard(colId, savedCard)
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
      I18n.t("delete_or_archive_confirm", { title: card.title }) || `Do you want to archive “${card.title}” card or permanently delete it?`,
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
      UI.showAlert("JSON import failed: " + err.message)
    } finally {
      e.target.value = ""
    }
  },

  handlePaste(e) {
    if (!UI.editor.open) return

    const cardEditor = e.target.closest("#editor")
    if (!cardEditor) return

    const cardId = Utils.qs("#editorForm").dataset.cardId
    if (!cardId) return

    const items = (e.clipboardData || e.originalEvent.clipboardData).items
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile()
        this.handleImageUpload(file, cardId)
      }
    }
  },

  handleDrop(e) {
    e.preventDefault()
    
    // Only allow drop when editor is open
    if (!UI.editor.open) return

    const cardEditor = e.target.closest("#editor")
    if (!cardEditor) return

    const cardId = Utils.qs("#editorForm").dataset.cardId
    if (!cardId) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        if (file.type.startsWith("image/")) {
          this.handleImageUpload(file, cardId)
        }
      })
    }
  },

  async handleImageUpload(file, cardId) {
    const { card } = Store.findCard(cardId)
    if (!card) return

    if ((card.attachments || []).length >= 4) {
      UI.showAlert(I18n.t("too_many_attachments"))
      return
    }

    // Process image: convert to WebP and resize
    const processedFile = await Utils.processImage(file)

    if (processedFile.size > 1 * 1024 * 1024) {
      UI.showAlert(I18n.t("image_too_large"))
      return
    }

    const cfg = DbSettings.get()
    if (cfg.provider !== "cloudflare") {
      UI.showAlert(I18n.t("image_upload_failed") + " (Cloudflare not active)")
      return
    }

    try {
      const result = await CloudflareBackend.uploadImage(processedFile, cfg)
      // Re-fetch card in case it changed
      const { card: freshCard } = Store.findCard(cardId)
      if (freshCard) {
        freshCard.attachments = freshCard.attachments || []
        freshCard.attachments.push({
          url: result.url,
          key: result.key,
          name: processedFile.name
        })
        Store.saveState()
        UI.updateCard(freshCard)
        
        // If editor is open for this card, update it too
        const form = Utils.qs("#editorForm")
        if (form.dataset.cardId === cardId) {
          UI.updateEditorAttachments(freshCard.attachments, cardId)
        }
      }
    } catch (err) {
      console.error(err)
      UI.showAlert(I18n.t("image_upload_failed"))
    }
  },
}

// Initialize the application
App.init()
