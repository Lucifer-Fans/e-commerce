import useSettings from '../../settings/useSettings';

/**
 * The store's logo and name, wherever they appear — header, footer, auth screens.
 *
 * Both come from admin settings. Until a logo is uploaded the mark falls back to
 * the first letter of the store name on a brand tile, which is what the storefront
 * shipped with, so an unconfigured install still looks finished.
 *
 * The name is rendered alongside the logo rather than replaced by it: a logo may be
 * an icon rather than a wordmark, and losing the name would cost the header its
 * only text label. Pass `showName={false}` where the layout already says it.
 */

const SIZES = {
  sm: { box: 'h-9 w-9 text-lg', logo: 'h-9', name: 'text-base' },
  md: { box: 'h-10 w-10 text-xl', logo: 'h-10', name: 'text-lg' },
};

export default function BrandMark({
  size = 'sm',
  showName = true,
  className = '',
  nameClassName = '',
  tileClassName = '',
}) {
  const { siteName, logoUrl } = useSettings();
  const s = SIZES[size] || SIZES.sm;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={siteName}
          // Height-constrained with a free width so a wordmark isn't squashed into
          // a square, and capped so an oversized upload can't push the nav around.
          className={`${s.logo} w-auto max-w-[140px] shrink-0 object-contain`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`grid ${s.box} shrink-0 place-items-center rounded-lg bg-brand-600 font-black ${tileClassName}`}
        >
          {siteName.trim().charAt(0).toUpperCase()}
        </span>
      )}

      {showName && (
        <span className={`font-extrabold tracking-tight ${s.name} ${nameClassName}`}>
          {siteName}
        </span>
      )}
    </span>
  );
}
