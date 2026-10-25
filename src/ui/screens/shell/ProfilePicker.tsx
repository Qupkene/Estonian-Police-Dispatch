// Profiilipilt (2.35.0): the signed-in player picks how the other players see them, in a room, in a shared shift and
// on the results board. A photo from the game's portraits, found by writing what they want ("naine 30 blond") or with
// the chips, or a drawing of a dispatcher in uniform. Saved to the account (PUT /api/me/avatar).
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/net/account';
import { useT } from '@/i18n';
import type { FaceDef } from '@/data/faces';
import { faceUrl } from '@/gen/face';
import {
  AGE_BANDS,
  avatarValue,
  isEmptyFilter,
  mergeFilters,
  nameSeed,
  parseFaceQuery,
  playerPicture,
  searchFaces,
  type AgeBand,
  type FaceFilter,
  type HairColor,
} from '@/gen/faceSearch';
import { Button, Modal, PlayerAvatar, playerDrawing, Segmented, TextField } from '@/ui/components';

/** Faces shown at first and added by "Näita veel". */
const PAGE = 48;

type Tab = 'photo' | 'drawing';
type Sex = 'any' | 'M' | 'F';
type Hair = 'any' | 'blond' | 'brown' | 'black' | 'grey' | 'red';

const HAIRS: Record<Exclude<Hair, 'any'>, HairColor[]> = {
  blond: ['blond'],
  brown: ['brown'],
  black: ['black'],
  grey: ['grey', 'white'],
  red: ['red'],
};

