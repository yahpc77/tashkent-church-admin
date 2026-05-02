// 타슈켄트 한인교회 교적 카드 OCR 백엔드 v3
// Firebase Functions v2 (onCall) + @google/generative-ai
//
// [API 키 최초 등록 - 반드시 1회 실행]
//   firebase functions:secrets:set GOOGLE_API_KEY
//
// 모델 우선순위:
//   1순위: gemini-3.1-flash         (최신 3.1 빠른 모델 - 무료 API 한도 넉넉함)
//   2순위: gemini-3.1-flash-preview (3.1 빠른 모델 베타)
//   3순위: gemini-2.5-flash         (경량 최종 폴백)
//
// ※ 3.1 Pro는 API 무료 티어 할당량(limit: 0) 에러로 인해 제외하고,
//   속도와 인식률이 뛰어난 3.1 Flash 계열을 메인으로 사용함.
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ── Secret 정의 ───────────────────────────────────────────────────────────────
const GOOGLE_API_KEY = defineSecret("GOOGLE_API_KEY");

// ── 모델 우선순위: 3.1 Pro 풀파워 장착 (유료 계정 전용) ────────────────────────
const MODEL_PRIORITY = [
    "gemini-3.1-pro-preview",  // <- 1순위: 무조건 이 이름 그대로!
    "gemini-2.5-pro",
    "gemini-2.5-flash"
];

// ── 고도화된 교적 카드 프롬프트 ───────────────────────────────────────────────
const SYSTEM_PROMPT = `너는 타슈켄트 한인교회 행정 시스템의 OCR 엔진이야.
이 사진은 교인등록카드(교적 카드)야. 카드에 적힌 모든 수기/인쇄 정보를 정밀 분석해서
반드시 아래 JSON 형식으로만 응답해. 마크다운 코드블록(\`\`\`json, \`\`\`)이나 부가 설명은 절대 금지.

{
  "head": {
    "name": "세대주 이름",
    "phone": "세대주 전화번호",
    "address": "주소",
    "birth": "생년월일 (YYYY-MM-DD 형식으로 변환)",
    "birthYear": "생년월일이 불완전하거나 연도만 있는 경우 4자리 연도만 추출 (예: 1985). 알 수 없으면 빈칸",
    "role": "직분 — 아래 [직분 규칙] 참고",
    "residence": "거주지 — '타슈켄트' 또는 '한국' 중 하나"
  },
  "members": [
    {
      "name": "가족 이름",
      "relation": "관계 (배우자 / 자녀1 / 자녀2 / 기타)",
      "phone": "전화번호",
      "birth": "생년월일 (YYYY-MM-DD 형식으로 변환)",
      "birthYear": "생년월일이 불완전하거나 연도만 있는 경우 4자리 연도만 추출 (예: 1985). 알 수 없으면 빈칸",
      "role": "직분 — 아래 [직분 규칙] 참고",
      "residence": "거주지 — '타슈켄트' 또는 '한국' 중 하나"
    }
  ],
  "metadata": {
    "이전교회": "값 (카드에 있을 경우만 포함)",
    "입국일": "YYYY-MM-DD (카드에 있을 경우만 포함)",
    "학교": "값 (카드에 있을 경우만 포함)",
    "직업": "값 (카드에 있을 경우만 포함)",
    "가훈": "값 (카드에 있을 경우만 포함)",
    "기도제목": "값 (카드에 있을 경우만 포함)",
    "세례일": "YYYY-MM-DD (카드에 있을 경우만 포함)",
    "등록일": "YYYY-MM-DD (카드에 있을 경우만 포함)"
  }
}

【직분 규칙 — 가장 중요한 지시, 반드시 따를 것】

  ▶ 이 교적 카드는 표(Table) 구조로 되어 있다.
  ▶ 표의 좌측 열에는 항목 이름(행 레이블)이 나열되어 있고,
    우측으로 세대주, 배우자, 자녀1, 자녀2 등의 인물 열(Column)이 이어진다.

  ★ 직분 추출 절차 (반드시 이 순서대로 수행):
    1. 표의 행(Row) 레이블 중에서 '이전직분', '이전 직분', '직분' 등의 텍스트를 찾아라.
    2. 해당 행에서 각 인물(세대주, 배우자, 자녀 등)의 열(Column)과 교차하는 셀의 텍스트를 읽어라.
    3. 그 셀의 텍스트를 아래 6가지 직분 중 하나로 치환하여 head.role 및 members[].role 필드에 개별적으로 각각 직접(direct) 반환하라.
    4. 이 카드 양식에는 '현재 직분' 란이 없다. '이전직분' 행이 실질적인 현재 직분 정보다.

  ★ 강력 경고: 직분 정보를 metadata summary 같은 곳에 뭉뚱그려 넣지 말고, 반드시 개별 인원의 객체(head.role, members[i].role)에 각각 매핑해야 한다!
  ★ 수기(흘림체) 판독 주의: 직분은 펜으로 직접 기입된 경우가 많다. 흘림체를 포함해 최대한 판독하라.

  치환 규칙 (아래 6가지 중 하나만 반환):
  - 목사     : 셀에 '목사', '담임', '부목사' 등이 보이면
  - 장로     : 셀에 '장로'가 보이면
  - 권사     : 셀에 '권사'가 보이면
  - 안수집사 : 셀에 '안수집사'가 보이면 ← 반드시 '집사'보다 먼저 확인
  - 집사     : 셀에 '집사'가 보이면 ('안수집사'는 위 항목으로 처리)
  - 성도     : 셀이 비어있거나, 읽을 수 없거나, 위 어디에도 해당하지 않으면

  ※ role 필드에 빈 문자열("")은 절대 금지. 불확실하면 반드시 '성도'를 반환할 것.

[거주지 규칙] — residence 필드:
  - 카드에 '한국', '귀국', 'Korea' 등이 보이면 → '한국'
  - 그 외 모든 경우 → '타슈켄트'
  ※ 타슈켄트에 살면서 한국에 잠시 방문한 경우도 '타슈켄트'로 기록할 것.

핵심 규칙:
- 모든 날짜는 반드시 YYYY-MM-DD 형식으로 변환할 것. (예: "85.3.15" → "1985-03-15")
- 값을 찾을 수 없는 head/members 필드(name, phone, address, birth)는 빈 문자열("")로 채울 것.
- role 과 residence 는 절대 빈 문자열로 반환하지 말 것. (폴백: role→"성도", residence→"타슈켄트")
- metadata는 카드에 실제 내용이 있는 항목만 동적으로 포함할 것. 비어있으면 해당 키를 아예 제외할 것.
- members 배열에는 세대주를 제외한 나머지 가족만 넣을 것.
- 가족이 없으면 members를 빈 배열([])로 줄 것.
- metadata에 내용이 없으면 빈 객체({})로 줄 것.`;


// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼 1: Base64 URI 헤더 완벽 제거
//   "data:image/jpeg;base64,XXXX" → "XXXX"
//   이미 순수 base64인 경우       → 그대로 반환
// ─────────────────────────────────────────────────────────────────────────────
function stripBase64Header(raw) {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const cleaned = raw.replace(/^data:[a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
    return cleaned.length > 0 ? cleaned : null;
}


// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼 2: Gemini 응답에서 순수 JSON 문자열 추출
//   우선순위: ```json...``` → ```...``` → { ... } 추출
// ─────────────────────────────────────────────────────────────────────────────
function extractJson(text) {
    if (!text || typeof text !== "string") {
        throw new Error("Gemini 응답이 비어있거나 문자열이 아닙니다.");
    }

    // 1순위: ```json ... ``` 마크다운 코드블록
    const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlock && jsonBlock[1]) return jsonBlock[1].trim();

    // 2순위: ``` ... ``` 일반 코드블록
    const codeBlock = text.match(/```\s*([\s\S]*?)```/);
    if (codeBlock && codeBlock[1]) return codeBlock[1].trim();

    // 3순위: 텍스트에서 { ... } 추출
    const jsonObj = text.match(/\{[\s\S]*\}/);
    if (jsonObj && jsonObj[0]) return jsonObj[0].trim();

    throw new Error(
        "응답 텍스트에서 JSON 구조를 찾을 수 없습니다. 원본 앞부분: " +
        text.slice(0, 300)
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function: processDocument
// ─────────────────────────────────────────────────────────────────────────────
exports.processDocument = onCall(
    { secrets: [GOOGLE_API_KEY] },
    async (request) => {

        // ── STEP 1: 페이로드 수신 및 기본 검증 ──────────────────────────────────
        const payload = request.data;
        console.log("[STEP 1] 수신된 payload 키:", Object.keys(payload || {}));

        const rawBase64 = (payload && (payload.imageBase64 || payload.image)) || null;
        if (!rawBase64) {
            console.error("[STEP 1] FAIL — imageBase64 필드 없음:", JSON.stringify(payload).slice(0, 300));
            throw new HttpsError("invalid-argument", "이미지 데이터(imageBase64)가 없습니다.");
        }

        // ── STEP 2: Base64 헤더 완벽 제거 ────────────────────────────────────────
        const imageBase64 = stripBase64Header(rawBase64);
        if (!imageBase64) {
            console.error("[STEP 2] FAIL — 헤더 제거 후 빈 문자열");
            throw new HttpsError("invalid-argument", "Base64 이미지 변환에 실패했습니다.");
        }

        const mimeType = payload.mimeType || "image/jpeg";
        console.log(`[STEP 2] OK — 순수 Base64 길이: ${imageBase64.length}자 | MIME: ${mimeType}`);

        // ── STEP 3: API 키 안전 주입 확인 ────────────────────────────────────────
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("[STEP 3] FAIL — GOOGLE_API_KEY 미주입. Secret 등록 여부 확인 필요.");
            throw new HttpsError("internal", "서버 설정 오류: API 키가 주입되지 않았습니다.");
        }
        console.log("[STEP 3] OK — API 키 확인됨 (앞 8자리):", apiKey.slice(0, 8) + "...");

        // ── STEP 4: Gemini 호출 — 3.1 preview → 2.5 Pro → 2.5 Flash 자동 폴백 ──
        const genAI = new GoogleGenerativeAI(apiKey);
        const imagePart = { inlineData: { data: imageBase64, mimeType } };

        let rawText = null;
        let usedModel = null;

        for (const modelName of MODEL_PRIORITY) {
            try {
                console.log(`[STEP 4] 모델 시도: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const geminiResult = await model.generateContent([SYSTEM_PROMPT, imagePart]);
                rawText = geminiResult.response.text();
                usedModel = modelName;
                console.log(`[STEP 4] OK — ${modelName} 성공. 응답 길이: ${rawText.length}자`);
                break;
            } catch (modelError) {
                const errMsg = modelError.message || String(modelError);
                console.warn(`[STEP 4] WARN — ${modelName} 실패: ${errMsg}`);

                if (modelName === MODEL_PRIORITY[MODEL_PRIORITY.length - 1]) {
                    console.error("[STEP 4] FAIL — 모든 모델 시도 실패");
                    throw new HttpsError("internal", `Gemini API 오류: ${errMsg}`);
                }
                console.log(`[STEP 4] → 다음 모델로 자동 전환합니다...`);
            }
        }

        // ── STEP 5: 응답 클리닝 및 JSON 파싱 ────────────────────────────────────
        console.log(`[STEP 5] 원본 응답 앞부분 (${usedModel}):`, rawText.slice(0, 500));

        try {
            const jsonString = extractJson(rawText);
            const parsed = JSON.parse(jsonString);

            // 필수 구조 검증
            if (!parsed.head || typeof parsed.head !== "object") {
                throw new Error("'head' 객체가 누락된 JSON 구조입니다.");
            }
            if (!Array.isArray(parsed.members)) {
                throw new Error("'members' 배열이 누락된 JSON 구조입니다.");
            }
            // metadata 없으면 빈 객체로 보정
            if (!parsed.metadata || typeof parsed.metadata !== "object") {
                parsed.metadata = {};
            }

            console.log("[STEP 5] OK — JSON 파싱 성공:", JSON.stringify(parsed).slice(0, 500));
            return { result: parsed, model: usedModel };

        } catch (parseError) {
            console.error("[STEP 5] FAIL — JSON 파싱 오류:", parseError.message);
            console.error("[STEP 5] 원본 전체 응답:", rawText);
            throw new HttpsError("internal", "AI 응답 JSON 파싱 실패: " + parseError.message);
        }
    }
);