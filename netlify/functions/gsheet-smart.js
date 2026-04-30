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

// ===== 1단계: 플랫폼 내부 구조 정의 =====
const PLATFORM_SCHEMA = {
  properties: {
    label: '🏠 매물',
    description: '단기 임대 숙소 정보',
    fields: {
      name: { required: true, type: 'string', desc: '숙소 고유 이름 (식별자)' },
      group: { type: 'string', desc: '지역 그룹 (서울/부산/제주 등)' },
      location: { type: 'string', desc: '위치/동 정보' },
      address: { type: 'string', desc: '상세 주소' },
      price: { required: true, type: 'number', desc: '1박 판매가 (숫자)' },
      cost: { type: 'number', desc: '1박 원가 (숫자)' },
      manager: { type: 'string', desc: '담당 매니저' }
    },
    uniqueKey: 'name'
  },
  bookings: {
    label: '📅 예약',
    description: '숙박 예약 정보 (체크인/아웃)',
    fields: {
      propName: { required: true, type: 'string', desc: '숙소명 (기존 등록된 것)' },
      guest: { required: true, type: 'string', desc: '예약자 이름' },
      contact: { type: 'string', desc: '연락처' },
      checkIn: { required: true, type: 'date', desc: '체크인 (YYYY-MM-DD)' },
      checkOut: { required: true, type: 'date', desc: '체크아웃 (YYYY-MM-DD)' },
      price: { required: true, type: 'number', desc: '예약 총 가격' },
      platform: { type: 'string', desc: 'Airbnb/Booking.com/Agoda/네이버/직접예약' },
      people: { type: 'number', desc: '인원수' },
      nationality: { type: 'string', desc: '국적' }
    },
    uniqueKey: 'propName+guest+checkIn'
  },
  expenses: {
    label: '💳 지출',
    description: '운영 비용 / 초기 투자',
    fields: {
      date: { required: true, type: 'date', desc: '지출 날짜' },
      propName: { required: true, type: 'string', desc: '숙소명' },
      majorCat: { type: 'enum', values: ['초기투자지출', '고정지출', '변동지출'], desc: '대분류' },
      category: { required: true, type: 'string', desc: '소분류 (청소비/수선비 등)' },
      amount: { required: true, type: 'number', desc: '금액' },
      memo: { type: 'string', desc: '메모' }
    },
    uniqueKey: 'propName+date+category+amount'
  }
};

// CSV 파싱
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const parseLine = (line) => {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim()); current = '';
      } else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

