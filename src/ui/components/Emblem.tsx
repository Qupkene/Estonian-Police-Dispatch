// Original EPD emblem (NOT the PPA logo): shield + cornflower + "EPD". ui-shell may refine the artwork.
export function Emblem({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="EPD" role="img">
      <path d="M32 3 L56 12 V30 C56 45 45 55 32 61 C19 55 8 45 8 30 V12 Z" fill="#0f2a52" stroke="#3d8bff" strokeWidth="2.5" />
      <circle cx="32" cy="27" r="7" fill="#3d6fff" />
      <text x="32" y="50" textAnchor="middle" fontSize="11" fontWeight="700" fill="#eaf1f8" fontFamily="Inter, sans-serif">
        EPD
      </text>
    </svg>
  );
}
