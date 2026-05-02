import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';

// ──────────────────────────────────────────────────────────────────────────────
// 역할(Role) 정의
// ──────────────────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'admin',       // 담임목사 (한재윤, 이수정) — 읽기/쓰기 전체 권한
  STAFF: 'staff',       // 교역자 — 읽기 전용 (목사님 승인 후)
  PENDING: 'pending',   // 최초 로그인 후 승인 대기 중
};

// 관리자로 자동 지정할 이메일 목록 (Firebase 콘솔 프로젝트 설정 시 교체)
const ADMIN_EMAILS = ['yahpc100@gmail.com'];

// ──────────────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Firebase Auth user
  const [profile, setProfile] = useState(null); // Firestore user profile (role 포함)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Firebase Auth 상태 감지 ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userProfile = await fetchOrCreateProfile(firebaseUser);
          setUser(firebaseUser);
          setProfile(userProfile);
        } catch (err) {
          console.error('프로필 로드 오류:', err);
          setError(err.message);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── Firestore 사용자 프로필 가져오기 / 최초 생성 ───────────────────────────
  async function fetchOrCreateProfile(firebaseUser) {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);
    const isAdminEmail = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase());

    if (snap.exists()) {
      const profileData = snap.data();

      // 관리자 이메일 배열에 포함되어 있으나 DB상 권한이 admin이 아닌 경우 강제 업데이트
      if (isAdminEmail && profileData.role !== ROLES.ADMIN) {
        await setDoc(userRef, {
          role: ROLES.ADMIN,
          approvedAt: serverTimestamp(),
          approvedBy: 'system'
        }, { merge: true });

        return {
          ...profileData,
          role: ROLES.ADMIN,
        };
      }

      return profileData;
    }

    // 최초 로그인: 이메일에 따라 역할 자동 부여
    const newProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      role: isAdminEmail ? ROLES.ADMIN : ROLES.PENDING,
      createdAt: serverTimestamp(),
      approvedAt: isAdminEmail ? serverTimestamp() : null,
      approvedBy: isAdminEmail ? 'system' : null,
    };

    await setDoc(userRef, newProfile);
    return newProfile;
  }

  // ── 구글 로그인 ──────────────────────────────────────────────────────────────
  async function loginWithGoogle() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged가 자동으로 처리
    } catch (err) {
      console.error('로그인 오류:', err);
      setError('로그인에 실패했습니다. 다시 시도해 주세요.');
      throw err;
    }
  }

  // ── 로그아웃 ─────────────────────────────────────────────────────────────────
  async function logout() {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('로그아웃 오류:', err);
    }
  }

  // ── 권한 헬퍼 ────────────────────────────────────────────────────────────────
  const isAdmin = profile?.role === ROLES.ADMIN;
  const isStaff = profile?.role === ROLES.STAFF;
  const isPending = profile?.role === ROLES.PENDING;
  const isApproved = isAdmin || isStaff; // 앱 접근 가능 여부

  const value = {
    user,
    profile,
    loading,
    error,
    loginWithGoogle,
    logout,
    isAdmin,
    isStaff,
    isPending,
    isApproved,
    ROLES,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── 커스텀 훅 ──────────────────────────────────────────────────────────────────
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}
