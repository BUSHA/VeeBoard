// ===== State =====
const STORAGE_KEY = "vee-board-state-v1"
const THEME_KEY = "vee-board-theme"
const qs = (s, el = document) => el.querySelector(s)
const qsa = (s, el = document) => [...el.querySelectorAll(s)]
const uid = () => Math.random().toString(36).slice(2, 10)

let state = loadState() ?? demoState()
let activeTagFilters = new Set()
let searchQuery = ""

const board = qs("#board")
const columnTpl = qs("#columnTemplate")
const cardTpl = qs("#cardTemplate")
const editor = qs("#editor")
const editorTitle = qs("#editorTitle")
const eTitle = qs("#eTitle")
const eDesc = qs("#eDesc")
const eTags = qs("#eTags")
const eDue = qs("#eDue")
const colDialog = qs("#colDialog")
const colName = qs("#colName")
const confirmDialog = qs("#confirmDialog")
const confirmText = qs("#confirmText")
const renameDialog = qs("#renameDialog")
const renameInput = qs("#renameInput")
const renameOk = qs("#renameOk")

let editCtx = null // {colId, cardId|null, isNew:boolean}
let justDragged = false // suppress click after drag

renderAll()
setupToolbar()
applyTheme(loadTheme())

function renderAll() {
  board.innerHTML = ""
  ensureTagFiltersFromState()
  for (const col of state.columns) {
    board.append(renderColumn(col))
  }
}

function renderColumn(col) {
  const node = columnTpl.content.firstElementChild.cloneNode(true)
  node.dataset.id = col.id
  const titleEl = qs(".column-title", node)
  titleEl.textContent = col.title

  titleEl.addEventListener("dblclick", () => renameColumn(col.id))
  qs(".btn-rename", node).addEventListener("click", () => renameColumn(col.id))
  qs(".btn-del-col", node).addEventListener("click", async () => {
    const ok = await showConfirm(
      `Delete column “${col.title}” with all its cards?`
    )
    if (!ok) return
    deleteColumn(col.id)
  })
  qs(".btn-add-card", node).addEventListener("click", () =>
    openCreateCard(col.id)
  )
  qs(".drag-handle", node).addEventListener("pointerdown", (e) =>
    startColumnDrag(e, node)
  )

  const list = qs(".cards", node)
  for (const card of col.cards) {
    list.append(renderCard(col, card))
  }
  return node
}

function renderCard(col, card) {
  if (!matchSearchAndTags(card)) return document.createComment("filtered")
  const node = cardTpl.content.firstElementChild.cloneNode(true)
  node.dataset.id = card.id
  qs(".card-title", node).textContent = card.title
  qs(".card-desc", node).textContent = card.description || ""
  const dueEl = qs(".card-due", node)
  if (card.due) {
    const d = new Date(card.due)
    dueEl.textContent = d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    dueEl.dateTime = d.toISOString()
  } else {
    dueEl.textContent = ""
  }
  const tagsBox = qs(".tags", node)
  ;(card.tags || []).forEach((t) => tagsBox.append(tagBadge(t)))

  // Open editor on click on the card (except grip and buttons)
  node.addEventListener("click", (e) => {
    if (e.target.closest(".card-grip") || e.target.closest(".btn")) return
    if (justDragged) return
    openEditCard(col.id, card.id)
  })

  // Delete button
  const delBtn = qs(".btn-del-card", node)
  delBtn.addEventListener("click", (ev) => {
    ev.stopPropagation()
    onDeleteCard(col.id, card.id)
  })

  // Start DnD only from the grip
  const grip = node.querySelector(".card-grip")
  grip.addEventListener("pointerdown", startCardPotentialDrag)

  // Keyboard
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      openEditCard(col.id, card.id)
    }
    if (e.key === "Delete") {
      e.preventDefault()
      onDeleteCard(col.id, card.id)
    }
  })

  return node
}

function onDeleteCard(colId, cardId) {
  showConfirm("Delete this card?").then((ok) => {
    if (!ok) return
    deleteCard(colId, cardId)
  })
}

function tagBadge(tag) {
  const el = document.createElement("span")
  el.className = "tag"
  const dot = document.createElement("span")
  dot.className = "dot"
  dot.style.background = colorFromString(tag)
  el.append(dot, document.createTextNode(tag))
  return el
}

