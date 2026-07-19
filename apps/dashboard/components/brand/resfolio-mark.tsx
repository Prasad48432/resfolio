import Image from "next/image";

type ResfolioMarkProps = {
  size?: number;
  className?: string;
};

export default function ResfolioMark({
  size = 28,
  className,
}: ResfolioMarkProps) {
  return (
    <Image
      src="/brand/resfolio-square-serif.svg"
      alt="Resfolio"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}
