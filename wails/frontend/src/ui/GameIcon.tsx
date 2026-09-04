import type { CSSProperties } from "react";

export function GameIcon({
  src,
  alt = "",
  className = "",
  style,
  size = 16,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`cm-icon ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
      draggable={false}
    />
  );
}
