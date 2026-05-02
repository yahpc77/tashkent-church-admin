import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Search,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  Church,
  Quote,
  Heart,
  Users,
  AlertCircle,
  Loader2,
  UserPlus,
} from 'lucide-react';

// ── 뱃지 색상 매핑 ──────────────────────────────────────────────────────────────
const RESIDENCE_STYLE = {
  타슈켄트: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/30' },
  한국:     { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  default:  { bg: 'bg-gray-500/20',   text: 'text-gray-300',    border: 'border-gray-500/30'   },
};

const POSITION_STYLE = {
  목사:   { bg: 'bg-amber-500/20',  text: 'text-amber-300',   border: 'border-amber-500/30'  },
  전도사: { bg: 'bg-amber-500/15',  text: 'text-amber-200',   border: 'border-amber-500/25'  },
  장로:   { bg: 'bg-violet-500/20', text: 'text-violet-300',  border: 'border-violet-500/30' },
  권사:   { bg: 'bg-pink-500/20',   text: 'text-pink-300',    border: 'border-pink-500/30'   },
  집사:   { bg: 'bg-sky-500/20',    text: 'text-sky-300',     border: 'border-sky-500/30'    },
  성도:   { bg: 'bg-white/5',       text: 'text-gray-400',    border: 'border-white/10'      },
  default:{ bg: 'bg-white/5',       text: 'text-gray-400',    border: 'border-white/10'      },
};

const META_ICON = {
  school:         { icon: GraduationCap, label: '학교' },
  job:            { icon: Briefcase,     label: '직업' },
  previousChurch: { icon: Church,        label: '이전교회' },
};

// ── 스켈레톤 카드 ────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-[#1e1e2e] border border-white/8 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="h-5 w-24 bg-white/10 rounded-md" />
          <div className="h-3.5 w-16 bg-white/7 rounded-md" />
        </div>
        <div className="h-5 w-16 bg-white/10 rounded-full" />
      </div>
      <div className="h-3.5 w-32 bg-white/7 rounded-md mb-5" />
      <div className="flex gap-2">
        <div className="h-5 w-14 bg-white/7 rounded-full" />
        <div className="h-5 w-18 bg-white/7 rounded-full" />
      </div>
    </div>
  );
}

// ── 빈 상태 UI ──────────────────────────────────────────────────────────────────
function EmptyState({ isSearching }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-5 ring-1 ring-white/10">
        <Users size={36} className="text-gray-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-300 mb-2">
        {isSearching ? '검색 결과 없음' : '등록된 성도가 없습니다'}
      </h3>
      <p className="text-sm text-gray-500 max-w-xs">
        {isSearching
          ? '검색 조건에 맞는 성도가 없습니다.\n검색어나 필터를 바꿔 다시 시도해 주세요.'
          : '아직 등록된 성도 정보가 없습니다.\n신규 등록 버튼을 통해 첫 성도를 등록해 주세요.'}
      </p>
    </div>
  );
}

