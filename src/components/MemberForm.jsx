import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase/config';
import { Loader2, UploadCloud, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function MemberForm({ onCancel, onImageChange, onSuccess, initialData, familyId }) {
  const [address, setAddress]     = useState(initialData?.address || '');
  const [addressAi, setAddressAi] = useState(false);
  // 가족 공통 metadata (AI 추출: 이전교회, 입국일, 가훈, 기도제목 등)
  const [familyMetadata, setFamilyMetadata]         = useState(initialData?.metadata || {});
  const [showMetadata, setShowMetadata]             = useState(!!initialData?.metadata && Object.keys(initialData.metadata).length > 0);

  const createDefaultMember = (relation = '세대주') => ({
    id: Date.now() + Math.random(),
    relation,
    name: '',
    phone: '',
    birthDate: '',
    position: '성도',
    attendanceStatus: '출석',
    residenceStatus: '타슈켄트',  // 기본값: 타슈켄트
    department: '장년부',
    isAiGenerated: {},
  });

  const [members, setMembers]         = useState(initialData?.members?.length > 0 ? initialData.members : [createDefaultMember()]);
  const [file, setFile]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  const positions   = ['성도', '집사', '안수집사', '권사', '장로', '목사', '전도사', '기타'];
  const attendances = ['출석', '미출석'];
  const residences  = ['타슈켄트', '한국'];  // 두 가지 옵션만 사용
  const departments = ['유초등부', '중고등부', '청년부', '장년부', '기타'];

  // ── AI 직분 매핑 헬퍼 ───────────────────────────────────────────────────
  // '안수집사'가 '집사'보다 먼저 체크되도록 븰 순서가 중요함
  const VALID_POSITIONS = ['목사', '장로', '권사', '안수집사', '집사', '성도', '전도사', '기타'];
  const VALID_POSITIONS_SET = new Set(VALID_POSITIONS);
  const normalizePosition = (raw) => {
    if (!raw || typeof raw !== 'string') return '성도';
    const trimmed = raw.trim();
    if (VALID_POSITIONS_SET.has(trimmed)) return trimmed;
    // 정확한 순서로 비교: '안수집사'를 '집사'보다 먼저 확인
    for (const p of VALID_POSITIONS) { if (trimmed.includes(p)) return p; }
    return '성도';
  };

  // ── 전화번호 정제 헬퍼: 숫자와 '+' 외 모든 부호 제거 ────────────────────────
  // 예: "90.823.4698" → "908234698", "+998 90 123" → "+99890123"
  const cleanPhone = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/[^0-9+]/g, '');
  };

  // ── 생년월일 기반 부서 자동 계산 헬퍼 ────────────────────────────────
  // 현재연도(2026) 기준 나이를 계산하여 부서 결정
  const calculateDepartment = (birthDateStr, birthYearStr) => {
    let year = NaN;
    if (birthDateStr) {
      year = parseInt(birthDateStr.split('-')[0], 10);
    }
    if (isNaN(year) && birthYearStr) {
      year = parseInt(birthYearStr, 10);
    }
    if (isNaN(year)) return '장년부';

    const currentYear = 2026; // 기준 연도: 2026년
    const age = currentYear - year; // 만 나이 기준
    if (age <= 13) return '유초등부';
    if (age <= 19) return '중고등부';
    if (age <= 29) return '청년부';
    return '장년부';
  };

  // ── AI 거주지 매핑 헬퍼 ──────────────────────────────────────────────────
  const normalizeResidence = (raw) => {
    if (!raw || typeof raw !== 'string') return '타슈켄트';
    const t = raw.trim();
    if (t === '한국' || t.includes('한국')) return '한국';
    return '타슈켄트';
  };

  const handleMemberChange = (id, field, value) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updatedAi = { ...(m.isAiGenerated || {}) };
      if (updatedAi[field]) updatedAi[field] = false;

      const updated = { ...m, [field]: value, isAiGenerated: updatedAi };

      // 생년월일이 수동으로 변경되면 부서를 자동 궄신
      if (field === 'birthDate') {
        updated.department = calculateDepartment(value);
      }

      return updated;
    }));
  };

  const handleMetadataChange = (key, value) => {
    setFamilyMetadata(prev => ({ ...prev, [key]: value }));
  };

  const addMember = () => {
    const relations = ['배우자', '자녀 1', '자녀 2', '자녀 3', '기타'];
    const nextRelation = members.length < relations.length + 1
      ? relations[members.length - 1]
      : '기타';
    setMembers(prev => [...prev, createDefaultMember(nextRelation)]);
  };

  const removeMember = (id) => {
    if (members.length === 1) return;
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleAddressChange = (e) => {
    setAddress(e.target.value);
    if (addressAi) setAddressAi(false);
  };

  const handleFileChange = async (e) => {
    e.preventDefault();
    const selectedFile = e.target.files?.[0] ?? null;
    await processSelectedFile(selectedFile);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const selectedFile = e.dataTransfer.files?.[0] ?? null;
    await processSelectedFile(selectedFile);
  };

  const processSelectedFile = async (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      onImageChange(URL.createObjectURL(selectedFile));
      await analyzeImage(selectedFile);
    } else {
      setFile(null);
      onImageChange(null);
    }
  };

  // ── Gemini OCR: 이미지 → Cloud Function → 폼 자동 입력 ──────────────────────
  const analyzeImage = async (imageFile) => {
    setIsOcrLoading(true);
    try {
      console.log('[STEP A] 이미지 → Base64 변환 시작');
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!reader.result) { reject(new Error('FileReader result가 비어 있습니다.')); return; }
          resolve(reader.result); // data URI 헤더 포함 — 서버에서 제거
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(imageFile);
      });
      const mimeType = imageFile.type || 'image/jpeg';
      console.log('[STEP A] OK — Base64 길이:', base64Image.length, '| MIME:', mimeType);

      console.log('[STEP B] Cloud Function processDocument 호출 중...');
      const processDocumentFn = httpsCallable(functions, 'processDocument');
      let result;
      try {
        result = await processDocumentFn({ imageBase64: base64Image, mimeType });
      } catch (callError) {
        console.error('[STEP B] FAIL:', callError.code, callError.message);
        throw callError;
      }
      console.log('[STEP B] OK — 사용 모델:', result.data?.model);

      console.log('[STEP C] 응답 데이터:', result.data);
      parseGeminiResponse(result.data);

    } catch (error) {
      if      (error.code === 'functions/invalid-argument') console.error('[OCR] 이미지 거부:', error.message);
      else if (error.code === 'functions/internal')         console.error('[OCR] 서버 내부 오류:', error.message);
      else if (error.code === 'functions/unauthenticated')  console.error('[OCR] 인증 실패:', error.message);
      else                                                   console.error('[OCR] 예상치 못한 오류:', error);
    } finally {
      setIsOcrLoading(false);
    }
  };

  // ── Gemini 응답 파싱 → 폼 주입 ───────────────────────────────────────────────
  const parseGeminiResponse = (data) => {
    try {
      const aiResult = data?.result;
      if (!aiResult) {
        console.error('[STEP C] FAIL — data.result 없음:', JSON.stringify(data));
        return;
      }
      const { head, members: aiMembers, metadata } = aiResult;
      if (!head) { console.error('[STEP C] FAIL — head 없음'); return; }

      // 주소
      if (head.address) { setAddress(head.address); setAddressAi(true); }

      // metadata (이전교회, 입국일, 가훈 등) — 내용 있을 때만 주입
      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
        setFamilyMetadata(metadata);
        setShowMetadata(true); // AI가 뭔가 찾았으면 자동 펼침
        console.log('[STEP C] metadata 주입:', metadata);
      }

      // members 상태 업데이트
      setMembers(prev => {
        const next = prev.map(m => ({ ...m, isAiGenerated: { ...(m.isAiGenerated || {}) } }));

        // ── 세대주 ─────────────────────────────────────────────────────────────────────
        const h = next[0];
        if (head.name)      { h.name            = head.name;                         h.isAiGenerated.name            = true; }
        // ① 전화번호: 숫자/'+' 외 특수부호 제거 후 주입
        if (head.phone)     { h.phone            = cleanPhone(head.phone);            h.isAiGenerated.phone           = true; }
        // ② 생년월일: 주입
        if (head.birth)     { h.birthDate        = head.birth;                         h.isAiGenerated.birthDate       = true; }
        // birth 또는 birthYear를 이용해 부서 자동 계산
        if (head.birth || head.birthYear) {
          h.department = calculateDepartment(head.birth, head.birthYear);
          h.isAiGenerated.department = true;
        }
        // ③ 직분: 정규화 후 주입 (값이 비어있거나 없으면 기본값 '성도')
        if (head.position !== undefined || head.role !== undefined) {
          h.position = normalizePosition(head.position || head.role);
          h.isAiGenerated.position = true;
        }
        // 거주지 매핑
        if (head.residence) { h.residenceStatus  = normalizeResidence(head.residence); h.isAiGenerated.residenceStatus = true; }

        // ── 가족 구성원 ─────────────────────────────────────────────────────────────────
        if (Array.isArray(aiMembers)) {
          aiMembers.forEach((ai, idx) => {
            const ti = idx + 1;
            if (!next[ti]) {
              const rel = ai.relation || (idx === 0 ? '배우자' : `자녀 ${idx}`);
              next.push(createDefaultMember(rel));
            }
            const m = next[ti];
            if (ai.name)      { m.name           = ai.name;                           m.isAiGenerated.name            = true; }
            // ① 전화번호 정제
            if (ai.phone)     { m.phone           = cleanPhone(ai.phone);              m.isAiGenerated.phone           = true; }
            // ② 생년월일 주입
            if (ai.birth)     { m.birthDate       = ai.birth;                           m.isAiGenerated.birthDate       = true; }
            // birth 또는 birthYear를 이용해 부서 자동 계산
            if (ai.birth || ai.birthYear) {
              m.department = calculateDepartment(ai.birth, ai.birthYear);
              m.isAiGenerated.department = true;
            }
            if (ai.relation)  { m.relation        = ai.relation;                        m.isAiGenerated.relation        = true; }
            // ③ 직분 정규화 (값이 비어있거나 없으면 기본값 '성도')
            if (ai.position !== undefined || ai.role !== undefined) {
              m.position = normalizePosition(ai.position || ai.role);
              m.isAiGenerated.position = true;
            }
            if (ai.residence) { m.residenceStatus = normalizeResidence(ai.residence);   m.isAiGenerated.residenceStatus = true; }
          });
        }

        console.log('[STEP C] 폼 입력 완료. 총 멤버 수:', next.length);
        return next;
      });

    } catch (error) {
      console.error('[STEP C] FAIL — 파싱 예외:', error);
    }
  };

  // ── 저장 ─────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const headMember = members[0];
    if (!headMember?.name) return;

    // isAiGenerated 플래그 제거 후 저장
    const cleanMembers = members.map(({ isAiGenerated, ...clean }) => clean);

    setLoading(true);
    try {
      let imageUrl = '';
      if (file) {
        const storageRef = ref(storage, `families/${Date.now()}_${file.name}`);
        const snapshot   = await uploadBytes(storageRef, file);
        imageUrl         = await getDownloadURL(snapshot.ref);
      }

      if (familyId) {
        const updateData = {
          address,
          members: cleanMembers,
          metadata: familyMetadata,
        };
        if (imageUrl) updateData.imageUrl = imageUrl;
        await updateDoc(doc(db, 'families', familyId), updateData);
      } else {
        await addDoc(collection(db, 'families'), {
          address,
          members: cleanMembers,
          metadata: familyMetadata,   // ← AI 추출 상세 정보도 함께 저장
          imageUrl,
          createdAt: serverTimestamp(),
        });
      }

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('등록 중 오류 발생:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── UI 헬퍼 ──────────────────────────────────────────────────────────────────
  const getInputClass = (isAiFilled) => {
    const base = 'w-full bg-transparent border-b py-1.5 text-sm focus:outline-none transition-colors ';
    return isAiFilled
      ? base + 'border-red-400/80 text-red-400 bg-red-500/10 px-2 rounded-t font-medium'
      : base + 'border-white/10 text-white focus:border-indigo-500';
  };
  const getSelectClass = (isAiFilled) => {
    const base = 'w-full bg-[#1e1e2e] border rounded-lg py-1.5 px-2 text-xs focus:outline-none transition-colors ';
    return isAiFilled
      ? base + 'border-red-400/80 text-red-400 bg-red-500/10 font-medium'
      : base + 'border-white/10 text-white focus:border-indigo-500';
  };

  const metadataKeys = Object.keys(familyMetadata);

  return (
    <div className="relative flex flex-col h-full bg-[#1e1e2e] text-gray-200">

      {/* OCR 로딩 오버레이 */}
      {isOcrLoading && (
        <div className="absolute inset-0 z-50 bg-[#13131f]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
          <div className="bg-[#1e1e2e] p-8 rounded-2xl shadow-2xl flex flex-col items-center border border-white/10">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">AI가 교적 카드를 분석 중입니다...</h3>
            <p className="text-sm text-indigo-300">정확한 정보를 추출하고 있습니다.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">가족 단위 등록</h3>
            <p className="text-xs text-gray-400 mt-1">등록 카드 한 장으로 온 가족을 한 번에 등록하세요.</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white transition-colors p-2">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">

          {/* 사진 첨부 */}
          <div className="bg-[#13131f] p-4 rounded-xl border border-white/5">
            <label className="text-sm font-medium text-gray-300 block mb-2">교인등록카드 사진 첨부</label>
            <div
              className="relative border-2 border-dashed border-gray-600 rounded-xl hover:border-indigo-500 transition-colors bg-[#1a1a2e] flex flex-col items-center justify-center p-6 cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isOcrLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <UploadCloud className="text-gray-400 mb-2" size={28} />
              <span className="text-sm text-gray-300">
                {file ? file.name : '클릭하거나 파일을 드래그하여 업로드 (AI 자동 입력)'}
              </span>
            </div>
          </div>

          {/* 공통 주소 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">가족 공통 주소</label>
            <input
              type="text"
              value={address}
              onChange={handleAddressChange}
              disabled={isOcrLoading}
              placeholder="상세 주소 입력"
              className={getInputClass(addressAi) + ' text-base py-2.5 px-4 rounded-xl bg-[#13131f] border'}
            />
            {addressAi && (
              <p className="text-[10px] text-red-400 mt-1 ml-1">AI가 입력한 항목입니다. 확인 후 수정 시 붉은색이 해제됩니다.</p>
            )}
          </div>

          {/* ── AI 상세 정보 토글 패널 ───────────────────────────────────────────── */}
          <div className="bg-[#13131f] rounded-xl border border-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMetadata(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                상세 정보 보기/수정
                {metadataKeys.length > 0 && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                    AI 추출 {metadataKeys.length}건
                  </span>
                )}
              </span>
              {showMetadata ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showMetadata && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                {metadataKeys.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2 text-center">
                    AI가 추출한 추가 정보가 없습니다. 직접 입력하세요.
                  </p>
                ) : (
                  <p className="text-[10px] text-red-400 mt-2">
                    AI가 입력한 항목입니다. 확인 후 수정하세요.
                  </p>
                )}

                {/* AI 추출 항목 수정 가능한 필드로 나열 */}
                {metadataKeys.map((key) => (
                  <div key={key}>
                    <label className="block text-[10px] text-gray-500 mb-1">{key}</label>
                    <input
                      type="text"
                      value={familyMetadata[key] || ''}
                      onChange={(e) => handleMetadataChange(key, e.target.value)}
                      disabled={isOcrLoading}
                      className="w-full bg-transparent border-b border-red-400/60 py-1.5 text-sm text-red-300 focus:outline-none focus:border-indigo-400 transition-colors"
                    />
                  </div>
                ))}

                {/* 직접 항목 추가 */}
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[10px] text-gray-500 mb-2">항목 직접 추가</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['이전교회', '입국일', '직업', '학교', '가훈', '기도제목', '세례일', '등록일'].map((key) => {
                      if (familyMetadata[key] !== undefined) return null;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFamilyMetadata(prev => ({ ...prev, [key]: '' }))}
                          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:border-indigo-500 rounded-lg px-2 py-1.5 transition-colors text-left"
                        >
                          + {key}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 가족 구성원 목록 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-400">가족 구성원</label>
              <button
                type="button"
                onClick={addMember}
                disabled={isOcrLoading}
                className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
              >
                <Plus size={14} /> 인원 추가
              </button>
            </div>

            {members.map((member, index) => (
              <div key={member.id} className="p-4 bg-[#13131f] border border-white/5 rounded-xl relative group mt-2">
                <div className="absolute -top-2 left-3 bg-[#13131f] px-2 text-xs font-semibold text-indigo-400">
                  {index === 0 ? '세대주 정보' : index === 1 ? '배우자 정보' : `자녀/기타 정보 ${index - 1}`}
                </div>
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    disabled={isOcrLoading}
                    className="absolute top-3 right-3 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* 기본 필드: 이름, 관계, 연락처, 생년월일 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pr-6 md:pr-0 mt-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">이름</label>
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => handleMemberChange(member.id, 'name', e.target.value)}
                      disabled={isOcrLoading}
                      placeholder="예) 홍길동"
                      style={{ color: member.isAiGenerated?.name ? '#f87171' : 'inherit' }}
                      className="w-full bg-transparent border-b border-white/10 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">관계</label>
                    <input
                      type="text"
                      value={member.relation}
                      onChange={(e) => handleMemberChange(member.id, 'relation', e.target.value)}
                      disabled={isOcrLoading}
                      placeholder="예) 세대주, 자녀"
                      style={{ color: member.isAiGenerated?.relation ? '#f87171' : 'inherit' }}
                      className="w-full bg-transparent border-b border-white/10 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">연락처</label>
                    <input
                      type="text"
                      value={member.phone}
                      onChange={(e) => handleMemberChange(member.id, 'phone', e.target.value)}
                      disabled={isOcrLoading}
                      placeholder="010-0000-0000"
                      style={{ color: member.isAiGenerated?.phone ? '#f87171' : 'inherit' }}
                      className="w-full bg-transparent border-b border-white/10 py-1.5 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">생년월일</label>
                    <input
                      type="date"
                      value={member.birthDate}
                      onChange={(e) => handleMemberChange(member.id, 'birthDate', e.target.value)}
                      disabled={isOcrLoading}
                      style={{ color: member.isAiGenerated?.birthDate ? '#f87171' : 'inherit' }}
                      className="w-full bg-transparent border-b border-white/10 py-1.5 text-sm focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* 부서/직분/출석/거주 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-black/20 p-3 rounded-lg border border-white/5">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">부서</label>
                    <select
                      value={member.department}
                      onChange={(e) => handleMemberChange(member.id, 'department', e.target.value)}
                      disabled={isOcrLoading}
                      className={getSelectClass(member.isAiGenerated?.department)}
                    >
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">직분</label>
                    <select
                      value={member.position}
                      onChange={(e) => handleMemberChange(member.id, 'position', e.target.value)}
                      disabled={isOcrLoading}
                      className={getSelectClass(member.isAiGenerated?.position)}
                    >
                      {positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">출석 여부</label>
                    <select
                      value={member.attendanceStatus}
                      onChange={(e) => handleMemberChange(member.id, 'attendanceStatus', e.target.value)}
                      disabled={isOcrLoading}
                      className={getSelectClass(member.isAiGenerated?.attendanceStatus)}
                    >
                      {attendances.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">거주 상태</label>
                    <select
                      value={member.residenceStatus}
                      onChange={(e) => handleMemberChange(member.id, 'residenceStatus', e.target.value)}
                      disabled={isOcrLoading}
                      className={getSelectClass(member.isAiGenerated?.residenceStatus)}
                    >
                      {residences.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="pt-5 mt-auto border-t border-white/10 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading || isOcrLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!members[0]?.name || loading || isOcrLoading}
            className="flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-600/20"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> 저장 중...</>
            ) : '가족 등록'}
          </button>
        </div>
      </form>
    </div>
  );
}