function ensureTagFiltersFromState() {
  const box = qs("#tagFilters")
  const tags = new Set()
  for (const c of state.columns)
    for (const k of c.cards) for (const t of k.tags || []) tags.add(t)
  box.innerHTML = ""
  ;[...tags].sort().forEach((tag) => {
    const chip = document.createElement("button")
    chip.className = "tag-chip"
    chip.innerHTML = `<span class="tag-dot" style="background:${colorFromString(
      tag
    )}"></span> ${tag}`
    chip.setAttribute("aria-pressed", "false")
    chip.addEventListener("click", () => {
      if (activeTagFilters.has(tag)) {
        activeTagFilters.delete(tag)
        chip.classList.remove("active")
        chip.setAttribute("aria-pressed", "false")
      } else {
        activeTagFilters.add(tag)
        chip.classList.add("active")
        chip.setAttribute("aria-pressed", "true")
      }
      rerenderFiltered()
    })
    box.appendChild(chip)
  })
}

function rerenderFiltered() {
  for (const colEl of qsa(".column")) {
    const col = state.columns.find((c) => c.id === colEl.dataset.id)
    const list = qs(".cards", colEl)
    list.innerHTML = ""
    for (const card of col.cards) list.append(renderCard(col, card))
  }
}

// ===== Columns =====
function addColumnByName(name) {
  state.columns.push({ id: uid(), title: name, cards: [] })
  saveState()
  renderAll()
}
function renameColumn(colId) {
  const col = state.columns.find((c) => c.id === colId)
  renameDialog.dataset.colId = colId
  renameInput.value = col.title
  renameDialog.showModal()
}
renameOk.addEventListener("click", () => {
  const id = renameDialog.dataset.colId
  const col = state.columns.find((c) => c.id === id)
  const t = renameInput.value.trim()
  if (!t) {
    renameInput.focus()
    return
  }
  col.title = t
  saveState()
  renderAll()
  renameDialog.close()
})
renameDialog.addEventListener("click", (e) => {
  if (e.target === renameDialog) renameDialog.close()
})

function deleteColumn(colId) {
  state.columns = state.columns.filter((c) => c.id !== colId)
  saveState()
  renderAll()
}

// ===== Cards =====
function addCard(colId, card) {
  const col = state.columns.find((c) => c.id === colId)
  col.cards.push(card)
  saveState()
  renderAll()
}
function deleteCard(colId, cardId) {
  const col = state.columns.find((c) => c.id === colId)
  col.cards = col.cards.filter((x) => x.id !== cardId)
  saveState()
  renderAll()
}

function openCreateCard(colId) {
  editCtx = { colId, cardId: null, isNew: true }
  editorTitle.textContent = "Create card"
  eTitle.value = ""
  eDesc.value = ""
  eTags.value = ""
  eDue.value = ""
  editor.showModal()
}
function openEditCard(colId, cardId) {
  const col = state.columns.find((c) => c.id === colId)
  const card = col.cards.find((x) => x.id === cardId)
  editCtx = { colId, cardId, isNew: false }
  editorTitle.textContent = "Edit card"
  eTitle.value = card.title
  eDesc.value = card.description || ""
  eTags.value = (card.tags || []).join(", ")
  eDue.value = card.due ? new Date(card.due).toISOString().slice(0, 10) : ""
  editor.showModal()
}

qs("#eSave").addEventListener("click", () => {
  if (!editCtx) return
  const { colId, cardId, isNew } = editCtx
  const col = state.columns.find((c) => c.id === colId)
  if (isNew) {
    const card = {
      id: uid(),
      title: eTitle.value.trim(),
      description: eDesc.value.trim(),
      tags: eTags.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      due: eDue.value ? new Date(eDue.value + "T00:00:00").toISOString() : "",
    }
    if (!card.title) {
      return
    }
    addCard(colId, card)
  } else {
    const card = col.cards.find((x) => x.id === cardId)
    card.title = eTitle.value.trim()
    if (!card.title) {
      alert("Title cannot be empty")
      return
    }
    card.description = eDesc.value.trim()
    card.tags = eTags.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    card.due = eDue.value
      ? new Date(eDue.value + "T00:00:00").toISOString()
      : ""
    saveState()
    renderAll()
  }
  editor.close()
})
editor.addEventListener("close", () => {
  editCtx = null
})
editor.addEventListener("click", (e) => {
  if (e.target === editor) editor.close()
})

// Column create dialog open
qs("#addColumnBtn").addEventListener("click", () => {
  colName.value = ""
  colDialog.showModal()
})
qs("#colCreate").addEventListener("click", () => {
  const name = colName.value.trim()
  if (!name) {
    colName.focus()
    return
  }
  addColumnByName(name)
  colDialog.close()
})
colDialog.addEventListener("click", (e) => {
  if (e.target === colDialog) colDialog.close()
})

