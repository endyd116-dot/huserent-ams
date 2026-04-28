import { getStore } from "@netlify/blobs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "qj-pms-secret-change-me";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { id, pw } = await req.json();
    const store = getStore({ name: "qj-pms-data", consistency: "strong" });
    const users = await store.get("users", { type: "json" }) || [];
    const user = users.find(u => u.id === id);

    if (!user || user.pw !== pw) {
      return jsonResponse({ error: "ID 또는 비밀번호가 올바르지 않습니다" }, 401);
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const { pw: _, ...safeUser } = user;
    return jsonResponse({ token, user: safeUser });
  } catch (e) {
    console.error("[auth]", e);
    return jsonResponse({ error: e.message }, 500);
  }
};

export const config = { path: "/api/auth" };