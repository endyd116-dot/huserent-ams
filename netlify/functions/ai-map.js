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

  // 인증 체크
  const user = verifyToken(req.headers.get("authorization"));
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  // API 키 체크
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "GEMINI_API_KEY가 설정되지 않았습니다. Netlify 환경변수를 확인하세요." }, 500);
  }

  try {
    const { type, columns, sampleRows } = await req.json();
    
    if (!columns || !columns.length) {
      return jsonResponse({ error: "컬럼 정보가 필요합니다" }, 400);
    }

    // 타입별 필요 필드 정의
    const fieldDefs = {
      properties: {
        name: '숙소명 (필수)',
        group: '그룹/지역 분류',
        location: '위치/동',
        address: '상세 주소',
        price: '1박 가격 (필수, 숫자)',
        cost: '원가 (숫자)',
        manager: '담당 매니저 이름'
      },
      bookings: {
        propName: '숙소명 (필수)',
        guest: '예약자 이름 (필수)',
        contact: '연락처/전화번호',
        checkIn: '체크인 날짜 (필수)',
        checkOut: '체크아웃 날짜 (필수)',
        price: '예약 가격 (필수, 숫자)',
        platform: '예약 플랫폼 (Airbnb/Booking 등)',
        people: '인원수 (숫자)',
        nationality: '국적'
      },
      expenses: {
        date: '지출 날짜 (필수)',
        propName: '숙소명 (필수)',
        majorCat: '대분류 (초기투자/고정/변동)',
        category: '소분류 (필수)',
        amount: '금액 (필수, 숫자)',
        memo: '메모/비고'
      }
    };

    const fields = fieldDefs[type];
    if (!fields) return jsonResponse({ error: "잘못된 type" }, 400);

    // Gemini에 보낼 프롬프트
    const prompt = `당신은 데이터 매핑 전문가입니다. Google Sheet의 컬럼을 시스템 필드와 정확하게 매칭해주세요.

【시스템 필드】 (${type})
${Object.entries(fields).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

【Sheet 컬럼】
${columns.map((c,i) => `${i+1}. "${c}"`).join('\n')}

【샘플 데이터 (처음 3행)】
${JSON.stringify(sampleRows, null, 2)}

【지시사항】
1. 각 시스템 필드에 가장 적합한 Sheet 컬럼을 매칭하세요
2. 컬럼 이름과 샘플 데이터 내용을 모두 분석하세요
3. 매칭이 애매하면 null 반환
4. 반드시 JSON 형식으로만 답변하세요 (설명 금지)
5. 공유된 구글시트들을 전부 분석하세요

【응답 형식】
{
  "${Object.keys(fields)[0]}": "매칭된 컬럼명 또는 null",
  ...
}`;

    // Gemini API 호출
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return jsonResponse({ error: `Gemini API 오류: ${geminiRes.status}` }, 500);
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      return jsonResponse({ error: "Gemini 응답 파싱 실패" }, 500);
    }

    let mapping;
    try {
      mapping = JSON.parse(responseText);
    } catch(e) {
      return jsonResponse({ error: "JSON 파싱 실패", raw: responseText }, 500);
    }

    // null 값 제거
    Object.keys(mapping).forEach(k => {
      if (mapping[k] === null || mapping[k] === 'null') delete mapping[k];
    });

    return jsonResponse({ 
      success: true, 
      mapping,
      provider: 'Gemini 2.0 Flash'
    });
  } catch (e) {
    console.error("[ai-map]", e);
    return jsonResponse({ error: e.message }, 500);
  }
};

export const config = { path: "/api/ai-map" };