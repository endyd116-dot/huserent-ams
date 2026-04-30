const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "qj-pms-secret-change-me";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function response(statusCode, data) {
  return {
    statusCode,
    headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }),
    body: JSON.stringify(data)
  };
}
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(authHeader.substring(7), JWT_SECRET);
  } catch (e) {
    return null;
  }
}
async function discoverViaSheetsAPI(sheetId, attempts) {
  if (!GEMINI_API_KEY) return [];

  try {
    const apiUrl = "https://sheets.googleapis.com/v4/spreadsheets/"
      + sheetId
      + "?key=" + GEMINI_API_KEY
      + "&fields=sheets.properties";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    attempts.push("Sheets API: HTTP " + res.status);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.sheets || []).map((s) => ({
      gid: String(s.properties.sheetId),
      name: s.properties.title,
      index: s.properties.index || 0,
      rowCount: (s.properties.gridProperties && s.properties.gridProperties.rowCount) || 0,
      colCount: (s.properties.gridProperties && s.properties.gridProperties.columnCount) || 0
    }));
  } catch (e) {
    attempts.push("Sheets API error: " + e.message);
    return [];
  }
}
async function discoverViaHTML(sheetId, attempts) {
  try {
    const htmlUrl = "https://docs.google.com/spreadsheets/d/" + sheetId + "/htmlview";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    attempts.push("HTMLview: HTTP " + res.status);

    if (!res.ok) return [];

    const html = await res.text();
    const found = new Map();

    // 패턴 1: {"id":숫자,"name":"이름"}
    const re1 = /\{"id":(\d+),"name":"([^"]+)"\}/g;
    let m;
    while ((m = re1.exec(html)) !== null) {
      if (!found.has(m[1])) found.set(m[1], { gid: m[1], name: m[2] });
    }

    // 패턴 2: gid=숫자>이름<
    if (found.size === 0) {
      const re2 = /gid=(\d+)[^>]*>([^<]{1,80})</g;
      while ((m = re2.exec(html)) !== null) {
        const name = m[2].trim().replace(/&[a-z]+;/g, "");
        if (name && !found.has(m[1]) && name.length < 80 && name.length > 0) {
          found.set(m[1], { gid: m[1], name: name });
        }
      }
    }

    // 패턴 3: "sheetId":숫자,...,"title":"이름"
    if (found.size === 0) {
      const re3 = /"sheetId":(\d+),[^}]*?"title":"([^"]+)"/g;
      while ((m = re3.exec(html)) !== null) {
        if (!found.has(m[1])) found.set(m[1], { gid: m[1], name: m[2] });
      }
    }

    if (found.size === 0) return [];

    const arr = Array.from(found.values());
    return arr.map((s, i) => ({ gid: s.gid, name: s.name, index: i }));
  } catch (e) {
    attempts.push("HTML error: " + e.message);
    return [];
  }
}
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);
  if (!user) return response(401, { error: "Unauthorized" });

  try {
    const body = JSON.parse(event.body || "{}");
    const url = body.url;
    if (!url) return response(400, { error: "URL이 필요합니다" });

    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) {
      return response(400, { error: "올바른 Google Sheet URL이 아닙니다" });
    }
    const sheetId = idMatch[1];

    const attempts = [];
    let sheets = [];
    let method = "";

    // 방법 1: Google Sheets API
    sheets = await discoverViaSheetsAPI(sheetId, attempts);
    if (sheets.length > 0) method = "Google Sheets API";

    // 방법 2: HTMLview Fallback
    if (sheets.length === 0) {
      sheets = await discoverViaHTML(sheetId, attempts);
      if (sheets.length > 0) method = "HTML 파싱";
    }

    if (sheets.length === 0) {
      return response(400, {
        success: false,
        error: "시트 탭 목록을 가져올 수 없습니다",
        hints: [
          "Google Sheets API가 활성화되어 있는지 확인하세요",
          "또는 시트를 \"파일 → 공유 → 웹에 게시\"로 게시하세요",
          "각 탭 URL을 따로 입력하여 \"현재 탭 동기화\" 사용 가능"
        ],
        attempts: attempts,
        sheetId: sheetId
      });
    }

    sheets.sort((a, b) => (a.index || 0) - (b.index || 0));

    return response(200, {
      success: true,
      sheetId: sheetId,
      sheets: sheets,
      count: sheets.length,
      method: method,
      attempts: attempts
    });
  } catch (e) {
    console.error("[gsheet-discover]", e);
    return response(500, { error: e.message || "Unknown error" });
  }
};