// ── 멤버 카드 ────────────────────────────────────────────────────────────────────
function MemberCard({ member }) {
  const navigate = useNavigate();
  const { name, position, residence, phone, metadata = {}, members = [] } = member;

  // 직분 표시: 비어있으면 '성도'
  const displayPosition = position || members[0]?.position || members[0]?.role || '성도';
  const displayName     = name || members[0]?.name || '이름 없음';
  const displayPhone    = phone || members[0]?.phone || '';
  const displayResidence= residence || (members[0]?.residenceStatus === '해외/한국' ? '한국' : members[0]?.residenceStatus === '타지' ? '타슈켄트' : '');

  const residenceStyle = RESIDENCE_STYLE[displayResidence] ?? RESIDENCE_STYLE.default;
  const positionStyle  = POSITION_STYLE[displayPosition]  ?? POSITION_STYLE.default;

  // metadata 칩 목록 (존재하는 항목만)
  const metaChips = Object.entries(META_ICON).filter(([key]) => metadata[key]);

  // 감성적 텍스트 (motto / prayerRequest)
  const highlight = metadata.motto || metadata.prayerRequest || null;
  const highlightLabel = metadata.motto ? '가훈' : '기도제목';

  // 가족 수
  const familyCount = members.length;

  return (
    <article
      onClick={() => navigate(`/family/${member.id}`)}
      className="
        group relative bg-[#1e1e2e] border border-white/8 rounded-2xl p-5 flex flex-col gap-4
        hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-900/20
        hover:-translate-y-0.5 transition-all duration-200 ease-out cursor-pointer
      "
    >
      {/* 거주지 뱃지 — 우측 상단 */}
      {displayResidence && (
        <span
          className={`
            absolute top-4 right-4 text-[10px] font-semibold px-2.5 py-1 rounded-full
            border backdrop-blur-sm
            ${residenceStyle.bg} ${residenceStyle.text} ${residenceStyle.border}
          `}
        >
          {displayResidence}
        </span>
      )}

      {/* 헤더: 이름 + 직분 */}
      <div className="pr-16">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold text-white tracking-tight leading-none">
            {displayName}
          </h3>
          {familyCount > 1 && (
            <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
              <Users size={10} />
              {familyCount}인 가족
            </span>
          )}
        </div>
        <span
          className={`
            mt-1.5 inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border
            ${positionStyle.bg} ${positionStyle.text} ${positionStyle.border}
          `}
        >
          {displayPosition}
        </span>
      </div>

      {/* 연락처 */}
      {displayPhone ? (
        <a
          href={`tel:${displayPhone.replace(/\s/g, '')}`}
          onClick={(e) => e.stopPropagation()}
          className="
            flex items-center gap-2 text-sm text-gray-400
            hover:text-indigo-300 transition-colors group/phone w-fit
          "
        >
          <span className="
            w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center
            group-hover/phone:bg-indigo-500/20 transition-colors
          ">
            <Phone size={11} className="text-indigo-400" />
          </span>
          <span className="font-mono tracking-wide">{displayPhone}</span>
        </a>
      ) : (
        <span className="flex items-center gap-2 text-sm text-gray-600 italic">
          <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
            <Phone size={11} />
          </span>
          연락처 없음
        </span>
      )}

      {/* 메타데이터 칩 (학교, 직업, 이전교회) */}
      {metaChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {metaChips.map(([key, { icon: Icon, label }]) => (
            <span
              key={key}
              className="
                flex items-center gap-1.5 text-[11px] text-gray-400 bg-white/5
                border border-white/8 px-2.5 py-1 rounded-full
                hover:bg-white/8 transition-colors
              "
              title={`${label}: ${metadata[key]}`}
            >
              <Icon size={10} className="text-gray-500 shrink-0" />
              <span className="truncate max-w-[100px]">{metadata[key]}</span>
            </span>
          ))}
        </div>
      )}

      {/* 감성 하이라이트 (가훈 / 기도제목) */}
      {highlight && (
        <div className="
          relative flex items-start gap-2.5 bg-gradient-to-r from-indigo-500/5 to-transparent
          border-l-2 border-indigo-500/40 pl-3 pr-2 py-2 rounded-r-lg
        ">
          <Quote size={12} className="text-indigo-400/60 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-indigo-400/70 mb-0.5 font-medium">{highlightLabel}</p>
            <p className="text-xs text-gray-400 italic leading-relaxed">{highlight}</p>
          </div>
        </div>
      )}

      {/* 주소 (있을 때만) */}
      {member.address && (
        <div className="flex items-start gap-1.5 text-[11px] text-gray-600 mt-auto pt-2 border-t border-white/5">
          <MapPin size={10} className="shrink-0 mt-0.5" />
          <span className="truncate">{member.address}</span>
        </div>
      )}
    </article>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────────
export default function MemberList() {
  const navigate = useNavigate();
  const [families, setFamilies]           = useState([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [error, setError]                 = useState(null);
  const [searchTerm, setSearchTerm]       = useState('');
  const [filterResidence, setFilterResidence] = useState('전체');

  const residenceFilters = ['전체', '타슈켄트', '한국'];

  // ── Firestore 실시간 구독 ──────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'families'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          // 편의 필드: 세대주 정보를 최상위로 꺼냄 (필터링용)
          _headName:      doc.data().members?.[0]?.name     || '',
          _headResidence: doc.data().members?.[0]?.residenceStatus || '',
        }));
        setFamilies(data);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[MemberList] Firestore 구독 오류:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ── 거주지 매핑 헬퍼 ──────────────────────────────────────────────────────────
  const normalizeResidence = (residenceStatus) => {
    if (!residenceStatus) return '';
    if (residenceStatus === '해외/한국') return '한국';
    if (residenceStatus === '타지' || residenceStatus === '타슈켄트') return '타슈켄트';
    return residenceStatus;
  };

  // ── 클라이언트 사이드 필터링 ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return families.filter((fam) => {
      // 이름 검색 (전 가족 구성원 이름 포함)
      const allNames = (fam.members || []).map((m) => m.name || '').join(' ');
      const matchSearch = !searchTerm || allNames.includes(searchTerm.trim());

      // 거주지 필터
      const headResidence = normalizeResidence(fam._headResidence);
      const matchResidence =
        filterResidence === '전체' ||
        headResidence === filterResidence ||
        (filterResidence === '한국' && fam._headResidence === '해외/한국');

      return matchSearch && matchResidence;
    });
  }, [families, searchTerm, filterResidence]);

  const isSearching = searchTerm.trim().length > 0 || filterResidence !== '전체';

  // ── 에러 UI ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center ring-1 ring-red-500/20">
          <AlertCircle size={28} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-red-300 mb-1">오류가 발생했습니다</h3>
          <p className="text-sm text-gray-500 whitespace-pre-line">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── 상단 컨트롤러 ──────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-white/5 space-y-3 shrink-0">

        {/* 검색창 */}
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            size={15}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="성도 이름으로 검색..."
            className="
              w-full bg-[#13131f] border border-white/10 rounded-xl
              py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-600
              focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30
              transition-all
            "
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* 거주지 필터 토글 버튼 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 shrink-0">거주지</span>
          <div className="flex gap-1.5">
            {residenceFilters.map((filter) => {
              const isActive = filterResidence === filter;
              const style =
                filter === '타슈켄트' ? RESIDENCE_STYLE.타슈켄트 :
                filter === '한국'    ? RESIDENCE_STYLE.한국 :
                null;
              return (
                <button
                  key={filter}
                  onClick={() => setFilterResidence(filter)}
                  className={`
                    text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150
                    ${isActive
                      ? style
                        ? `${style.bg} ${style.text} ${style.border} shadow-sm`
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                      : 'bg-transparent text-gray-500 border-white/10 hover:border-white/20 hover:text-gray-300'
                    }
                  `}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {/* 총 인원 표시 */}
          <span className="ml-auto text-[11px] text-gray-600">
            {isLoading ? '...' : `${filtered.length}가정`}
          </span>
        </div>
      </div>

      {/* ── 메인 카드 그리드 ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {isLoading ? (
          /* 스켈레톤 UI */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* 빈 상태 */
          <div className="grid grid-cols-1">
            <EmptyState isSearching={isSearching} />
          </div>
        ) : (
          /* 카드 그리드 */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((fam) => {
              // families 컬렉션 문서 구조 → MemberCard props 정규화
              const head = fam.members?.[0] || {};
              return (
                <MemberCard
                  key={fam.id}
                  member={{
                    id:        fam.id,
                    name:      head.name,
                    position:  head.role,
                    residence: normalizeResidence(head.residenceStatus),
                    phone:     head.phone,
                    address:   fam.address,
                    metadata:  fam.metadata || {},
                    members:   fam.members  || [],
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── 플로팅 액션 버튼 (FAB) ─────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/add')}
        className="
          fixed bottom-8 right-8 z-50
          flex items-center gap-2.5
          bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
          text-white text-sm font-semibold
          pl-5 pr-6 py-3.5 rounded-full
          shadow-lg shadow-indigo-600/40
          hover:shadow-xl hover:shadow-indigo-600/50
          hover:-translate-y-0.5 active:translate-y-0
          transition-all duration-200 ease-out
          ring-2 ring-indigo-500/20 hover:ring-indigo-400/40
        "
        aria-label="성도 등록"
      >
        <UserPlus size={17} strokeWidth={2.5} />
        <span>성도 등록</span>
      </button>
    </div>
  );
}
