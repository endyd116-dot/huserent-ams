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

const PLATFORM_SCHEMA = {
  properties: {
    label: '🏠 매물',
    description: '단기 임대 숙소 정보',
    fields: {
      name: { required: true, type: 'string', desc: '숙소 고유 이름' },
      group: { type: 'string', desc: '지역 그룹' },
      location: { type: 'string', desc: '위치/동' },
      address: { type: 'string', desc: '상세 주소' },
      price: { required: true, type: 'number', desc: '1박 판매가' },
      cost: { type: 'number', desc: '1박 원가' },
      manager: { type: 'string', desc: '담당자' }
    }
  },
  bookings: {
    label: '📅 예약',
    description: '숙박 예약 정보',
    fields: {
      propName: { required: true, type: 'string', desc: '숙소명' },
      guest: { required: true, type: 'string', desc: '예약자' },
      contact: { type: 'string', desc: '연락처' },
      checkIn: { required: true, type: 'date', desc: '체크인 YYYY-MM-DD' },
      checkOut: { required: true, type: 'date', desc: '체크아웃 YYYY-MM-DD' },
      price: { required: true, type: 'number', desc: '가격' },
      platform: { type: 'string', desc: 'Airbnb/Booking.com/Agoda/네이버/직접예약' },
      people: { type: 'number', desc: '인원' },
      nationality: { type: 'string', desc: '국적' }
    }
  },
  expenses: {
    label: '💳 지출',
    description: '운영 비용',
    fields: {
      date: { required: true, type: 'date', desc: '지출 날짜' },
      propName: { required: true, type: 'string', desc: '숙소명' },
      majorCat: { type: 'enum', values: ['초기투자지출','고정지출','변동지출'], desc: '대분류' },
      category: { required: true, type: 'string', desc: '소분류' },
      amount: { required: true, type: 'number', desc: '금액' },
      memo: { type: 'string', desc: '메모' }
    }
  }
};