export function ProfilePicker({ onClose }: { onClose: () => void }) {
  const t = useT();
  const user = useAccount((s) => s.user);
  const name = user?.name ?? '?';
  const stored = user?.avatar ?? '';
  const [value, setValue] = useState(stored);
  const [tab, setTab] = useState<Tab>(() =>
    playerPicture(stored, name).kind === 'face' ? 'photo' : 'drawing',
  );
  const [query, setQuery] = useState('');
  const [sex, setSex] = useState<Sex>('any');
  const [age, setAge] = useState<AgeBand | 'any'>('any');
  const [hair, setHair] = useState<Hair>('any');
  const [beard, setBeard] = useState(false);
  const [bald, setBald] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chips: FaceFilter = {
    ...(sex !== 'any' ? { gender: sex } : {}),
    ...(age !== 'any' ? { ageMin: AGE_BANDS[age][0], ageMax: AGE_BANDS[age][1] } : {}),
    ...(hair !== 'any' ? { hair: HAIRS[hair] } : {}),
    ...(beard ? { beard: true } : {}),
    ...(bald ? { bald: true } : {}),
  };
  const filter = mergeFilters(chips, parseFaceQuery(query));
  const filterKey = JSON.stringify(filter);
  const found = useMemo(() => searchFaces(filter), [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [filterKey]);

  const picked = playerPicture(value, name);
  const drawSeed = picked.kind === 'draw' ? picked.seed : nameSeed(name);
  const save = async () => {
    setSaving(true);
    setError(null);
    const ok = await useAccount.getState().setAvatar(value);
    setSaving(false);
    if (ok) onClose();
    else setError(t('profile.error'));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('profile.title')}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('profile.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={saving || value === stored}
            data-testid="profile-save"
          >
            {saving ? t('profile.saving') : t('profile.save')}
          </Button>
        </>
      }
    >
      <div className="vk-prof" data-testid="profile-picker">
        <div className="vk-prof__me">
          <PlayerAvatar avatar={value} name={name} size={88} className="vk-prof__big" />
          <div>
            <strong>{name}</strong>
            <p className="vk-dim">{t('profile.lead')}</p>
          </div>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label={t('profile.title')}
          options={[
            { value: 'photo', label: t('profile.tab.photo') },
            { value: 'drawing', label: t('profile.tab.drawing') },
          ]}
        />
        {tab === 'photo' ? (
          <>
            <TextField
              value={query}
              onChange={setQuery}
              icon="search"
              placeholder={t('profile.search')}
              aria-label={t('profile.search')}
              data-testid="profile-search"
            />
            <div className="vk-prof__chips">
              <ChipRow<Sex>
                label={t('profile.sex')}
                value={sex}
                onChange={setSex}
                options={[
                  ['any', t('profile.any')],
                  ['M', t('profile.sex.M')],
                  ['F', t('profile.sex.F')],
                ]}
              />
              <ChipRow<AgeBand | 'any'>
                label={t('profile.age')}
                value={age}
                onChange={setAge}
                options={[
                  ['any', t('profile.any')],
                  ...(Object.keys(AGE_BANDS) as AgeBand[]).map((b): [AgeBand, string] => [
                    b,
                    t(`profile.age.${b}`),
                  ]),
                ]}
              />
              <ChipRow<Hair>
                label={t('profile.hair')}
                value={hair}
                onChange={setHair}
                options={[
                  ['any', t('profile.any')],
                  ...(Object.keys(HAIRS) as Exclude<Hair, 'any'>[]).map((h): [Hair, string] => [
                    h,
                    t(`profile.hair.${h}`),
                  ]),
                ]}
              />
              <div className="vk-prof__row" role="group" aria-label={t('profile.more')}>
                <span className="vk-label">{t('profile.more')}</span>
                <button
                  type="button"
                  className={`vk-prof__chip${beard ? ' is-on' : ''}`}
                  aria-pressed={beard}
                  onClick={() => setBeard(!beard)}
                >
                  {t('profile.beard')}
                </button>
                <button
                  type="button"
                  className={`vk-prof__chip${bald ? ' is-on' : ''}`}
                  aria-pressed={bald}
                  onClick={() => setBald(!bald)}
                >
                  {t('profile.bald')}
                </button>
              </div>
            </div>
            <p className="vk-prof__count" role="status" data-testid="profile-count">
              {found.faces.length === 0
                ? t('profile.none')
                : found.nearest
                  ? t('profile.nearest', { n: found.faces.length })
                  : isEmptyFilter(filter)
                    ? t('profile.all', { n: found.faces.length })
                    : t('profile.found', { n: found.faces.length })}
            </p>
            <ul className="vk-prof__grid" data-testid="profile-faces">
              {found.faces.slice(0, shown).map((f) => (
                <li key={f.id}>
                  <FaceButton
                    face={f}
                    selected={picked.kind === 'face' && picked.face.id === f.id}
                    onPick={() => setValue(avatarValue({ kind: 'face', face: f }))}
                    label={t('profile.pick', { age: f.age })}
                  />
                </li>
              ))}
            </ul>
            {found.faces.length > shown && (
              <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                {t('profile.more.faces', { n: Math.min(PAGE, found.faces.length - shown) })}
              </Button>
            )}
          </>
        ) : (
          <div className="vk-prof__draw">
            <img src={playerDrawing(drawSeed)} width={120} height={120} alt="" className="ui-avatar" />
            <div className="vk-prof__drawActions">
              <Button
                variant="primary"
                onClick={() =>
                  setValue(avatarValue({ kind: 'draw', seed: (drawSeed * 1103515245 + 12345) >>> 0 }))
                }
                data-testid="profile-shuffle"
              >
                {t('profile.shuffle')}
              </Button>
              <Button variant="ghost" onClick={() => setValue('')}>
                {t('profile.byName')}
              </Button>
              <p className="vk-dim">{t('profile.drawing.lead')}</p>
            </div>
          </div>
        )}
        {error && (
          <p className="vk-msg is-bad" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ChipRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="vk-prof__row" role="radiogroup" aria-label={label}>
      <span className="vk-label">{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`vk-prof__chip${value === v ? ' is-on' : ''}`}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function FaceButton({
  face,
  selected,
  onPick,
  label,
}: {
  face: FaceDef;
  selected: boolean;
  onPick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`vk-prof__face${selected ? ' is-on' : ''}`}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onPick}
      data-face={face.id}
    >
      <img src={faceUrl(face)} width={96} height={96} alt="" loading="lazy" draggable={false} />
    </button>
  );
}
