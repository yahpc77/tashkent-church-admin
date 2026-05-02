import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ZoomableViewer from '../components/ZoomableViewer';
import MemberForm from '../components/MemberForm';
import MemberList from '../components/MemberList';
import { LogOut, User, Plus } from 'lucide-react';

export default function Dashboard() {
  const { profile, logout, isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'register'
  const [previewImage, setPreviewImage] = useState(null);
  // 모바일 환경에서 원본 교적 문서 토글 상태를 관리하는 State (기본값: 숨김)
  const [isDocVisibleOnMobile, setIsDocVisibleOnMobile] = useState(false);
  const handleRegisterClick = () => {
    setViewMode('register');
    setPreviewImage(null);
  };

  const handleCancelRegister = () => {
    setViewMode('list');
    setPreviewImage(null);
  };

  const handleSuccessRegister = () => {
    setViewMode('list');
    setPreviewImage(null);
  };

  const defaultImageUrl = "https://images.unsplash.com/photo-1568283094545-ef059b011dc0?q=80&w=1000&auto=format&fit=crop";

  return (
    <div className="h-screen flex flex-col bg-[#13131f] text-gray-100 font-sans">
      {/* Header (기존과 동일) */}
      <header className="h-16 bg-[#1e1e2e]/80 backdrop-blur-md border-b border-white/10 px-6 flex items-center justify-between shrink-0 z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-sm font-bold text-white">TKC</span>
          </div>
          <h1 className="text-lg font-semibold text-white tracking-tight">가족등록 및 행정 관리</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-[#2a2a3d] px-3 py-1.5 rounded-full border border-white/5">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden border border-indigo-500/30">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={14} className="text-indigo-400" />
              )}
            </div>
            <div className="flex flex-col pr-2">
              <span className="text-xs font-medium text-white leading-tight">{profile?.displayName}</span>
              <span className="text-[10px] text-indigo-300 leading-tight">
                {isAdmin ? '최고 관리자' : '교역자 (읽기전용)'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content (반응형 및 토글 로직 적용) */}
      {/* 모바일에서는 세로 스크롤 허용(overflow-y-auto), PC에서는 숨김(md:overflow-hidden) */}
      <main className="flex-1 overflow-y-auto md:overflow-hidden p-4 md:p-6">
        {/* 모바일: 세로 배치(flex-col), PC: 가로 배치(md:flex-row) */}
        <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">

          {/* 📱 모바일 전용 토글 버튼 (PC에서는 md:hidden으로 숨김) */}
          <button
            onClick={() => setIsDocVisibleOnMobile(!isDocVisibleOnMobile)}
            className="md:hidden w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-colors border border-indigo-500/50 shrink-0"
          >
            {isDocVisibleOnMobile ? '⬆️ 원본 교적 문서 닫기' : '⬇️ 원본 교적 문서 보기'}
          </button>

          {/* Left Panel: Zoomable Viewer */}
          {/* 모바일: isDocVisibleOnMobile 상태에 따라 보이기/숨기기, 높이 50vh 제한. PC: 항상 보이고(md:flex) 너비 50%(md:w-1/2) */}
          <div className={`w-full md:w-1/2 min-h-[50vh] md:h-full flex-col ${isDocVisibleOnMobile ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-200">원본 교적 문서</h2>
              {/* 모바일에서는 불필요한 단축키 안내 숨김 */}
              <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-md hidden md:block">Ctrl + 휠 줌 지원</span>
            </div>
            <div className="flex-1 bg-[#1e1e2e] rounded-2xl border border-white/10 shadow-xl overflow-hidden p-3 relative group">
              <ZoomableViewer imageUrl={previewImage || defaultImageUrl} />
            </div>
          </div>

          {/* Right Panel: Data Management */}
          {/* 모바일: 너비 100%(w-full), PC: 너비 50%(md:w-1/2) */}
          <div className="w-full md:w-1/2 h-auto md:h-full flex flex-col shrink-0 md:shrink">
            {viewMode === 'list' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-200">가족 등록 데이터</h2>
                  {isAdmin && (
                    <button
                      onClick={handleRegisterClick}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
                    >
                      <Plus size={16} />
                      신규 등록
                    </button>
                  )}
                </div>

                <div className="flex-1 bg-[#1e1e2e] rounded-2xl border border-white/10 shadow-xl flex flex-col overflow-hidden">
                  <MemberList />
                </div>
              </>
            ) : (
              <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-xl flex flex-col min-h-[500px] md:min-h-0">
                <MemberForm
                  onCancel={handleCancelRegister}
                  onImageChange={setPreviewImage}
                  onSuccess={handleSuccessRegister}
                />
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
} //