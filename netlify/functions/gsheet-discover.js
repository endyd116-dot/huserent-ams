import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "qj-pms-secret-change-me";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

function verifyToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try { return jwt.verify(authHeader.substring(7), JWT_SECRET); }
  catch { return null; }
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = verifyToken(req.headers.get("authorization"));
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const { url } = await req.json();
    if (!url) return jsonResponse({ error: "URL이 필요합니다" }, 400);

    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) return jsonResponse({ error: "올바른 Google Sheet URL이 아닙니다" }, 400);
    const sheetId = idMatch[1];

    let sheets = [];
    let method = '';
    const attempts = [];

    // 방법 1: Google Sheets API (가장 정확, 권장)
        if (GEMINI_API_KEY) {
      try {
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${GEMINI_API_KEY}&fields=sheets.properties`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        attempts.push(`Sheets API: HTTP ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          sheets = (data.sheets || []).map(s => ({
            gid: String(s.properties.sheetId),
            name: s.properties.title,
            index: s.properties.index || 0,
            rowCount: s.properties.gridProperties?.rowCount || 0,
            colCount: s.properties.gridProperties?.columnCount || 0
          }));
          method = 'Google Sheets API';
        }
      } catch (e) {
        attempts.push(`Sheets API error: ${e.message}`);
      }
    }

    // 방법 2: HTMLview 파싱 fallback
    if (!sheets.length) {
      try {
        const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
        const res = await fetch(htmlUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        attempts.push(`HTMLview: HTTP ${res.status}`);
        
        if (res.ok) {
          const html = await res.text();
          const found = new Map();
          
          // 패턴 1: {"id":숫자,"name":"이름"}
          const re1 = /\{"id":(\d+),"name":"([^"]+)"\}/g;
          let m;
          while ((m = re1.exec(html)) !== null) {
            if (!found.has(m[1])) found.set(m[1], { gid: m[1], name: m[2] });
          }
          
          // 패턴 2: gid=숫자 + 텍스트 (메뉴 영역)
          if (!found.size) {
            const re2 = /gid=(\d+)[^>]*>([^<]{1,80})</g;
            while ((m = re2.exec(html)) !== null) {
              const name = m[2].trim().replace(/&[a-z]+;/g, '');
              if (name && !found.has(m[1]) && name.length < 80 && name.length > 0) {
                found.set(m[1], { gid: m[1], name });
              }
            }
          }
          
          // 패턴 3: "sheetId":숫자,"properties":{"title":"이름"
          if (!found.size) {
            const re3 = /"sheetId":(\d+),[^}]*?"title":"([^"]+)"/g;
            while ((m = re3.exec(html)) !== null) {
              if (!found.has(m[1])) found.set(m[1], { gid: m[1], name: m[2] });
            }
          }
          
          if (found.size) {
            sheets = [...found.values()].map((s, i) => ({ ...s, index: i }));
            method = 'HTML 파싱';
          }
        }
      } catch (e) {
        attempts.push(`HTML error: ${e.message}`);
      }
    }

    // 방법 3: pubhtml 파싱 (게시된 시트)
    if (!sheets.length) {
      try {
        const pubUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`;
        const res = await fetch(pubUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        attempts.push(`pubhtml: HTTP ${res.status}`);
        
        if (res.ok) {
          const html = await res.text();
          const found = new Map();
          // pubhtml의 메뉴 영역에서 추출
          const re = /id="sheet-button-(\d+)"[^>]*?>([^<]+)</g;
          let m;
          while ((m = re.exec(html)) !== null) {
            if (!found.has(m[1])) found.set(m[1], { gid: m[1], name: m[2].trim() });
          }
          if (found.size) {
            sheets = [...found.values()].map((s, i) => ({ ...s, index: i }));
            method = 'pubhtml 파싱';
          }
        }
      } catch (e) {
        attempts.push(`pubhtml error: ${e.message}`);
      }
    }

    // 방법 4: 최후의 수단
    if (!sheets.length) {
      return jsonResponse({
        success: false,
        error: '시트 탭 목록을 가져올 수 없습니다',
        hints: [
          '✅ Google Sheets API 활성화 필요 (Google Cloud 콘솔)',
          '✅ 또는 시트를 "파일 → 공유 → 웹에 게시"로 게시',
          '✅ Single 모드로 각 탭 URL을 따로 입력하여 사용 가능'
        ],
        attempts,
        sheetId
      }, 400);
    }

    // 인덱스 순으로 정렬
    sheets.sort((a, b) => (a.index || 0) - (b.index || 0));

    return jsonResponse({
      success: true,
      sheetId,
      sheets,
      count: sheets.length,
      method,
      attempts
    });
  } catch (e) {
    console.error('[gsheet-discover]', e);
    return jsonResponse({ error: e.message }, 500);
  }
};

export const config = { path: "/api/gsheet-discover" };