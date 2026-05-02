import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import MemberForm from '../components/MemberForm';
import { Loader2, ArrowLeft, Edit3 } from 'lucide-react';

export default function FamilyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchFamily = async () => {
      try {
        const docRef = doc(db, 'families', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFamily({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.error('No such document!');
        }
      } catch (error) {
        console.error('Error fetching document:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFamily();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#13131f]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!family) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#13131f] text-white">
        <p className="mb-4">가족 정보를 찾을 수 없습니다.</p>
        <button onClick={() => navigate(-1)} className="text-indigo-400 hover:underline">돌아가기</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#13131f] text-gray-200 p-6">
      <div className="max-w-4xl mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span>목록으로</span>
          </button>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Edit3 size={16} />
              수정
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#1e1e2e] rounded-2xl border border-white/10 shadow-xl overflow-hidden">
          {isEditing ? (
            <div className="p-6">
              <MemberForm
                initialData={family}
                familyId={family.id}
                onCancel={() => setIsEditing(false)}
                onImageChange={() => {}}
                onSuccess={() => {
                  setIsEditing(false);
                  // Force reload to get updated data
                  window.location.reload();
                }}
              />
            </div>
          ) : (
            <div className="p-8 space-y-8">
              <h2 className="text-2xl font-bold text-white">가족 상세 정보</h2>
              
              <div>
                <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">기본 정보</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">주소:</span> {family.address || '-'}</div>
                  <div><span className="text-gray-500">등록일:</span> {family.createdAt?.toDate().toLocaleDateString() || '-'}</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">메타데이터</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {Object.entries(family.metadata || {}).map(([key, value]) => (
                    <div key={key}><span className="text-gray-500">{key}: </span> {value}</div>
                  ))}
                  {Object.keys(family.metadata || {}).length === 0 && <p className="text-gray-500">메타데이터 없음</p>}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">구성원 정보</h3>
                <div className="space-y-4">
                  {(family.members || []).map((m, idx) => (
                    <div key={idx} className="bg-[#13131f] p-4 rounded-xl border border-white/5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-500 text-xs block mb-1">이름</span>{m.name || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">관계</span>{m.relation || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">직분</span>{m.position || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">전화번호</span>{m.phone || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">생년월일</span>{m.birthDate || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">부서</span>{m.department || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">거주지</span>{m.residenceStatus || '-'}</div>
                        <div><span className="text-gray-500 text-xs block mb-1">출석</span>{m.attendanceStatus || '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {family.imageUrl && (
                <div>
                  <h3 className="text-lg font-semibold text-indigo-400 mb-3 border-b border-white/10 pb-2">교적 카드 스캔본</h3>
                  <img src={family.imageUrl} alt="교적카드" className="max-w-full h-auto rounded-lg border border-white/10" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
