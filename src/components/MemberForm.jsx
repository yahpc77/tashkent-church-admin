import React, { useState } from 'react';
import { collection, doc, updateDoc, serverTimestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase/config';
import { Loader2, UploadCloud, X, Plus, Trash2, ChevronDown, ChevronUp, Info, Users, User, List } from 'lucide-react';

export default function MemberForm({ onCancel, onImageChange, onSuccess, initialData, familyId }) {
  // 문서 타입: 'individual' | 'family' | 'list'
  const [documentType, setDocumentType] = useState(initialData?.documentType || 'individual');

  const [address, setAddress]     = useState(initialData?.address || '');
  const [addressAi, setAddressAi] = useState(false);
  const [familyMetadata, setFamilyMetadata]         = useState(initialData?.metadata || {});
  const [showMetadata, setShowMetadata]             = useState(!!initialData?.metadata && Object.keys(initialData.metadata).length > 0);
  const [aiSummary, setAiSummary]                   = useState('');

  const createDefaultMember = (relation = '본인') => ({
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
    relation,
    name: '',
    phone: '',
    birthDate: '',
    position: '성도',
    attendanceStatus: '출석',
    residenceStatus: '타슈켄트',
    department: '장년부',
    company: '',
    personalPrayer: '',
    visitLog: [],
    isAiGenerated: {},
  });

  const [members, setMembers]         = useState(initialData?.members?.length > 0 ? initialData.members : [createDefaultMember('본인')]);
  const [file, setFile]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  const positions   = ['성도', '집사', '안수집사', '권사', '장로', '목사', '전도사', '기타'];
  const attendances = ['출석', '미출석'];
  const residences  = ['타슈켄트', '한국'];
  const departments = ['유초등부', '중고등부', '청년부', '장년부', '기타'];

  const VALID_POSITIONS = ['목사', '장로', '권사', '안수집사', '집사', '성도', '전도사', '기타'];
  const VALID_POSITIONS_SET = new Set(VALID_POSITIONS);
  const normalizePosition = (raw) => {
    if (!raw || typeof raw !== 'string') return '성도';
    const trimmed = raw.trim();
    if (VALID_POSITIONS_SET.has(trimmed)) return trimmed;
    for (const p of VALID_POSITIONS) { if (trimmed.includes(p)) return p; }
    return '성도';
  };

  const cleanPhone = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/[^0-9+]/g, '');
  };

  const calculateDepartment = (birthDateStr, birthYearStr) => {
    let year = NaN;
    if (birthDateStr) {
      year = parseInt(birthDateStr.split('-')[0], 10);
    }
    if (isNaN(year) && birthYearStr) {
      year = parseInt(birthYearStr, 10);
    }
    if (isNaN(year)) return '장년부';

    const currentYear = 2026;
    const age = currentYear - year;
    if (age <= 13) return '유초등부';
    if (age <= 19) return '중고등부';
    if (age <= 29) return '청년부';
    return '장년부';
  };

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
    let nextRelation = '본인';
    if (documentType === 'family') {
      const relations = ['배우자', '자녀 1', '자녀 2', '자녀 3', '기타'];
      nextRelation = members.length < relations.length + 1
        ? relations[members.length - 1]
        : '기타';
    }
    setMembers(prev => [...prev, createDefaultMember(nextRelation)]);
  };

  const removeMember = (id) => {
    if (members.length === 1 && documentType !== 'list') return; // list는 다 지울 수도 있게 허용할 수 있으나 기본적으론 최소 1명
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

  const analyzeImage = async (imageFile) => {
    setIsOcrLoading(true);
    try {
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!reader.result) { reject(new Error('FileReader result가 비어 있습니다.')); return; }
          resolve(reader.result);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(imageFile);
      });
      const mimeType = imageFile.type || 'image/jpeg';

      const processDocumentFn = httpsCallable(functions, 'processDocument');
      const result = await processDocumentFn({ imageBase64: base64Image, mimeType });

      parseGeminiResponse(result.data);

    } catch (error) {
      console.error('[OCR] 오류:', error);
      alert('이미지 분석 중 오류가 발생했습니다. 직접 입력해주세요.');
    } finally {
      setIsOcrLoading(false);
    }
  };

  const parseGeminiResponse = (data) => {
    try {
      const aiResult = data?.result;
      if (!aiResult) return;

      const docType = aiResult.documentType || 'list';
      setDocumentType(docType);

      let rawMembers = [];
      if (Array.isArray(aiResult.members)) {
        rawMembers = aiResult.members;
      }

      const newMembers = [];
      const formatDateForInput = (raw) => {
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
        return '';
      };

      rawMembers.forEach((aiMember) => {
        const rel = aiMember.relation || (docType === 'family' ? '가족' : '본인');
        const m = createDefaultMember(rel);

        if (aiMember.name)      { m.name = aiMember.name; m.isAiGenerated.name = true; }
        if (aiMember.phone)     { m.phone = cleanPhone(aiMember.phone); m.isAiGenerated.phone = true; }
        if (aiMember.birth)     { 
          m.birthDate = formatDateForInput(aiMember.birth); 
          m.isAiGenerated.birthDate = true; 
        }
        
        if (aiMember.role !== undefined) {
          m.position = normalizePosition(aiMember.role);
          m.isAiGenerated.position = true;
        }
        if (aiMember.residence) { 
          m.residenceStatus = normalizeResidence(aiMember.residence); 
          m.isAiGenerated.residenceStatus = true; 
        }
        if (aiMember.company) { 
          m.company = aiMember.company; 
          m.isAiGenerated.company = true; 
        }
        if (aiMember.department) { 
          m.department = aiMember.department; 
          m.isAiGenerated.department = true; 
        } else if (aiMember.birth) {
          m.department = calculateDepartment(aiMember.birth);
          m.isAiGenerated.department = true;
        }

        // 개별 메타데이터나 주소가 있다면 (특히 개인이나 리스트에서)
        if (docType !== 'family' && aiMember.address) {
          setAddress(aiMember.address); // 단순화: 마지막 사람 주소 사용
          setAddressAi(true);
        }
        
        newMembers.push(m);
      });

      if (newMembers.length > 0) {
        setMembers(newMembers);
      }
      
      const typeLabel = docType === 'family' ? '가족 등록 카드' : docType === 'individual' ? '개인 등록 카드' : '성도 명단';
      setAiSummary(`분석 완료: [${typeLabel}] 문서에서 총 ${newMembers.length}명의 인물을 추출했습니다.`);

    } catch (error) {
      console.error('파싱 오류:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (members.length === 0 || !members[0]?.name) return;

    setLoading(true);
    try {
      let imageUrl = '';
      if (file) {
        const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
        const snapshot   = await uploadBytes(storageRef, file);
        imageUrl         = await getDownloadURL(snapshot.ref);
      }

      // 1. familyId 부여
      let currentFamilyId = null;
      if (documentType === 'family') {
        currentFamilyId = familyId || `fam_${Date.now()}`;
        
        const familyData = {
          address,
          metadata: familyMetadata,
          updatedAt: serverTimestamp(),
        };
        if (imageUrl) familyData.imageUrl = imageUrl;

        if (familyId) {
          await updateDoc(doc(db, 'families', familyId), familyData);
        } else {
          familyData.createdAt = serverTimestamp();
          const batchFamily = writeBatch(db);
          batchFamily.set(doc(collection(db, 'families'), currentFamilyId), familyData);
          await batchFamily.commit();
        }
      }

      // 2. 모든 개별 성도를 "독립된 문서"로 일괄 저장 (Batch Write 적용)
      const batch = writeBatch(db);

      for (const member of members) {
        if (!member.name) continue;

        const { isAiGenerated, id, ...memberData } = member;
        const finalMemberData = { ...memberData, updatedAt: serverTimestamp() };

        if (currentFamilyId) {
          finalMemberData.familyId = currentFamilyId;
        }
        if (address) finalMemberData.address = address;
        if (imageUrl && documentType !== 'family') finalMemberData.imageUrl = imageUrl;

        // 중복 체크 (이름 + 생년월일)
        const q = query(
          collection(db, 'members'),
          where('name', '==', memberData.name),
          where('birthDate', '==', memberData.birthDate || '')
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // 중복 시 기존 문서 업데이트 (merge)
          const existingDocRef = querySnapshot.docs[0].ref;
          batch.update(existingDocRef, finalMemberData);
        } else {
          // 신규 생성
          const newDocRef = doc(collection(db, 'members'));
          batch.set(newDocRef, { ...finalMemberData, createdAt: serverTimestamp() });
        }
      }

      // 트랜잭션 일괄 커밋
      await batch.commit();

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('등록 중 오류 발생:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInputClass = (isAiFilled) => {
    const base = 'w-full bg-transparent border-b py-1.5 text-sm focus:outline-none transition-colors ';
    return isAiFilled
      ? base + 'border-red-400/80 text-red-400 bg-red-500/10 px-2 rounded-t font-medium'
      : base + 'border-white/10 text-white focus:border-indigo-500';
  };

  const metadataKeys = Object.keys(familyMetadata);

  return (
    <div className="relative flex flex-col h-full bg-[#1e1e2e] text-gray-200">
      {isOcrLoading && (
        <div className="absolute inset-0 z-50 bg-[#13131f]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
          <div className="bg-[#1e1e2e] p-8 rounded-2xl shadow-2xl flex flex-col items-center border border-white/10">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">AI가 문서를 분석 중입니다...</h3>
            <p className="text-sm text-indigo-300">문서 타입을 판별하고 정보를 추출하고 있습니다.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col h-full p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              새 등록
            </h3>
            <p className="text-xs text-gray-400 mt-1">등록 카드나 명단을 업로드하면 AI가 동적으로 폼을 구성합니다.</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white transition-colors p-2">
            <X size={20} />
          </button>
        </div>

        {/* 폼 타입 선택기 (수동 변경 가능) */}
        <div className="flex bg-[#13131f] p-1 rounded-xl mb-6 border border-white/5">
          {[
            { id: 'individual', label: '개인', icon: User },
            { id: 'family', label: '가족', icon: Users },
            { id: 'list', label: '리스트', icon: List }
          ].map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                setDocumentType(type.id);
                if (type.id === 'individual' && members.length > 1) {
                  setMembers([members[0]]);
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${
                documentType === type.id 
                  ? 'bg-indigo-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <type.icon size={16} />
              {type.label}
            </button>
          ))}
        </div>

        {aiSummary && (
          <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl flex items-center text-indigo-300 text-sm animate-in fade-in slide-in-from-top-4">
            <Info className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="font-medium">{aiSummary}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
          {/* 사진 첨부 */}
          <div className="bg-[#13131f] p-4 rounded-xl border border-white/5">
            <label className="text-sm font-medium text-gray-300 block mb-2">이미지 스캔본 첨부</label>
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
                {file ? file.name : '클릭하거나 파일을 드래그하여 업로드 (AI가 타입 자동 판별)'}
              </span>
            </div>
          </div>

          {/* 가족 폼일 경우: 공통 주소 및 메타데이터 */}
          {(documentType === 'family' || documentType === 'individual') && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                {documentType === 'family' ? '가족 공통 주소' : '주소'}
              </label>
              <input
                type="text"
                value={address}
                onChange={handleAddressChange}
                disabled={isOcrLoading}
                placeholder="상세 주소 입력"
                className={getInputClass(addressAi) + ' text-base py-2.5 px-4 rounded-xl bg-[#13131f] border'}
              />
            </div>
          )}

          {documentType === 'family' && (
            <div className="bg-[#13131f] rounded-xl border border-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMetadata(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                  상세 정보 보기/수정
                </span>
                {showMetadata ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showMetadata && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                  {metadataKeys.map((key) => (
                    <div key={key}>
                      <label className="block text-[10px] text-gray-500 mb-1">{key}</label>
                      <input
                        type="text"
                        value={familyMetadata[key] || ''}
                        onChange={(e) => handleMetadataChange(key, e.target.value)}
                        disabled={isOcrLoading}
                        className="w-full bg-transparent border-b border-white/20 py-1.5 text-sm focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-white/5">
                    <div className="grid grid-cols-2 gap-2">
                      {['이전교회', '입국일', '직업', '학교', '가훈', '기도제목', '세례일', '등록일'].map((key) => {
                        if (familyMetadata[key] !== undefined) return null;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setFamilyMetadata(prev => ({ ...prev, [key]: '' }))}
                            className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-lg px-2 py-1.5 text-left"
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
          )}

          {/* 구성원 리스트 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mt-4">
              <label className="text-sm font-medium text-gray-300">
                {documentType === 'individual' ? '개인 정보' : `인원 리스트 (${members.length}명)`}
              </label>
              {documentType !== 'individual' && (
                <button
                  type="button"
                  onClick={addMember}
                  disabled={isOcrLoading}
                  className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                >
                  <Plus size={14} /> 인원 추가
                </button>
              )}
            </div>

            {members.map((member, index) => (
              <div key={member.id} className="p-4 bg-[#1a1a2e] border border-white/5 rounded-xl relative flex flex-col gap-4">
                {documentType !== 'individual' && (
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-semibold text-indigo-400">
                      No. {index + 1} {documentType === 'family' && member.relation ? `(${member.relation})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                <div className={`grid gap-3 w-full ${documentType === 'list' ? 'grid-cols-2 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-3'}`}>
                  {documentType === 'family' && (
                    <div className="col-span-2 lg:col-span-1">
                      <label className="block text-[10px] text-gray-500 mb-1">관계</label>
                      <input
                        type="text"
                        value={member.relation}
                        onChange={(e) => handleMemberChange(member.id, 'relation', e.target.value)}
                        className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  )}
                  <div className={documentType === 'list' ? 'col-span-1' : 'col-span-2 lg:col-span-1'}>
                    <label className="block text-[10px] text-gray-500 mb-1">이름</label>
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => handleMemberChange(member.id, 'name', e.target.value)}
                      style={{ color: member.isAiGenerated?.name ? '#f87171' : 'inherit' }}
                      className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">직분</label>
                    <select
                      value={member.position}
                      onChange={(e) => handleMemberChange(member.id, 'position', e.target.value)}
                      style={{ color: member.isAiGenerated?.position ? '#f87171' : 'inherit' }}
                      className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    >
                      {positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">생년월일</label>
                    <input
                      type="date"
                      value={member.birthDate}
                      onChange={(e) => handleMemberChange(member.id, 'birthDate', e.target.value)}
                      style={{ color: member.isAiGenerated?.birthDate ? '#f87171' : 'inherit' }}
                      className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">전화번호</label>
                    <input
                      type="text"
                      value={member.phone}
                      onChange={(e) => handleMemberChange(member.id, 'phone', e.target.value)}
                      style={{ color: member.isAiGenerated?.phone ? '#f87171' : 'inherit' }}
                      className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  {(documentType === 'individual' || documentType === 'list') && (
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">회사/직장</label>
                      <input
                        type="text"
                        value={member.company}
                        onChange={(e) => handleMemberChange(member.id, 'company', e.target.value)}
                        style={{ color: member.isAiGenerated?.company ? '#f87171' : 'inherit' }}
                        className="w-full bg-[#13131f] border border-white/5 rounded-lg px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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
            ) : '저장하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
