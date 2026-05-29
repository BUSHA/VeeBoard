// ============================================================================
//  VeeBoard
// ============================================================================

const CONFIG = {
  version: "0.3.0"
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

const ICONS = {
  REPLY: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`,
  EDIT: `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  DELETE: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  SEND: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transform: translate(-1px, 1px);"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
  CHECK: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  CANCEL: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
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
  processAvatarImage: async (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(file)

      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const size = 256
          const srcSize = Math.min(img.width, img.height)
          const sx = Math.max(0, Math.floor((img.width - srcSize) / 2))
          const sy = Math.max(0, Math.floor((img.height - srcSize) / 2))
          const canvas = document.createElement("canvas")
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext("2d")
          ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size)
          canvas.toBlob((blob) => {
            if (blob) {
              const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp"
              resolve(new File([blob], newName, { type: "image/webp" }))
            } else {
              resolve(file)
            }
          }, "image/webp", 0.9)
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
  getPasswordValidationError: (password, { allowEmpty = false } = {}) => {
    const value = (password || "").trim()
    if (!value) return allowEmpty ? "" : "required"
    if (value.length < 6) return "too_short"

    const lower = value.toLowerCase()
    const blocked = new Set([
      "1234",
      "12345",
      "123456",
      "1234567",
      "12345678",
      "0000",
      "000000",
      "1111",
      "111111",
      "password",
      "qwerty",
      "admin",
      "letmein",
    ])
    if (blocked.has(lower)) return "too_common"

    const uniqueChars = new Set(lower)
    if (uniqueChars.size === 1) return "too_simple"

    const isSequential = (text) => {
      if (text.length < 4) return false
      let ascending = true
      let descending = true
      for (let i = 1; i < text.length; i++) {
        const prev = text.charCodeAt(i - 1)
        const curr = text.charCodeAt(i)
        if (curr !== prev + 1) ascending = false
        if (curr !== prev - 1) descending = false
      }
      return ascending || descending
    }

    if (isSequential(lower)) return "too_simple"
    return ""
  },
  getPasswordStrength: (password, { allowEmpty = false } = {}) => {
    const value = (password || "").trim()
    if (!value) {
      return {
        tone: "empty",
        labelKey: allowEmpty ? "" : "password_strength_empty",
      }
    }

    const validationError = Utils.getPasswordValidationError(value, { allowEmpty })
    if (validationError) {
      return { tone: "weak", labelKey: "password_strength_weak" }
    }

    let score = 0
    if (value.length >= 8) score += 1
    if (value.length >= 12) score += 1
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
    if (/\d/.test(value)) score += 1
    if (/[^A-Za-z0-9]/.test(value)) score += 1

    if (score >= 5) return { tone: "strong", labelKey: "password_strength_strong" }
    if (score >= 4) return { tone: "good", labelKey: "password_strength_good" }
    return { tone: "ok", labelKey: "password_strength_ok" }
  },
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
    document.documentElement.lang = this.current
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
      document.documentElement.lang = lang
      this.updatePage()
      this.updateTabs()
      // Re-render board to update dynamic text like "(Overdue)"
      if (typeof UI !== "undefined" && UI.renderBoard) UI.renderBoard()
      if (typeof Notifications !== "undefined" && Notifications.render) Notifications.render()
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

  serverError(message) {
    if (!message) return ""
    const key = BACKEND_ERROR_MAP[message]
    return key ? this.t(key) : message
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
    Utils.qsa("[data-i18n-aria-label]").forEach(el => {
      const key = el.dataset.i18nAriaLabel
      el.setAttribute("aria-label", this.t(key))
    })
  }
}

// Map backend error strings to I18n keys
const BACKEND_ERROR_MAP = {
  "Unauthorized": "unauthorized",
  "Only admin can create boards.": "admin_only_create_boards",
  "Board name is required.": "board_name_required",
  "A board with this name already exists.": "board_name_exists",
  "Only admin can rename boards.": "admin_only_rename_boards",
  "Board ID is required.": "board_id_required",
  "Board not found.": "board_not_found",
  "Only admin of the target board can rename it.": "admin_only_target_rename",
  "Only admin can delete boards.": "admin_only_delete_boards",
  "The default board cannot be deleted.": "default_board_no_delete",
  "Only admin of the target board can delete it.": "admin_only_target_delete",
  "Email and password are required.": "email_pin_required",
  "Invalid email or password.": "incorrect_pin",
  "Board is required.": "board_required",
  "You do not have access to this board.": "no_board_access",
  "Your account is waiting for admin approval.": "account_pending_approval",
  "An account with this email already exists.": "account_exists",
  "Only admin can view all users.": "admin_only_view_users",
  "Only admin can modify board access.": "admin_only_modify_board_access",
  "User and board are required.": "user_board_required",
  "Current board access is managed by approval/removal.": "board_access_managed",
  "You can assign only boards where you are admin.": "assign_only_admin_boards",
  "User is not on the current board.": "user_not_on_board",
  "Admin user cannot be removed from that board.": "admin_cannot_be_removed_from_board",
  "Only admin can modify users.": "admin_only_modify_users",
  "User email is required.": "user_email_required",
  "Changing account email is not supported.": "email_change_not_supported",
  "Password is required for a new user.": "password_required_new_user",
  "Only admin can delete users.": "admin_only_delete_users",
  "Missing user email.": "missing_user_email",
  "Admin user cannot be deleted.": "admin_user_cannot_be_deleted",
  "Only admin can modify users list.": "admin_only_modify_users_list",
  "Only admin can modify board structure.": "admin_only_modify_board_structure",
  "You can edit or delete only your own cards.": "own_card_only_error",
  "You can edit or delete only your own comments.": "own_comment_only_error",
  "Card author cannot be changed.": "card_author_cannot_be_changed",
  "New cards must belong to the current user.": "new_cards_must_belong_to_user",
  "You can add only your own comments.": "own_comments_only",
  "Only admins can perform remote deletion": "admins_only_remote_deletion",

  // CloudflareBackend fallback strings
  "Cloudflare load failed": "cloudflare_load_failed",
  "Cloudflare save failed": "cloudflare_save_failed",
  "Cloudflare not configured": "cloudflare_not_configured",
  "Authentication failed": "auth_failed",
  "Signup failed": "signup_failed",
  "Upload failed": "upload_failed",
  "User save failed": "user_save_failed",
  "Failed to load users": "users_load_failed",
  "Profile save failed": "profile_save_failed",
  "Board access update failed": "board_access_update_failed",
  "Failed to create board": "board_create_failed",
  "Failed to rename board": "board_rename_failed",
  "Failed to switch board": "board_switch_failed",
  "Failed to delete board": "board_delete_failed",
  "Failed to load boards": "boards_load_failed",
  "Failed to save user": "user_save_failed",
  "Failed to delete user": "user_delete_failed",
  "User delete failed": "user_delete_failed",
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
  defaultWorkerUrl() {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      return window.location.origin
    }
    return ""
  },
  get() {
    try {
      const defaultWorkerUrl = this.defaultWorkerUrl()
      const defaults = {
        cfWorkerUrl: defaultWorkerUrl,
        cfBoardId: "default",
        cfUserEmail: "",
        cfUserName: "",
        cfUserToken: "",
        cfBoardSessions: {},
      }
      const sanitize = (id) => (id || "").replace(/[^a-z0-9_-]/gi, "") || "default"
      const saved = JSON.parse(localStorage.getItem(this.KEY)) || {}
      const sanitizedSessions = saved.cfBoardSessions && typeof saved.cfBoardSessions === "object"
        ? Object.fromEntries(
            Object.entries(saved.cfBoardSessions).map(([k, v]) => [sanitize(k), v])
          )
        : {}
      return {
        ...defaults,
        ...saved,
        cfWorkerUrl: saved.cfWorkerUrl || defaultWorkerUrl,
        cfBoardId: sanitize(saved.cfBoardId),
        cfBoardSessions: sanitizedSessions,
      }
    } catch {
      return { cfWorkerUrl: "", cfBoardId: "default", cfUserEmail: "", cfUserName: "", cfUserToken: "", cfBoardSessions: {} }
    }
  },
  set(v) {
    const cfWorkerUrl = (v.cfWorkerUrl || "").trim()
    const cfBoardId = (v.cfBoardId || "default").replace(/[^a-z0-9_-]/gi, "") || "default"
    const cfBoardSessions = v.cfBoardSessions && typeof v.cfBoardSessions === "object" ? { ...v.cfBoardSessions } : {}
    if (v.cfUserToken && v.cfUserEmail) {
      const existingSession = cfBoardSessions[cfBoardId] || {}
      cfBoardSessions[cfBoardId] = {
        cfUserEmail: v.cfUserEmail || "",
        cfUserName: v.cfUserName || "",
        cfUserToken: v.cfUserToken || "",
        isAdmin: v.isAdmin !== undefined ? !!v.isAdmin : !!existingSession.isAdmin,
      }
    }
    localStorage.setItem(this.KEY, JSON.stringify({
      cfWorkerUrl: cfWorkerUrl || this.defaultWorkerUrl(),
      cfBoardId,
      cfUserEmail: v.cfUserEmail || "",
      cfUserName: v.cfUserName || "",
      cfUserToken: v.cfUserToken || "",
      cfBoardSessions,
    }))
  },
  getBoardSession(boardId, config = this.get()) {
    const session = config.cfBoardSessions?.[boardId || "default"]
    if (!session?.cfUserToken) return null
    return session
  },
}