// Confirm helper
function showConfirm(message) {
  return new Promise((resolve) => {
    confirmText.textContent = message
    confirmDialog.returnValue = "cancel"
    confirmDialog.showModal()
    const onClose = () => {
      confirmDialog.removeEventListener("close", onClose)
      resolve(confirmDialog.returnValue !== "cancel")
    }
    confirmDialog.addEventListener("close", onClose)
    confirmDialog.addEventListener("click", (e) => {
      if (e.target === confirmDialog) confirmDialog.close()
    })
  })
}

// ===== Search =====
qs("#search").addEventListener("input", (e) => {
  searchQuery = e.target.value.toLowerCase()
  rerenderFiltered()
})
function matchSearchAndTags(card) {
  const tags = (card.tags || []).map((t) => t.toLowerCase())
  if (activeTagFilters.size) {
    for (const t of activeTagFilters)
      if (!tags.includes(t.toLowerCase())) return false
  }
  if (!searchQuery) return true
  const txt = (
    card.title +
    " " +
    (card.description || "") +
    " " +
    tags.join(" ")
  ).toLowerCase()
  return txt.includes(searchQuery)
}

// ===== Theme / Import-Export =====
function setupToolbar() {
  const themeBtn = qs("#themeToggle")

  // При кліку перемикаємо тему та іконку
  themeBtn.addEventListener("click", () => {
    const next = loadTheme() === "dark" ? "light" : "dark"
    applyTheme(next)
    saveTheme(next)
    themeBtn.textContent = next === "light" ? "☾" : "☼"
  })

  // Встановлюємо правильну іконку при завантаженні
  themeBtn.textContent = loadTheme() === "light" ? "☾" : "☼"

  qs("#exportBtn").addEventListener("click", exportJSON)
  qs("#importInput").addEventListener("change", importJSON)
}
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "vee-board.json"
  a.click()
  URL.revokeObjectURL(a.href)
}
async function importJSON(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    validateState(data)
    state = data
    saveState()
    renderAll()
  } catch (err) {
    console.error(err)
    alert("Import error. Check JSON format.")
  } finally {
    e.target.value = ""
  }
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t)
}
function saveTheme(t) {
  localStorage.setItem(THEME_KEY, t)
}
function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "light"
}

// ===== LocalStorage =====
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    validateState(data)
    return data
  } catch {
    return null
  }
}
function validateState(data) {
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
}

