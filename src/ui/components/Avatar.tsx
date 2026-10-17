import { useMemo } from 'react';
import { avatarDataUri, type AvatarOptions } from '@/gen/avatar';

export function Avatar({
  seed,
  size = 40,
  className,
  ...o
}: AvatarOptions & { seed: number; size?: number; className?: string }) {
  const src = useMemo(
    () => avatarDataUri(seed, o),
    [seed, o.gender, o.age, o.hair, o.hairColor, o.beard, o.glasses, o.uniform, o.eyes],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <img
      className={`ui-avatar${className ? ' ' + className : ''}`}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