function buildCsvUrl(url) {
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  if (!idMatch) return null;
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

// ===== 2단계: AI 분석 (타입 판별 + 컬럼 매핑) =====
async function aiAnalyze(columns, sampleRows, existingPropNames) {
  const schemaDesc = Object.entries(PLATFORM_SCHEMA).map(([k, v]) => {
    const fieldsDesc = Object.entries(v.fields).map(([fk, fv]) => 
      `    - ${fk}${fv.required?'*':''} (${fv.type}): ${fv.desc}${fv.values?` [값: ${fv.values.join('/')}]`:''}`
    ).join('\n');
    return `${k} - ${v.label}: ${v.description}\n  필드:\n${fieldsDesc}`;
  }).join('\n\n');

  const prompt = `당신은 부동산 관리 시스템(QJ-PMS)의 데이터 통합 AI입니다.

【플랫폼 데이터 구조】
${schemaDesc}

【기존 매물 목록】 (예약/지출 매칭용)
${existingPropNames.slice(0, 50).join(', ') || '(아직 매물 없음)'}

【분석 대상 시트】

컬럼 (${columns.length}개):
${columns.map((c,i) => `${i+1}. "${c}"`).join('\n')}

샘플 데이터 (처음 3행):
${JSON.stringify(sampleRows, null, 2)}

【지시사항】
1. 시트 데이터의 성격을 분석해서 properties/bookings/expenses 중 가장 적합한 타입 선택
2. 컬럼명과 샘플 데이터 내용을 모두 분석하여 시스템 필드와 매칭
3. 매칭 불가능한 필드는 null
4. 신뢰도(high/medium/low) 평가
5. 반드시 JSON으로만 답변

【응답 형식】
{
  "detectedType": "properties|bookings|expenses",
  "confidence": "high|medium|low",
  "reason": "한국어로 분석 근거 한 문장",
  "mapping": {
    "필드명1": "컬럼명",
    "필드명2": null
  }
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 오류 ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI 응답이 비어있습니다");
  return JSON.parse(text);
}

// 날짜 정규화
function normalizeDate(s) {
  if (!s) return '';
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  if (/^\d+$/.test(s) && +s > 30000 && +s < 80000) {
    const d = new Date((+s - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return s;
}

// ===== 3단계: 데이터 변환 =====
function transformRows(rows, type, mapping, propMap) {
  const transformed = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const item = {};
    Object.keys(mapping).forEach(field => {
      const col = mapping[field];
      if (col && row[col] !== undefined && row[col] !== null) {
        item[field] = String(row[col]).trim();
      }
    });

    try {
      if (type === 'properties') {
        if (!item.name || !item.price) { errors.push(`${idx+2}행: 숙소명/가격 누락`); return; }
        item.price = +String(item.price).replace(/[^0-9.]/g,'') || 0;
        item.cost = +String(item.cost||0).replace(/[^0-9.]/g,'') || 0;
        item._sourceRow = idx + 2;
      } else if (type === 'bookings') {
        if (!item.guest || !item.checkIn || !item.checkOut || !item.price) { errors.push(`${idx+2}행: 필수 항목 누락`); return; }
        const propId = propMap[item.propName];
        if (!propId) { errors.push(`${idx+2}행: 매물 "${item.propName}" 미등록`); return; }
        item.propId = propId;
        item.price = +String(item.price).replace(/[^0-9.]/g,'') || 0;
        item.people = +(item.people||2);
        item.platform = item.platform || '직접예약';
        item.nationality = item.nationality || '한국';
        item.checkIn = normalizeDate(item.checkIn);
        item.checkOut = normalizeDate(item.checkOut);
        item._sourceRow = idx + 2;
      } else if (type === 'expenses') {
        if (!item.amount || !item.category) { errors.push(`${idx+2}행: 금액/분류 누락`); return; }
        const propId = propMap[item.propName];
        if (!propId) { errors.push(`${idx+2}행: 매물 "${item.propName}" 미등록`); return; }
        item.propId = propId;
        item.amount = +String(item.amount).replace(/[^0-9.-]/g,'') || 0;
        item.date = normalizeDate(item.date);
        item.majorCat = item.majorCat || '변동지출';
        item._sourceRow = idx + 2;
      }
      transformed.push(item);
    } catch(e) {
      errors.push(`${idx+2}행: ${e.message}`);
    }
  });

  return { transformed, errors };
}

// ===== 4단계: 변경 비교 (추가/수정/삭제) =====
function compareWithExisting(transformed, existingItems, type) {
  const adds = [], updates = [], unchanged = [];
  const matchedIds = new Set();

  // 고유키 함수
  const keyOf = (item) => {
    if (type === 'properties') return item.name;
    if (type === 'bookings') {
      const propName = item.propName || (existingItems.find(x => x.id === item.propId)?.propName);
      return `${propName}|${item.guest}|${item.checkIn}`;
    }
    if (type === 'expenses') {
      return `${item.propId}|${item.date}|${item.category}|${item.amount}`;
    }
    return JSON.stringify(item);
  };

  // 기존 데이터를 키로 인덱싱
  const existingMap = {};
  (existingItems || []).forEach(item => {
    const k = keyOf(item);
    if (k) existingMap[k] = item;
  });

  transformed.forEach(newItem => {
    const k = keyOf(newItem);
    const existing = existingMap[k];

    if (!existing) {
      adds.push(newItem);
    } else {
      matchedIds.add(existing.id);
      // 변경 사항 감지
      const changes = [];
      Object.keys(newItem).forEach(field => {
        if (field.startsWith('_') || field === 'id' || field === 'propName') return;
        const oldVal = existing[field];
        const newVal = newItem[field];
        if (String(oldVal||'') !== String(newVal||'')) {
          changes.push({ field, from: oldVal, to: newVal });
        }
      });
      if (changes.length) {
        updates.push({ ...newItem, id: existing.id, _changes: changes });
      } else {
        unchanged.push(existing);
      }
    }
  });

  return { adds, updates, unchanged, matchedIds: [...matchedIds] };
}

// ===== 메인 핸들러 =====
export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = verifyToken(req.headers.get("authorization"));
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "GEMINI_API_KEY가 설정되지 않았습니다. Netlify 환경변수를 확인하세요." }, 500);
  }

  try {
    const { url, existingProps, existingBookings, existingExpenses } = await req.json();
    if (!url) return jsonResponse({ error: "URL이 필요합니다" }, 400);

    const log = [];
    const t0 = Date.now();

    // ===== 1️⃣ 플랫폼 내부 분석 =====
    log.push({ step: 1, msg: '🔍 플랫폼 데이터 구조 분석 중...', time: Date.now()-t0 });
    const propNames = (existingProps || []).map(p => p.name);
    const propMap = {};
    (existingProps || []).forEach(p => { propMap[p.name] = p.id; });
    log.push({ step: 1, msg: `✅ 발견된 매물 ${propNames.length}개, 예약 ${(existingBookings||[]).length}건, 지출 ${(existingExpenses||[]).length}건`, time: Date.now()-t0 });

    // ===== 2️⃣ Google Sheet 접근 =====
    log.push({ step: 2, msg: '🌐 Google Sheet에 접근 중...', time: Date.now()-t0 });
    const csvUrl = buildCsvUrl(url);
    if (!csvUrl) return jsonResponse({ error: "올바른 Google Sheet URL이 아닙니다" }, 400);

    const sheetRes = await fetch(csvUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QJ-PMS/3.3)', 'Accept': 'text/csv' }
    });

    if (!sheetRes.ok) {
      let msg = `시트 접근 실패 (HTTP ${sheetRes.status})`;
      if (sheetRes.status === 404) msg = '시트를 찾을 수 없습니다. URL을 확인하세요.';
      else if (sheetRes.status === 403 || sheetRes.status === 401) msg = '시트가 비공개입니다. "링크가 있는 모든 사용자: 뷰어"로 공유하세요.';
      return jsonResponse({ error: msg }, 400);
    }

    const csvText = await sheetRes.text();
    if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
      return jsonResponse({ error: '시트가 비공개입니다. "링크가 있는 모든 사용자: 뷰어"로 공유 설정 필요' }, 400);
    }

    const rows = parseCSV(csvText);
    if (!rows.length) return jsonResponse({ error: '시트에 데이터가 없습니다' }, 400);
    log.push({ step: 2, msg: `✅ 시트 데이터 로드 완료 (${rows.length}행, ${Object.keys(rows[0]).length}열)`, time: Date.now()-t0 });

    // ===== 3️⃣ AI 외부 분석 =====
    log.push({ step: 3, msg: '🤖 AI가 데이터 타입과 매핑 분석 중... (Gemini 2.0 Flash)', time: Date.now()-t0 });
    const columns = Object.keys(rows[0]);
    const sampleRows = rows.slice(0, 3);
    const aiResult = await aiAnalyze(columns, sampleRows, propNames);

    const cleanMapping = {};
    Object.keys(aiResult.mapping || {}).forEach(k => {
      const v = aiResult.mapping[k];
      if (v && v !== 'null' && columns.includes(v)) cleanMapping[k] = v;
    });
    log.push({ step: 3, msg: `✅ AI 분석 완료: ${PLATFORM_SCHEMA[aiResult.detectedType]?.label} 타입 감지 (신뢰도: ${aiResult.confidence})`, time: Date.now()-t0 });
    log.push({ step: 3, msg: `📊 ${Object.keys(cleanMapping).length}개 필드 자동 매핑됨`, time: Date.now()-t0 });

    // ===== 4️⃣ 데이터 변환 =====
    log.push({ step: 4, msg: '🔄 데이터 변환 중...', time: Date.now()-t0 });
    const { transformed, errors } = transformRows(rows, aiResult.detectedType, cleanMapping, propMap);
    log.push({ step: 4, msg: `✅ 변환 완료: ${transformed.length}건 정상, ${errors.length}건 오류`, time: Date.now()-t0 });

    // ===== 5️⃣ 변경 비교 =====
    log.push({ step: 5, msg: '🔍 기존 데이터와 비교 중...', time: Date.now()-t0 });
    const existingItems = aiResult.detectedType === 'properties' ? existingProps :
                          aiResult.detectedType === 'bookings' ? existingBookings :
                          existingExpenses;
    
    // bookings의 경우 propName 필드 추가 (비교용)
    const enhancedExisting = (existingItems || []).map(item => {
      if (aiResult.detectedType === 'bookings' && item.propId) {
        const prop = (existingProps||[]).find(p => p.id === item.propId);
        return { ...item, propName: prop?.name };
      }
      return item;
    });

    const { adds, updates, unchanged } = compareWithExisting(transformed, enhancedExisting, aiResult.detectedType);
    log.push({ step: 5, msg: `✅ 비교 완료: 추가 ${adds.length}건 / 수정 ${updates.length}건 / 동일 ${unchanged.length}건`, time: Date.now()-t0 });

    // ===== 응답 =====
    return jsonResponse({
      success: true,
      type: aiResult.detectedType,
      typeLabel: PLATFORM_SCHEMA[aiResult.detectedType]?.label,
      confidence: aiResult.confidence,
      reason: aiResult.reason,
      mapping: cleanMapping,
      columns,
      stats: {
        totalRows: rows.length,
        validRows: transformed.length,
        errorRows: errors.length,
        addCount: adds.length,
        updateCount: updates.length,
        unchangedCount: unchanged.length
      },
      adds,
      updates,
      errors: errors.slice(0, 20),
      log,
      duration: Date.now() - t0,
      provider: 'Gemini 2.0 Flash'
    });
  } catch (e) {
    console.error("[gsheet-smart]", e);
    return jsonResponse({ error: e.message, stack: e.stack?.slice(0, 500) }, 500);
  }
};

export const config = { path: "/api/gsheet-smart" };