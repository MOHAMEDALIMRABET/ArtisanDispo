import Link from 'next/link';

interface LogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: () => void;
  className?: string;
}

const sizes = {
  sm: { width: 200, height: 50, className: 'h-10 w-auto' },
  md: { width: 300, height: 75, className: 'h-14 w-auto' },
  lg: { width: 400, height: 100, className: 'h-20 w-auto' },
};

export function Logo({ size = 'md', href = '/', onClick, className }: LogoProps) {
  const { width, height, className: sizeClass } = sizes[size];

  const content = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/Logo-artisandispo.png"
      alt="ArtisanDispo - Trouvez votre artisan de confiance"
      width={width}
      height={height}
      className={`${className ?? sizeClass} object-contain`}
    />
  );

  const wrapperClass = 'inline-flex items-center rounded-md transition-opacity hover:opacity-90';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={wrapperClass} aria-label="Accueil ArtisanDispo">
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return content;
}
