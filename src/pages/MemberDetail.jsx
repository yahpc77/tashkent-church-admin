import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Loader2, ArrowLeft, Users, Edit3, Save, X } from 'lucide-react';

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchMember = async () => {
      try {
        const docRef = doc(db, 'members', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMember({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.error('No such document!');
        }
      } catch (error) {
        console.error('Error fetching document:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMember();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#13131f]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#13131f] text-white">
        <p className="mb-4">성도 정보를 찾을 수 없습니다.</p>
        <button onClick={() => navigate(-1)} className="text-indigo-400 hover:underline">돌아가기</button>
      </div>
    );
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) {
      return '-';
    }
  };

  // Safe date formatter for <input type="date">
  const formatDateForInput = (raw) => {
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return ''; // Invalid format => empty string
  };

  const handleEditClick = () => {
    setEditForm({
      ...member,
      birthDate: formatDateForInput(member.birthDate),
      visitLogStr: (member.visitLog || []).join('\n\n')
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'members', id);
      const updatedData = {
        name: editForm.name,
        relation: editForm.relation,
        position: editForm.position,
        company: editForm.company,
        phone: editForm.phone,
        birthDate: editForm.birthDate,
        department: editForm.department,
        residenceStatus: editForm.residenceStatus,
        attendanceStatus: editForm.attendanceStatus,
        personalPrayer: editForm.personalPrayer,
        visitLog: editForm.visitLogStr.split('\n\n').map(s => s.trim()).filter(Boolean),
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updatedData);
      
      // Update local state
      setMember(prev => ({
        ...prev,
        ...updatedData,
        visitLog: updatedData.visitLog
      }));
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating document:', error);
      alert('수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#13131f] text-gray-200 p-6">
      <div className="max-w-4xl mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span>목록으로</span>
          </button>
          
          <div className="flex items-center gap-3">
            {!isEditing && (
              <button
                onClick={handleEditClick}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10"
              >
                <Edit3 size={16} />
                수정하기
              </button>
            )}
            
            {member.familyId && (
              <button
                onClick={() => navigate(`/family/${member.familyId}`)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Users size={16} />
                우리 가족 전체 보기
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#1e1e2e] rounded-2xl border border-white/10 shadow-xl overflow-hidden p-8 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              {isEditing ? '개인 상세 정보 수정' : '개인 상세 정보'}
            </h2>
            {isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  <X size={16} /> 취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 저장
                </button>
              </div>
            )}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">기본 정보</h3>
            {isEditing ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">이름</label>
                  <input type="text" name="name" value={editForm.name || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">관계</label>
                  <input type="text" name="relation" value={editForm.relation || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">직분</label>
                  <input type="text" name="position" value={editForm.position || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">회사/직장</label>
                  <input type="text" name="company" value={editForm.company || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">전화번호</label>
                  <input type="text" name="phone" value={editForm.phone || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">생년월일</label>
                  <input type="date" name="birthDate" value={editForm.birthDate || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">부서</label>
                  <input type="text" name="department" value={editForm.department || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">거주지</label>
                  <select name="residenceStatus" value={editForm.residenceStatus || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white">
                    <option value="타슈켄트">타슈켄트</option>
                    <option value="한국">한국</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">출석 여부</label>
                  <select name="attendanceStatus" value={editForm.attendanceStatus || ''} onChange={handleChange} className="w-full bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 focus:border-indigo-500 outline-none text-white">
                    <option value="출석">출석</option>
                    <option value="미출석">미출석</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                <div><span className="text-gray-500 block text-xs mb-1">이름</span> <span className="font-medium text-lg text-white">{member.name || '-'}</span></div>
                <div><span className="text-gray-500 block text-xs mb-1">관계</span> {member.relation || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">직분</span> {member.position || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">회사/직장</span> {member.company || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">전화번호</span> {member.phone || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">생년월일</span> {member.birthDate || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">등록일</span> {formatDate(member.createdAt)}</div>
                <div><span className="text-gray-500 block text-xs mb-1">부서</span> {member.department || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">거주지</span> {member.residenceStatus || '-'}</div>
                <div><span className="text-gray-500 block text-xs mb-1">출석 여부</span> {member.attendanceStatus || '-'}</div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">신앙 활동 내역</h3>
            <div className="bg-[#13131f] p-5 rounded-xl border border-white/5 space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <label className="text-gray-400 text-xs font-semibold block mb-1">개인 기도제목</label>
                    <textarea 
                      name="personalPrayer" 
                      value={editForm.personalPrayer || ''} 
                      onChange={handleChange} 
                      className="w-full bg-[#1e1e2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 outline-none resize-y min-h-[100px]"
                      placeholder="기도제목을 자유롭게 입력하세요..."
                    />
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <label className="text-gray-400 text-xs font-semibold block mb-2">심방 기록 (항목별로 줄바꿈하여 두 줄 띄기로 구분)</label>
                    <textarea 
                      name="visitLogStr" 
                      value={editForm.visitLogStr || ''} 
                      onChange={handleChange} 
                      className="w-full bg-[#1e1e2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 outline-none resize-y min-h-[120px]"
                      placeholder="예) 2026-05-01: 봄 대심방 완료\n\n2026-06-15: 생일 심방"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-gray-400 text-xs font-semibold block mb-1">개인 기도제목</span>
                    <p className="text-sm text-gray-300 min-h-[2.5rem] whitespace-pre-line">
                      {member.personalPrayer || '등록된 개인 기도제목이 없습니다.'}
                    </p>
                  </div>
                  
                  <div className="pt-4 border-t border-white/5">
                    <span className="text-gray-400 text-xs font-semibold block mb-2">심방 기록</span>
                    {member.visitLog && member.visitLog.length > 0 ? (
                      <ul className="space-y-2">
                        {member.visitLog.map((log, idx) => (
                          <li key={idx} className="text-sm text-gray-300 bg-white/5 p-3 rounded-lg border border-white/5 whitespace-pre-line">
                            {log}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">심방 기록이 없습니다.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
