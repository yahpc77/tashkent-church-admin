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

// ── 고도화된 지능형 통합 등록 프롬프트 ───────────────────────────────────────────────
const SYSTEM_PROMPT = `너는 타슈켄트 한인교회 행정 시스템의 최고 수준 OCR 엔진이자 데이터 분석가야.
과거의 '가족' 중심 틀을 완전히 버리고, 모든 인원을 '독립적인 개인'으로 추출한다.

업로드되는 이미지는 명단(표)이거나 가족 등록 카드, 혹은 개인 등록 카드일 수 있다.
제일 먼저 문서의 타입(documentType)을 판별하라.
- 'list' (성도 명단 표): 여러 명의 행을 추출.
- 'family' (가족 등록 카드): 세대주, 배우자, 자녀 관계를 파악하여 추출.
- 'individual' (개인 등록 카드): 1인 정보 추출.

결과값은 반드시 아래 JSON 포맷으로 반환해야 한다:
{
  "documentType": "list" | "family" | "individual",
  "members": [
    {
      "name": "성도 이름",
      "relation": "관계 (세대주/본인/배우자/자녀 등 기재된 대로 추출. 표 명단이면 '본인' 또는 빈칸)",
      "phone": "전화번호 (숫자와 +만 남길 것)",
      "birth": "YYYY-MM-DD (생년월일. 불완전하면 연도만)",
      "role": "직분 — 아래 [직분 규칙] 참고",
      "residence": "거주지 — '타슈켄트' 또는 '한국'",
      "company": "회사/직장 (있을 경우만)",
      "address": "주소 (있을 경우만)",
      "metadata": {
        "이전교회": "값",
        "가훈": "값"
      }
    }
  ]
}

【데이터 추출 핵심 규칙】
1. [X표시 필터링]: 'list' 타입 명단에서 이름 칸이나 이름 주변에 'X' 표시, 취소선, 또는 귀임/삭제 등의 표시가 명확히 있는 사람은 **무조건 추출 대상에서 제외**하라. (배열에 포함시키지 말 것)
2. [전수 조사]: X표시가 없는 사람은 인원수 제한 없이 100% 다 추출할 것.
3. [독립 객체]: 가족으로 묶는 별도의 구조(families)를 만들지 말고, 오직 하나의 "members" 배열 안에 모든 개인을 평면적(Flat)으로 나열할 것.
4. [직분 규칙]: '목사', '장로', '권사', '안수집사', '집사', '성도' 중 하나. 수기(흘림체) 판독 주의. 비어있으면 기본값 '성도'.
5. [거주지 규칙]: '한국', '귀국', 'Korea' 등이 보이면 '한국', 나머지는 모두 '타슈켄트'.
6. 빈칸은 빈 문자열("")로 채울 것.

【직분 규칙 — 가장 중요한 지시, 반드시 따를 것】
- 수기(흘림체) 판독에 주의하라.
- 각 인원의 role 필드에 다음 6가지 직분 중 하나로 치환하여 반환하라:
  - 목사, 장로, 권사
  - 안수집사 ('집사'보다 먼저 확인)
  - 집사
  - 성도 (비어있거나 알 수 없으면 기본값)

【거주지 규칙】
- '한국', '귀국', 'Korea' 등이 보이면 → '한국'
- 그 외 모든 경우 → '타슈켄트'

핵심 규칙:
- 모든 날짜는 반드시 YYYY-MM-DD 형식. 불완전하면(예: 연도만) 해당 연도만.
- 전화번호는 숫자와 '+'만 남길 것.
- 값을 찾을 수 없는 필드는 빈 문자열("")로 채울 것. (단, role은 "성도", residence는 "타슈켄트" 폴백)
- metadata는 실제 내용이 있는 항목만 동적으로 포함할 것. 비어있으면 해당 키 제외.`;


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
    {
        secrets: [GOOGLE_API_KEY],
        cors: true,             // 모든 origin 허용 (CORS 에러 방지)
        timeoutSeconds: 300,    // 타임아웃 5분(300초)으로 연장 (504 Gateway Timeout 방지)
        memory: "1GB"           // 메모리 1GB 할당 (대용량 이미지 처리용)
    },
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
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        maxOutputTokens: 8192,
                        responseMimeType: "application/json"
                    }
                });
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
            let parsed = JSON.parse(jsonString);

            // 유연한 예외 처리: members가 없으면 구조 보정 시도
            if (!parsed.members || !Array.isArray(parsed.members)) {
                console.warn("[STEP 5] 'members' 배열 없음. 자동 보정 시도...");
                let fallbackMembers = [];

                if (parsed.head) {
                    fallbackMembers.push({ ...parsed.head, relation: "세대주" });
                }
                if (parsed.families && Array.isArray(parsed.families)) {
                    parsed.families.forEach(fam => {
                        if (Array.isArray(fam.members)) {
                            fallbackMembers.push(...fam.members);
                        }
                    });
                }
                if (fallbackMembers.length === 0) {
                    if (Array.isArray(parsed)) fallbackMembers = parsed;
                    else fallbackMembers = [parsed];
                }

                parsed = {
                    members: fallbackMembers
                };
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