// 다중 endpoint URL 빌더
function buildCsvUrls(url) {
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  if (!idMatch) return null;
  const id = idMatch[1];
  const gid = gidMatch ? gidMatch[1] : '0';
  return [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/pub?gid=${gid}&single=true&output=csv`
  ];
}

// 스마트 CSV 파싱 (헤더 자동 감지)
function parseCSV(text) {
  const allLines = text.split(/\r?\n/);
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

  const allParsed = allLines.map(parseLine);

  let headerIdx = 0;
  let maxNonEmpty = 0;
  for (let i = 0; i < Math.min(15, allParsed.length); i++) {
    const nonEmpty = allParsed[i].filter(c => c && c.trim()).length;
    if (nonEmpty > maxNonEmpty) {
      maxNonEmpty = nonEmpty;
      headerIdx = i;
    }
  }

  if (maxNonEmpty < 2) return { rows: [], headers: [], headerIdx: -1 };

  const rawHeaders = allParsed[headerIdx];
  const headers = rawHeaders.map((h, i) => {
    const cleaned = (h || '').trim();
    return cleaned || `컬럼${i+1}`;
  });

  const rows = allParsed.slice(headerIdx + 1)
    .filter(values => values.some(v => v && v.trim()))
    .map(values => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = values[i] || '');
      return obj;
    });

  return { rows, headers, headerIdx };
}

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

【기존 매물 목록】
${existingPropNames.slice(0, 50).join(', ') || '(아직 매물 없음)'}

【분석 대상 시트】
컬럼 (${columns.length}개):
${columns.map((c,i) => `${i+1}. "${c}"`).join('\n')}

샘플 데이터 (처음 3행):
${JSON.stringify(sampleRows, null, 2)}

【지시사항】
1. 시트 데이터 성격을 분석해 properties/bookings/expenses 중 가장 적합한 타입 선택
2. 컬럼명과 샘플 데이터 모두 분석하여 시스템 필드와 매칭
3. 매칭 불가능한 필드는 null
4. 신뢰도(high/medium/low) 평가
5. 반드시 JSON으로만 답변

【응답 형식】
{
  "detectedType": "properties|bookings|expenses",
  "confidence": "high|medium|low",
  "reason": "한국어 분석 근거 한 문장",
  "mapping": {
    "필드명": "컬럼명 또는 null"
  }
}`;

  const models = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro'
  ];

  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature: 0.1, 
              responseMimeType: "application/json",
              maxOutputTokens: 2048
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error("AI 응답이 비어있습니다");
          console.log(`✅ AI 분석 성공: ${model}`);
          return JSON.parse(text);
        }

        const errText = await res.text();
        lastError = `${model} (${res.status}): ${errText.slice(0, 200)}`;

        if (res.status === 429 || res.status === 503) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }
          break;
        }
        break;
      } catch (e) {
        lastError = `${model}: ${e.message}`;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
  }

  throw new Error(`모든 AI 모델 한도 초과 또는 오류.\n${lastError}\n\n💡 5-10분 후 재시도하거나 https://aistudio.google.com 에서 quota 확인하세요.`);
}

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
        if (!item.name) { errors.push(`${idx+2}행: 숙소명 누락 (스킵)`); return; }
        if (!item.price) item.price = 0;
        item.price = +String(item.price).replace(/[^0-9.]/g,'') || 0;
        item.cost = +String(item.cost||0).replace(/[^0-9.]/g,'') || 0;
        item._sourceRow = idx + 2;
      } else if (type === 'bookings') {
        if (!item.guest || !item.checkIn || !item.checkOut) { errors.push(`${idx+2}행: 필수 항목(예약자/체크인/체크아웃) 누락`); return; }
        const propId = propMap[item.propName];
        if (!propId) { errors.push(`${idx+2}행: 매물 "${item.propName}" 미등록`); return; }
        item.propId = propId;
        item.price = +String(item.price||0).replace(/[^0-9.]/g,'') || 0;
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

function compareWithExisting(transformed, existingItems, type) {
  const adds = [], updates = [], unchanged = [];
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

  return { adds, updates, unchanged };
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = verifyToken(req.headers.get("authorization"));
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: "GEMINI_API_KEY가 Netlify 환경변수에 설정되지 않았습니다" }, 500);
  }

  try {
    const { url, existingProps, existingBookings, existingExpenses } = await req.json();
    if (!url) return jsonResponse({ error: "URL이 필요합니다" }, 400);

    const log = [];
    const t0 = Date.now();

    log.push({ step: 1, msg: '🔍 플랫폼 데이터 구조 분석 중...', time: Date.now()-t0 });
    const propNames = (existingProps || []).map(p => p.name);
    const propMap = {};
    (existingProps || []).forEach(p => { propMap[p.name] = p.id; });
    log.push({ step: 1, msg: `✅ 매물 ${propNames.length}개, 예약 ${(existingBookings||[]).length}건, 지출 ${(existingExpenses||[]).length}건 발견`, time: Date.now()-t0 });

    // 다중 endpoint 시도
    const csvUrls = buildCsvUrls(url);
    if (!csvUrls) return jsonResponse({ error: "올바른 Google Sheet URL이 아닙니다" }, 400);

    log.push({ step: 2, msg: '🌐 Google Sheet에 접근 중 (다중 endpoint 시도)...', time: Date.now()-t0 });

    let csvText = null;
    let lastStatus = null;
    let usedEndpoint = null;
    
    for (const csvUrl of csvUrls) {
      try {
        const sheetRes = await fetch(csvUrl, {
          redirect: 'follow',
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/csv,text/plain,*/*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
          }
        });
        lastStatus = sheetRes.status;
        
        if (sheetRes.ok) {
          const text = await sheetRes.text();
          if (!text.includes('<!DOCTYPE html>') && !text.includes('<html') && !text.trim().startsWith('<')) {
            csvText = text;
            usedEndpoint = csvUrl.includes('/export?') ? 'export' : csvUrl.includes('/gviz/') ? 'gviz' : 'pub';
            log.push({ step: 2, msg: `✅ ${usedEndpoint} endpoint 성공`, time: Date.now()-t0 });
            break;
          }
        }
      } catch (e) {
        console.error(`Endpoint failed:`, e.message);
      }
    }

    if (!csvText) {
      return jsonResponse({ 
        error: '🔒 시트 접근 실패 (모든 endpoint 시도 실패)',
        details: `최종 HTTP 상태: ${lastStatus}`,
        solutions: [
          '시크릿 모드에서 아래 URL 직접 접속 테스트:',
          csvUrls[0],
          'CSV가 다운로드되면 → 일시적 문제, 잠시 후 재시도',
          'CSV가 안 되면 → 파일 → 공유 → 웹에 게시 → CSV 형식 게시'
        ],
        urlsTried: csvUrls
      }, 400);
    }

    const parsed = parseCSV(csvText);
    if (!parsed.rows.length) {
      return jsonResponse({ 
        error: '시트에서 유효한 데이터를 찾을 수 없습니다',
        debug: {
          totalLines: csvText.split('\n').length,
          first200chars: csvText.slice(0, 200)
        }
      }, 400);
    }

    const rows = parsed.rows;
    log.push({ step: 2, msg: `✅ 데이터 로드 완료 (헤더: ${parsed.headerIdx+1}행, 데이터: ${rows.length}행, 컬럼: ${parsed.headers.length}개)`, time: Date.now()-t0 });

    log.push({ step: 3, msg: '🤖 AI가 데이터 타입과 매핑 분석 중...', time: Date.now()-t0 });
    const columns = Object.keys(rows[0]);
    const sampleRows = rows.slice(0, 3);
    const aiResult = await aiAnalyze(columns, sampleRows, propNames);

    const cleanMapping = {};
    Object.keys(aiResult.mapping || {}).forEach(k => {
      const v = aiResult.mapping[k];
      if (v && v !== 'null' && columns.includes(v)) cleanMapping[k] = v;
    });
    log.push({ step: 3, msg: `✅ AI 분석 완료: ${PLATFORM_SCHEMA[aiResult.detectedType]?.label} (신뢰도: ${aiResult.confidence})`, time: Date.now()-t0 });
    log.push({ step: 3, msg: `📊 ${Object.keys(cleanMapping).length}개 필드 자동 매핑`, time: Date.now()-t0 });

    log.push({ step: 4, msg: '🔄 데이터 변환 중...', time: Date.now()-t0 });
    const { transformed, errors } = transformRows(rows, aiResult.detectedType, cleanMapping, propMap);
    log.push({ step: 4, msg: `✅ 변환 완료: ${transformed.length}건 정상, ${errors.length}건 오류`, time: Date.now()-t0 });

    log.push({ step: 5, msg: '🔍 기존 데이터와 비교 중...', time: Date.now()-t0 });
    const existingItems = aiResult.detectedType === 'properties' ? existingProps :
                          aiResult.detectedType === 'bookings' ? existingBookings :
                          existingExpenses;
    
    const enhancedExisting = (existingItems || []).map(item => {
      if (aiResult.detectedType === 'bookings' && item.propId) {
        const prop = (existingProps||[]).find(p => p.id === item.propId);
        return { ...item, propName: prop?.name };
      }
      return item;
    });

    const { adds, updates, unchanged } = compareWithExisting(transformed, enhancedExisting, aiResult.detectedType);
    log.push({ step: 5, msg: `✅ 비교 완료: 추가 ${adds.length}건 / 수정 ${updates.length}건 / 동일 ${unchanged.length}건`, time: Date.now()-t0 });

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
      errors: errors.slice(0, 30),
      log,
      duration: Date.now() - t0,
      provider: 'Gemini 2.5 Flash'
    });
  } catch (e) {
    console.error("[gsheet-smart]", e);
    return jsonResponse({ error: e.message, stack: e.stack?.slice(0, 500) }, 500);
  }
};

export const config = { path: "/api/gsheet-smart" };