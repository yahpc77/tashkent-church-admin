import React, { useState } from 'react';
import { collection, query, where, getDocs, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function BulkUpdateModal({ isOpen, onClose, onSuccess }) {
  const [department, setDepartment] = useState('');
  const [namesText, setNamesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!department.trim() || !namesText.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const names = namesText
        .split(/[\n,]+/)
        .map(n => n.trim())
        .filter(Boolean);
      
      const uniqueNames = [...new Set(names)];

      let successCount = 0;
      let failedNames = [];

      // Query all names. We process them in parallel.
      const queryPromises = uniqueNames.map(async (name) => {
        const q = query(collection(db, 'members'), where('name', '==', name));
        const snapshot = await getDocs(q);
        return { name, docs: snapshot.docs };
      });

      const queryResults = await Promise.all(queryPromises);

      const batch = writeBatch(db);
      let operationsCount = 0;

      for (const result of queryResults) {
        if (result.docs.length > 0) {
          result.docs.forEach(docSnap => {
            batch.update(docSnap.ref, {
              departments: arrayUnion(department.trim())
            });
            operationsCount++;
          });
          successCount += result.docs.length;
        } else {
          failedNames.push(result.name);
        }
      }

      if (operationsCount > 0) {
        await batch.commit();
      }

      setResult({
        successCount,
        failedNames,
      });

      if (successCount > 0) {
        if (onSuccess) onSuccess();
      }

    } catch (error) {
      console.error('Bulk update failed:', error);
      alert('일괄 업데이트 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-[#1e1e2e] rounded-2xl w-full max-w-lg shadow-2xl border border-white/10 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white">부서 일괄 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" disabled={loading}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {result ? (
            <div className="flex flex-col items-center justify-center text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 ring-1 ring-emerald-500/20">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">업데이트 완료</h3>
              <p className="text-gray-300 text-sm mb-4">
                성공적으로 <span className="font-bold text-indigo-400">{result.successCount}명</span>의 데이터를 업데이트했습니다.
              </p>
              {result.failedNames.length > 0 && (
                <div className="w-full text-left bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-2">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-2">
                    <AlertCircle size={16} /> 다음 인원은 데이터베이스에서 찾을 수 없습니다:
                  </div>
                  <p className="text-xs text-red-300/80 leading-relaxed">
                    {result.failedNames.join(', ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <form id="bulkUpdateForm" onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">추가할 부서명</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="예) 찬양대, 예배부"
                  className="w-full bg-[#13131f] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                  required
                />
                <p className="text-xs text-gray-500 mt-1.5">입력한 부서가 각 대상자의 '다중 부서' 항목에 추가됩니다. (기존 부서는 보존됨)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">대상자 이름 명단</label>
                <textarea
                  value={namesText}
                  onChange={(e) => setNamesText(e.target.value)}
                  placeholder="홍길동, 김철수, 이영희&#10;또는 줄바꿈으로 구분하여 입력하세요."
                  className="w-full bg-[#13131f] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none transition-colors min-h-[160px] resize-y"
                  required
                />
              </div>
            </form>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end gap-3 bg-[#1e1e2e] shrink-0 rounded-b-2xl">
          {result ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-white/10 text-white hover:bg-white/15 transition-colors"
            >
              닫기
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                form="bulkUpdateForm"
                disabled={loading || !department.trim() || !namesText.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-600/20"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? '업데이트 중...' : '일괄 추가 실행'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
