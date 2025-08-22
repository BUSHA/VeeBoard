// ============================================================================
//  VeeBoard
// ============================================================================
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
}

/**
 * @module Store
 * Manages the application state and persistence to LocalStorage.
 */
const Store = {
  STORAGE_KEY: "vee-board-state-v1",
  state: {
    columns: [],
  },

  loadState() {
    try {
      const rawState = localStorage.getItem(this.STORAGE_KEY)
      if (rawState) {
        const data = JSON.parse(rawState)
        this.validateState(data)
        this.state = data
      } else {
        this.state = this.getDemoState()
      }
    } catch {
      this.state = this.getDemoState()
    }

    // Ensure archive column exists for backward compatibility
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

  saveState() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state))
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
              title: "Drag & Drop",
              description:
                "Try dragging this card to another column using <br>the grip icon <b>⋮⋮</b> at the top left of the card.",
              tags: ["guide", "welcome"],
              due: "",
            },
            {
              id: Utils.uid(),
              title: "Rich Text & Links",
              description: `The description supports basic rich text hotkeys, like <b>bold</b> or <i>italic</i> text. You can also create <a href="https://github.com/busha/VeeBoard" target="_blank">links</a> by selecting text and pasting a URL. Try removing the link – select it and press <b>Cmd/Ctrl + K</b>.`,
              tags: ["feature", "editor"],
              due: createFutureDate(4, 18, 0),
            },
          ],
        },
        {
          id: Utils.uid(),
          title: "In Progress",
          cards: [
            {
              id: Utils.uid(),
              title: "Due Date Reminders",
              description:
                "This card is due soon and has a reminder set for 15 minutes before its due time. The app will send a browser notification 🔔 even if the tab is closed.",
              tags: ["notifications", "ux", "feature"],
              due: createFutureDate(1, 10, 0),
              reminder: { enabled: true, offset: 15 },
            },
            {
              id: Utils.uid(),
              title: "Handle Overdue Cards",
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
              title: "Dark Theme Toggle",
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

    this.updateCardElement(node, card, column)

    const grip = node.querySelector(".card-grip")
    grip.addEventListener("pointerdown", Dnd.startCardPotentialDrag)

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

  // --- Card DnD ---
  startCardPotentialDrag(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return

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
    }

    cardEl.setPointerCapture(e.pointerId)

    if (e.pointerType !== "mouse") {
      Dnd.cardDrag.timerId = setTimeout(() => {
        if (Dnd.cardDrag && !Dnd.cardDrag.started) {
          Dnd.beginCardDrag(e)
        }
      }, 300)
    }

    document.addEventListener("pointermove", Dnd.onCardPotentialMove)
    document.addEventListener("pointerup", Dnd.onCardDragEnd)
    document.addEventListener("pointercancel", Dnd.onCardDragEnd)
  },

  onCardPotentialMove(e) {
    if (!Dnd.cardDrag || e.pointerId !== Dnd.cardDrag.pointerId) return

    const dx = e.clientX - Dnd.cardDrag.startX
    const dy = e.clientY - Dnd.cardDrag.startY
    const dist = Math.hypot(dx, dy)
    const threshold = e.pointerType === "mouse" ? 6 : 8

    if (dist > threshold && !Dnd.cardDrag.started) {
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
  },

  onCardPointerMove(e) {
    if (!Dnd.cardDrag || !Dnd.cardDrag.started) return
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

    Dnd.cardDrag = null
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
  },

  onColMove(e) {
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
  },
}

/**
 * @module App
 * Main application controller. Initializes the app and handles events.
 */
const App = {
  init() {
    this.registerServiceWorker()
    this.setupEventListeners()
    this.loadTheme()
    Store.loadState()
    UI.renderBoard()
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
        const existingColIds = new Set(Store.state.columns.map((c) => c.id))
        incomingState.columns.forEach((incCol) => {
          if (!existingColIds.has(incCol.id)) {
            Store.state.columns.push(incCol)
          } else {
            const existingCol = Store.findColumn(incCol.id)
            const existingCardIds = new Set(existingCol.cards.map((c) => c.id))
            incCol.cards.forEach((incCard) => {
              if (!existingCardIds.has(incCard.id)) {
                existingCol.cards.push(incCard)
              }
            })
          }
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
