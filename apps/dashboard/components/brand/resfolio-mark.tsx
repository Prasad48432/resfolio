type ResfolioMarkProps = {
  size?: number;
  accent?: string;
  className?: string;
};

export default function ResfolioMark({
  size = 28,
  accent = "#ff6a3d",
  className = "",
}: ResfolioMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="2 1 28 30"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient
          id="resfolioGradient"
          x1="5"
          y1="1"
          x2="27"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffa06b" />
          <stop offset="45%" stopColor="#ff7b4e" />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>

      <path
        d="M8 2H18L27 11V26.5C27 28.43 25.43 30 23.5 30H8C6.07 30 4.5 28.43 4.5 26.5V5.5C4.5 3.57 6.07 2 8 2Z"
        stroke="url(#resfolioGradient)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M18 2V11H27"
        stroke="url(#resfolioGradient)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect
        x="10"
        y="8.5"
        width="5.2"
        height="5.2"
        rx="0.75"
        transform="rotate(45 14.1 10.8)"
        fill={accent}
      />

      <rect x="9.5" y="18" width="11.5" height="1" rx="0.5" fill={accent} />
      <rect x="9.5" y="20.8" width="9" height="1" rx="0.5" fill={accent} />
      <rect x="9.5" y="23.6" width="6.5" height="1" rx="0.5" fill={accent} />
    </svg>
  );
}
