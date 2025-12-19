import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';
import CustomNotebookModal from './CustomNotebookModal';

// 气泡运动范围（相对于内容区域的百分比坐标）
// 为了让气泡几乎可以覆盖到卡片右侧和顶部区域，这里放宽边界，只在四周保留少量安全留白。
const MOVEMENT_BOUNDS = { xMin: 2, xMax: 98, yMin: 6, yMax: 94 };
const BUTTON_ZONE = { xMin: 44, xMax: 56, yMin: 84, yMax: 92 };

interface NotebookBubble {
  notebook_id: string;
  name: string;
  note_count: number;
  size: number;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

const calculateBubbleSize = (noteCount: number): { size: number; fontSize: number } => {
  const baseSize = 160;
  const minSize = 80;
  let size: number;

  if (noteCount <= 10) {
    size = baseSize;
  } else if (noteCount <= 50) {
    size = baseSize - (noteCount - 10) * 0.5;
  } else if (noteCount <= 200) {
    size = 140 - (noteCount - 50) * 0.15;
  } else {
    size = Math.max(minSize, 120 - (noteCount - 200) * 0.1);
  }
  
  size = Math.max(minSize, Math.min(baseSize, size));
  const fontSize = Math.max(10, Math.min(18, size * 0.12));
  return { size: Math.round(size), fontSize: Math.round(fontSize) };
};

const isInsideButtonZone = (xPercent: number, yPercent: number, paddingPercent = 0) => {
  return (
    xPercent > BUTTON_ZONE.xMin - paddingPercent &&
    xPercent < BUTTON_ZONE.xMax + paddingPercent &&
    yPercent > BUTTON_ZONE.yMin - paddingPercent &&
    yPercent < BUTTON_ZONE.yMax + paddingPercent
  );
};

const getRadiusPercent = (sizePx: number, rect: DOMRect) => {
  const radiusPx = sizePx / 2;
  const x = (radiusPx / rect.width) * 100;
  const y = (radiusPx / rect.height) * 100;
  return { x, y, max: Math.max(x, y) };
};

const getBoundsPx = (rect: DOMRect, sizePx: number) => {
  const radius = sizePx / 2;
  return {
    minX: (MOVEMENT_BOUNDS.xMin / 100) * rect.width + radius,
    maxX: (MOVEMENT_BOUNDS.xMax / 100) * rect.width - radius,
    minY: (MOVEMENT_BOUNDS.yMin / 100) * rect.height + radius,
    maxY: (MOVEMENT_BOUNDS.yMax / 100) * rect.height - radius
  };
};

const clampPercentToBounds = (xPercent: number, yPercent: number, sizePx: number, rect: DOMRect) => {
  const bounds = getBoundsPx(rect, sizePx);
  const xPx = (xPercent / 100) * rect.width;
  const yPx = (yPercent / 100) * rect.height;
  const clampedXPx = Math.max(bounds.minX, Math.min(bounds.maxX, xPx));
  const clampedYPx = Math.max(bounds.minY, Math.min(bounds.maxY, yPx));
  return {
    x: (clampedXPx / rect.width) * 100,
    y: (clampedYPx / rect.height) * 100,
    hitX: clampedXPx !== xPx,
    hitY: clampedYPx !== yPx,
    bounds
  };
};

const pushOutOfButtonZone = (
  xPercent: number,
  yPercent: number,
  sizePx: number,
  rect: DOMRect,
  bounds: ReturnType<typeof getBoundsPx>
) => {
  const radiusPx = sizePx / 2;
  const paddingPx = radiusPx;
  const zone = {
    minX: (BUTTON_ZONE.xMin / 100) * rect.width - paddingPx,
    maxX: (BUTTON_ZONE.xMax / 100) * rect.width + paddingPx,
    minY: (BUTTON_ZONE.yMin / 100) * rect.height - paddingPx,
    maxY: (BUTTON_ZONE.yMax / 100) * rect.height + paddingPx
  };

  const xPx = (xPercent / 100) * rect.width;
  const yPx = (yPercent / 100) * rect.height;

  const inside = xPx > zone.minX && xPx < zone.maxX && yPx > zone.minY && yPx < zone.maxY;
  if (!inside) {
    return { x: xPercent, y: yPercent, bounced: false };
  }

  const centerX = (zone.minX + zone.maxX) / 2;
  const centerY = (zone.minY + zone.maxY) / 2;
  const dx = xPx - centerX || 0.0001;
  const dy = yPx - centerY || 0.0001;
  const mag = Math.sqrt(dx * dx + dy * dy) || 1;
  const push = Math.max(radiusPx * 0.6, 8);

  const nextXPx = Math.max(bounds.minX, Math.min(bounds.maxX, xPx + (dx / mag) * push));
  const nextYPx = Math.max(bounds.minY, Math.min(bounds.maxY, yPx + (dy / mag) * push));

  return {
    x: (nextXPx / rect.width) * 100,
    y: (nextYPx / rect.height) * 100,
    bounced: true
  };
};

const generatePosition = (
  existingBubbles: NotebookBubble[],
  size: number,
  rect: DOMRect | null
): { x: number; y: number } => {
  const maxAttempts = 80;

  if (rect) {
    const bounds = getBoundsPx(rect, size);
    const radius = size / 2;
    const toPercent = (val: number, total: number) => (val / total) * 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const xPx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const yPx = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      const xPercent = toPercent(xPx, rect.width);
      const yPercent = toPercent(yPx, rect.height);

      if (isInsideButtonZone(xPercent, yPercent, 8)) continue;

      const overlaps = existingBubbles.some((bubble) => {
        const bxPx = (bubble.x / 100) * rect.width;
        const byPx = (bubble.y / 100) * rect.height;
        const distance = Math.hypot(xPx - bxPx, yPx - byPx);
        return distance < radius + bubble.size / 2 + 8;
      });

      if (!overlaps) {
        return { x: xPercent, y: yPercent };
      }
    }

    const fallbackX = (bounds.minX + bounds.maxX) / 2;
    const fallbackY = (bounds.minY + bounds.maxY) / 2;
    return { x: toPercent(fallbackX, rect.width), y: toPercent(fallbackY, rect.height) };
  }