const CloudflareBackend = {
  resolveWorkerUrl(config = {}) {
    return (config.cfWorkerUrl || DbSettings.defaultWorkerUrl()).replace(/\/+$/, "")
  },
  buildHeaders(config, extra = {}) {
    const boardId = (config.cfBoardId || "default").replace(/[^a-z0-9_-]/gi, "") || "default"
    const headers = {
      "X-Board-ID": boardId,
      ...extra,
    }
    if (config.cfUserToken) {
      headers["X-User-Token"] = config.cfUserToken
    }
    return headers
  },
  getAuthenticatedImageUrl(url, config = DbSettings.get()) {
    if (!config.cfUserToken || !url) return url
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) return url
    try {
      const worker = new URL(cfWorkerUrl)
      const u = new URL(url, worker.origin)
      if (u.pathname === "/image" && u.searchParams.get("key")) {
        u.protocol = worker.protocol
        u.host = worker.host
        const key = u.searchParams.get("key")
        const keyBoardId = key.indexOf("/") > 0 ? key.slice(0, key.indexOf("/")) : null
        const imageBoardId = u.searchParams.get("boardId") || keyBoardId || config.cfBoardId || "default"
        const boardSession = DbSettings.getBoardSession(imageBoardId, config)
        u.searchParams.set("token", boardSession?.cfUserToken || config.cfUserToken)
        u.searchParams.set("boardId", boardSession?.cfUserToken ? imageBoardId : (config.cfBoardId || "default"))
        return u.toString()
      }
      if (u.origin === worker.origin) {
        u.searchParams.set("token", config.cfUserToken)
        return u.toString()
      }
    } catch {}
    return url
  },
  async load(config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) return null

    const response = await fetch(`${cfWorkerUrl}/load`, {
      headers: this.buildHeaders(config)
    })
    if (!response.ok) {
      let message = "Cloudflare load failed"
      try {
        const data = await response.json()
        if (data?.error) message = data.error
      } catch {}
      const error = new Error(message)
      error.status = response.status
      throw error
    }

    return await response.json()
  },
  async listBoards(config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/boards`, {
      headers: this.buildHeaders(config),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to load boards")
    return data
  },
  async createBoard(config, name) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/boards`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ name }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to create board")
    return data
  },
  async switchBoard(config, boardId) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/board-session`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ boardId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to switch board")
    return data
  },
  async renameBoard(config, boardId, name) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/boards`, {
      method: "PUT",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ boardId, name }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to rename board")
    return data
  },
  async deleteBoard(config, boardId) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/boards`, {
      method: "DELETE",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ boardId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to delete board")
    return data
  },
  async authenticate(config, email, pinCode) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/auth`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ email, pinCode }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || "Authentication failed")
    }
    return data
  },
  async signup(config, email, pinCode, name = "") {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/signup`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ email, pinCode, name }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Signup failed")
    return data
  },
  async save(state, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) return
    const response = await fetch(`${cfWorkerUrl}/save`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify(state),
    })
    if (!response.ok) {
      let message = "Cloudflare save failed"
      try {
        const data = await response.json()
        if (data?.error) message = data.error
      } catch {
        try {
          const text = await response.text()
          if (text) message = text
        } catch {}
      }
      const error = new Error(message)
      error.status = response.status
      throw error
    }
  },
  async subscribe(config, handler) {
    // Cloudflare D1 doesn't support push.
    // Sync-on-focus (visibilitychange) is used instead in App.setupEventListeners.
    return () => {}
  },
  async uploadImage(file, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/upload`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": file.type }),
      body: file,
    })
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(txt || "Upload failed");
    }
    return await response.json()
  },
  async deleteImage(key, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) return
    await fetch(`${cfWorkerUrl}/delete-image?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: this.buildHeaders(config)
    })
  },
  async upsertUser(user, config, previousEmail = "") {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/user`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ ...user, previousEmail }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "User save failed")
    return data
  },
  async updateProfile(profile, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/profile`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify(profile),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Profile save failed")
    return data
  },
  async listUsers(config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/users`, {
      headers: this.buildHeaders(config),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to load users")
    return data
  },
  async deleteUser(email, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    const { cfBoardId } = config
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/user?email=${encodeURIComponent(email)}&boardId=${encodeURIComponent(cfBoardId || "default")}`, {
      method: "DELETE",
      headers: this.buildHeaders(config),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "User delete failed")
    return data
  },
  async setUserBoardAccess(email, boardId, hasAccess, config) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl) throw new Error("Cloudflare not configured")
    const response = await fetch(`${cfWorkerUrl}/user-board-access`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ email, boardId, hasAccess }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Board access update failed")
    return data
  },
  async listNotifications(config, limit = 50) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl || !config.cfUserToken) return { notifications: [], unreadCount: 0 }
    const response = await fetch(`${cfWorkerUrl}/notifications?limit=${encodeURIComponent(limit)}`, {
      headers: this.buildHeaders(config),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to load notifications")
    return data
  },
  async markNotificationsRead(config, payload = {}) {
    const cfWorkerUrl = this.resolveWorkerUrl(config)
    if (!cfWorkerUrl || !config.cfUserToken) return { notifications: [], unreadCount: 0 }
    const response = await fetch(`${cfWorkerUrl}/notifications/read`, {
      method: "POST",
      headers: this.buildHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "Failed to update notifications")
    return data
  }
}

/**
 * @module Store
 * Manages the application state and persistence to Cloudflare D1.
 */
const Store = {
  isAdmin: false,
  state: {
    columns: [],
    users: [],
  },

  loadState: async function () {
    const cfg = DbSettings.get()
    let data = this.createEmptyState()

    if (cfg.cfWorkerUrl) {
      try {
        data = await CloudflareBackend.load(cfg) || this.createEmptyState()
      } catch (e) {
        if (e?.status === 401 || e?.status === 403) {
          console.warn("Cloudflare session rejected during load:", e)
          if (typeof UI !== "undefined" && UI.clearCloudflareSession) {
            UI.clearCloudflareSession()
          }
        } else {
          console.warn("Cloudflare load failed:", e)
          if (typeof UI !== "undefined" && UI.showAlert) {
            UI.showAlert(I18n.serverError(e.message) || I18n.t("cloudflare_load_failed"))
          }
        }
      }
    }

    try {
      this.validateState(data)
    } catch {
      data = this.createEmptyState()
    }
    this.state = data

    if (!this.state.columns.length) {
      this.state = this.createEmptyState(this.state.users || [])
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
    this.state.users = this.state.users.map((user) => ({
      ...user,
      email: (user.email || "").trim().toLowerCase(),
      avatarUrl: user.avatarUrl || "",
      avatarKey: user.avatarKey || "",
      isAdmin: !!user.isAdmin,
      isApproved: user.isApproved !== false,
    }))
    this.isAdmin = !!this.getCurrentUserProfile()?.isAdmin

    this.state.columns.forEach((col) => {
      col.cards.forEach((card) => this.normalizeCard(card))
    })
    
    return this.state
  },

  addUser(user) {
    if (!user) return
    if (!this.state.users.some(u => u.name === user.name)) {
      this.state.users.push(user)
      this.saveState()
    }
  },

  saveState: async function () {
    const cfg = DbSettings.get()
    if (!cfg.cfWorkerUrl) return
    try {
      Sync.muteNext(900)
      await CloudflareBackend.save(this.state, cfg)
    } catch (e) {
      if (e?.status === 401) {
        console.warn("Cloudflare save rejected:", e)
        if (typeof UI !== "undefined" && UI.clearCloudflareSession) {
          UI.clearCloudflareSession()
          if (UI.renderBoard) UI.renderBoard()
        }
      } else {
        console.warn("Cloudflare save failed:", e)
      }
      if (typeof UI !== "undefined" && UI.showAlert) {
        UI.showAlert(I18n.serverError(e.message) || I18n.t("cloudflare_save_failed"))
      }
    }
  },

  normalizeComment(comment = {}) {
    return {
      id: typeof comment.id === "string" && comment.id ? comment.id : Utils.uid(),
      text: typeof comment.text === "string" ? comment.text : "",
      author: typeof comment.author === "string" ? comment.author : "",
      authorEmail: typeof comment.authorEmail === "string" ? comment.authorEmail.trim().toLowerCase() : "",
      createdAt: comment.createdAt || Utils.nowIso(),
      updatedAt: comment.updatedAt || comment.createdAt || Utils.nowIso(),
      replies: Array.isArray(comment.replies)
        ? comment.replies
            .map((reply) => this.normalizeComment(reply))
            .filter((reply) => reply.text.trim())
        : [],
    }
  },

  normalizeCard(card) {
    card.comments = Array.isArray(card.comments)
      ? card.comments
          .map((comment) => this.normalizeComment(comment))
          .filter((comment) => comment.text.trim())
      : []
    return card
  },

  getCurrentUserName() {
    const cfg = DbSettings.get()
    if (!cfg.cfUserToken) return ""
    return (this.getCurrentUserProfile()?.name || cfg.cfUserName || cfg.cfUserEmail || "").trim()
  },

  getCurrentUserEmail() {
    const cfg = DbSettings.get()
    return cfg.cfUserToken ? (cfg.cfUserEmail || "").trim().toLowerCase() : ""
  },

  getCurrentUserProfile() {
    const email = this.getCurrentUserEmail()
    if (!email) return null
    return this.findUserByEmail(email) || {
      email,
      name: (DbSettings.get().cfUserName || email).trim(),
      avatarUrl: "",
      avatarKey: "",
      isAdmin: !!this.isAdmin,
      isApproved: true,
    }
  },

  hasCloudflareSession() {
    const cfg = DbSettings.get()
    return !!cfg.cfWorkerUrl && !!cfg.cfUserToken
  },

  requiresCloudflareLogin() {
    const cfg = DbSettings.get()
    return !!cfg.cfWorkerUrl && !cfg.cfUserToken
  },

  isCurrentUserAdmin() {
    return !!this.isAdmin
  },

  canCurrentUserEditCard(card) {
    if (this.isCurrentUserAdmin()) return true
    const currentUser = this.getCurrentUserProfile()
    return !!currentUser && !!card && (
      ((card.createdByEmail || "").trim().toLowerCase() && (card.createdByEmail || "").trim().toLowerCase() === currentUser.email) ||
      (!(card.createdByEmail || "").trim() && (card.createdBy || "").trim() === currentUser.name)
    )
  },

  canCurrentUserMoveCard(card) {
    if (this.isCurrentUserAdmin()) return true
    const currentUser = this.getCurrentUserProfile()
    if (!currentUser || !card) return false
    const ownerEmail = (card.createdByEmail || "").trim().toLowerCase()
    const ownerName = (card.createdBy || "").trim()
    const assigneeEmail = (card.assignedUser?.email || "").trim().toLowerCase()
    const assigneeName = (card.assignedUser?.name || "").trim()
    return ownerEmail === currentUser.email || (!ownerEmail && ownerName === currentUser.name) || assigneeEmail === currentUser.email || (!assigneeEmail && assigneeName === currentUser.name)
  },

  canCurrentUserManageComment(comment) {
    if (this.isCurrentUserAdmin()) return true
    return this.canCurrentUserEditComment(comment)
  },

  canCurrentUserEditComment(comment) {
    const currentUser = this.getCurrentUserProfile()
    return !!currentUser && !!comment && (
      ((comment.authorEmail || "").trim().toLowerCase() && (comment.authorEmail || "").trim().toLowerCase() === currentUser.email) ||
      (!(comment.authorEmail || "").trim() && (comment.author || "").trim() === currentUser.name)
    )
  },

  canCurrentUserComment() {
    return !!this.getCurrentUserName()
  },

  canCurrentUserManageBoardStructure() {
    return this.isCurrentUserAdmin()
  },

  findUserByName(name) {
    return (this.state.users || []).find((user) => (user.name || "").trim() === (name || "").trim()) || null
  },

  findUserByEmail(email) {
    return (this.state.users || []).find((user) => (user.email || "").trim().toLowerCase() === (email || "").trim().toLowerCase()) || null
  },

  getCommentCount(card) {
    const walk = (comments = []) => comments.reduce((sum, comment) => sum + 1 + walk(comment.replies || []), 0)
    return walk(card?.comments || [])
  },

  findComment(card, commentId, comments = card?.comments || [], parent = null) {
    for (const comment of comments) {
      if (comment.id === commentId) return { comment, parent, siblings: comments }
      const nested = this.findComment(card, commentId, comment.replies || [], comment)
      if (nested.comment) return nested
    }
    return { comment: null, parent: null, siblings: null }
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
      const currentUser = this.getCurrentUserProfile()
      const newCard = {
        id: Utils.uid(),
        title: cardData.title,
        description: cardData.description || "",
        tags: cardData.tags || [],
        due: cardData.due || "",
        assignedUser: cardData.assignedUser || null,
        attachments: cardData.attachments || [],
        comments: cardData.comments || [],
        createdBy: currentUser?.name || currentUser?.email || "",
        createdByEmail: currentUser?.email || "",
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
      col.cards.unshift(newCard)
      this.saveState()
      return newCard
    }
  },

  updateCard(cardId, cardData) {
    const { card } = this.findCard(cardId)
    if (card) {
      const currentUser = this.getCurrentUserProfile()
      card.title = cardData.title
      card.description = cardData.description
      card.tags = cardData.tags
      card.due = cardData.due
      card.assignedUser = cardData.assignedUser || null
      card.attachments = cardData.attachments || []
      card.comments = cardData.comments || card.comments || []
      if (!card.createdBy) {
        card.createdBy = currentUser?.name || currentUser?.email || ""
      }
      if (!card.createdByEmail) {
        card.createdByEmail = currentUser?.email || ""
      }
      
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
        cardToDelete.attachments.forEach(att => {
          if (att.key) CloudflareBackend.deleteImage(att.key, cfg).catch(console.error)
        })
      }
    }
  },

  addComment(cardId, text, parentCommentId = "") {
    const { card } = this.findCard(cardId)
    const currentUser = this.getCurrentUserProfile()
    const author = currentUser?.name || currentUser?.email || ""
    const authorEmail = currentUser?.email || ""
    if (!card || !authorEmail) return null
    const now = Utils.nowIso()
    const comment = this.normalizeComment({
      id: Utils.uid(),
      text,
      author,
      authorEmail,
      createdAt: now,
      updatedAt: now,
    })
    if (parentCommentId) {
      const parentEntry = this.findComment(card, parentCommentId)
      if (!parentEntry.comment) return null
      parentEntry.comment.replies = parentEntry.comment.replies || []
      parentEntry.comment.replies.push(comment)
    } else {
      card.comments = card.comments || []
      card.comments.push(comment)
    }
    card.lastChanged = now
    card.lastChangedBy = Meta.clientId
    card.seq = Meta.nextSeq()
    this.saveState()
    return comment
  },

  updateComment(cardId, commentId, text) {
    const { card } = this.findCard(cardId)
    if (!card) return null
    const comment = this.findComment(card, commentId).comment
    if (!comment) return null
    comment.text = text
    comment.updatedAt = Utils.nowIso()
    card.lastChanged = comment.updatedAt
    card.lastChangedBy = Meta.clientId
    card.seq = Meta.nextSeq()
    this.saveState()
    return comment
  },

  deleteComment(cardId, commentId) {
    const { card } = this.findCard(cardId)
    if (!card || !Array.isArray(card.comments)) return false
    const entry = this.findComment(card, commentId)
    const siblings = entry.siblings
    const index = siblings ? siblings.findIndex((entry) => entry.id === commentId) : -1
    if (index === -1) return false
    siblings.splice(index, 1)
    card.lastChanged = Utils.nowIso()
    card.lastChangedBy = Meta.clientId
    card.seq = Meta.nextSeq()
    this.saveState()
    return true
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

  createEmptyState(users = []) {
    const now = Utils.nowIso()
    const currentEmail = (DbSettings.get().cfUserEmail || "").trim().toLowerCase()
    const starterAssignee =
      users.find((user) => (user.email || "").trim().toLowerCase() === currentEmail) ||
      users[0] ||
      null
    const starterCard = {
      id: Utils.uid(),
      title: I18n.t("starter_card_title"),
      description: I18n.t("starter_card_desc"),
      tags: ["starter"],
      due: "",
      assignedUser: starterAssignee
        ? {
            email: (starterAssignee.email || "").trim().toLowerCase(),
            name: (starterAssignee.name || "").trim(),
          }
        : null,
      attachments: [],
      comments: [],
      createdBy: "",
      createdByEmail: "",
      createdAt: now,
      lastChanged: now,
      lastChangedBy: "system",
      seq: 0,
      contentChangedAt: now,
      positionChangedAt: now,
    }

    return {
      users,
      columns: [
        {
          id: Utils.uid(),
          title: I18n.t("todo_col_title"),
          cards: [starterCard],
        },
        {
          id: Utils.uid(),
          title: I18n.t("in_progress_col_title"),
          cards: [],
        },
        {
          id: Utils.uid(),
          title: I18n.t("blocked_col_title"),
          cards: [],
        },
        {
          id: Utils.uid(),
          title: I18n.t("done_col_title"),
          isDone: true,
          cards: [],
        },
        {
          id: "archive",
          title: I18n.t("archive_col_title"),
          isDone: false,
          isArchive: true,
          cards: [],
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
      if (!cfg.cfWorkerUrl) return
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

const Notifications = {
  items: [],
  unreadCount: 0,
  isLoading: false,

  async refresh() {
    const cfg = DbSettings.get()
    if (!cfg.cfWorkerUrl || !cfg.cfUserToken) {
      this.items = []
      this.unreadCount = 0
      this.render()
      return
    }
    this.isLoading = true
    this.render()
    try {
      const data = await CloudflareBackend.listNotifications(cfg)
      this.items = Array.isArray(data.notifications) ? data.notifications : []
      this.unreadCount = Number(data.unreadCount || 0)
    } catch (err) {
      console.warn("Failed to load notifications:", err)
    } finally {
      this.isLoading = false
      this.render()
    }
  },

  async markRead(id) {
    if (!id) return
    const cfg = DbSettings.get()
    try {
      const data = await CloudflareBackend.markNotificationsRead(cfg, { id })
      this.items = Array.isArray(data.notifications) ? data.notifications : this.items.map((item) => item.id === id ? { ...item, readAt: Utils.nowIso() } : item)
      this.unreadCount = Number(data.unreadCount ?? this.items.filter((item) => !item.readAt).length)
      this.render()
    } catch (err) {
      console.warn("Failed to mark notification read:", err)
    }
  },

  async markAllRead() {
    const cfg = DbSettings.get()
    if (!cfg.cfUserToken) return
    try {
      const data = await CloudflareBackend.markNotificationsRead(cfg, { all: true })
      this.items = Array.isArray(data.notifications) ? data.notifications : this.items.map((item) => ({ ...item, readAt: item.readAt || Utils.nowIso() }))
      this.unreadCount = Number(data.unreadCount || 0)
      this.render()
    } catch (err) {
      console.warn("Failed to mark all notifications read:", err)
    }
  },

  format(item) {
    const meta = item.metadata || {}
    const params = {
      actor: meta.actorName || meta.actorEmail || item.actorEmail || I18n.t("someone"),
      card: meta.cardTitle || item.body || I18n.t("card"),
      from: meta.fromColumnTitle || "",
      to: meta.toColumnTitle || meta.columnTitle || "",
      comment: meta.commentText || item.body || "",
      board: meta.boardName || meta.boardId || "",
      due: meta.due ? new Date(meta.due).toLocaleString() : "",
    }
    const titleKey = `notification_${item.type}_title`
    const bodyKey = `notification_${item.type}_body`
    return {
      title: I18n.t(titleKey, params) === titleKey ? (item.title || I18n.t("notification")) : I18n.t(titleKey, params),
      body: I18n.t(bodyKey, params) === bodyKey ? (item.body || "") : I18n.t(bodyKey, params),
    }
  },

  render() {
    const wrap = Utils.qs("#notificationsWrap")
    const badge = Utils.qs("#notificationsBadge")
    const list = Utils.qs("#notificationsList")
    const markAllBtn = Utils.qs("#markAllNotificationsReadBtn")
    if (!wrap || !badge || !list || !markAllBtn) return

    const hasSession = Store.hasCloudflareSession()
    wrap.style.display = hasSession ? "" : "none"
    badge.hidden = !hasSession || this.unreadCount <= 0
    badge.textContent = this.unreadCount > 0 ? (this.unreadCount > 99 ? "99+" : String(this.unreadCount)) : ""
    markAllBtn.disabled = this.unreadCount <= 0

    list.innerHTML = ""
    if (!hasSession) return
    if (this.isLoading && this.items.length === 0) {
      const empty = document.createElement("div")
      empty.className = "notifications-empty"
      empty.textContent = I18n.t("notifications_loading")
      list.append(empty)
      return
    }
    if (this.items.length === 0) {
      const empty = document.createElement("div")
      empty.className = "notifications-empty"
      empty.textContent = I18n.t("notifications_empty")
      list.append(empty)
      return
    }

    this.items.forEach((item) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = `notification-item${item.readAt ? "" : " unread"}`
      button.dataset.notificationId = item.id || ""
      button.dataset.cardId = item.cardId || ""

      const text = document.createElement("span")
      text.className = "notification-item-text"
      const formatted = this.format(item)
      const title = document.createElement("strong")
      title.textContent = formatted.title
      const body = document.createElement("span")
      body.textContent = formatted.body
      text.append(title, body)

      const time = document.createElement("time")
      time.className = "notification-item-time"
      if (item.createdAt) {
        time.dateTime = item.createdAt
        time.textContent = new Date(item.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      }

      button.append(text, time)
      list.append(button)
    })
  },

  async open(itemId) {
    const item = this.items.find((entry) => entry.id === itemId)
    if (!item) return
    await this.markRead(item.id)
    Utils.qs("#notificationsPanel")?.classList.remove("show")
    if (!item.cardId) return
    const { card, col } = Store.findCard(item.cardId)
    if (!card || !col) {
      UI.showAlert(I18n.t("notification_card_missing"))
      return
    }
    UI.showCardDetail(card, col.id)
  },
}

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
  cardDetailDialog: Utils.qs("#cardDetailDialog"),
  colDialog: Utils.qs("#colDialog"),
  renameDialog: Utils.qs("#renameDialog"),
  confirmDialog: Utils.qs("#confirmDialog"),
  promptDialog: Utils.qs("#promptDialog"),
  dropzone: Utils.qs("#dropzone"),
  // Templates
  columnTemplate: Utils.qs("#columnTemplate"),
  cardTemplate: Utils.qs("#cardTemplate"),
  // Menu
  menuBtn: Utils.qs("#menuBtn"),
  menuContent: Utils.qs("#menuContent"),
  notificationsBtn: Utils.qs("#notificationsBtn"),
  notificationsPanel: Utils.qs("#notificationsPanel"),
  toggleArchiveBtn: Utils.qs("#toggleArchiveBtn"),
  logoutBtn: Utils.qs("#logoutBtn"),
  profileBtn: Utils.qs("#profileBtn"),

  // State for filtering
  activeTagFilters: new Set(),
  activeUserFilters: new Set(),
  searchQuery: "",
  editingCommentId: "",
  replyToCommentId: "",
  authMode: "login",
  adminUsers: [],
  adminBoards: [],
  accessibleBoards: [],
  pendingProfileAvatarFile: null,
  pendingProfileAvatarRemoved: false,
  pendingCardAttachments: [],
  dragCounter: 0,
  activeUploadContext: "editor",

  toggleDropzone(active) {
    const el = Utils.qs("#dropzone") // Using qs directly in case this.dropzone is stale
    if (!el) return
    if (active) {
      el.style.display = "flex"
      // Force repaint
      el.offsetHeight
      el.classList.add("active")
    } else {
      el.classList.remove("active")
      // Delay display none after transition
      setTimeout(() => {
        if (!el.classList.contains("active")) {
          el.style.display = "none"
        }
      }, 250)
    }
  },

  getMoveToColumns(cardId) {
    const { col } = Store.findCard(cardId)
    if (!col) return []
    return Store.state.columns.filter((targetCol) => {
      return !targetCol.isDone && !targetCol.isArchive && targetCol.id !== col.id
    })
  },

  hideMoveToMenu() {
    const menu = Utils.qs("#moveToMenu")
    if (menu) menu.classList.remove("show")
    const detailMenu = Utils.qs("#cardDetailMoveToMenu")
    if (detailMenu) detailMenu.classList.remove("show")
  },

  renderMoveToMenu(cardId, menuSelector = "#moveToMenu") {
    const menu = Utils.qs(menuSelector)
    if (!menu) return []
    menu.innerHTML = ""

    const columns = this.getMoveToColumns(cardId)
    columns.forEach((col) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "btn secondary"
      btn.dataset.moveToColId = col.id
      btn.setAttribute("role", "menuitem")
      btn.textContent = col.title
      menu.append(btn)
    })

    return columns
  },

  formatDateTime(value) {
    if (!value) return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  },

  toLocalDateTimeInput(value) {
    if (!value) return ""
    const dateObj = new Date(value)
    if (Number.isNaN(dateObj.getTime())) return ""
    const localDate = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
    return localDate.toISOString().slice(0, 16)
  },

  hasMeaningfulHtml(html) {
    const temp = document.createElement("div")
    temp.innerHTML = html || ""
    return temp.textContent.trim().length > 0 || temp.querySelector("img, iframe, a, hr") !== null
  },

  updateAuthButtonsVisibility() {
    const cfg = DbSettings.get()
    const showAuth = !!cfg.cfWorkerUrl
    if (this.logoutBtn) this.logoutBtn.style.display = showAuth && Store.hasCloudflareSession() ? "" : "none"
    if (this.profileBtn) this.profileBtn.style.display = showAuth && Store.hasCloudflareSession() ? "" : "none"
    const notificationsWrap = Utils.qs("#notificationsWrap")
    if (notificationsWrap) notificationsWrap.style.display = showAuth && Store.hasCloudflareSession() ? "" : "none"
    this.updateBoardNameLabel()
  },

  updateBoardNameLabel() {
    const label = Utils.qs("#boardNameLabel")
    if (!label) return
    const cfg = DbSettings.get()
    const isLoggedIn = !!cfg.cfWorkerUrl && Store.hasCloudflareSession()
    if (!isLoggedIn) {
      label.style.display = "none"
      return
    }
    const board = (this.accessibleBoards || []).find((b) => b.id === cfg.cfBoardId)
    label.textContent = board?.name || cfg.cfBoardId || ""
    label.style.display = ""
  },

  updateBoardActionsVisibility() {
    const cfg = DbSettings.get()
    const isCloudflareLoggedOut = !cfg.cfWorkerUrl || !Store.hasCloudflareSession()
    const addColumnBtn = Utils.qs("#addColumnBtn")
    const toggleArchiveBtn = Utils.qs("#toggleArchiveBtn")
    if (addColumnBtn) addColumnBtn.style.display = isCloudflareLoggedOut ? "none" : ""
    if (toggleArchiveBtn) toggleArchiveBtn.style.display = isCloudflareLoggedOut ? "none" : ""
  },

  clearCloudflareSession({ keepUserName = true } = {}) {
    const cfg = DbSettings.get()
    const nextCfg = {
      ...cfg,
      cfUserEmail: "",
      cfUserToken: "",
      cfBoardSessions: {},
    }
    if (!keepUserName) nextCfg.cfUserName = ""
    DbSettings.set(nextCfg)
    Store.isAdmin = false
    this.accessibleBoards = []
    this.updateAdminPanelVisibility()
    this.updateAuthButtonsVisibility()
    this.updateMenuButtonAvatar()
    Notifications.refresh()
  },

  updateAdminPanelVisibility() {
    const adminBtn = Utils.qs("#adminPanelBtn");
    if (!adminBtn) return;
    const cfg = DbSettings.get();

    if (cfg.cfWorkerUrl && Store.isAdmin) {
      adminBtn.style.display = "block";
    } else {
      adminBtn.style.display = "none";
    }
  },

  updateMenuButtonAvatar() {
    if (!this.menuBtn) return
    const cfg = DbSettings.get()
    if (!cfg.cfUserToken) {
      this.menuBtn.textContent = "☰"
      this.menuBtn.innerHTML = "☰"
      return
    }
    const currentUser = Store.getCurrentUserProfile()
    if (currentUser?.avatarUrl) {
      const img = document.createElement("img")
      img.src = CloudflareBackend.getAuthenticatedImageUrl(currentUser.avatarUrl)
      img.alt = ""
      img.className = "menu-avatar-img"
      this.menuBtn.innerHTML = ""
      this.menuBtn.appendChild(img)
    } else {
      this.menuBtn.textContent = "☰"
    }
  },

  renderBoardSelect(selectEl, fallbackInput, boards = this.accessibleBoards) {
    if (!selectEl) return
    const cfg = DbSettings.get()
    selectEl.innerHTML = ""
    const currentBoardId = cfg.cfBoardId || "default"
    const normalizedBoards = Array.isArray(boards) ? [...boards] : []
    if (!normalizedBoards.length) {
      selectEl.style.display = "none"
      if (fallbackInput) {
        fallbackInput.value = currentBoardId
        fallbackInput.style.display = ""
      }
      return
    }

    if (!normalizedBoards.some((board) => board.id === currentBoardId)) {
      normalizedBoards.unshift({ id: currentBoardId, name: currentBoardId })
    }

    normalizedBoards.forEach((board) => {
      const option = document.createElement("option")
      option.value = board.id
      option.textContent = board.name || board.id
      selectEl.append(option)
    })
    selectEl.value = currentBoardId
    selectEl.style.display = ""
    if (fallbackInput) {
      fallbackInput.value = currentBoardId
      fallbackInput.style.display = "none"
    }
  },

  updateProfileAvatarPreview(avatarUrl = "") {
    const preview = Utils.qs("#profileAvatarPreview")
    const removeBtn = Utils.qs("#removeAvatarBtn")
    if (!preview) return
    if (avatarUrl) {
      preview.classList.remove("placeholder")
      const img = document.createElement("img")
      img.src = CloudflareBackend.getAuthenticatedImageUrl(avatarUrl)
      img.alt = ""
      preview.innerHTML = ""
      preview.appendChild(img)
    } else {
      preview.classList.add("placeholder")
      preview.innerHTML = ""
    }
    if (removeBtn) removeBtn.disabled = !avatarUrl && !this.pendingProfileAvatarFile
  },

  enhancePasswordField(input, options = {}) {
    if (!input) return
    const { allowEmpty = false } = options

    if (input.dataset.passwordEnhanced === "true") {
      const shell = input.parentElement
      const strength = shell?.nextElementSibling?.classList.contains("password-strength")
        ? shell.nextElementSibling
        : null
      if (strength) {
        const state = Utils.getPasswordStrength(input.value, { allowEmpty })
        strength.className = `password-strength password-strength--${state.tone}`
        strength.textContent = I18n.t(state.labelKey)
      }
      return
    }

    const shell = document.createElement("div")
    shell.className = "password-input-shell"
    input.parentNode.insertBefore(shell, input)
    shell.appendChild(input)

    const strength = document.createElement("div")
    strength.className = "password-strength password-strength--empty"
    shell.insertAdjacentElement("afterend", strength)

    const update = () => {
      const state = Utils.getPasswordStrength(input.value, { allowEmpty })
      strength.className = `password-strength password-strength--${state.tone}`
      strength.textContent = I18n.t(state.labelKey)
    }

    input.addEventListener("input", update)
    input.dataset.passwordEnhanced = "true"
    update()
  },

  renderD1SetupGate() {
    this.board.innerHTML = `
      <section class="board-login-gate">
        <h2>${I18n.t("d1_setup_title")}</h2>
        <p>${I18n.t("d1_setup_hint")}</p>
      </section>
    `
    this.updateTagFilters()
    this.applyFilters()
    this.updateMenuButtonAvatar()
    this.updateAuthButtonsVisibility()
    this.updateBoardActionsVisibility()
    this.updateAdminPanelVisibility()
  },

  renderLoginGate() {
    const cfg = DbSettings.get()
    const isSignup = this.authMode === "signup"
    const isOwnerBootstrap = (Store.state.users || []).length === 0
    this.board.innerHTML = `
      <section class="board-login-gate">
        <h2>${I18n.t(isSignup ? (isOwnerBootstrap ? "signup_owner_title" : "signup_title") : "login_title")}</h2>
        <p>${I18n.t(isSignup ? (isOwnerBootstrap ? "signup_owner_hint" : "login_required") : "login_required")}</p>
        ${isSignup ? `
          <form id="boardSignupForm" class="board-login-form">
            <label>
              <span>${I18n.t("email_label")}</span>
              <input id="boardSignupEmail" type="email" autocomplete="email" data-i18n-placeholder="email_placeholder" placeholder="Enter your email">
            </label>
            <label>
              <span>${I18n.t("display_name")}</span>
              <input id="boardSignupName" type="text" autocomplete="name" data-i18n-placeholder="display_name_placeholder" placeholder="How others should see you">
            </label>
            <label>
              <span>${I18n.t("new_password")}</span>
              <input id="boardSignupPinCode" type="password" data-i18n-placeholder="signup_password_placeholder" placeholder="Choose a password">
            </label>
            <button type="submit" class="btn primary">${I18n.t("signup_action")}</button>
          </form>
          <div class="board-auth-switch">
            <button type="button" id="signupBackBtn" class="board-auth-link">&larr; ${I18n.t("back")}</button>
            ${isOwnerBootstrap ? "" : `<button type="button" id="showLoginMode" class="board-auth-link">${I18n.t("go_to_login")}</button>`}
          </div>
        ` : `
          <form id="boardLoginForm" class="board-login-form">
            <label>
              <span>${I18n.t("email_label")}</span>
              <input id="boardLoginEmail" type="email" autocomplete="email" data-i18n-placeholder="email_placeholder" placeholder="Enter your email">
            </label>
            <label>
              <span>${I18n.t("pin_code")}</span>
              <input id="boardLoginPinCode" type="password" data-i18n-placeholder="login_password_placeholder" placeholder="Enter your password">
            </label>
            <button type="submit" class="btn primary">${I18n.t("login")}</button>
          </form>
          <div class="board-auth-switch">
            <button type="button" id="showSignupMode" class="board-auth-link">${I18n.t(isOwnerBootstrap ? "signup_owner_title" : "go_to_signup")}</button>
          </div>
        `}
      </section>
    `
    const emailInput = Utils.qs("#boardLoginEmail", this.board)
    if (emailInput) emailInput.value = cfg.cfUserEmail || ""
    const boardLoginForm = Utils.qs("#boardLoginForm", this.board)
    if (boardLoginForm) {
      boardLoginForm.addEventListener("submit", App.handleCloudflareLogin.bind(App))
    }
    const signupForm = Utils.qs("#boardSignupForm", this.board)
    if (signupForm) {
      this.enhancePasswordField(Utils.qs("#boardSignupPinCode", signupForm))
      signupForm.addEventListener("submit", App.handleCloudflareSignup.bind(App))
    }
    Utils.qs("#signupBackBtn", this.board)?.addEventListener("click", () => {
      this.authMode = "login"
      this.renderLoginGate()
    })
    Utils.qs("#showSignupMode", this.board)?.addEventListener("click", () => {
      this.authMode = "signup"
      this.renderLoginGate()
    })
    Utils.qs("#showLoginMode", this.board)?.addEventListener("click", () => {
      this.authMode = "login"
      this.renderLoginGate()
    })
    this.updateTagFilters()
    this.applyFilters()
    this.updateMenuButtonAvatar()
    this.updateAuthButtonsVisibility()
    this.updateBoardActionsVisibility()
    this.updateAdminPanelVisibility()
    if (typeof I18n !== "undefined") I18n.updatePage()
  },

  createAvatarNode(user, options = {}) {
    const { subtle = false } = options
    const resolvedUser = (user?.email && Store.findUserByEmail(user.email)) || Store.findUserByName(user?.name || "") || user || {}
    if (resolvedUser.avatarUrl) {
      const img = document.createElement("img")
      img.src = CloudflareBackend.getAuthenticatedImageUrl(resolvedUser.avatarUrl)
      img.alt = ""
      img.className = `avatar-image${subtle ? " avatar-image--subtle" : ""}`
      return img
    }
    const dot = document.createElement("span")
    dot.className = "avatar-dot"
    if (subtle) dot.classList.add("avatar-dot--subtle")
    const label = resolvedUser.name || resolvedUser.email || user?.name || user?.email || "?"
    const initial = label[0]
    dot.textContent = initial
    dot.style.background = Utils.colorFromString(label)
    return dot
  },

  renderAdminUsers() {
    const list = Utils.qs("#adminUserList");
    if (!list) return;
    list.innerHTML = "";

    // Security check to prevent rendering if not admin
    const cfg = DbSettings.get();
    if (!cfg.cfWorkerUrl || !Store.isAdmin) {
      return;
    }

    const currentEmail = (cfg.cfUserEmail || "").trim().toLowerCase();

    (this.adminUsers || []).forEach((u) => {
      const isProtectedAdmin = !!u.isAdmin;
      const isSelf = (u.email || "").trim().toLowerCase() === currentEmail;
      const row = document.createElement("div");
      row.className = "admin-user-card";

      // --- Header: Avatar + Identity + Badge Toggles ---
      const header = document.createElement("div");
      header.className = "admin-user-header";

      const avatarContainer = document.createElement("div");
      avatarContainer.className = "admin-user-head";
      const avatarPreview = document.createElement("div");
      avatarPreview.className = "profile-avatar-preview admin-user-avatar";
      if (u.avatarUrl) {
        const img = document.createElement("img")
        img.src = CloudflareBackend.getAuthenticatedImageUrl(u.avatarUrl)
        img.alt = ""
        avatarPreview.innerHTML = ""
        avatarPreview.append(img)
      } else {
        avatarPreview.classList.add("placeholder");
      }
      avatarContainer.append(avatarPreview);

      const identity = document.createElement("div");
      identity.className = "admin-user-identity";
      const displayNameEl = document.createElement("span");
      displayNameEl.className = "admin-user-display-name";
      displayNameEl.textContent = u.name || u.email || I18n.t("new_user");
      const emailHintEl = document.createElement("span");
      emailHintEl.className = "admin-user-email-hint";
      emailHintEl.textContent = u.name ? (u.email || "") : "";
      identity.append(displayNameEl, emailHintEl);

      const badges = document.createElement("div");
      badges.className = "admin-user-badges";

      const createToggle = (label, isChecked, isDisabled = false) => {
        const wrap = document.createElement("label");
        wrap.className = "admin-badge-toggle";
        wrap.classList.toggle("is-checked", !!isChecked);
        if (isDisabled) wrap.classList.add("disabled");
        const inp = document.createElement("input");
        inp.type = "checkbox";
        inp.checked = isChecked;
        inp.disabled = isDisabled;
        const text = document.createElement("span");
        text.className = "toggle-label-text";
        text.textContent = label;
        const slider = document.createElement("span");
        slider.className = "toggle-slider";
        inp.addEventListener("change", () => {
          wrap.classList.toggle("is-checked", inp.checked);
        });
        wrap.append(inp, text, slider);
        return { wrap, inp };
      };

      const { wrap: approvedWrap, inp: approvedInp } = createToggle(I18n.t("approved_user"), !!u.isApproved, isSelf);
      const { wrap: adminWrap, inp: adminInp } = createToggle(I18n.t("admin_role"), !!u.isAdmin, isSelf);
      badges.append(approvedWrap, adminWrap);

      header.append(avatarContainer, identity, badges);

      // --- Body: Password Reset ---
      const body = document.createElement("div");
      body.className = "admin-user-body";

      const passwordField = document.createElement("label");
      passwordField.className = "admin-user-field";
      const passwordLabel = document.createElement("span");
      passwordLabel.className = "admin-user-field-label";
      passwordLabel.textContent = I18n.t("new_password");
      const pinInp = document.createElement("input");
      pinInp.type = "password";
      pinInp.className = "admin-user-input";
      pinInp.placeholder = I18n.t("password_leave_blank_hint");
      passwordField.append(passwordLabel, pinInp);
      this.enhancePasswordField(pinInp, { allowEmpty: true });

      const boardAccess = document.createElement("div");
      boardAccess.className = "admin-user-board-access";
      const boardAccessLabel = document.createElement("span");
      boardAccessLabel.className = "admin-user-field-label";
      boardAccessLabel.textContent = I18n.t("board_access");
      const boardList = document.createElement("div");
      boardList.className = "admin-user-board-list";
      const userBoards = new Set(Array.isArray(u.boards) ? u.boards : []);
      (this.adminBoards || []).forEach((board) => {
        const boardToggle = document.createElement("label");
        boardToggle.className = "admin-user-board-toggle";
        const boardInput = document.createElement("input");
        boardInput.type = "checkbox";
        boardInput.checked = board.id === cfg.cfBoardId || userBoards.has(board.id);
        boardInput.disabled = board.id === cfg.cfBoardId || isSelf;
        boardToggle.classList.toggle("is-current", board.id === cfg.cfBoardId || isSelf);
        const boardText = document.createElement("span");
        boardText.textContent = board.name || board.id;
        boardToggle.append(boardInput, boardText);
        boardInput.addEventListener("change", async () => {
          try {
            const result = await CloudflareBackend.setUserBoardAccess(u.email, board.id, boardInput.checked, cfg);
            UI.adminUsers = result.users || UI.adminUsers;
            UI.adminBoards = result.boards || UI.adminBoards;
            UI.renderAdminUsers();
          } catch (err) {
            boardInput.checked = !boardInput.checked;
            UI.showAlert(I18n.serverError(err.message) || I18n.t("board_access_update_failed"));
          }
        });
        boardList.append(boardToggle);
      });
      boardAccess.append(boardAccessLabel, boardList);

      body.append(passwordField, boardAccess);
      row.append(header, body);

      // --- Footer: Actions ---
      const footerContainer = document.createElement("div");
      footerContainer.className = "admin-user-footer";

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn-link admin-user-save";
      saveBtn.type = "button";
      saveBtn.textContent = I18n.t("save");

      const delBtn = document.createElement("button");
      delBtn.className = "btn-link error admin-user-delete";
      delBtn.textContent = I18n.t("delete_user");
      if (isProtectedAdmin) delBtn.style.display = "none";

      footerContainer.append(delBtn, saveBtn);
      row.append(footerContainer);

      const updateSaveVisibility = () => {
        const hasChanges =
          pinInp.value.trim() !== "" ||
          approvedInp.checked !== !!u.isApproved ||
          adminInp.checked !== !!u.isAdmin;
        saveBtn.style.visibility = hasChanges ? "visible" : "hidden";
        const footerHasContent = hasChanges || !isProtectedAdmin;
        footerContainer.style.display = footerHasContent ? "flex" : "none";
      };

      pinInp.addEventListener("input", updateSaveVisibility);
      approvedInp.addEventListener("change", updateSaveVisibility);
      adminInp.addEventListener("change", updateSaveVisibility);
      updateSaveVisibility();

      const saveChanges = async () => {
        const nextPin = pinInp.value.trim();
        if (!u.email) return;
        const passwordError = Utils.getPasswordValidationError(nextPin, { allowEmpty: true });
        if (passwordError) {
          UI.showAlert(I18n.t("weak_password_error"));
          return;
        }

        if (cfg.cfWorkerUrl) {
          try {
            const result = await CloudflareBackend.upsertUser({
              email: u.email,
              name: u.name || "",
              isApproved: approvedInp.checked,
              isAdmin: adminInp.checked,
              pinCode: nextPin || undefined,
              avatarUrl: u.avatarUrl || "",
              avatarKey: u.avatarKey || "",
            }, cfg, u.email);
            UI.adminUsers = result.users || UI.adminUsers;
            await Store.loadState();
            UI.renderBoard();
            UI.renderAdminUsers();
            await Notifications.refresh();
          } catch (err) {
            UI.showAlert(I18n.serverError(err.message) || I18n.t("user_save_failed"));
          }
          return;
        }
      };
      
      saveBtn.addEventListener("click", () => { saveChanges(); });
      
      delBtn.addEventListener("click", async () => {
        if (isProtectedAdmin) return
        const choice = await UI.showConfirm(I18n.t("delete_user_confirm", { id: u.email || u.name }), {
          title: I18n.t("delete_user"),
          deleteText: I18n.t("delete"),
          showArchiveButton: false,
        })
        if (choice !== "delete") return
        const avatarKey = u.avatarKey
        if (cfg.cfWorkerUrl) {
          CloudflareBackend.deleteUser(u.email, cfg)
            .then(async (result) => {
              UI.adminUsers = result.users || [];
              await Store.loadState();
              UI.renderBoard();
              UI.renderAdminUsers();
              UI.updateMenuButtonAvatar();
              await Notifications.refresh();
              if (avatarKey) {
                CloudflareBackend.deleteImage(avatarKey, cfg).catch(console.error)
              }
            })
            .catch((err) => UI.showAlert(I18n.serverError(err.message) || I18n.t("user_delete_failed")));
        }
      });
      list.appendChild(row);
    });
  },

  showDialog(dialog) {
    document.body.classList.add("dialog-open")
    dialog.showModal()
    dialog.focus()
  },

  // --- Card Rendering ---
  createCardElement(card, column) {
    const node = this.cardTemplate.content.firstElementChild.cloneNode(true)
    node.dataset.id = card.id

    // Add pointerdown listener on the whole card for drag-and-drop (mouse only)
    node.addEventListener("pointerdown", Dnd.startCardPotentialDrag)

    this.updateCardElement(node, card, column)

    return node
  },

  updateCardElement(node, card, column) {
    const cfg = DbSettings.get()
    const deleteBtn = Utils.qs(".btn-del-card", node)
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
          const authUrl = CloudflareBackend.getAuthenticatedImageUrl(att.url)
          img.src = authUrl
          img.loading = "lazy"
          img.alt = I18n.t("attachment")
          item.append(img)
          
          item.addEventListener("pointerdown", (e) => {
            e.stopPropagation()
            this.showLightbox(authUrl)
          })
          attBox.append(item)
        })
      } else {
        attBox.style.display = "none"
      }
    }

    const commentsCountEl = Utils.qs(".card-comments-count", node)
    if (commentsCountEl) {
      const count = Store.getCommentCount(card)
      if (count > 0) {
        commentsCountEl.textContent = I18n.t("comments_count", { count })
        commentsCountEl.title = I18n.t("comments")
        commentsCountEl.style.display = ""
      } else {
        commentsCountEl.textContent = ""
        commentsCountEl.style.display = "none"
      }
    }

    if (deleteBtn) {
      deleteBtn.style.display = Store.canCurrentUserEditCard(card) ? "" : "none"
    }

    const creatorEl = Utils.qs(".card-creator", node)
    if (creatorEl) {
      const creatorName = (card.createdBy || "").trim()
      if (creatorName) {
        creatorEl.innerHTML = ""
        const createdAtTs = card.createdAt ? Date.parse(card.createdAt) : 0
        const editedAtTs = card.contentChangedAt ? Date.parse(card.contentChangedAt) : 0
        const isEdited = !!createdAtTs && !!editedAtTs && editedAtTs > createdAtTs
        const timestamp = isEdited ? card.contentChangedAt : card.createdAt
        const formattedTimestamp = timestamp
          ? new Date(timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""
        const label = document.createElement("span")
        label.className = "card-creator-label"
        label.textContent = `${I18n.t(isEdited ? "edited_label" : "author_label")}:`
        const meta = document.createElement("span")
        meta.className = "card-creator-meta"
        meta.textContent = formattedTimestamp
        creatorEl.append(
          label,
          this.createUserBadge({ name: creatorName, email: card.createdByEmail || "" }, { subtle: true }),
          meta
        )
        creatorEl.style.display = ""
      } else {
        creatorEl.innerHTML = ""
        creatorEl.style.display = "none"
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

  createUserBadge(user, options = {}) {
    const { subtle = false } = options
    const resolvedUser = (user?.email && Store.findUserByEmail(user.email)) || Store.findUserByName(user?.name || "") || user || {}
    const avatar = this.createAvatarNode(resolvedUser, { subtle })
    const label = resolvedUser.name || resolvedUser.email || user?.name || user?.email || ""
    const nameText = document.createTextNode(label)
    
    const wrapper = document.createElement("span")
    wrapper.className = "card-assignee"
    if (subtle) wrapper.classList.add("card-assignee--subtle")
    wrapper.style.display = "inline-flex"
    wrapper.style.alignItems = "center"
    wrapper.style.gap = "6px"
    wrapper.append(avatar, nameText)
    wrapper.title = label
    return wrapper
  },

  // --- Column Rendering ---
  createColumnElement(column) {
    const node = this.columnTemplate.content.firstElementChild.cloneNode(true)
    node.dataset.id = column.id
    Utils.qs(".column-title", node).textContent = column.title
    this.syncColumnEmptyState(node, column.cards.length === 0)
    const canManageStructure = Store.canCurrentUserManageBoardStructure()

    if (column.isArchive) {
      node.classList.add("column--archive")
      const actions = Utils.qs(".column-actions", node)
      if (actions) actions.remove()
      Utils.qsa('[data-action="add-card"]', node).forEach(el => el.remove())
      const dragHandle = Utils.qs(".drag-handle", node)
      if (dragHandle) dragHandle.remove()
    } else if (!canManageStructure) {
      const actions = Utils.qs(".column-actions", node)
      const dragHandle = Utils.qs(".drag-handle", node)
      if (actions) actions.style.display = "none"
      if (dragHandle) dragHandle.style.display = "none"
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

  syncColumnEmptyState(colEl, isEmpty) {
    if (!colEl) return
    colEl.classList.toggle("column--empty", isEmpty)
  },

  // --- Board Rendering ---
  renderBoard() {
    if (!DbSettings.get().cfWorkerUrl) {
      this.renderD1SetupGate()
      return
    }
    if (Store.requiresCloudflareLogin()) {
      this.renderLoginGate()
      return
    }
    this.board.innerHTML = ""
    Store.state.columns.forEach((col) => {
      this.board.append(this.createColumnElement(col))
    })
    const addColumnBtn = Utils.qs("#addColumnBtn")
    if (addColumnBtn) addColumnBtn.style.display = Store.canCurrentUserManageBoardStructure() ? "" : "none"
    this.updateTagFilters()
    this.applyFilters()
    this.updateMenuButtonAvatar()
    this.updateAuthButtonsVisibility()
    this.updateBoardActionsVisibility()
    this.updateAdminPanelVisibility()
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
      Utils.qs(".cards", colEl).prepend(cardEl)
      this.syncColumnEmptyState(colEl, false)
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
    if (cardEl) {
      const colEl = cardEl.closest(".column")
      cardEl.remove()
      if (colEl) {
        const hasCards = Utils.qs(".cards", colEl)?.children.length > 0
        this.syncColumnEmptyState(colEl, !hasCards)
      }
    }
    this.updateTagFilters()
  },

  showCardDetail(card, colId, options = {}) {
    if (!card) return
    const form = Utils.qs("#cardDetailForm")
    form.dataset.cardId = card.id
    form.dataset.colId = colId
    form.dataset.editMode = options.editMode ? "true" : "false"
    this.resetCommentComposer("detail")
    this.renderCardDetail()
    this.showDialog(this.cardDetailDialog)
  },

  renderCardDetail() {
    const form = Utils.qs("#cardDetailForm")
    const cardId = form?.dataset.cardId
    const { card, col } = cardId ? Store.findCard(cardId) : { card: null, col: null }
    if (!form || !card || !col) return

    const canEdit = Store.canCurrentUserEditCard(card)
    const canMove = Store.canCurrentUserMoveCard(card)
    const isEditing = canEdit && form.dataset.editMode === "true"

    form.classList.toggle("is-editing", isEditing)
    Utils.qs("#cardDetailColumn").textContent = col.title || ""
    Utils.qs("#cardDetailTitle").textContent = card.title || I18n.t("card")
    Utils.qs("#cardDetailTitleInput").value = card.title || ""

    const sanitizedHtml = DOMPurify.sanitize(card.description || "", { ADD_ATTR: ["target"] })
    const desc = Utils.qs("#cardDetailDescription")
    desc.innerHTML = this.hasMeaningfulHtml(sanitizedHtml) ? sanitizedHtml : I18n.t("no_description")
    desc.classList.toggle("is-empty", !this.hasMeaningfulHtml(sanitizedHtml))
    Utils.qs("#cardDetailDescriptionEditor").innerHTML = sanitizedHtml

    Utils.qs("#cardDetailEditBtn").style.display = canEdit && !isEditing ? "" : "none"
    Utils.qs("#cardDetailDeleteBtn").style.display = canEdit && !isEditing ? "" : "none"
    Utils.qs("#cardDetailAttachmentAction").style.display = isEditing ? "" : "none"

    this.renderCardDetailAttachments(card.attachments || [], card.id, isEditing)
    this.renderCardDetailSidebar(card, col, isEditing)
    this.renderComments(card, {
      section: Utils.qs("#cardDetailCommentsSection"),
      list: Utils.qs("#cardDetailComments"),
      input: Utils.qs("#cardDetailCommentInput"),
      saveBtn: Utils.qs("#cardDetailSaveCommentBtn"),
    })

    const movePanel = Utils.qs("#cardDetailMovePanel")
    const markDoneBtn = Utils.qs("#cardDetailMarkDoneBtn")
    const moveToWrap = Utils.qs("#cardDetailMoveToWrap")
    const moveTargets = this.renderMoveToMenu(card.id, "#cardDetailMoveToMenu")
    if (movePanel) movePanel.style.display = canMove && !isEditing ? "" : "none"
    if (markDoneBtn) markDoneBtn.textContent = col.isDone ? I18n.t("undone") : I18n.t("mark_as_done")
    if (moveToWrap) moveToWrap.style.display = canMove && !isEditing && moveTargets.length ? "" : "none"
  },

  renderCardDetailSidebar(card, col, isEditing) {
    const assignee = Utils.qs("#cardDetailAssignee")
    assignee.innerHTML = ""
    if (card.assignedUser) {
      assignee.classList.remove("card-detail-empty")
      assignee.append(this.createUserBadge(card.assignedUser))
    } else {
      assignee.textContent = I18n.t("unassigned")
      assignee.classList.add("card-detail-empty")
    }

    const due = Utils.qs("#cardDetailDue")
    due.textContent = card.due ? this.formatDateTime(card.due) : I18n.t("no_due_date")
    due.dateTime = card.due || ""
    due.classList.toggle("card-detail-empty", !card.due)

    const tags = Utils.qs("#cardDetailTags")
    tags.innerHTML = ""
    ;(card.tags || []).forEach((tag) => tags.append(this.createTagBadge(tag)))
    if (!(card.tags || []).length) {
      tags.textContent = I18n.t("no_tags")
      tags.classList.add("card-detail-empty")
    } else {
      tags.classList.remove("card-detail-empty")
    }

    const author = Utils.qs("#cardDetailAuthor")
    author.innerHTML = ""
    const authorName = (card.createdBy || "").trim()
    if (authorName) {
      author.classList.remove("card-detail-empty")
      author.append(this.createUserBadge({ name: authorName, email: card.createdByEmail || "" }, { subtle: true }))
      const created = this.formatDateTime(card.createdAt)
      if (created) author.append(document.createTextNode(` ${created}`))
    } else {
      author.textContent = I18n.t("unknown")
      author.classList.add("card-detail-empty")
    }

    const edited = Utils.qs("#cardDetailEdited")
    const editedValue = card.contentChangedAt || card.lastChanged || ""
    edited.textContent = editedValue ? this.formatDateTime(editedValue) : I18n.t("not_edited")
    edited.classList.toggle("card-detail-empty", !editedValue)

    Utils.qs("#cardDetailUserInput").value = card.assignedUser?.name || ""
    Utils.qs("#cardDetailTagsInput").value = (card.tags || []).join(", ")
    Utils.qs("#cardDetailDueInput").value = this.toLocalDateTimeInput(card.due)
    const clearBtn = Utils.qs("#cardDetailClearUserBtn")
    if (clearBtn) clearBtn.style.display = Utils.qs("#cardDetailUserInput").value && isEditing ? "block" : "none"
  },

  renderCardDetailAttachments(attachments, cardId, editable) {
    const container = Utils.qs("#cardDetailAttachments")
    if (!container) return
    container.innerHTML = ""
    if (!attachments || attachments.length === 0) {
      const empty = document.createElement("div")
      empty.className = "card-detail-empty"
      empty.textContent = I18n.t("no_attachments")
      container.append(empty)
      return
    }

    attachments.forEach((att) => {
      const item = document.createElement("div")
      item.className = "card-detail-attachment"
      const img = document.createElement("img")
      const authUrl = CloudflareBackend.getAuthenticatedImageUrl(att.url)
      img.src = authUrl
      img.alt = att.name || I18n.t("attachment")
      img.addEventListener("click", () => this.showLightbox(authUrl))
      item.append(img)

      const delBtn = document.createElement("button")
      delBtn.type = "button"
      delBtn.className = "editor-attachment-delete"
      delBtn.innerHTML = "&times;"
      delBtn.disabled = !editable
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault()
        if (!editable) return
        const choice = await this.showConfirm(I18n.t("image_delete_confirm"), {
          title: I18n.t("delete"),
          showArchiveButton: false,
        })
        if (choice === "delete") this.deleteAttachment(cardId, att.key)
      })
      item.append(delBtn)
      container.append(item)
    })
  },

  // --- Dialogs ---
  showCardEditor(card, colId) {
    const form = Utils.qs("#editorForm")
    form.dataset.colId = colId
    form.dataset.cardId = card ? card.id : ""
    this.pendingCardAttachments = []

    Utils.qs("#editorTitle").textContent = card ? I18n.t("edit_card") : I18n.t("create_card")
    form.elements.title.value = card ? card.title : ""
    const rawDesc = card ? card.description || "" : ""
    Utils.qs("#descriptionEditor", form).innerHTML = DOMPurify.sanitize(rawDesc, { ADD_ATTR: ["target"] })
    form.elements.tags.value = card ? (card.tags || []).join(", ") : ""
    
    const currentUser = Store.getCurrentUserName()
    form.elements.user.value = card ? (card.assignedUser?.name || "") : (currentUser || "")

    const clearUserBtn = Utils.qs('#clearUserBtn', form)
    if (clearUserBtn) {
      clearUserBtn.style.display = form.elements.user.value ? "block" : "none"
    }

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
    const moveToWrap = Utils.qs("#moveToWrap", form)
    const descriptionEditor = Utils.qs("#descriptionEditor", form)
    const saveBtn = Utils.qs('.actions-main .btn.primary', form)
    const addAttachmentBtn = Utils.qs("#addAttachmentBtn", form)
    const commentsSection = Utils.qs("#commentsSection", form)
    const canEdit = !card || Store.canCurrentUserEditCard(card)
    const canMove = !card || Store.canCurrentUserMoveCard(card)

    form.elements.title.readOnly = !canEdit
    form.elements.tags.readOnly = !canEdit
    form.elements.due.disabled = !canEdit
    form.elements.user.readOnly = !canEdit
    descriptionEditor.contentEditable = canEdit ? "true" : "false"
    descriptionEditor.setAttribute("aria-readonly", canEdit ? "false" : "true")
    if (clearUserBtn) clearUserBtn.disabled = !canEdit
    if (saveBtn) {
      saveBtn.disabled = !canEdit
      saveBtn.style.display = canEdit ? "" : "none"
    }
    if (addAttachmentBtn) addAttachmentBtn.disabled = !canEdit

    if (card) {
      const { col } = Store.findCard(card.id)
      const moveTargets = this.renderMoveToMenu(card.id)
      markDoneBtn.parentElement.style.display = canMove ? "" : "none"
      if (moveToWrap) moveToWrap.style.display = canMove && moveTargets.length ? "" : "none"
      markDoneBtn.textContent = col.isDone ? I18n.t("undone") : I18n.t("mark_as_done")
    } else {
      markDoneBtn.parentElement.style.display = "none"
      if (moveToWrap) moveToWrap.style.display = "none"
    }

    this.hideMoveToMenu()
    this.resetCommentComposer()
    this.showDialog(this.editor)
    this.updateEditorAttachments(card ? card.attachments : this.pendingCardAttachments, card?.id)
    this.renderEditorComments(card)
    commentsSection.style.display = card && !!DbSettings.get().cfWorkerUrl ? "flex" : "none"
  },

  updateEditorAttachments(attachments, cardId) {
    const container = Utils.qs("#editorAttachments")
    if (!container) return
    container.innerHTML = ""
    const { card } = cardId ? Store.findCard(cardId) : { card: null }
    const canEdit = !card || Store.canCurrentUserEditCard(card)
    
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
      const authUrl = CloudflareBackend.getAuthenticatedImageUrl(att.url)
      img.src = authUrl
      img.style.cursor = "zoom-in"
      img.addEventListener("click", () => this.showLightbox(authUrl))
      item.append(img)

      const delBtn = document.createElement("button")
      delBtn.type = "button"
      delBtn.className = "editor-attachment-delete"
      delBtn.innerHTML = "&times;"
      delBtn.disabled = !canEdit
      delBtn.addEventListener("click", async (e) => {
        if (!canEdit) return
        e.preventDefault()
        const choice = await this.showConfirm(I18n.t("image_delete_confirm"), {
          title: I18n.t("delete"),
          showArchiveButton: false
        })
        if (choice === "delete") {
          if (cardId) {
            this.deleteAttachment(cardId, att.key)
          } else {
            this.deletePendingAttachment(att.key)
          }
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
    await CloudflareBackend.deleteImage(key, cfg).catch(console.error)

    card.attachments = (card.attachments || []).filter(a => a.key !== key)
    Store.saveState()
    
    // Update UI
    this.updateCard(card)
    // If editor is open for this card, update it too
    const form = Utils.qs("#editorForm")
    if (form.dataset.cardId === cardId) {
      this.updateEditorAttachments(card.attachments, cardId)
    }
    const detailForm = Utils.qs("#cardDetailForm")
    if (detailForm?.dataset.cardId === cardId) {
      if (detailForm.dataset.editMode === "true") {
        this.renderCardDetailAttachments(card.attachments, cardId, true)
      } else {
        this.renderCardDetail()
      }
    }
  },

  async deletePendingAttachment(key) {
    const cfg = DbSettings.get()
    await CloudflareBackend.deleteImage(key, cfg).catch(console.error)
    this.pendingCardAttachments = this.pendingCardAttachments.filter(a => a.key !== key)
    this.updateEditorAttachments(this.pendingCardAttachments, "")
  },

  cleanupPendingCardAttachments() {
    if (!this.pendingCardAttachments.length) return
    const cfg = DbSettings.get()
    this.pendingCardAttachments.forEach((att) => {
      if (att.key) CloudflareBackend.deleteImage(att.key, cfg).catch(console.error)
    })
    this.pendingCardAttachments = []
  },

  getCommentTargets(context = "") {
    const useDetail = context === "detail" || (!context && this.cardDetailDialog?.open)
    return useDetail
      ? {
          input: Utils.qs("#cardDetailCommentInput"),
          saveBtn: Utils.qs("#cardDetailSaveCommentBtn"),
          cancelBtn: Utils.qs("#cardDetailCancelCommentEditBtn"),
          replyEl: Utils.qs("#cardDetailCommentReplyingTo"),
          form: Utils.qs("#cardDetailForm"),
          list: Utils.qs("#cardDetailComments"),
          context: "detail",
        }
      : {
          input: Utils.qs("#commentInput"),
          saveBtn: Utils.qs("#saveCommentBtn"),
          cancelBtn: Utils.qs("#cancelCommentEditBtn"),
          replyEl: Utils.qs("#commentReplyingTo"),
          form: Utils.qs("#editorForm"),
          list: Utils.qs("#editorComments"),
          context: "editor",
        }
  },

  resetCommentComposer(context = "") {
    this.editingCommentId = ""
    this.replyToCommentId = ""
    const { input, saveBtn, cancelBtn, replyEl } = this.getCommentTargets(context)
    if (input) input.value = ""

    if (saveBtn) {
      saveBtn.innerHTML = ICONS.SEND
      saveBtn.title = I18n.t("add_comment")
      saveBtn.setAttribute("aria-label", I18n.t("add_comment"))
    }
    if (cancelBtn) {
      cancelBtn.style.display = "none"
      cancelBtn.innerHTML = ICONS.CANCEL
      cancelBtn.title = I18n.t("cancel")
      cancelBtn.setAttribute("aria-label", I18n.t("cancel"))
    }
    if (replyEl) {
      replyEl.textContent = ""
      replyEl.style.display = "none"
    }
  },

  renderEditorComments(card) {
    this.renderComments(card, {
      section: Utils.qs("#commentsSection"),
      list: Utils.qs("#editorComments"),
      input: Utils.qs("#commentInput"),
      saveBtn: Utils.qs("#saveCommentBtn"),
    })
  },

  renderComments(card, targets) {
    const { section, list, input, saveBtn } = targets
    if (!section || !list || !input || !saveBtn) return

    if (!card || !DbSettings.get().cfWorkerUrl) {
      section.style.display = "none"
      return
    }

    section.style.display = "flex"
    list.innerHTML = ""
    const comments = Array.isArray(card.comments) ? card.comments : []

    const renderCommentItem = (comment, isReply = false) => {
      const item = document.createElement("div")
      item.className = `comment-item${isReply ? " comment-reply" : ""}`
      item.dataset.commentId = comment.id

      const header = document.createElement("div")
      header.className = "comment-item-header"

      const meta = document.createElement("div")
      meta.className = "comment-item-meta"
      meta.append(this.createUserBadge({ name: comment.author, email: comment.authorEmail || "" }, { subtle: true }))

      const date = document.createElement("time")
      date.className = "comment-item-date"
      const timestamp = comment.updatedAt || comment.createdAt
      if (timestamp) {
        date.dateTime = timestamp
        date.textContent = new Date(timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      }
      meta.append(date)
      header.append(meta)

      const actions = document.createElement("div")
      actions.className = "comment-item-actions"

      if (!isReply) {
        const replyBtn = document.createElement("button")
        replyBtn.type = "button"
        replyBtn.className = "btn-link"
        replyBtn.dataset.commentAction = "reply"
        replyBtn.dataset.commentId = comment.id
        replyBtn.innerHTML = ICONS.REPLY
        replyBtn.title = I18n.t("reply_comment")
        replyBtn.setAttribute("aria-label", I18n.t("reply_comment"))
        actions.append(replyBtn)
      }

      if (Store.canCurrentUserEditComment(comment)) {
        const editBtn = document.createElement("button")
        editBtn.type = "button"
        editBtn.className = "btn-link"
        editBtn.dataset.commentAction = "edit"
        editBtn.dataset.commentId = comment.id
        editBtn.innerHTML = ICONS.EDIT
        editBtn.title = I18n.t("edit_comment")
        editBtn.setAttribute("aria-label", I18n.t("edit_comment"))

        actions.append(editBtn)
      }

      if (Store.canCurrentUserManageComment(comment)) {
        const deleteBtn = document.createElement("button")
        deleteBtn.type = "button"
        deleteBtn.className = "btn-link"
        deleteBtn.dataset.commentAction = "delete"
        deleteBtn.dataset.commentId = comment.id
        deleteBtn.innerHTML = ICONS.DELETE
        deleteBtn.title = I18n.t("delete_comment")
        deleteBtn.setAttribute("aria-label", I18n.t("delete_comment"))

        actions.append(deleteBtn)
      }

      header.append(actions)

      const text = document.createElement("div")
      text.className = "comment-item-text"
      text.textContent = comment.text || ""

      item.append(header, text)
      list.append(item)

      ;(comment.replies || []).forEach((reply) => renderCommentItem(reply, true))
    }

    if (comments.length === 0) {
      const empty = document.createElement("div")
      empty.className = "comment-empty-message"
      empty.textContent = I18n.t("no_comments")
      list.append(empty)
    } else {
      comments.forEach((comment) => renderCommentItem(comment))
    }

    input.disabled = !Store.canCurrentUserComment()
    saveBtn.disabled = !Store.canCurrentUserComment()
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
    const canManageStructure = Store.canCurrentUserManageBoardStructure()
    form.elements.title.readOnly = !canManageStructure
    form.elements.isDoneColumn.disabled = !canManageStructure
    const saveBtn = Utils.qs('.actions-main .btn.primary', form)
    if (saveBtn) saveBtn.disabled = !canManageStructure
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
        archiveButton.parentElement.style.display = ""
      } else {
        archiveButton.parentElement.style.display = "none"
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

  showAlert(message, title = I18n.t("alert")) {
    return new Promise((resolve) => {
      const dialog = this.confirmDialog
      const titleEl = dialog.querySelector("#confirmTitle")
      const archiveButton = dialog.querySelector('button[value="archive"]')
      const deleteButton = dialog.querySelector("#confirmOk")
      const cancelButton = dialog.querySelector('button[value="cancel"]')
      const actionsContainer = deleteButton.parentElement

      titleEl.textContent = title
      deleteButton.textContent = I18n.t("ok")
      archiveButton.parentElement.style.display = "none"
      cancelButton.style.display = "none"

      Utils.qs("#confirmText", dialog).textContent = message

      const closeHandler = () => {
        dialog.removeEventListener("close", closeHandler)
        // Restore buttons
        archiveButton.parentElement.style.display = ""
        cancelButton.style.display = ""
        resolve()
      }
      dialog.addEventListener("close", closeHandler)
      this.showDialog(dialog)
    })
  },

  showPrompt(title, placeholder = "", defaultValue = "") {
    return new Promise((resolve) => {
      const dialog = this.promptDialog
      const titleEl = dialog.querySelector("#promptTitle")
      const input = dialog.querySelector("#promptInput")
      const okBtn = dialog.querySelector("#promptOk")
      const cancelBtn = dialog.querySelector('button[value="cancel"]')

      titleEl.textContent = title
      input.placeholder = placeholder
      input.value = defaultValue
      okBtn.disabled = !defaultValue.trim()

      const inputHandler = () => {
        okBtn.disabled = !input.value.trim()
      }
      input.addEventListener("input", inputHandler)

      const closeHandler = () => {
        dialog.removeEventListener("close", closeHandler)
        input.removeEventListener("input", inputHandler)
        resolve(dialog.returnValue === "ok" ? input.value.trim() : null)
      }
      dialog.addEventListener("close", closeHandler)

      okBtn.onclick = () => dialog.close("ok")
      cancelBtn.onclick = () => dialog.close("cancel")

      this.showDialog(dialog)
      input.focus()
      if (defaultValue) input.select()
    })
  },

  // --- Filtering & Searching ---
  getAvailableFilters() {
    const allTags = new Set()
    const allUsers = new Map() // name -> user object

    Store.state.columns
      .filter((c) => !c.isArchive)
      .forEach((c) =>
        c.cards.forEach((k) => {
          (k.tags || []).forEach((t) => allTags.add(t))
          if (k.assignedUser && k.assignedUser.name) {
            const key = k.assignedUser.name
            allUsers.set(key, k.assignedUser)
          }
        })
      )

    return { allTags, allUsers }
  },

  pruneUnavailableFilters(allTags, allUsers) {
    let changed = false

    for (const tag of [...this.activeTagFilters]) {
      if (!allTags.has(tag)) {
        this.activeTagFilters.delete(tag)
        changed = true
      }
    }

    for (const userKey of [...this.activeUserFilters]) {
      if (!allUsers.has(userKey)) {
        this.activeUserFilters.delete(userKey)
        changed = true
      }
    }

    return changed
  },

  updateTagFilters() {
    const tagBox = Utils.qs("#tagFilters")
    const userBox = Utils.qs("#userFilters")
    if (Store.requiresCloudflareLogin()) {
      tagBox.innerHTML = ""
      userBox.innerHTML = ""
      tagBox.style.display = "none"
      userBox.style.display = "none"
      this.activeTagFilters.clear()
      this.activeUserFilters.clear()
      return
    }

    const { allTags, allUsers } = this.getAvailableFilters()
    const filtersChanged = this.pruneUnavailableFilters(allTags, allUsers)

    tagBox.innerHTML = ""
    userBox.innerHTML = ""
    
    // Populate User Filters
    if (allUsers.size > 0) {
      userBox.style.display = "flex"
      ;[...allUsers.values()].sort((a,b) => (a.name||"").localeCompare(b.name||"")).forEach((user) => {
        const chip = document.createElement("button")
        chip.className = "tag-chip user-chip"
        const userKey = user.name || ""
        chip.dataset.userKey = userKey
        chip.append(this.createAvatarNode(user), document.createTextNode(` ${user.name || ""}`))
        
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
        const dot = document.createElement("span")
        dot.className = "tag-dot"
        dot.style.background = Utils.colorFromString(tag)
        chip.innerHTML = ""
        chip.appendChild(dot)
        chip.appendChild(document.createTextNode(" " + tag))
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

    if (filtersChanged) this.applyFilters()
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
      card.tags.join(" ").toLowerCase().includes(this.searchQuery) ||
      (card.assignedUser && (card.assignedUser.name || "").toLowerCase().includes(this.searchQuery))

    const tagsMatch =
      this.activeTagFilters.size === 0 ||
      [...this.activeTagFilters].every((filterTag) =>
        card.tags.includes(filterTag)
      )

    const userMatch =
      this.activeUserFilters.size === 0 ||
      (card.assignedUser && this.activeUserFilters.has(card.assignedUser.name))

    cardEl.style.display = searchMatch && tagsMatch && userMatch ? "" : "none"
  },


  updateTagAutocomplete(input, container) {
    const value = input.value
    const lastCommaIndex = value.lastIndexOf(",")
    const currentPrefix = value.slice(lastCommaIndex + 1).trim().toLowerCase()

    // Collect all existing tags
    const allTags = new Set()
    Store.state.columns.forEach((c) =>
      c.cards.forEach((k) => (k.tags || []).forEach((t) => allTags.add(t)))
    )

    const existingTags = value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)

    const matches = [...allTags]
      .filter((t) => t.toLowerCase().startsWith(currentPrefix) && !existingTags.includes(t.toLowerCase()))
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
    const allUsersMap = new Map()

    if (Store.state.users) {
      Store.state.users.forEach((u) => {
        if (u && (u.name || u.email) && u.isApproved !== false) {
          allUsersMap.set(u.email || u.name, u)
        }
      })
    }

    Store.state.columns.forEach((c) =>
      c.cards.forEach((k) => {
        if (k.assignedUser && k.assignedUser.name) {
          allUsersMap.set(k.assignedUser.email || k.assignedUser.name, k.assignedUser)
        }
      })
    )

    const matches = [...allUsersMap.values()]
      .filter(u => ((u.name || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query)))
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
    input.value = user.name || user.email || ""
    container.classList.remove("show")
  },

  sortCardsByUser() {
    Store.state.columns.forEach(col => {
      col.cards.sort((a, b) => {
        const nameA = (a.assignedUser?.name || "zzz").toLowerCase()
        const nameB = (b.assignedUser?.name || "zzz").toLowerCase()
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
    Utils.qsa("[data-theme-option]").forEach(btn => {
      const isActive = btn.dataset.themeOption === theme
      btn.classList.toggle("active", isActive)
      btn.setAttribute("aria-pressed", String(isActive))
    })
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
  suppressClick: false,

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
    if (e.button !== 0) return
    // Only support mouse drag on desktop, skip touch
    if (e.pointerType !== "mouse") return

    // Prevent drag from interactive elements (links, buttons, inputs, tags, etc.)
    const interactive = e.target.closest(
      "a, button, input, textarea, select, .tag, .card-actions"
    )
    if (interactive) return

    const cardEl = e.currentTarget.closest(".card")
    const { card } = Store.findCard(cardEl?.dataset.id)
    if (card && !Store.canCurrentUserMoveCard(card)) return
    const rect = cardEl.getBoundingClientRect()

    Dnd.cardDrag = {
      pointerId: e.pointerId,
      cardEl,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      started: false,
    }
    cardEl.setPointerCapture(e.pointerId)

    document.addEventListener("pointermove", Dnd.onCardPotentialMove)
    document.addEventListener("pointerup", Dnd.onCardDragEnd)
    document.addEventListener("pointercancel", Dnd.onCardDragEnd)
  },

  onCardPotentialMove(e) {
    if (!Dnd.cardDrag || e.pointerId !== Dnd.cardDrag.pointerId) return
    Dnd.lastPointerX = e.clientX
    Dnd.lastPointerY = e.clientY

    const dx = e.clientX - Dnd.cardDrag.startX
    const dy = e.clientY - Dnd.cardDrag.startY
    const dist = Math.hypot(dx, dy)

    if (dist > 6 && !Dnd.cardDrag.started) {
      Dnd.beginCardDrag(e)
    }

    if (Dnd.cardDrag.started) {
      e.preventDefault()
      Dnd.onCardPointerMove(e)
    }
  },

  beginCardDrag(e) {
    Dnd.cardDrag.started = true
    Dnd.suppressClick = true
    document.body.classList.add("dragging-ui")

    const { cardEl } = Dnd.cardDrag
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
    const column = el ? el.closest(".column") : null
    const list = el?.closest(".cards") || column?.querySelector(".cards")
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

    if (Dnd.cardDrag.started) {
      const { cardEl, ghost, placeholder } = Dnd.cardDrag
      const toList = placeholder.closest(".cards")

      if (toList) {
        const fromColEl = cardEl.closest(".column")
        const toColEl = toList.closest(".column")
        const fromColId = fromColEl.dataset.id
        const toColId = toColEl.dataset.id
        const cardId = cardEl.dataset.id
        const toIndex = [...toList.children].indexOf(placeholder)

        Store.moveCard(cardId, fromColId, toColId, toIndex)
        UI.updateTagFilters()

        toList.insertBefore(cardEl, placeholder)
        UI.syncColumnEmptyState(fromColEl, Utils.qs(".cards", fromColEl)?.children.length === 0)
        UI.syncColumnEmptyState(toColEl, Utils.qs(".cards", toColEl)?.children.length === 0)

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

    UI.updateAuthButtonsVisibility()
    Notifications.render()

    await Store.loadState()
    if (typeof UI !== "undefined") {
      UI.updateAdminPanelVisibility()
      UI.updateAuthButtonsVisibility()
    }

    UI.renderBoard()
    UI.updateMenuButtonAvatar()
    await Notifications.refresh()
    Store.startRealtime()
  },



  async handleCloudflareLogin(e) {
    e.preventDefault()
    const form = e.currentTarget
    const cfg = DbSettings.get()
    const email = (Utils.qs("#boardLoginEmail", form)?.value || "").trim().toLowerCase()
    const pinCode = (Utils.qs("#boardLoginPinCode", form)?.value || "").trim()
    const selectedBoardId = cfg.cfBoardId || "default"
    const loginCfg = { ...cfg, cfBoardId: selectedBoardId }

    if (!cfg.cfWorkerUrl) {
      UI.showAlert(I18n.t("cloudflare_hint"))
      return
    }
    if (!email || !pinCode) {
      UI.showAlert(I18n.t("email_pin_required"))
      return
    }

    try {
      const auth = await CloudflareBackend.authenticate(loginCfg, email, pinCode)
      DbSettings.set({
        ...loginCfg,
        cfUserEmail: email,
        cfUserName: auth.user?.name || email,
        cfUserToken: auth.token || "",
        isAdmin: !!auth.isAdmin,
      })
      Store.isAdmin = !!auth.isAdmin
      try {
        const boards = await CloudflareBackend.listBoards(DbSettings.get())
        UI.accessibleBoards = boards.boards || []
      } catch (err) {
        console.warn("Failed to load boards:", err)
      }
      await Store.loadState()
      UI.renderBoard()
      UI.updateMenuButtonAvatar()
      UI.updateAuthButtonsVisibility()
      await Notifications.refresh()
      form.closest("dialog")?.close()
    } catch (err) {
      UI.showAlert(I18n.serverError(err.message) || I18n.t("incorrect_pin"))
    }
  },

  async handleCloudflareSignup(e) {
    e.preventDefault()
    const form = e.currentTarget
    const cfg = DbSettings.get()
    const email = (Utils.qs("#boardSignupEmail", form)?.value || "").trim().toLowerCase()
    const name = (Utils.qs("#boardSignupName", form)?.value || "").trim()
    const pinCode = (Utils.qs("#boardSignupPinCode", form)?.value || "").trim()

    if (!cfg.cfWorkerUrl) {
      UI.showAlert(I18n.t("cloudflare_hint"))
      return
    }
    if (!email || !pinCode) {
      UI.showAlert(I18n.t("email_pin_required"))
      return
    }
    if (Utils.getPasswordValidationError(pinCode)) {
      UI.showAlert(I18n.t("weak_password_error"))
      return
    }

    try {
      const result = await CloudflareBackend.signup(cfg, email, pinCode, name)
      form.reset()
      UI.authMode = "login"
      await Store.loadState()
      UI.renderBoard()
      UI.showAlert(I18n.t(result?.bootstrapOwner ? "signup_owner_created" : "signup_pending"))
    } catch (err) {
      UI.showAlert(I18n.serverError(err.message) || I18n.t("signup_failed"))
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
          UI.showCardDetail(card, colId)
          break
        case "delete-card":
          this.promptDeleteOrArchive(cardId)
          break
        case "rename-column":
          if (!Store.canCurrentUserManageBoardStructure()) return
          const col = Store.findColumn(colId)
          UI.showRenameDialog(col, col.title)
          break
        case "delete-column":
          if (!Store.canCurrentUserManageBoardStructure()) return
          this.handleDeleteColumn(colId)
          break
      }
    })

    UI.board.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      const cardEl = e.target.closest(".card")
      if (!cardEl || e.target.closest("button, a, input, textarea, select")) return
      e.preventDefault()
      const { card, col } = Store.findCard(cardEl.dataset.id)
      if (card && col) UI.showCardDetail(card, col.id)
    })

    // --- Form Submissions ---
    Utils.qs("#editorForm").addEventListener(
      "submit",
      this.handleSaveCard.bind(this)
    )

    Utils.qs("#cardDetailForm").addEventListener(
      "submit",
      this.handleSaveCardDetail.bind(this)
    )

    Utils.qs("#cardDetailEditBtn").addEventListener("click", () => {
      const form = Utils.qs("#cardDetailForm")
      form.dataset.editMode = "true"
      UI.renderCardDetail()
      Utils.qs("#cardDetailTitleInput")?.focus()
    })

    Utils.qs("#cardDetailCancelEditBtn").addEventListener("click", () => {
      const form = Utils.qs("#cardDetailForm")
      form.dataset.editMode = "false"
      UI.renderCardDetail()
    })

    Utils.qs("#cardDetailCloseBtn").addEventListener("click", () => {
      UI.cardDetailDialog.close()
    })

    Utils.qs("#cardDetailDeleteBtn").addEventListener("click", () => {
      const cardId = Utils.qs("#cardDetailForm").dataset.cardId
      this.promptDeleteOrArchive(cardId)
    })

    Utils.qs("#markDoneBtn").addEventListener("click", (e) => {
      this.handleMarkAsDone(e.target.closest("form"))
    })

    Utils.qs("#cardDetailMarkDoneBtn").addEventListener("click", (e) => {
      this.handleMarkAsDone(e.target.closest("form"))
    })

    Utils.qs("#moveToBtn").addEventListener("click", (e) => {
      e.stopPropagation()
      const form = e.target.closest("form")
      const cardId = form?.dataset.cardId
      if (!cardId) return
      const moveToWrap = Utils.qs("#moveToWrap", form)
      const moveToMenu = Utils.qs("#moveToMenu", form)
      const moveTargets = UI.renderMoveToMenu(cardId)
      if (!moveToWrap || !moveToMenu || !moveTargets.length) return
      moveToWrap.style.display = ""
      moveToMenu.classList.toggle("show")
    })

    Utils.qs("#cardDetailMoveToBtn").addEventListener("click", (e) => {
      e.stopPropagation()
      const form = e.target.closest("form")
      const cardId = form?.dataset.cardId
      if (!cardId) return
      const moveToWrap = Utils.qs("#cardDetailMoveToWrap", form)
      const moveToMenu = Utils.qs("#cardDetailMoveToMenu", form)
      const moveTargets = UI.renderMoveToMenu(cardId, "#cardDetailMoveToMenu")
      if (!moveToWrap || !moveToMenu || !moveTargets.length) return
      moveToWrap.style.display = ""
      moveToMenu.classList.toggle("show")
    })

    Utils.qs("#moveToMenu").addEventListener("click", (e) => {
      const moveToItem = e.target.closest("[data-move-to-col-id]")
      if (!moveToItem) return
      this.handleMoveCardTo(Utils.qs("#editorForm"), moveToItem.dataset.moveToColId)
    })

    Utils.qs("#cardDetailMoveToMenu").addEventListener("click", (e) => {
      const moveToItem = e.target.closest("[data-move-to-col-id]")
      if (!moveToItem) return
      this.handleMoveCardTo(Utils.qs("#cardDetailForm"), moveToItem.dataset.moveToColId)
    })

    Utils.qs("#saveCommentBtn").addEventListener("click", () => {
      this.handleSaveComment()
    })

    Utils.qs("#cardDetailSaveCommentBtn").addEventListener("click", () => {
      this.handleSaveComment()
    })

    Utils.qs("#commentInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.handleSaveComment()
      }
    })

    Utils.qs("#cardDetailCommentInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.handleSaveComment()
      }
    })

    Utils.qs("#cancelCommentEditBtn").addEventListener("click", () => {
      UI.resetCommentComposer("editor")
    })

    Utils.qs("#cardDetailCancelCommentEditBtn").addEventListener("click", () => {
      UI.resetCommentComposer("detail")
    })

    Utils.qs("#editorComments").addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-comment-action]")
      if (!actionEl) return

      const cardId = Utils.qs("#editorForm").dataset.cardId
      const { card } = Store.findCard(cardId)
      if (!card) return

      const commentId = actionEl.dataset.commentId
      const comment = Store.findComment(card, commentId).comment
      if (!comment) return

      if (actionEl.dataset.commentAction === "reply") {
        UI.replyToCommentId = comment.id
        UI.editingCommentId = ""
        const replyEl = Utils.qs("#commentReplyingTo")
        replyEl.textContent = I18n.t("replying_to", { name: comment.author || "" })
        replyEl.style.display = ""
        Utils.qs("#commentInput").value = ""
        Utils.qs("#saveCommentBtn").innerHTML = ICONS.SEND
        Utils.qs("#saveCommentBtn").title = I18n.t("add_comment")
        Utils.qs("#saveCommentBtn").setAttribute("aria-label", I18n.t("add_comment"))
        Utils.qs("#cancelCommentEditBtn").style.display = ""
        const input = Utils.qs("#commentInput")
        input.focus()
        input.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (actionEl.dataset.commentAction === "edit") {
        if (!Store.canCurrentUserEditComment(comment)) {
          UI.showAlert(I18n.t("own_comment_only_error"))
          return
        }
        UI.editingCommentId = comment.id
        const input = Utils.qs("#commentInput")
        input.value = comment.text || ""
        Utils.qs("#saveCommentBtn").innerHTML = ICONS.CHECK
        Utils.qs("#saveCommentBtn").title = I18n.t("save_comment")
        Utils.qs("#saveCommentBtn").setAttribute("aria-label", I18n.t("save_comment"))
        Utils.qs("#cancelCommentEditBtn").style.display = ""
        input.focus()
        input.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (actionEl.dataset.commentAction === "delete") {
        this.handleDeleteComment(card.id, comment.id)
      }
    })

    Utils.qs("#cardDetailComments").addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-comment-action]")
      if (!actionEl) return

      const cardId = Utils.qs("#cardDetailForm").dataset.cardId
      const { card } = Store.findCard(cardId)
      if (!card) return

      const commentId = actionEl.dataset.commentId
      const comment = Store.findComment(card, commentId).comment
      if (!comment) return

      if (actionEl.dataset.commentAction === "reply") {
        UI.replyToCommentId = comment.id
        UI.editingCommentId = ""
        const replyEl = Utils.qs("#cardDetailCommentReplyingTo")
        replyEl.textContent = I18n.t("replying_to", { name: comment.author || "" })
        replyEl.style.display = ""
        Utils.qs("#cardDetailCommentInput").value = ""
        Utils.qs("#cardDetailSaveCommentBtn").innerHTML = ICONS.SEND
        Utils.qs("#cardDetailSaveCommentBtn").title = I18n.t("add_comment")
        Utils.qs("#cardDetailSaveCommentBtn").setAttribute("aria-label", I18n.t("add_comment"))
        Utils.qs("#cardDetailCancelCommentEditBtn").style.display = ""
        const input = Utils.qs("#cardDetailCommentInput")
        input.focus()
        input.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (actionEl.dataset.commentAction === "edit") {
        if (!Store.canCurrentUserEditComment(comment)) {
          UI.showAlert(I18n.t("own_comment_only_error"))
          return
        }
        UI.editingCommentId = comment.id
        const input = Utils.qs("#cardDetailCommentInput")
        input.value = comment.text || ""
        Utils.qs("#cardDetailSaveCommentBtn").innerHTML = ICONS.CHECK
        Utils.qs("#cardDetailSaveCommentBtn").title = I18n.t("save_comment")
        Utils.qs("#cardDetailSaveCommentBtn").setAttribute("aria-label", I18n.t("save_comment"))
        Utils.qs("#cardDetailCancelCommentEditBtn").style.display = ""
        input.focus()
        input.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (actionEl.dataset.commentAction === "delete") {
        this.handleDeleteComment(card.id, comment.id)
      }
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
    tagsInput.addEventListener("focus", () => {
      UI.updateTagAutocomplete(tagsInput, tagAutocomplete)
    })

    const detailTagsInput = Utils.qs("#cardDetailTagsInput")
    const detailTagAutocomplete = Utils.qs("#cardDetailTagAutocomplete")
    detailTagsInput.addEventListener("input", () => {
      UI.updateTagAutocomplete(detailTagsInput, detailTagAutocomplete)
    })
    detailTagsInput.addEventListener("focus", () => {
      UI.updateTagAutocomplete(detailTagsInput, detailTagAutocomplete)
    })

    const userInput = Utils.qs('input[name="user"]', Utils.qs("#editorForm"))
    const userAutocomplete = Utils.qs("#userAutocomplete")
    const clearUserBtn = Utils.qs('#clearUserBtn', Utils.qs("#editorForm"))

    const toggleClearBtn = () => {
      if (clearUserBtn) clearUserBtn.style.display = userInput.value ? "block" : "none"
    }

    userInput.addEventListener("input", () => {
      UI.updateUserAutocomplete(userInput, userAutocomplete)
      toggleClearBtn()
    })
    userInput.addEventListener("focus", () => {
      UI.updateUserAutocomplete(userInput, userAutocomplete)
      toggleClearBtn()
    })

    if (clearUserBtn) {
      clearUserBtn.addEventListener("click", () => {
        userInput.value = ""
        userAutocomplete.classList.remove("show")
        toggleClearBtn()
        userInput.focus()
      })
    }

    const detailUserInput = Utils.qs("#cardDetailUserInput")
    const detailUserAutocomplete = Utils.qs("#cardDetailUserAutocomplete")
    const detailClearUserBtn = Utils.qs("#cardDetailClearUserBtn")
    const toggleDetailClearBtn = () => {
      if (detailClearUserBtn) detailClearUserBtn.style.display = detailUserInput.value ? "block" : "none"
    }

    detailUserInput.addEventListener("input", () => {
      UI.updateUserAutocomplete(detailUserInput, detailUserAutocomplete)
      toggleDetailClearBtn()
    })
    detailUserInput.addEventListener("focus", () => {
      UI.updateUserAutocomplete(detailUserInput, detailUserAutocomplete)
      toggleDetailClearBtn()
    })

    if (detailClearUserBtn) {
      detailClearUserBtn.addEventListener("click", () => {
        detailUserInput.value = ""
        detailUserAutocomplete.classList.remove("show")
        toggleDetailClearBtn()
        detailUserInput.focus()
      })
    }

    // Close autocomplete when clicking outside
    window.addEventListener("click", (e) => {
      if (e.target !== tagsInput && !tagAutocomplete.contains(e.target)) {
        tagAutocomplete.classList.remove("show")
      }
      if (e.target !== detailTagsInput && !detailTagAutocomplete.contains(e.target)) {
        detailTagAutocomplete.classList.remove("show")
      }
      if (e.target !== userInput && !userAutocomplete.contains(e.target)) {
        userAutocomplete.classList.remove("show")
      }
      if (e.target !== detailUserInput && !detailUserAutocomplete.contains(e.target)) {
        detailUserAutocomplete.classList.remove("show")
      }
      const moveToWrap = Utils.qs("#moveToWrap")
      const detailMoveToWrap = Utils.qs("#cardDetailMoveToWrap")
      if (moveToWrap && !moveToWrap.contains(e.target) && (!detailMoveToWrap || !detailMoveToWrap.contains(e.target))) {
        UI.hideMoveToMenu()
      }
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

    // --- Dropdown Menu ---
    UI.menuBtn.addEventListener("click", (e) => {
      e.stopPropagation() // Prevent the window click listener from firing immediately
      UI.menuContent.classList.toggle("show")
      UI.notificationsPanel?.classList.remove("show")
    })

    if (UI.notificationsBtn && UI.notificationsPanel) {
      UI.notificationsBtn.addEventListener("click", async (e) => {
        e.stopPropagation()
        UI.menuContent?.classList.remove("show")
        UI.notificationsPanel.classList.toggle("show")
        if (UI.notificationsPanel.classList.contains("show")) {
          await Notifications.refresh()
        }
      })
      Utils.qs("#notificationsList")?.addEventListener("click", (e) => {
        const item = e.target.closest(".notification-item")
        if (!item) return
        Notifications.open(item.dataset.notificationId)
      })
      Utils.qs("#markAllNotificationsReadBtn")?.addEventListener("click", (e) => {
        e.stopPropagation()
        Notifications.markAllRead()
      })
    }

    // Close menu if clicking outside of it
    window.addEventListener("click", (e) => {
      if (
        !UI.menuBtn.contains(e.target) &&
        UI.menuContent.classList.contains("show")
      ) {
        UI.menuContent.classList.remove("show")
      }
      if (
        UI.notificationsPanel &&
        UI.notificationsBtn &&
        !UI.notificationsBtn.contains(e.target) &&
        !UI.notificationsPanel.contains(e.target) &&
        UI.notificationsPanel.classList.contains("show")
      ) {
        UI.notificationsPanel.classList.remove("show")
      }
    })

    // --- Admin Panel ---
    const adminPanelBtn = Utils.qs("#adminPanelBtn");
    const adminDialog = Utils.qs("#adminDialog");
    if (adminPanelBtn && adminDialog) {
      adminPanelBtn.addEventListener("click", async (e) => {
        const cfg = DbSettings.get();
        if (!cfg.cfWorkerUrl || !Store.isAdmin) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        try {
          const result = await CloudflareBackend.listUsers(cfg);
          UI.adminUsers = result.users || [];
          UI.adminBoards = result.boards || [];
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("users_load_failed"));
          return;
        }
        UI.renderAdminUsers();
        UI.showDialog(adminDialog);
        adminPanelBtn.closest(".dropdown-content").classList.remove("show");
      });
      
      const closeBtn = Utils.qs(".btn-close-admin", adminDialog);
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          adminDialog.close();
        });
      }

    }

    const profileBtn = Utils.qs("#profileBtn")
    const profileDialog = Utils.qs("#profileDialog")
    const profileForm = Utils.qs("#profileForm")
    const profileAvatarInput = Utils.qs("#profileAvatarInput", profileDialog)
    const changeAvatarBtn = Utils.qs("#changeAvatarBtn", profileDialog)
    const removeAvatarBtn = Utils.qs("#removeAvatarBtn", profileDialog)

    if (profileBtn && profileDialog && profileForm) {
      profileBtn.addEventListener("click", () => {
        const currentUser = Store.getCurrentUserProfile()
        if (!currentUser) return
        UI.pendingProfileAvatarFile = null
        UI.pendingProfileAvatarRemoved = false
        Utils.qs("#profileEmail", profileDialog).value = currentUser.email || ""
        Utils.qs("#profileDisplayName", profileDialog).value = currentUser.name || ""
        Utils.qs("#profilePassword", profileDialog).value = ""
        UI.enhancePasswordField(Utils.qs("#profilePassword", profileDialog), { allowEmpty: true })
        UI.updateProfileAvatarPreview(currentUser.avatarUrl || "")
        UI.showDialog(profileDialog)
        profileBtn.closest(".dropdown-content")?.classList.remove("show")
      })

      profileForm.addEventListener("submit", async (e) => {
        e.preventDefault()
        const cfg = DbSettings.get()
        const currentUser = Store.getCurrentUserProfile()
        if (!currentUser) return
        let nextAvatarUrl = currentUser.avatarUrl || ""
        let nextAvatarKey = currentUser.avatarKey || ""
        const oldAvatarKey = currentUser.avatarKey || ""

        if (UI.pendingProfileAvatarFile) {
          try {
            const uploadedAvatar = await CloudflareBackend.uploadImage(UI.pendingProfileAvatarFile, cfg)
            nextAvatarUrl = uploadedAvatar.url
            nextAvatarKey = uploadedAvatar.key
          } catch (err) {
            UI.showAlert(I18n.t("picture_upload_failed"))
            return
          }
        } else if (UI.pendingProfileAvatarRemoved) {
          nextAvatarUrl = ""
          nextAvatarKey = ""
        }

        const nextPinCode = (Utils.qs("#profilePassword", profileDialog).value || "").trim()
        const passwordError = Utils.getPasswordValidationError(nextPinCode, { allowEmpty: true })
        if (passwordError) {
          UI.showAlert(I18n.t("weak_password_error"))
          return
        }

        try {
          const result = await CloudflareBackend.updateProfile({
            name: (Utils.qs("#profileDisplayName", profileDialog).value || "").trim(),
            pinCode: nextPinCode,
            avatarUrl: nextAvatarUrl,
            avatarKey: nextAvatarKey,
          }, cfg)
          DbSettings.set({
            ...cfg,
            cfUserName: result.user?.name || cfg.cfUserName || cfg.cfUserEmail || "",
          })
          if (oldAvatarKey && oldAvatarKey !== nextAvatarKey) {
            CloudflareBackend.deleteImage(oldAvatarKey, cfg).catch(console.error)
          }
          await Store.loadState()
          UI.renderBoard()
          UI.updateMenuButtonAvatar()
          profileDialog.close()
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("profile_save_failed"))
        }
      })
    }

    if (changeAvatarBtn && profileAvatarInput) {
      changeAvatarBtn.addEventListener("click", () => profileAvatarInput.click())
      profileAvatarInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0]
        if (!file) return
        UI.pendingProfileAvatarFile = await Utils.processAvatarImage(file)
        UI.pendingProfileAvatarRemoved = false
        UI.updateProfileAvatarPreview(URL.createObjectURL(UI.pendingProfileAvatarFile))
        e.target.value = ""
      })
    }

    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener("click", () => {
        UI.pendingProfileAvatarFile = null
        UI.pendingProfileAvatarRemoved = true
        UI.updateProfileAvatarPreview("")
      })
    }

    // --- Database & Sync ---
    const dbBtn = Utils.qs("#dbSettingsBtn")
    const dbDialog = Utils.qs("#dbDialog")
    const dbForm = Utils.qs("#dbForm")
    const cfUrlInput = Utils.qs("#cfWorkerUrl", dbDialog)
    const cfIdInput = Utils.qs("#cfBoardId", dbDialog)
    const cfBoardSelect = Utils.qs("#cfBoardSelect", dbDialog)
    const boardActionBtns = Utils.qs("#boardActionBtns", dbDialog)
    const newBoardBtn = Utils.qs("#newBoardBtn", dbDialog)
    const renameBoardBtn = Utils.qs("#renameBoardBtn", dbDialog)
    const deleteBoardBtn = Utils.qs("#deleteBoardBtn", dbDialog)

    const getSelectedBoardId = () =>
      (cfBoardSelect?.style.display !== "none" ? cfBoardSelect.value : cfIdInput.value.trim()) || "default"

    const refreshAfterBoardAction = async (boards) => {
      UI.accessibleBoards = boards || []
      UI.renderBoardSelect(cfBoardSelect, cfIdInput, UI.accessibleBoards)
      UI.updateBoardNameLabel()
      const cfg = DbSettings.get()
      const selId = getSelectedBoardId()
      if (selId !== cfg.cfBoardId) {
        const nextCfg = { ...cfg, cfBoardId: selId }
        const cachedSession = DbSettings.getBoardSession(selId, cfg)
        if (cachedSession?.cfUserToken) {
          nextCfg.cfUserToken = cachedSession.cfUserToken
          nextCfg.cfUserEmail = cachedSession.cfUserEmail || ""
          nextCfg.cfUserName = cachedSession.cfUserName || ""
          Store.isAdmin = !!cachedSession.isAdmin
        } else {
          nextCfg.cfUserToken = ""
          nextCfg.cfUserEmail = ""
          nextCfg.cfUserName = ""
          Store.isAdmin = false
        }
        DbSettings.set(nextCfg)
        await Store.loadState()
        UI.renderBoard()
        UI.updateMenuButtonAvatar()
        UI.updateAuthButtonsVisibility()
        UI.updateAdminPanelVisibility()
        await Notifications.refresh()
      }
    }

    dbBtn.addEventListener("click", async () => {
      const cfg = DbSettings.get()
      cfUrlInput.value = cfg.cfWorkerUrl || ""
      cfIdInput.value = cfg.cfBoardId || ""
      UI.renderBoardSelect(cfBoardSelect, cfIdInput, UI.accessibleBoards)
      if (boardActionBtns) boardActionBtns.style.display = Store.hasCloudflareSession() && Store.isAdmin ? "" : "none"
      if (Store.hasCloudflareSession()) {
        try {
          const result = await CloudflareBackend.listBoards(cfg)
          UI.accessibleBoards = result.boards || []
          UI.renderBoardSelect(cfBoardSelect, cfIdInput, UI.accessibleBoards)
        } catch (err) {
          console.warn("Failed to load boards:", err)
        }
      }
      UI.showDialog(dbDialog)
    })

    if (UI.logoutBtn) {
      UI.logoutBtn.addEventListener("click", async () => {
        UI.clearCloudflareSession()
        await Store.loadState()
        UI.renderBoard()
        UI.updateMenuButtonAvatar()
        UI.logoutBtn.closest(".dropdown-content")?.classList.remove("show")
      })
    }

    const addColumnBtn = Utils.qs("#addColumnBtn")
    if (addColumnBtn) {
      addColumnBtn.disabled = !Store.canCurrentUserManageBoardStructure()
    }

    dbForm.addEventListener("submit", async (e) => {
      e.preventDefault()
      const prevCfg = DbSettings.get()
      const selectedBoardId = getSelectedBoardId()
      const nextWorkerUrl = cfUrlInput.value.trim()
      const workerChanged = nextWorkerUrl !== (prevCfg.cfWorkerUrl || "")

      const newCfg = {
        cfWorkerUrl: nextWorkerUrl,
        cfBoardId: selectedBoardId,
        cfUserEmail: prevCfg.cfUserEmail || "",
        cfUserName: prevCfg.cfUserName || "",
        cfUserToken: prevCfg.cfUserToken || "",
        cfBoardSessions: workerChanged ? {} : { ...(prevCfg.cfBoardSessions || {}) },
      }

      const cloudflareChanged =
        workerChanged ||
        newCfg.cfBoardId !== (prevCfg.cfBoardId || "default")
      if (cloudflareChanged && !workerChanged && prevCfg.cfUserToken) {
        try {
          const switched = await CloudflareBackend.switchBoard(prevCfg, newCfg.cfBoardId)
          newCfg.cfUserEmail = prevCfg.cfUserEmail || switched.user?.email || ""
          newCfg.cfUserName = switched.user?.name || prevCfg.cfUserName || newCfg.cfUserEmail || ""
          newCfg.cfUserToken = switched.token || ""
          newCfg.isAdmin = !!switched.isAdmin
          Store.isAdmin = !!switched.isAdmin
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("board_switch_failed"))
          return
        }
      } else if (cloudflareChanged && !workerChanged && !prevCfg.cfUserToken) {
        const cachedSession = DbSettings.getBoardSession(newCfg.cfBoardId, prevCfg)
        if (cachedSession) {
          newCfg.cfUserEmail = cachedSession.cfUserEmail || ""
          newCfg.cfUserName = cachedSession.cfUserName || newCfg.cfUserEmail || ""
          newCfg.cfUserToken = cachedSession.cfUserToken || ""
          Store.isAdmin = !!cachedSession.isAdmin
        }
      } else if (cloudflareChanged) {
        newCfg.cfUserEmail = ""
        newCfg.cfUserName = ""
        newCfg.cfUserToken = ""
        newCfg.cfBoardSessions = {}
        Store.isAdmin = false
      }

      DbSettings.set(newCfg)
      await Store.loadState()
      UI.renderBoard()
      UI.updateMenuButtonAvatar()
      UI.updateAuthButtonsVisibility()
      await Notifications.refresh()
      dbDialog.close()
    })

    if (newBoardBtn) {
      newBoardBtn.addEventListener("click", async () => {
        const cfg = DbSettings.get()
        const name = await UI.showPrompt(I18n.t("new_board_title"), I18n.t("new_board_placeholder"))
        if (!name) return
        try {
          const created = await CloudflareBackend.createBoard(cfg, name)
          const nextCfg = {
            ...cfg,
            cfBoardId: created.board?.id || cfg.cfBoardId || "default",
            cfUserName: created.user?.name || cfg.cfUserName || cfg.cfUserEmail || "",
            cfUserToken: created.token || cfg.cfUserToken || "",
            isAdmin: !!created.isAdmin,
          }
          DbSettings.set(nextCfg)
          Store.isAdmin = !!created.isAdmin
          UI.accessibleBoards = created.boards || []
          UI.renderBoardSelect(cfBoardSelect, cfIdInput, UI.accessibleBoards)
          await Store.loadState()
          UI.renderBoard()
          UI.updateMenuButtonAvatar()
          UI.updateAuthButtonsVisibility()
          UI.updateAdminPanelVisibility()
          await Notifications.refresh()
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("board_create_failed"))
        }
      })
    }

    if (renameBoardBtn) {
      renameBoardBtn.addEventListener("click", async () => {
        const cfg = DbSettings.get()
        const targetBoardId = getSelectedBoardId()
        const boardInfo = (UI.accessibleBoards || []).find((b) => b.id === targetBoardId)
        const currentName = boardInfo?.name || targetBoardId
        const newName = await UI.showPrompt(I18n.t("rename_board_title"), "", currentName)
        if (!newName || newName === currentName) return
        try {
          const result = await CloudflareBackend.renameBoard(cfg, targetBoardId, newName)
          await refreshAfterBoardAction(result.boards)
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("board_rename_failed"))
        }
      })
    }

    if (deleteBoardBtn) {
      deleteBoardBtn.addEventListener("click", async () => {
        const cfg = DbSettings.get()
        const targetBoardId = getSelectedBoardId()
        if (targetBoardId === "default") {
          UI.showAlert(I18n.t("default_board_no_delete"))
          return
        }
        const boardInfo = (UI.accessibleBoards || []).find((b) => b.id === targetBoardId)
        const boardName = boardInfo?.name || targetBoardId
        const choice = await UI.showConfirm(I18n.t("delete_board_confirm", { name: boardName }), {
          title: I18n.t("delete_board"),
          deleteText: I18n.t("delete"),
          showArchiveButton: false,
        })
        if (choice !== "delete") return
        try {
          const result = await CloudflareBackend.deleteBoard(cfg, targetBoardId)
          UI.accessibleBoards = result.boards || []
          if (UI.accessibleBoards.length === 0) {
            const nextCfg = { ...cfg, cfBoardId: "default", cfUserToken: "", cfUserEmail: "", cfUserName: "" }
            const defaultSession = DbSettings.getBoardSession("default", cfg)
            if (defaultSession?.cfUserToken) {
              nextCfg.cfUserToken = defaultSession.cfUserToken
              nextCfg.cfUserEmail = defaultSession.cfUserEmail || ""
              nextCfg.cfUserName = defaultSession.cfUserName || ""
            }
            DbSettings.set(nextCfg)
            Store.isAdmin = false
            await Store.loadState()
            UI.renderBoard()
            UI.updateMenuButtonAvatar()
            UI.updateAuthButtonsVisibility()
            UI.updateAdminPanelVisibility()
            await Notifications.refresh()
            dbDialog.close()
          } else {
            const currentBoardId = cfg.cfBoardId || "default"
            if (targetBoardId === currentBoardId) {
              const nextBoardId = UI.accessibleBoards[0].id
              const nextCfg = { ...cfg, cfBoardId: nextBoardId }
              const cachedSession = DbSettings.getBoardSession(nextBoardId, cfg)
              if (cachedSession?.cfUserToken) {
                nextCfg.cfUserToken = cachedSession.cfUserToken
                nextCfg.cfUserEmail = cachedSession.cfUserEmail || ""
                nextCfg.cfUserName = cachedSession.cfUserName || ""
                Store.isAdmin = !!cachedSession.isAdmin
              } else {
                nextCfg.cfUserToken = ""
                nextCfg.cfUserEmail = ""
                nextCfg.cfUserName = ""
                Store.isAdmin = false
              }
              DbSettings.set(nextCfg)
              await Store.loadState()
              UI.renderBoard()
              UI.updateMenuButtonAvatar()
              UI.updateAuthButtonsVisibility()
              UI.updateAdminPanelVisibility()
              await Notifications.refresh()
            }
            UI.renderBoardSelect(cfBoardSelect, cfIdInput, UI.accessibleBoards)
            UI.updateBoardNameLabel()
          }
        } catch (err) {
          UI.showAlert(I18n.serverError(err.message) || I18n.t("board_delete_failed"))
        }
      })
    }

    // --- Theme ---
    Utils.qsa("[data-theme-option]").forEach(btn => {
      btn.addEventListener("click", () => UI.applyTheme(btn.dataset.themeOption))
    })

    // --- Image Upload UI ---
    const addAttBtn = Utils.qs("#addAttachmentBtn")
    const detailAddAttBtn = Utils.qs("#cardDetailAddAttachmentBtn")
    const attInput = Utils.qs("#attachmentInput")
    if (addAttBtn && attInput) {
      addAttBtn.addEventListener("click", () => {
        UI.activeUploadContext = "editor"
        const cardId = Utils.qs("#editorForm").dataset.cardId
        const { card } = cardId ? Store.findCard(cardId) : { card: null }
        if (card && !Store.canCurrentUserEditCard(card)) return
        attInput.click()
      })
      if (detailAddAttBtn) {
        detailAddAttBtn.addEventListener("click", () => {
          UI.activeUploadContext = "detail"
          const form = Utils.qs("#cardDetailForm")
          const cardId = form.dataset.cardId
          const { card } = cardId ? Store.findCard(cardId) : { card: null }
          if (!card || !Store.canCurrentUserEditCard(card) || form.dataset.editMode !== "true") return
          attInput.click()
        })
      }
      attInput.addEventListener("change", (e) => {
        const cardId = UI.activeUploadContext === "detail"
          ? Utils.qs("#cardDetailForm").dataset.cardId
          : Utils.qs("#editorForm").dataset.cardId
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
        if (dialog === UI.editor) {
          if (!Utils.qs("#editorForm").dataset.cardId) {
            UI.cleanupPendingCardAttachments()
          }
          UI.hideMoveToMenu()
          UI.dragCounter = 0
          UI.toggleDropzone(false)
        }
        if (dialog === UI.cardDetailDialog) {
          Utils.qs("#cardDetailForm").dataset.editMode = "false"
          UI.resetCommentComposer("detail")
          UI.hideMoveToMenu()
        }
      })
    })

    Utils.qsa('dialog .btn.secondary[value="cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest("dialog").close()
      })
    })

    const descriptionEditor = Utils.qs("#descriptionEditor")
    const detailDescriptionEditor = Utils.qs("#cardDetailDescriptionEditor")

    const bindRichTextEditor = (editor) => {
      if (!editor) return
      editor.addEventListener("keydown", (e) => {
      const isCtrlOrCmd = e.metaKey || e.ctrlKey

      if (isCtrlOrCmd && e.key === "b") {
        e.preventDefault()
        document.execCommand("bold", false, null)
      } else if (isCtrlOrCmd && e.key === "k") {
        e.preventDefault()
          document.execCommand("unlink", false, null)
        }
      })

      editor.addEventListener("paste", (e) => {
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
    }

    bindRichTextEditor(descriptionEditor)
    bindRichTextEditor(detailDescriptionEditor)

    // --- Focus Sync ---
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible") {
        const cfg = DbSettings.get()
        // Fetch updates whenever the tab becomes active
        if (cfg.cfWorkerUrl) {
          await Store.loadState()
          UI.renderBoard()
          await Notifications.refresh()
        }
      }
    })
    
    // --- Image Upload (Paste & Drop) ---
    window.addEventListener("paste", this.handlePaste.bind(this))
    
    window.addEventListener("dragenter", (e) => {
      if (UI.editor.open && e.dataTransfer.types.includes("Files")) {
        e.preventDefault()
        UI.dragCounter++
        UI.toggleDropzone(true)
      }
    })

    window.addEventListener("dragover", (e) => {
      if (UI.editor.open && e.dataTransfer.types.includes("Files")) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }
    })

    window.addEventListener("dragleave", (e) => {
      if (UI.editor.open) {
        e.preventDefault()
        UI.dragCounter--
        if (UI.dragCounter <= 0) {
          UI.dragCounter = 0
          UI.toggleDropzone(false)
        }
      }
    })

    window.addEventListener("drop", (e) => {
      UI.dragCounter = 0
      UI.toggleDropzone(false)
      this.handleDrop(e)
    })
  },

  // --- Action Handlers ---
  handleAddColumn(e) {
    e.preventDefault()
    if (!Store.canCurrentUserManageBoardStructure()) return
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
    if (!Store.canCurrentUserManageBoardStructure()) {
      e.target.closest("dialog").close()
      return
    }
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
    if (!Store.canCurrentUserManageBoardStructure()) return
    const col = Store.findColumn(colId)
    const context = {
      title: I18n.t("delete_column_title"),
      deleteText: I18n.t("delete"),
      showArchiveButton: false,
    }
    const choice = await UI.showConfirm(
      I18n.t("delete_col_confirm", { title: col.title }),
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
    if (!Store.canCurrentUserMoveCard(card)) {
      UI.showAlert(I18n.t("own_card_only_error"))
      return
    }

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
        UI.showAlert(I18n.t("no_done_col_error"))
        return
      }
    }

    UI.renderBoard()
    const dialog = form.closest("dialog")
    if (dialog === UI.cardDetailDialog) {
      const fresh = Store.findCard(cardId)
      if (fresh.card && fresh.col) {
        form.dataset.colId = fresh.col.id
        UI.renderCardDetail()
      }
    } else {
      dialog.close()
    }
  },

  handleMoveCardTo(form, toColId) {
    const cardId = form.dataset.cardId
    if (!cardId || !toColId) return

    const { card, col: fromCol } = Store.findCard(cardId)
    const toCol = Store.findColumn(toColId)
    if (!card || !fromCol || !toCol) return
    if (!Store.canCurrentUserMoveCard(card)) {
      UI.showAlert(I18n.t("own_card_only_error"))
      return
    }
    if (toCol.isDone || toCol.isArchive || toCol.id === fromCol.id) return

    Store.moveCard(cardId, fromCol.id, toCol.id, -1)
    UI.renderBoard()
    UI.hideMoveToMenu()
    const dialog = form.closest("dialog")
    if (dialog === UI.cardDetailDialog) {
      const fresh = Store.findCard(cardId)
      if (fresh.card && fresh.col) {
        form.dataset.colId = fresh.col.id
        UI.renderCardDetail()
      }
    } else {
      dialog.close()
    }
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
    if (existingCard && !Store.canCurrentUserEditCard(existingCard)) {
      UI.showAlert(I18n.t("own_card_only_error"))
      return
    }
    
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
      comments: existingCard ? (existingCard.comments || []) : [],
      attachments: existingCard ? existingCard.attachments : UI.pendingCardAttachments
    }

    const userVal = form.elements.user.value.trim()
    if (userVal) {
      const existingUser = (Store.state.users || []).find(u => (u.name || "") === userVal || (u.email || "") === userVal)
      if (existingUser) {
        cardData.assignedUser = existingUser
      } else {
        UI.showAlert(I18n.t("user_not_found"));
        return;
      }
    }

    let savedCard
    if (cardId) {
      savedCard = Store.updateCard(cardId, cardData)
      UI.updateCard(savedCard)
    } else {
      savedCard = Store.addCard(colId, cardData)
      UI.addCard(colId, savedCard)
      UI.pendingCardAttachments = []
    }


    form.closest("dialog").close()
  },

  handleSaveCardDetail(e) {
    e.preventDefault()
    const form = e.target
    const cardId = form.dataset.cardId
    if (!cardId) return

    const { card: existingCard } = Store.findCard(cardId)
    if (!existingCard) return
    if (!Store.canCurrentUserEditCard(existingCard)) {
      UI.showAlert(I18n.t("own_card_only_error"))
      return
    }

    const title = Utils.qs("#cardDetailTitleInput").value.trim()
    if (!title) return

    const descHtml = Utils.qs("#cardDetailDescriptionEditor").innerHTML.trim()
    const description = UI.hasMeaningfulHtml(descHtml) ? descHtml : ""
    const cardData = {
      title,
      description,
      tags: Utils.qs("#cardDetailTagsInput").value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      due: Utils.qs("#cardDetailDueInput").value
        ? new Date(Utils.qs("#cardDetailDueInput").value).toISOString()
        : "",
      assignedUser: null,
      comments: existingCard.comments || [],
      attachments: existingCard.attachments || [],
    }

    const userVal = Utils.qs("#cardDetailUserInput").value.trim()
    if (userVal) {
      const existingUser = (Store.state.users || []).find((u) => (u.name || "") === userVal || (u.email || "") === userVal)
      if (existingUser) {
        cardData.assignedUser = existingUser
      } else {
        UI.showAlert(I18n.t("user_not_found"))
        return
      }
    }

    const savedCard = Store.updateCard(cardId, cardData)
    UI.updateCard(savedCard)
    form.dataset.editMode = "false"
    UI.renderCardDetail()
  },

  handleSaveComment() {
    const targets = UI.getCommentTargets()
    const form = targets.form
    const cardId = form.dataset.cardId
    if (!cardId || !Store.canCurrentUserComment()) return

    const input = targets.input
    const text = input.value.trim()
    if (!text) return

    const { card } = Store.findCard(cardId)
    if (!card) return

    if (UI.editingCommentId) {
      const comment = Store.findComment(card, UI.editingCommentId).comment
      if (!comment || !Store.canCurrentUserEditComment(comment)) {
        UI.showAlert(I18n.t("own_comment_only_error"))
        return
      }
      Store.updateComment(cardId, comment.id, text)
    } else {
      Store.addComment(cardId, text, UI.replyToCommentId)
    }

    const fresh = Store.findCard(cardId).card
    UI.updateCard(fresh)
    if (targets.context === "detail") {
      UI.renderCardDetail()
    } else {
      UI.renderEditorComments(fresh)
    }
    UI.resetCommentComposer(targets.context)
    targets.input?.scrollIntoView({ behavior: "smooth", block: "center" })
  },

  async handleDeleteComment(cardId, commentId) {
    const { card } = Store.findCard(cardId)
    const comment = card ? Store.findComment(card, commentId).comment : null
    if (!card || !comment) return
    if (!Store.canCurrentUserManageComment(comment)) {
      UI.showAlert(I18n.t("own_comment_only_error"))
      return
    }

    const choice = await UI.showConfirm(I18n.t("delete_comment_confirm"), {
      title: I18n.t("delete_comment"),
      deleteText: I18n.t("delete"),
      showArchiveButton: false,
    })
    if (choice !== "delete") return

    Store.deleteComment(cardId, commentId)
    const fresh = Store.findCard(cardId).card
    UI.updateCard(fresh)
    if (UI.cardDetailDialog?.open) {
      UI.renderCardDetail()
      UI.resetCommentComposer("detail")
      Utils.qs("#cardDetailCommentInput")?.scrollIntoView({ behavior: "smooth", block: "center" })
    } else {
      UI.renderEditorComments(fresh)
      UI.resetCommentComposer("editor")
      Utils.qs("#commentInput")?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  },

  async promptDeleteOrArchive(cardId) {
    const { card, col } = Store.findCard(cardId)
    if (!card) return
    if (!Store.canCurrentUserEditCard(card)) {
      UI.showAlert(I18n.t("own_card_only_error"))
      return
    }

    const context = col.isArchive
      ? {
          title: I18n.t("archived_card_title"),
          deleteText: I18n.t("delete_permanently"),
          showArchiveButton: false,
        }
      : {
          title: I18n.t("delete_card_title"),
          deleteText: I18n.t("delete"),
          showArchiveButton: true,
        }

    const choice = await UI.showConfirm(
      I18n.t("delete_or_archive_confirm", { title: card.title }),
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
      if (UI.cardDetailDialog?.open) {
        const fresh = Store.findCard(cardId)
        if (fresh.card && fresh.col) UI.renderCardDetail()
      }
    } else if (choice === "delete") {
      Store.deleteCard(cardId)
      UI.deleteCard(cardId)
      if (UI.cardDetailDialog?.open) UI.cardDetailDialog.close()
    }
  },

  handlePaste(e) {
    const inEditor = UI.editor.open && e.target.closest("#editor")
    const inDetail = UI.cardDetailDialog?.open && e.target.closest("#cardDetailDialog")
    if (!inEditor && !inDetail) return

    const form = inDetail ? Utils.qs("#cardDetailForm") : Utils.qs("#editorForm")
    if (inDetail && form.dataset.editMode !== "true") return
    const cardId = form.dataset.cardId
    const { card } = cardId ? Store.findCard(cardId) : { card: null }
    if (card && !Store.canCurrentUserEditCard(card)) return

    const items = (e.clipboardData || e.originalEvent.clipboardData).items
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        this.handleImageUpload(file, cardId)
      }
    }
  },

  handleDrop(e) {
    e.preventDefault()
    
    const inEditor = UI.editor.open
    const inDetail = UI.cardDetailDialog?.open && Utils.qs("#cardDetailForm").dataset.editMode === "true"
    if (!inEditor && !inDetail) return

    const cardId = inDetail ? Utils.qs("#cardDetailForm").dataset.cardId : Utils.qs("#editorForm").dataset.cardId
    const { card } = cardId ? Store.findCard(cardId) : { card: null }
    if (card && !Store.canCurrentUserEditCard(card)) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        if (file.type.startsWith("image/")) {
          this.handleImageUpload(file, cardId)
        }
      })
    }
  },

  async handleImageUpload(file, cardId) {
    const { card } = cardId ? Store.findCard(cardId) : { card: null }
    if (cardId && !card) return

    const attachments = card ? (card.attachments || []) : UI.pendingCardAttachments
    if (attachments.length >= 4) {
      UI.showAlert(I18n.t("too_many_attachments"))
      return
    }

    // Process image: convert to WebP and resize
    const processedFile = await Utils.processImage(file)

    if (processedFile.size > 5 * 1024 * 1024) {
      UI.showAlert(I18n.t("image_too_large"))
      return
    }

    const cfg = DbSettings.get()
    if (!cfg.cfWorkerUrl) {
      UI.showAlert(I18n.t("image_upload_failed"))
      return
    }

    try {
      const result = await CloudflareBackend.uploadImage(processedFile, cfg)
      if (cardId) {
        // Re-fetch card in case it changed
        const { card: freshCard } = Store.findCard(cardId)
        if (!freshCard) return
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
        const detailForm = Utils.qs("#cardDetailForm")
        if (detailForm?.dataset.cardId === cardId) {
          if (detailForm.dataset.editMode === "true") {
            UI.renderCardDetailAttachments(freshCard.attachments, cardId, true)
          } else {
            UI.renderCardDetail()
          }
        }
      } else {
        UI.pendingCardAttachments.push({
          url: result.url,
          key: result.key,
          name: processedFile.name
        })
        UI.updateEditorAttachments(UI.pendingCardAttachments, "")
      }
    } catch (err) {
      console.error(err)
      UI.showAlert(I18n.t("image_upload_failed"))
    }
  },
}

// Initialize the application
App.init()
