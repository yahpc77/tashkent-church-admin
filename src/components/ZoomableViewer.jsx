import React, { useState, useRef, useEffect } from 'react';

export default function ZoomableViewer({ imageUrl }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartInfo = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Ctrl + 휠 이벤트 처리
      if (e.ctrlKey) {
        e.preventDefault(); // 기본 브라우저 줌 방지
        const zoomSpeed = 0.05;
        let newScale = scale;
        
        if (e.deltaY < 0) {
          // 휠업: 확대
          newScale = scale + zoomSpeed;
        } else {
          // 휠다운: 축소
          newScale = scale - zoomSpeed;
        }
        
        // 최소 0.5배, 최대 5배로 배율 제한
        newScale = Math.min(Math.max(0.5, newScale), 5);
        
        // 1배율 이하로 축소될 경우 위치 초기화
        if (newScale <= 1 && scale > 1) {
          setPosition({ x: 0, y: 0 });
        }
        
        setScale(newScale);
      }
    };

    // wheel 이벤트는 passive: false로 등록해야 preventDefault()가 작동함
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scale]);

  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartInfo.current = {
        x: e.clientX,
        y: e.clientY,
        startX: position.x,
        startY: position.y
      };
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    
    const dx = e.clientX - dragStartInfo.current.x;
    const dy = e.clientY - dragStartInfo.current.y;
    
    setPosition({
      x: dragStartInfo.current.startX + dx,
      y: dragStartInfo.current.startY + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-black/20 rounded-lg flex items-center justify-center relative select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt="Original Document" 
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, 
            transition: isDragging ? 'none' : 'transform 0.1s ease-out' 
          }}
          className={`max-w-full max-h-full object-contain origin-center ${
            scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
          draggable="false"
        />
      ) : (
        <div className="text-gray-500">이미지 또는 문서가 없습니다.</div>
      )}
      
      {/* 줌 배율 표시기 */}
      <div className="absolute bottom-4 left-4 bg-black/60 text-white/90 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 backdrop-blur-sm">
        {Math.round(scale * 100)}% <span className="opacity-60 ml-1">(Ctrl + 휠로 확대/축소)</span>
      </div>
      
      {/* 리셋 버튼 */}
      <button 
        onClick={resetView}
        className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 text-white/90 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 backdrop-blur-sm transition-colors cursor-pointer z-10"
      >
        초기화
      </button>
    </div>
  );
}
