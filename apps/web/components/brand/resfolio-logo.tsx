import Image from "next/image";

type ResfolioLogoProps = {
  size?: number;
  className?: string;
};

export default function ResfolioLogo({
  size = 180,
  className,
}: ResfolioLogoProps) {
  return (
    <Image
      src="/brand/resfolio-wordmark.svg"
      alt="Resfolio"
      width={size}
      height={(size * 190) / 565} // preserve aspect ratio
      priority
      className={className}
    />
  );
}
