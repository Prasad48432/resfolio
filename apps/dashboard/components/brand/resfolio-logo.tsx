import Image from "next/image";

type ResfolioLogoProps = {
  size?: number;
  className?: string;
};

export default function ResfolioLogo({
  size = 180,
  className,
}: ResfolioLogoProps) {
  const height = (size * 190) / 565;

  return (
    <span className={className}>
      {/* Light mode */}
      <Image
        src="/brand/resfolio-wordmark-dark.svg"
        alt="Resfolio"
        width={size}
        height={height}
        priority
        className="hidden dark:block"
      />

      {/* Dark mode */}
      <Image
        src="/brand/resfolio-wordmark.svg"
        alt="Resfolio"
        width={size}
        height={height}
        priority
        className="block dark:hidden"
      />
    </span>
  );
}
