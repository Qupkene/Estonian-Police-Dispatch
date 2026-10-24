import { useMemo, useState } from 'react';
import { avatarDataUri, type AvatarOptions } from '@/gen/avatar';
import { faceUrl, pickFace } from '@/gen/face';

export function Avatar({
  seed,
  size = 40,
  className,
  photo = false,
  ...o
}: AvatarOptions & {
  seed: number;
  size?: number;
  className?: string;
  /** A photo portrait for a made-up civilian (src/gen/face.ts); the drawing stays for officers, public figures and legends. */
  photo?: boolean;
}) {
  const drawn = useMemo(
    () => avatarDataUri(seed, o),
    [seed, o.gender, o.age, o.hair, o.hairColor, o.beard, o.glasses, o.uniform, o.eyes],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const face = useMemo(
    () =>
      photo && !o.uniform
        ? pickFace(seed, {
            gender: o.gender,
            age: o.age,
            hair: o.hair,
            hairColor: o.hairColor,
            beard: o.beard,
          })
        : undefined,
    [photo, seed, o.gender, o.age, o.hair, o.hairColor, o.beard, o.uniform],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const [failed, setFailed] = useState<string | null>(null);
  const src = face && failed !== face.id ? faceUrl(face) : drawn;
  return (
    <img
      className={`ui-avatar${face && failed !== face.id ? ' ui-avatar--photo' : ''}${className ? ' ' + className : ''}`}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      loading="lazy"
      onError={face ? () => setFailed(face.id) : undefined}
    />
  );
}