  const minDistance = size / 10 + 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = MOVEMENT_BOUNDS.xMin + Math.random() * (MOVEMENT_BOUNDS.xMax - MOVEMENT_BOUNDS.xMin);
    const y = MOVEMENT_BOUNDS.yMin + Math.random() * (MOVEMENT_BOUNDS.yMax - MOVEMENT_BOUNDS.yMin);

    if (isInsideButtonZone(x, y, 8)) continue;

    const overlaps = existingBubbles.some((bubble) => {
      const dx = x - bubble.x;
      const dy = y - bubble.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const combinedRadius = size / 10 + bubble.size / 10;
      return distance < combinedRadius + minDistance;
    });
    
    if (!overlaps) {
      return { x, y };
    }
  }
  
  return {
    x: MOVEMENT_BOUNDS.xMin + Math.random() * (MOVEMENT_BOUNDS.xMax - MOVEMENT_BOUNDS.xMin),
    y: MOVEMENT_BOUNDS.yMin + Math.random() * (MOVEMENT_BOUNDS.yMax - MOVEMENT_BOUNDS.yMin)
  };
};

const generateColor = (index: number, total: number): string => {
  const greenShades = [
    'bg-[#c0f7ec]',
    'bg-[#90e2d0]',
    'bg-[#6bd8c0]',
    'bg-[#43ccb0]',
    'bg-[#06c3a8]',
    'bg-[#04b094]'
  ];
  const shadeIndex = Math.floor((index / total) * greenShades.length);
  return greenShades[Math.min(shadeIndex, greenShades.length - 1)];
};

