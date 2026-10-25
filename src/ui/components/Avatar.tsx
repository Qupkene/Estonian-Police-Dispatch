import { useMemo, useState } from 'react';
import type { FaceDef } from '@/data/faces';
import { avatarDataUri, type AvatarOptions } from '@/gen/avatar';
import { faceUrl, pickFace } from '@/gen/face';
import { nameSeed, playerPicture } from '@/gen/faceSearch';

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

/** The drawing of a player (a dispatcher in uniform): its look follows the seed. */
export function playerDrawing(seed: number): string {
  return avatarDataUri(seed, { gender: seed & 1 ? 'M' : 'F', age: 24 + ((seed >>> 1) % 32), uniform: true });
}

/**
 * A player's profile picture (2.35.0, src/gen/faceSearch.ts): the face they picked from the game's portraits, or a
 * drawing (their own seed, or their name's until they choose). Falls back to the name's drawing if the photo does
 * not load.
 */
export function PlayerAvatar({
  avatar,
  name,
  size = 28,
  className,
}: {
  avatar?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const pic = useMemo(() => playerPicture(avatar, name), [avatar, name]);
  const fallback = useMemo(() => playerDrawing(nameSeed(name)), [name]);
  const [failed, setFailed] = useState(false);
  const src =
    pic.kind === 'face' && !failed
      ? faceUrl(pic.face)
      : pic.kind === 'draw'
        ? playerDrawing(pic.seed)
        : fallback;
  return (
    <img
      className={`ui-avatar ui-player${pic.kind === 'face' && !failed ? ' ui-avatar--photo' : ''}${className ? ' ' + className : ''}`}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      loading="lazy"
      data-avatar={avatar || 'default'}
      onError={pic.kind === 'face' ? () => setFailed(true) : undefined}
    />
  );
}
