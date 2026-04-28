import { getStore } from "@netlify/blobs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "qj-pms-secret-change-me";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};

function verifyToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try { return jwt.verify(authHeader.substring(7), JWT_SECRET); }
  catch { return null; }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  const collection = url.searchParams.get("collection");
  const id = url.searchParams.get("id");
  const isBulk = url.searchParams.get("bulk") === "1";

  const auth = req.headers.get("authorization");
  const user = verifyToken(auth);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!collection) return jsonResponse({ error: "collection required" }, 400);

  const store = getStore({ name: "qj-pms-data", consistency: "strong" });

  try {
    if (req.method === "GET") {
      const data = await store.get(collection, { type: "json" });
      if (id && Array.isArray(data)) {
        return jsonResponse(data.find(x => String(x.id) === String(id)) || null);
      }
      return jsonResponse(data || []);
    }

    if (req.method === "POST") {
      const body = await req.json();
      let data = await store.get(collection, { type: "json" }) || [];
      if (!Array.isArray(data)) data = [];
      const newItem = { ...body, id: body.id || Date.now() };
      data.push(newItem);
      await store.setJSON(collection, data);
      return jsonResponse(newItem, 201);
    }

    if (req.method === "PUT") {
      const body = await req.json();
      if (isBulk && body.data !== undefined) {
        await store.setJSON(collection, body.data);
        return jsonResponse({ success: true });
      }
      const data = await store.get(collection, { type: "json" }) || [];
      if (!Array.isArray(data)) return jsonResponse({ error: "Not array" }, 400);
      const idx = data.findIndex(x => String(x.id) === String(id || body.id));
      if (idx === -1) return jsonResponse({ error: "Not found" }, 404);
      data[idx] = { ...data[idx], ...body };
      await store.setJSON(collection, data);
      return jsonResponse(data[idx]);
    }

    if (req.method === "DELETE") {
      const data = await store.get(collection, { type: "json" }) || [];
      if (!Array.isArray(data)) return jsonResponse({ error: "Not array" }, 400);
      const filtered = data.filter(x => String(x.id) !== String(id));
      await store.setJSON(collection, filtered);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[data]", e);
    return jsonResponse({ error: e.message }, 500);
  }
};

export const config = { path: "/api/data" };