function CreateNote() {
  const navigate = useNavigate();
  const [notebookBubbles, setNotebookBubbles] = useState<NotebookBubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredBubble, setHoveredBubble] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startClientX: number;
    startClientY: number;
    radiusXPercent: number;
    radiusYPercent: number;
    rect: DOMRect;
    bubbleSize: number;
  } | null>(null);

  useEffect(() => {
    draggingIdRef.current = draggingId;
  }, [draggingId]);

  const fetchNotebooks = useCallback(async () => {
    try {
      setLoading(true);
      const rect = containerRef.current?.getBoundingClientRect() || null;
      const notebooksList = await apiClient.getNotebooks();
      const sorted = [...notebooksList].sort((a, b) => a.note_count - b.note_count);
      const bubbles: NotebookBubble[] = [];
      
      sorted.forEach((notebook, index) => {
        const { size, fontSize } = calculateBubbleSize(notebook.note_count);
        const position = generatePosition(bubbles, size, rect);
        const color = generateColor(index, sorted.length);
        const speed = 0.25 + Math.random() * 0.25;
        const angle = Math.random() * Math.PI * 2;
        
        bubbles.push({
          notebook_id: notebook.notebook_id,
          name: notebook.name,
          note_count: notebook.note_count,
          size,
          fontSize,
          color,
          x: position.x,
          y: position.y,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed
        });
      });
      
      setNotebookBubbles(bubbles);
    } catch (error) {
      console.error('获取笔记本列表失败:', error);
      setNotebookBubbles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  useEffect(() => {
    if (loading || notebookBubbles.length === 0) return;

    const animate = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      setNotebookBubbles((prev) =>
        prev.map((bubble) => {
          // 拖动中的气泡由拖拽逻辑接管，不参与自动运动
          if (draggingIdRef.current && bubble.notebook_id === draggingIdRef.current) {
            return bubble;
          }

          const bounds = getBoundsPx(rect, bubble.size);
          const radiusPercent = getRadiusPercent(bubble.size, rect).max;
          const centerXPx = (bubble.x / 100) * rect.width;
          const centerYPx = (bubble.y / 100) * rect.height;
          const velXPx = (bubble.velocityX / 100) * rect.width;
          const velYPx = (bubble.velocityY / 100) * rect.height;

          let newXPx = centerXPx + velXPx;
          let newYPx = centerYPx + velYPx;
          let newVelocityX = bubble.velocityX;
          let newVelocityY = bubble.velocityY;

          if (newXPx <= bounds.minX || newXPx >= bounds.maxX) {
            newVelocityX = -newVelocityX;
            newXPx = Math.max(bounds.minX, Math.min(bounds.maxX, newXPx));
          }
          if (newYPx <= bounds.minY || newYPx >= bounds.maxY) {
            newVelocityY = -newVelocityY;
            newYPx = Math.max(bounds.minY, Math.min(bounds.maxY, newYPx));
          }

          const zoneBounce = pushOutOfButtonZone(
            (newXPx / rect.width) * 100,
            (newYPx / rect.height) * 100,
            bubble.size,
            rect,
            bounds
          );
          if (zoneBounce.bounced) {
            newVelocityX = -newVelocityX;
            newVelocityY = -newVelocityY;
            newXPx = (zoneBounce.x / 100) * rect.width;
            newYPx = (zoneBounce.y / 100) * rect.height;
          }

          if (Math.random() < 0.02) {
            newVelocityX = (Math.random() - 0.5) * 0.5;
            newVelocityY = (Math.random() - 0.5) * 0.5;
          }

          newXPx = Math.max(bounds.minX, Math.min(bounds.maxX, newXPx));
          newYPx = Math.max(bounds.minY, Math.min(bounds.maxY, newYPx));

          return {
            ...bubble,
            x: (newXPx / rect.width) * 100,
            y: (newYPx / rect.height) * 100,
            velocityX: newVelocityX,
            velocityY: newVelocityY
          };
        })
      );

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [loading, notebookBubbles.length]);

  // 处理气泡拖拽
  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (event: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const { rect, startClientX, startClientY, startX, startY, radiusXPercent, radiusYPercent, id, bubbleSize } = state;
      const dx = event.clientX - startClientX;
      const dy = event.clientY - startClientY;

      const deltaXPercent = (dx / rect.width) * 100;
      const deltaYPercent = (dy / rect.height) * 100;

      const bounds = {
        xMin: MOVEMENT_BOUNDS.xMin + radiusXPercent,
        xMax: MOVEMENT_BOUNDS.xMax - radiusXPercent,
        yMin: MOVEMENT_BOUNDS.yMin + radiusYPercent,
        yMax: MOVEMENT_BOUNDS.yMax - radiusYPercent
      };

      let nextX = startX + deltaXPercent;
      let nextY = startY + deltaYPercent;

      const clamped = clampPercentToBounds(nextX, nextY, bubbleSize, rect);
      nextX = clamped.x;
      nextY = clamped.y;

      const pushed = pushOutOfButtonZone(nextX, nextY, bubbleSize, rect, clamped.bounds);
      if (pushed.bounced) {
        nextX = pushed.x;
        nextY = pushed.y;
      }

      setNotebookBubbles((prev) =>
        prev.map((bubble) =>
          bubble.notebook_id === id
            ? {
                ...bubble,
                x: nextX,
                y: nextY,
                velocityX: 0,
                velocityY: 0
              }
            : bubble
        )
      );
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      draggingIdRef.current = null;
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId]);

  useEffect(() => {
    const handleRefresh = () => fetchNotebooks();
    window.addEventListener('notebook:created', handleRefresh);
    window.addEventListener('notebooks:refresh', handleRefresh);
    return () => {
      window.removeEventListener('notebook:created', handleRefresh);
      window.removeEventListener('notebooks:refresh', handleRefresh);
    };
  }, [fetchNotebooks]);

  const handleBubbleClick = (notebookId: string) => {
    navigate(`/notes/${notebookId}`);
  };

  const handleBubbleMouseDown = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    bubble: NotebookBubble
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const radiusPercents = getRadiusPercent(bubble.size, rect);

    dragStateRef.current = {
      id: bubble.notebook_id,
      startX: bubble.x,
      startY: bubble.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      radiusXPercent: radiusPercents.x,
      radiusYPercent: radiusPercents.y,
      rect,
      bubbleSize: bubble.size
    };

    // 直接同步 ref，避免点击事件读取到旧的 dragging 状态导致无法跳转
    draggingIdRef.current = bubble.notebook_id;
    setDraggingId(bubble.notebook_id);
  };

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{ minHeight: '100%' }}
      >
        <div className="absolute inset-0 w-full h-full overflow-hidden" style={{ zIndex: 1 }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-slate-500">加载中...</div>
            </div>
          ) : (
            notebookBubbles.map((bubble) => (
              <div
                key={bubble.notebook_id}
                className={`absolute ${bubble.color} rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 shadow-xl shadow-[#8de2d5]`}
                style={{
                  width: `${bubble.size}px`,
                  height: `${bubble.size}px`,
                  left: `${bubble.x}%`,
                  top: `${bubble.y}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: hoveredBubble && hoveredBubble !== bubble.notebook_id ? 0.6 : 1,
                  fontSize: `${bubble.fontSize}px`
                }}
                onMouseEnter={() => setHoveredBubble(bubble.notebook_id)}
                onMouseLeave={() => setHoveredBubble(null)}
                onMouseDown={(e) => handleBubbleMouseDown(e, bubble)}
                onClick={() => {
                  // 如果刚刚处于拖拽状态，则不触发点击跳转
                  if (!draggingIdRef.current) {
                    handleBubbleClick(bubble.notebook_id);
                  }
                }}
                title={`${bubble.name} (${bubble.note_count} 条笔记)`}
              >
                <span className="text-white font-medium text-center px-2 whitespace-nowrap pointer-events-none select-none">
                  {bubble.name}
                </span>
              </div>
            ))
          )}
        </div>
        
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setShowCustomModal(true)}
            className="px-8 py-4 rounded-full font-medium text-lg bg-black text-white hover:bg-gray-900 hover:scale-105 transition-all"
          >
            + 自定义笔记本
          </button>
        </div>
      </div>

      <CustomNotebookModal
        open={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onCreated={fetchNotebooks}
      />
    </>
  );
}

export default CreateNote;