// ===== Demo data =====
function demoState() {
  const colTodo = { id: uid(), title: "To do", cards: [] }
  const colDoing = { id: uid(), title: "In progress", cards: [] }
  const colDone = { id: uid(), title: "Done", cards: [] }
  colTodo.cards.push(
    {
      id: uid(),
      title: "Card design",
      description: "Pick colors, spacing, shadows.",
      tags: ["ui", "design"],
      due: isoPlusDays(2),
    },
    {
      id: uid(),
      title: "Search/filter",
      description: "Live filtering.",
      tags: ["feature"],
      due: isoPlusDays(4),
    },
    {
      id: uid(),
      title: "Persist state",
      description: "LocalStorage",
      tags: ["storage"],
      due: "",
    }
  )
  colDoing.cards.push({
    id: uid(),
    title: "Drag & drop",
    description: "Pointer Events for mouse & touch.",
    tags: ["dnd", "ux"],
    due: isoPlusDays(1),
  })
  colDone.cards.push(
    {
      id: uid(),
      title: "Dark theme",
      description: "Toggle + persistence.",
      tags: ["theme"],
      due: isoPlusDays(-1),
    },
    {
      id: uid(),
      title: "Import/Export",
      description: "JSON files",
      tags: ["storage"],
      due: "",
    }
  )
  return { columns: [colTodo, colDoing, colDone] }
}
function isoPlusDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ===== Utils =====
function colorFromString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 70% 50%)`
}

// ===== Card DnD with threshold & long-press =====
let drag = null // {pointerId, cardEl, fromColId, ghost, placeholder, offsetX, offsetY}
let pdrag = null // potential drag
const INTERACTIVE_SELECTOR =
  'button, .btn, a, input, textarea, select, [contenteditable="true"]'

function startCardPotentialDrag(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return
  // Start only from grip
  if (!e.target.closest(".card-grip")) return

  const cardEl = e.currentTarget.closest(".card") || e.target.closest(".card")
  const rect = cardEl.getBoundingClientRect()
  pdrag = {
    pointerId: e.pointerId,
    cardEl,
    startX: e.clientX,
    startY: e.clientY,
    started: false,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    timerId: null,
  }
  cardEl.setPointerCapture(e.pointerId)
  if (e.pointerType !== "mouse") {
    pdrag.timerId = setTimeout(() => {
      if (pdrag && !pdrag.started) {
        beginDrag(e, cardEl, pdrag.offsetX, pdrag.offsetY)
        pdrag.started = true
      }
    }, 300)
  }
  document.addEventListener("pointermove", onPotentialMove)
  document.addEventListener("pointerup", cancelPotentialOrEnd)
  document.addEventListener("pointercancel", cancelPotentialOrEnd)
}

function onPotentialMove(e) {
  if (!pdrag || e.pointerId !== pdrag.pointerId) return
  const dx = e.clientX - pdrag.startX,
    dy = e.clientY - pdrag.startY
  const dist = Math.hypot(dx, dy)
  const threshold = e.pointerType === "mouse" ? 6 : 8
  if (dist > threshold && !pdrag.started) {
    clearTimeout(pdrag.timerId)
    beginDrag(e, pdrag.cardEl, pdrag.offsetX, pdrag.offsetY)
    pdrag.started = true
  }
  if (drag) {
    e.preventDefault()
    onPointerMove(e)
  }
}

function cancelPotentialOrEnd(e) {
  if (pdrag && e.pointerId === pdrag.pointerId) {
    clearTimeout(pdrag.timerId)
    pdrag = null
  }
  if (drag) endDrag(e)
}

function beginDrag(e, cardEl, offsetX, offsetY) {
  e.preventDefault()
  document.body.classList.add("dragging-ui")
  const fromColEl = cardEl.closest(".column")
  drag = {
    pointerId: e.pointerId,
    cardEl,
    fromColId: fromColEl.dataset.id,
    ghost: createGhost(cardEl),
    placeholder: createPlaceholder(),
    offsetX,
    offsetY,
  }
  cardEl.classList.add("dragging")
  cardEl.after(drag.placeholder)
  document.addEventListener("pointermove", onPointerMove)
  document.addEventListener("pointerup", endDrag)
  document.addEventListener("pointercancel", endDrag)
}

function onPointerMove(e) {
  if (!drag) return
  positionGhost(e.clientX - drag.offsetX, e.clientY - drag.offsetY)
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const list = el && el.closest ? el.closest(".cards") : null
  if (!list) return
  const siblings = [...list.children].filter(
    (n) => !n.classList.contains("placeholder")
  )
  let placed = false
  for (const s of siblings) {
    const r = s.getBoundingClientRect()
    if (e.clientY < r.top + r.height / 2) {
      list.insertBefore(drag.placeholder, s)
      placed = true
      break
    }
  }
  if (!placed) list.appendChild(drag.placeholder)
}

function endDrag(e) {
  if (!drag) return
  const { cardEl, ghost, placeholder, fromColId } = drag
  const toList = placeholder.closest(".cards")
  if (toList) {
    const toColId = toList.closest(".column").dataset.id
    commitMove(
      cardEl,
      fromColId,
      toColId,
      indexOfPlaceholder(toList, placeholder)
    )
  }
  cardEl.classList.remove("dragging")
  ghost.remove()
  placeholder.remove()
  drag = null

  document.removeEventListener("pointermove", onPointerMove)
  document.removeEventListener("pointerup", endDrag)
  document.removeEventListener("pointercancel", endDrag)

  document.body.classList.remove("dragging-ui")
  justDragged = true
  setTimeout(() => (justDragged = false), 0)
}

function createGhost(cardEl) {
  const r = cardEl.getBoundingClientRect()
  const g = cardEl.cloneNode(true)
  Object.assign(g.style, {
    position: "fixed",
    left: r.left + "px",
    top: r.top + "px",
    width: r.width + "px",
    pointerEvents: "none",
    opacity: ".9",
    transform: "rotate(2deg)",
    zIndex: 9999,
  })
  g.classList.add("dragging")
  document.body.appendChild(g)
  return g
}
function positionGhost(x, y) {
  if (!drag) return
  Object.assign(drag.ghost.style, { left: x + "px", top: y + "px" })
}
function createPlaceholder() {
  const p = document.createElement("div")
  p.className = "card placeholder"
  p.textContent = "Drop here"
  return p
}
function indexOfPlaceholder(list, ph) {
  return [...list.children].indexOf(ph)
}
function commitMove(cardEl, fromColId, toColId, toIndex) {
  const fromCol = state.columns.find((c) => c.id === fromColId)
  const cardId = cardEl.dataset.id
  const card = fromCol.cards.find((c) => c.id === cardId)
  fromCol.cards = fromCol.cards.filter((c) => c.id !== cardId)
  const toCol = state.columns.find((c) => c.id === toColId)
  if (toIndex < 0 || toIndex > toCol.cards.length) toIndex = toCol.cards.length
  toCol.cards.splice(toIndex, 0, card)
  saveState()
  renderAll()
}

// ===== Column DnD: ghost + placeholder =====
let colDrag = null // {pointerId, ghost, placeholder, srcEl, startX, offsetX}
// Auto-scroll state for horizontal dragging near screen edges
let colAuto = { raf: 0, vx: 0 }
function stopColAutoScroll() {
  if (colAuto.raf) cancelAnimationFrame(colAuto.raf)
  colAuto.raf = 0
  colAuto.vx = 0
}
function runColAutoScroll() {
  if (!colDrag || colAuto.vx === 0) {
    colAuto.raf = 0
    return
  }
  // Scroll the board horizontally
  board.scrollLeft += colAuto.vx
  colAuto.raf = requestAnimationFrame(runColAutoScroll)
}
function updateColAutoScroll(clientX) {
  const vw = document.documentElement.clientWidth
  const edge = 48 // px from edges to start autoscroll
  const maxSpeed = 24 // px per frame at the extreme edge
  let vx = 0
  if (clientX < edge) {
    vx = -Math.ceil(((edge - clientX) / edge) * maxSpeed)
  } else if (clientX > vw - edge) {
    vx = Math.ceil(((clientX - (vw - edge)) / edge) * maxSpeed)
  }
  if (vx !== colAuto.vx) {
    colAuto.vx = vx
    if (vx !== 0 && !colAuto.raf) {
      colAuto.raf = requestAnimationFrame(runColAutoScroll)
    }
    if (vx === 0 && colAuto.raf) {
      stopColAutoScroll()
    }
  }
}
function startColumnDrag(e, colEl) {
  if (e.button !== 0) return
  e.preventDefault()
  document.body.classList.add("dragging-ui")
  const rect = colEl.getBoundingClientRect()
  if (e.pointerType !== "touch") colEl.setPointerCapture(e.pointerId)
  const ghost = colEl.cloneNode(true)
  Object.assign(ghost.style, {
    position: "fixed",
    left: rect.left + "px",
    top: rect.top + "px",
    width: rect.width + "px",
    pointerEvents: "none",
    opacity: ".95",
    transform: "scale(1.02)",
    zIndex: 9999,
  })
  ghost.classList.add("dragging")
  document.body.appendChild(ghost)
  const ph = document.createElement("section")
  ph.className = "column column-placeholder"
  ph.style.minWidth = rect.width + "px"
  ph.style.height = rect.height + "px"
  // Put placeholder exactly where the column was
  board.replaceChild(ph, colEl)
  colDrag = {
    pointerId: e.pointerId,
    ghost,
    placeholder: ph,
    srcEl: colEl,
    startX: e.clientX,
    offsetX: e.clientX - rect.left,
  }
  document.addEventListener("pointermove", onColMove)
  document.addEventListener("pointerup", endColDrag)
  document.addEventListener("pointercancel", endColDrag)
  stopColAutoScroll()
}
function onColMove(e) {
  if (!colDrag) return
  const { ghost, placeholder, offsetX } = colDrag
  const x = e.clientX - offsetX
  ghost.style.left = x + "px"
  updateColAutoScroll(e.clientX)
  const items = [...board.querySelectorAll(".column")].filter(
    (el) => el !== colDrag.srcEl && el !== placeholder
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
  if (target) board.insertBefore(placeholder, target)
  else board.appendChild(placeholder)
}
function endColDrag() {
  if (!colDrag) return
  stopColAutoScroll()
  const { ghost, placeholder, srcEl } = colDrag
  ghost.remove()
  // Return the column to the exact placeholder position
  board.replaceChild(srcEl, placeholder)
  srcEl.style.visibility = ""
  const order = [...board.querySelectorAll(".column")].map(
    (el) => el.dataset.id
  )
  state.columns.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  saveState()
  document.removeEventListener("pointermove", onColMove)
  document.removeEventListener("pointerup", endColDrag)
  document.removeEventListener("pointercancel", endColDrag)
  colDrag = null
  document.body.classList.remove("dragging-ui")
}
