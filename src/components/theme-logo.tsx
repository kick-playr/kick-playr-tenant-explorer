'use client';
/* eslint-disable @next/next/no-img-element -- getImageProps provides Next-optimized local image sources. */
import { getImageProps } from 'next/image';
import { useClubBranding } from './club-branding-provider';
/** CSS selects the asset before first paint; theme metadata owns the variant. */
export function ThemeLogo({
  className = '',
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const club = useClubBranding();
  const image = (variant: 'black' | 'white') =>
    getImageProps({
      src:
        (variant === 'black'
          ? club?.branding?.logoLight
          : (club?.branding?.logoDark ?? club?.branding?.logoLight)
        )?.dataUrl ?? `/brand/kick-playr-logo-${variant}.png`,
      alt: '',
      width: 64,
      height: 64,
      loading: priority ? 'eager' : 'lazy',
    }).props;
  return (
    <span
      className={`theme-logo ${className}`}
      role="img"
      aria-label="Kick Playr"
    >
      <img className="theme-logo-on-light" {...image('black')} alt="" />
      <img className="theme-logo-on-dark" {...image('white')} alt="" />
    </span>
  );
}

/** Keep the artwork and wordmark separate, as in the Kick Playr website header. */
export function BrandLogo({ priority = false }: { priority?: boolean }) {
  const club = useClubBranding();
  const name =
    club?.branding?.name ||
    (club?.branding?.logoLight || club?.branding?.logoDark
      ? club.clubName
      : null);
  return (
    <span className="brand-lockup">
      <span aria-hidden="true">
        <ThemeLogo priority={priority} />
      </span>
      <span className="brand-copy">
        <span className="brand-wordmark">
          {name ?? 'kick-playr'}
          {!name && <b>.</b>}
        </span>
        <small className="brand-tagline">Platform console</small>
      </span>
    </span>
  );
}
