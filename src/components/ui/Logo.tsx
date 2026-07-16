export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="storeos-logo-grad" x1="8" y1="6" x2="8" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {/* Top diamond outline */}
      <path
        d="M24 6 L40 16 L24 26 L8 16 Z"
        stroke="url(#storeos-logo-grad)"
        strokeWidth="3.4"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Middle chevron */}
      <path
        d="M8 24 L24 34 L40 24"
        stroke="url(#storeos-logo-grad)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Bottom chevron */}
      <path
        d="M8 32 L24 42 L40 32"
        stroke="url(#storeos-logo-grad)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
