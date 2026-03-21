export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+/g, "/"); // Normalize slashes
    const method = request.method;

    const origin = request.headers.get("Origin") || "*";
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Board-ID, X-API-Key",
      "Access-Control-Allow-Credentials": "true",
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
        
        const userInfo = {
          email: request.headers.get("Cf-Access-Authenticated-User-Email"),
          name: request.headers.get("Cf-Access-Authenticated-User-Name") || request.headers.get("Cf-Access-Authenticated-User-Email")?.split("@")[0]
        };

        return new Response(JSON.stringify({
          state: result ? JSON.parse(result.data) : null,
          user: userInfo.email ? userInfo : null
        }), { 
          headers: { ...headers, "Content-Type": "application/json" } 
        });
      }

      if (path === "/save" && method === "POST") {
        const body = await request.json();
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
