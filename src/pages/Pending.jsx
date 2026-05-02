import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, LogOut } from 'lucide-react';

export default function Pending() {
  const { user, isApproved, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (isApproved) {
      navigate('/');
    }
  }, [user, isApproved, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#13131f] text-gray-100">
      <div className="w-full max-w-md p-10 bg-[#1e1e2e] rounded-3xl border border-white/10 shadow-2xl text-center">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20">
            <Clock size={40} className="text-yellow-500 animate-pulse" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-4 tracking-tight">승인 대기 중</h1>
        <p className="text-gray-400 mb-10 leading-relaxed text-sm">
          <span className="text-white font-medium">{user?.displayName}</span>님의 계정은 현재 승인 대기 상태입니다.<br/><br/>
          담임목사님의 시스템 접근 승인 후,<br/>교역자 전용(읽기) 권한으로 입장하실 수 있습니다.
        </p>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 w-full bg-[#2a2a3d] hover:bg-[#35354a] transition-all py-3.5 px-4 rounded-xl font-medium text-sm text-gray-300 hover:text-white"
        >
          <LogOut size={18} />
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
