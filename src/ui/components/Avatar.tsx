import { useMemo, useState } from 'react';
import type { FaceDef } from '@/data/faces';
import { avatarDataUri, type AvatarOptions } from '@/gen/avatar';
import { faceUrl, pickFace } from '@/gen/face';

/**
 * A person's photo portrait (src/gen/face.ts): `face` when the caller knows it (a person in a shift, see faceFor),
 * else one picked by the seed. The drawing shows while there is no photo pool, or when the image does not load.
 */
export function Avatar({
  seed,
  size = 40,
  className,
  face: given,
  ...o
}: AvatarOptions & { seed: number; size?: number; className?: string; face?: FaceDef }) {
  const drawn = useMemo(
    () => avatarDataUri(seed, o),
    [seed, o.gender, o.age, o.hair, o.hairColor, o.beard, o.glasses, o.uniform, o.eyes],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = useMemo(
    () =>
      given ??
      pickFace(seed, { gender: o.gender, age: o.age, hair: o.hair, hairColor: o.hairColor, beard: o.beard }),
    [given, seed, o.gender, o.age, o.hair, o.hairColor, o.beard],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const [failed, setFailed] = useState<string | null>(null);
  const photo = picked && failed !== picked.id ? picked : undefined;
  return (
    <img
      className={`ui-avatar${photo ? ' ui-avatar--photo' : ''}${className ? ' ' + className : ''}`}
      src={photo ? faceUrl(photo) : drawn}
      width={size}
      height={size}
      alt=""
      draggable={false}
      loading="lazy"
      onError={photo ? () => setFailed(photo.id) : undefined}
    />
  );
}
