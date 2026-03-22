function decodeUserHeader(request) {
  const sentUserEncoded = request.headers.get("X-Admin-User-Encoded");
  let sentUser = request.headers.get("X-Admin-User");
  if (sentUserEncoded) {
    try {
      sentUser = decodeURIComponent(sentUserEncoded);
    } catch {
      sentUser = sentUserEncoded;
    }
  }
  return (sentUser || "").trim();
}

function normalizeColumnShells(columns = []) {
  return JSON.stringify(columns.map((col) => ({
    id: col.id || "",
    title: col.title || "",
    isDone: !!col.isDone,
    isArchive: !!col.isArchive,
  })));
}

function flattenCards(state = {}) {
  const byId = new Map();
  for (const col of state.columns || []) {
    (col.cards || []).forEach((card, index) => {
      byId.set(card.id, { card, colId: col.id, index });
    });
  }
  return byId;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function comparableCardContent(card = {}) {
  return {
    title: card.title || "",
    description: card.description || "",
    tags: card.tags || [],
    due: card.due || "",
    assignedUser: card.assignedUser || null,
    attachments: card.attachments || [],
    createdBy: card.createdBy || "",
    createdAt: card.createdAt || "",
    contentChangedAt: card.contentChangedAt || "",
  };
}

function normalizeComments(comments = []) {
  if (!Array.isArray(comments)) return [];
  return comments.map((comment) => ({
    id: comment.id || "",
    text: comment.text || "",
    author: comment.author || "",
    createdAt: comment.createdAt || "",
    updatedAt: comment.updatedAt || comment.createdAt || "",
  }));
}

function commentsChangeAllowed(oldComments = [], newComments = [], currentUser = "") {
  const oldList = normalizeComments(oldComments);
  const newList = normalizeComments(newComments);
  const oldById = new Map(oldList.map((comment) => [comment.id, comment]));
  const newById = new Map(newList.map((comment) => [comment.id, comment]));

  for (const oldComment of oldList) {
    const next = newById.get(oldComment.id);
    if (!next) {
      if ((oldComment.author || "").trim() !== currentUser) return false;
      continue;
    }
    if ((next.author || "").trim() !== (oldComment.author || "").trim()) return false;
    if ((next.createdAt || "") !== (oldComment.createdAt || "")) return false;
    if (stableStringify(oldComment) !== stableStringify(next) && (oldComment.author || "").trim() !== currentUser) {
      return false;
    }
  }

  for (const newComment of newList) {
    if (oldById.has(newComment.id)) continue;
    if ((newComment.author || "").trim() !== currentUser) return false;
  }

  const preservedOldIds = oldList.filter((comment) => newById.has(comment.id)).map((comment) => comment.id);
  const preservedNewIds = newList.filter((comment) => oldById.has(comment.id)).map((comment) => comment.id);
  if (stableStringify(preservedOldIds) !== stableStringify(preservedNewIds)) return false;

  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+/g, "/"); // Normalize slashes
    const method = request.method;

    // Basic CORS
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Board-ID, X-API-Key, X-Admin-User, X-Admin-User-Encoded",
      "Access-Control-Expose-Headers": "X-Admin-User, X-Admin-User-Encoded",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const boardId = request.headers.get("X-Board-ID") || url.searchParams.get("boardId") || "default";
    const apiKey = request.headers.get("X-API-Key") || url.searchParams.get("apiKey");

    // Protection: If API_KEY is set in wrangler secrets, require it
    if (env.API_KEY && apiKey !== env.API_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }

    try {
      if (path === "/load" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT data FROM boards WHERE id = ?"
        ).bind(boardId).first();
        
        const responseHeaders = { ...headers, "Content-Type": "application/json" };
        if (env.ADMIN_USER) {
          responseHeaders["X-Admin-User-Encoded"] = encodeURIComponent(env.ADMIN_USER);
        }

        return new Response(JSON.stringify(result ? JSON.parse(result.data) : null), { 
          headers: responseHeaders 
        });
      }

      if (path === "/save" && method === "POST") {
        const body = await request.json();
        
        // Basic Security Check: only admin can modify the `users` array
        if (env.ADMIN_USER) {
          const sentAdminUser = decodeUserHeader(request);
          const existingRow = await env.DB.prepare(
            "SELECT data FROM boards WHERE id = ?"
          ).bind(boardId).first();
          
          if (existingRow && existingRow.data) {
            const existingData = JSON.parse(existingRow.data);
            const oldUsersList = existingData.users || [];
            const newUsersList = body.users || [];
            const oldUsers = JSON.stringify(oldUsersList);
            const newUsers = JSON.stringify(newUsersList);
            
            if (oldUsers !== newUsers && sentAdminUser !== env.ADMIN_USER) {
              const addedUsers = newUsersList.filter(
                newUser => !oldUsersList.some(
                  oldUser => oldUser.name === newUser.name && oldUser.pinCode === newUser.pinCode
                )
              );
              const removedUsers = oldUsersList.filter(
                oldUser => !newUsersList.some(
                  newUser => newUser.name === oldUser.name && newUser.pinCode === oldUser.pinCode
                )
              );
              const isSelfRegistration =
                sentAdminUser &&
                addedUsers.length === 1 &&
                removedUsers.length === 0 &&
                addedUsers[0].name === sentAdminUser;

              if (!isSelfRegistration) {
                return new Response(JSON.stringify({ error: "Only admin can modify users list." }), { 
                  status: 403, 
                  headers: { ...headers, "Content-Type": "application/json" } 
                });
              }
            }

            if (sentAdminUser !== env.ADMIN_USER) {
              if (normalizeColumnShells(existingData.columns) !== normalizeColumnShells(body.columns)) {
                return new Response(JSON.stringify({ error: "Only admin can modify board structure." }), {
                  status: 403,
                  headers: { ...headers, "Content-Type": "application/json" }
                });
              }

              const oldCards = flattenCards(existingData);
              const newCards = flattenCards(body);

              for (const [cardId, oldEntry] of oldCards.entries()) {
                const newEntry = newCards.get(cardId);
                const oldOwner = (oldEntry.card.createdBy || "").trim();
                const oldAssignee = (oldEntry.card.assignedUser?.name || "").trim();

                if (!newEntry) {
                  if (oldOwner !== sentAdminUser) {
                    return new Response(JSON.stringify({ error: "You can edit or delete only your own cards." }), {
                      status: 403,
                      headers: { ...headers, "Content-Type": "application/json" }
                    });
                  }
                  continue;
                }

                const commentsChanged =
                  stableStringify(normalizeComments(oldEntry.card.comments)) !==
                  stableStringify(normalizeComments(newEntry.card.comments));

                if (commentsChanged && !commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, sentAdminUser)) {
                  return new Response(JSON.stringify({ error: "You can edit or delete only your own comments." }), {
                    status: 403,
                    headers: { ...headers, "Content-Type": "application/json" }
                  });
                }

                const cardChanged =
                  JSON.stringify(oldEntry.card) !== JSON.stringify(newEntry.card) ||
                  oldEntry.colId !== newEntry.colId ||
                  oldEntry.index !== newEntry.index;

                if (cardChanged && oldOwner !== sentAdminUser) {
                  const contentChanged =
                    stableStringify(comparableCardContent(oldEntry.card)) !==
                    stableStringify(comparableCardContent(newEntry.card));
                  const columnChanged = oldEntry.colId !== newEntry.colId;
                  const indexChanged = oldEntry.index !== newEntry.index;
                  const passiveReindexOnly =
                    !contentChanged &&
                    !commentsChanged &&
                    !columnChanged &&
                    indexChanged;
                  const moveOnly =
                    !contentChanged &&
                    !commentsChanged &&
                    columnChanged &&
                    oldAssignee === sentAdminUser;
                  const commentsOnly =
                    !contentChanged &&
                    !columnChanged &&
                    !indexChanged &&
                    commentsChanged &&
                    commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, sentAdminUser);
                  const moveWithAllowedComments =
                    !contentChanged &&
                    columnChanged &&
                    commentsChanged &&
                    oldAssignee === sentAdminUser &&
                    commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, sentAdminUser);

                  if (!moveOnly && !passiveReindexOnly && !commentsOnly && !moveWithAllowedComments) {
                    return new Response(JSON.stringify({ error: "You can edit or delete only your own cards." }), {
                      status: 403,
                      headers: { ...headers, "Content-Type": "application/json" }
                    });
                  }
                }

                if ((newEntry.card.createdBy || "").trim() !== oldOwner) {
                  return new Response(JSON.stringify({ error: "Card author cannot be changed." }), {
                    status: 403,
                    headers: { ...headers, "Content-Type": "application/json" }
                  });
                }
              }

              for (const [cardId, newEntry] of newCards.entries()) {
                if (oldCards.has(cardId)) continue;
                if ((newEntry.card.createdBy || "").trim() !== sentAdminUser) {
                  return new Response(JSON.stringify({ error: "New cards must belong to the current user." }), {
                    status: 403,
                    headers: { ...headers, "Content-Type": "application/json" }
                  });
                }
                const newComments = normalizeComments(newEntry.card.comments);
                if (newComments.some((comment) => (comment.author || "").trim() !== sentAdminUser)) {
                  return new Response(JSON.stringify({ error: "You can add only your own comments." }), {
                    status: 403,
                    headers: { ...headers, "Content-Type": "application/json" }
                  });
                }
              }
            }
          }
        }
        
        const data = JSON.stringify(body);
        
        await env.DB.prepare(
          "INSERT OR REPLACE INTO boards (id, data, updated_at) VALUES (?, ?, ?)"
        ).bind(boardId, data, new Date().toISOString()).run();
        
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...headers, "Content-Type": "application/json" } 
        });
      }

      if (path === "/upload" && method === "POST") {
        if (!env.BUCKET) return new Response("R2 Bucket not configured", { status: 500, headers });
        
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          return new Response("Only images are allowed", { status: 400, headers });
        }

        const contentLength = parseInt(request.headers.get("content-length") || "0");
        if (contentLength > 1 * 1024 * 1024) { // 1MB limit
          return new Response("Image too large (max 1MB)", { status: 413, headers });
        }

        const extension = contentType.split("/")[1] || "png";
        const filename = `${boardId}/${crypto.randomUUID()}.${extension}`;
        const blob = await request.blob();
        
        await env.BUCKET.put(filename, blob, {
          httpMetadata: { contentType },
        });

        // We return the relative path. The frontend will prepend the worker URL if needed,
        // or we can return a full URL if R2 is public.
        // For simplicity, let's return the URL that can be used to GET the file from this worker.
        const fileUrl = `${url.origin}/image?key=${encodeURIComponent(filename)}&boardId=${encodeURIComponent(boardId)}${env.API_KEY ? `&apiKey=${encodeURIComponent(apiKey)}` : ""}`;
        
        return new Response(JSON.stringify({ url: fileUrl, key: filename }), { 
          headers: { ...headers, "Content-Type": "application/json" } 
        });
      }

      if (path === "/image" && method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400, headers });
        
        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404, headers });

        const imageHeaders = new Headers(headers);
        object.writeHttpMetadata(imageHeaders);
        imageHeaders.set("etag", object.httpEtag);
        imageHeaders.set("Cache-Control", "public, max-age=31536000");

        return new Response(object.body, { headers: imageHeaders });
      }

      if (path === "/delete-image" && method === "DELETE") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400, headers });
        
        // Ensure the key belongs to this board (basic security)
        if (!key.startsWith(`${boardId}/`)) {
          return new Response("Unauthorized", { status: 401, headers });
        }

        await env.BUCKET.delete(key);
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...headers, "Content-Type": "application/json" } 
        });
      }

      return new Response("Not Found", { status: 404, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: { ...headers, "Content-Type": "application/json" } 
      });
    }
  },
};
