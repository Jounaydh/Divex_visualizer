import { useEffect, useRef } from "react";

export function EditorMinimap({
  content,
  activeLine,
  onNavigate,
}: {
  content: string;
  activeLine: number;
  onNavigate: (line: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const lines = content.split(/\r?\n/);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    const rowHeight = height / Math.max(1, lines.length);
    const sampleStep = Math.max(1, Math.ceil(lines.length / 1200));
    lines.forEach((line, index) => {
      if (index % sampleStep !== 0) return;
      const trimmed = line.trim();
      if (!trimmed) return;
      const indentation = Math.min(20, line.length - line.trimStart().length);
      const length = Math.min(width - indentation - 4, Math.max(2, trimmed.length * 0.75));
      context.fillStyle = /^(import|export|class|interface|function|def|void)\b/.test(trimmed)
        ? "rgba(174, 190, 211, 0.7)"
        : "rgba(157, 160, 169, 0.42)";
      context.fillRect(2 + indentation * 0.35, index * rowHeight, length, Math.max(1, Math.min(2, rowHeight)));
    });
    const markerY = ((Math.max(1, activeLine) - 1) / Math.max(1, lines.length)) * height;
    context.fillStyle = "rgba(255,255,255,0.35)";
    context.fillRect(0, markerY, width, 2);
  }, [activeLine, content]);

  return (
    <canvas
      ref={canvasRef}
      className="editor-minimap"
      aria-label="Editor minimap"
      onPointerDown={(event) => {
        const lineCount = content.split(/\r?\n/).length;
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientY - bounds.top) / Math.max(1, bounds.height);
        onNavigate(Math.max(1, Math.min(lineCount, Math.round(ratio * lineCount))));
      }}
    />
  );
}
