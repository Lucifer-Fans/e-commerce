import { useEffect, useState } from 'react';

/**
 * Circular profile photo with an initial-letter fallback.
 *
 * Google-hosted pictures (lh3.googleusercontent.com) occasionally fail to load —
 * rate limiting, or the user revoking the photo — so a load error quietly falls
 * back to the initial instead of leaving a broken image in the header.
 */
export default function UserAvatar({ user, size = 44, className = '', ring = false }) {
  const url = user?.avatar?.url;
  const [failed, setFailed] = useState(false);

  // A fresh upload must clear a previous failure, otherwise the new photo is skipped.
  useEffect(() => setFailed(false), [url]);

  const base = `grid shrink-0 place-items-center overflow-hidden rounded-full ${
    ring ? 'ring-2 ring-white/70' : ''
  } ${className}`;
  const style = { width: size, height: size };

  if (url && !failed) {
    return (
      <span className={base} style={style}>
        <img
          src={url}
          alt={user?.name ? `${user.name}'s profile photo` : 'Profile photo'}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-brand-600 font-bold text-white`}
      style={{ ...style, fontSize: Math.max(12, Math.round(size * 0.4)) }}
      aria-label={user?.name ? `${user.name}'s profile` : 'Profile'}
    >
      {user?.name?.trim()?.charAt(0).toUpperCase() || '?'}
    </span>
  );
}
