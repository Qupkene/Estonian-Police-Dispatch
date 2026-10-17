// "Režissööri režiim" tools for filming police movies. Owned by ui-tools. Reads everything from the stores.
import { useEffect, useMemo, useState } from 'react';
import type { IncidentCategory, Priority, RadioMsg, SimState, Text } from '@/sim/types';
import { TEMPLATES } from '@/data/incidents';
import { directorRadio, directorSpawn } from '@/sim/commands';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { Badge, Button, Empty, Icon, PriorityChip, Segmented, Toggle } from '@/ui/components';
import { useDirector } from './directorStore';
import { CATEGORIES, PLACEHOLDER_LABEL, templateMatches } from './lib/helpers';
import { run, useSim } from './lib/engine';
import { SCENES, sceneDuration } from './lib/scenes';
import { playScene, stopScene } from './lib/sceneRunner';
import { Section } from './parts';
import './tools.css';

// ── panel ────────────────────────────────────────────────────────────────────

export function DirectorPanel() {
  const t = useT();
  const sim = useSim();
  const placing = useDirector((d) => d.placing);
  const setPlacing = useDirector((d) => d.setPlacing);

  // Esc cancels map placement.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, setPlacing]);

  if (!sim) {
    return (
      <div className="tl-dir">
        <Empty icon="film" title={t('tools.dir.title')}>
          {t('tools.noSim')}
        </Empty>
      </div>
    );
  }
  if (sim.mode !== 'director') {
    return (
      <div className="tl-dir">
        <Empty icon="film" title={t('tools.dir.title')}>
          {t('tools.dir.only')}
        </Empty>
      </div>
    );
  }
  return (
    <div className="tl-dir">
      {placing && <PlacingBanner sim={sim} />}
      <TemplatePicker />
      <RadioComposer sim={sim} />
      <Teleport sim={sim} />
      <CameraTime />
      <Scenes sim={sim} />
    </div>
  );
}

function PlacingBanner({ sim }: { sim: SimState }) {
  const t = useT();
  const placing = useDirector((d) => d.placing);
  const setPlacing = useDirector((d) => d.setPlacing);
  if (!placing) return null;
  const label = placing.kind === 'incident' ? t('tools.dir.placing') : t('tools.dir.placingUnit', { u: sim.units[placing.unitId]?.callsign ?? placing.unitId });
  return (
    <div className="tl-placing" role="status">
      <Icon name="crosshair" size={16} />
      <span>{label}</span>
      <Button size="sm" variant="ghost" icon="close" onClick={() => setPlacing(null)}>
        {t('tools.dir.cancel')}
      </Button>
    </div>
  );
}

function TemplatePicker() {
  const t = useT();
  const tx = useTx();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<IncidentCategory | 'all'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [sumEt, setSumEt] = useState('');
  const [sumEn, setSumEn] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const priority = useDirector((d) => d.priority);
  const setPriority = useDirector((d) => d.setPriority);
  const setCustomSummary = useDirector((d) => d.setCustomSummary);
  const setPlacing = useDirector((d) => d.setPlacing);
  const placing = useDirector((d) => d.placing);
  const lastSpawned = useDirector((d) => d.lastSpawned);

  const list = useMemo(() => TEMPLATES.filter((tpl) => (cat === 'all' || tpl.category === cat) && templateMatches(tpl, q)), [q, cat]);
  const tpl = sel ? TEMPLATES.find((x) => x.id === sel) : undefined;
  const catsPresent = useMemo(() => CATEGORIES.filter((c) => TEMPLATES.some((x) => x.category === c)), []);

  useEffect(() => {
    const et = sumEt.trim();
    setCustomSummary(et ? { et, en: sumEn.trim() || et } : null);
  }, [sumEt, sumEn, setCustomSummary]);

  useEffect(() => {
    if (!lastSpawned) return;
    const inc = useGame.getState().sim?.incidents[lastSpawned];
    if (inc) setNote(t('tools.dir.spawned', { n: inc.number }));
  }, [lastSpawned]); // eslint-disable-line react-hooks/exhaustive-deps

  const spawnRandom = () => {
    if (!tpl) return;
    const summary: Text | undefined = sumEt.trim() ? { et: sumEt.trim(), en: sumEn.trim() || sumEt.trim() } : undefined;
    const id = run((s) => directorSpawn(s, { templateId: tpl.id, priority: priority ?? undefined, summary }));
    const inc = id ? useGame.getState().sim?.incidents[id] : undefined;
    setNote(inc ? t('tools.dir.spawned', { n: inc.number }) : t('tools.dir.failed'));
  };

  return (
    <Section title={t('tools.dir.templates')} icon="pin" aside={<span className="dim">{list.length}</span>}>
      <div className="tl-dir__filters">
        <span className="tl-reg__inputbox">
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tools.dir.searchPh')} aria-label={t('tools.dir.searchPh')} />
        </span>
        <select className="tl-select" value={cat} onChange={(e) => setCat(e.target.value as IncidentCategory | 'all')} aria-label={t('tools.dir.allCats')}>
          <option value="all">{t('tools.dir.allCats')}</option>
          {catsPresent.map((c) => (
            <option key={c} value={c}>
              {t(`tools.cat.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <ul className="tl-tpls" role="listbox" aria-label={t('tools.dir.templates')}>
        {list.length === 0 && <li className="tl-muted-line">{t('tools.dir.noTemplates')}</li>}
        {list.slice(0, 120).map((x) => (
          <li key={x.id} role="option" aria-selected={x.id === sel}>
            <button type="button" className={`tl-tpl${x.id === sel ? ' is-on' : ''}`} onClick={() => setSel(x.id)}>
              <PriorityChip p={x.priority} compact />
              <span className="tl-tpl__code mono">{x.code}</span>
              <span className="tl-tpl__title">{tx(x.title)}</span>
              <span className="tl-tpl__cat">{t(`tools.cat.${x.category}`)}</span>
            </button>
          </li>
        ))}
      </ul>

      {tpl && (
        <div className="tl-tpl-detail">
          <div className="tl-tpl-detail__head">
            <PriorityChip p={priority ?? tpl.priority} />
            <strong>{tx(tpl.title)}</strong>
            {tpl.legacy && <Badge tone="gold">2024</Badge>}
          </div>
          {tpl.summary[0] && (
            <p className="tl-tpl-detail__sum">
              {tx(tpl.summary[0])
                .split(/(\{\w+\})/)
                .map((part, i) =>
                  /^\{\w+\}$/.test(part) ? (
                    <span key={i} className="tl-ph">
                      {tx(PLACEHOLDER_LABEL[part.slice(1, -1)] ?? part.slice(1, -1))}
                    </span>
                  ) : (
                    part
                  ),
                )}
            </p>
          )}
          <div className="tl-tpl-detail__need">
            {t('tools.dir.need')}: {tpl.units.need.map((n) => `${n.count}× ${t(`tools.unit.${n.type}`)}`).join(', ') || '—'}
          </div>
        </div>
      )}

      <div className="tl-field">
        <span className="tl-field__label">{t('tools.dir.priority')}</span>
        <Segmented<'tpl' | '1' | '2' | '3' | '4'>
          size="sm"
          label={t('tools.dir.priority')}
          value={priority ? (String(priority) as '1') : 'tpl'}
          onChange={(v) => setPriority(v === 'tpl' ? null : (Number(v) as Priority))}
          options={[
            { value: 'tpl', label: t('tools.dir.prioDefault') },
            { value: '1', label: 'P1' },
            { value: '2', label: 'P2' },
            { value: '3', label: 'P3' },
            { value: '4', label: 'P4' },
          ]}
        />
      </div>

      <div className="tl-field">
        <span className="tl-field__label">{t('tools.dir.summary')}</span>
        <textarea className="tl-textarea" rows={2} value={sumEt} onChange={(e) => setSumEt(e.target.value)} placeholder={t('tools.dir.summaryEt')} aria-label={t('tools.dir.summaryEt')} />
        <input className="tl-input" value={sumEn} onChange={(e) => setSumEn(e.target.value)} placeholder={t('tools.dir.summaryEn')} aria-label={t('tools.dir.summaryEn')} />
      </div>

      <div className="tl-dir__actions">
        <Button
          variant="primary"
          icon="crosshair"
          disabled={!tpl}
          className={placing?.kind === 'incident' ? 'is-armed' : undefined}
          onClick={() => tpl && setPlacing({ kind: 'incident', templateId: tpl.id })}
        >
          {t('tools.dir.place')}
        </Button>
        <Button icon="target" disabled={!tpl} onClick={spawnRandom}>
          {t('tools.dir.random')}
        </Button>
        {note && <span className="tl-dir__note">{note}</span>}
      </div>
    </Section>
  );
}

function RadioComposer({ sim }: { sim: SimState }) {
  const t = useT();
  const [from, setFrom] = useState('JK');
  const [level, setLevel] = useState<RadioMsg['level']>('routine');
  const [et, setEt] = useState('');
  const [en, setEn] = useState('');
  const [sent, setSent] = useState(false);
  const units = sim.unitOrder.map((id) => sim.units[id]).filter(Boolean);

  const send = () => {
    const txt = et.trim();
    if (!txt) return;
    run((s) => directorRadio(s, from, { et: txt, en: en.trim() || txt }, level));
    setEt('');
    setEn('');
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };

  return (
    <Section title={t('tools.dir.radio')} icon="radio">
      <div className="tl-dir__row">
        <label className="tl-field tl-field--inline">
          <span className="tl-field__label">{t('tools.dir.from')}</span>
          <select className="tl-select" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="JK">{t('tools.dir.jk')}</option>
            <option value="HK">{t('tools.dir.hk')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.callsign}>
                {u.callsign}
              </option>
            ))}
          </select>
        </label>
        <Segmented<RadioMsg['level']>
          size="sm"
          label={t('tools.dir.level')}
          value={level}
          onChange={setLevel}
          options={[
            { value: 'routine', label: t('tools.dir.level.routine') },
            { value: 'priority', label: t('tools.dir.level.priority') },
            { value: 'emergency', label: t('tools.dir.level.emergency') },
          ]}
        />
      </div>
      <textarea
        className={`tl-textarea tl-textarea--${level}`}
        rows={2}
        value={et}
        onChange={(e) => setEt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
        }}
        placeholder={t('tools.dir.textEt')}
        aria-label={t('tools.dir.textEt')}
      />
      <input className="tl-input" value={en} onChange={(e) => setEn(e.target.value)} placeholder={t('tools.dir.textEn')} aria-label={t('tools.dir.textEn')} />
      <div className="tl-dir__actions">
        <Button variant={level === 'emergency' ? 'danger' : 'primary'} icon="send" kbd="Ctrl+↵" disabled={!et.trim()} onClick={send}>
          {t('tools.dir.send')}
        </Button>
        {sent && <span className="tl-dir__note">{t('tools.dir.sent')}</span>}
      </div>
    </Section>
  );
}

function Teleport({ sim }: { sim: SimState }) {
  const t = useT();
  const units = sim.unitOrder.map((id) => sim.units[id]).filter(Boolean);
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? '');
  const setPlacing = useDirector((d) => d.setPlacing);
  const placing = useDirector((d) => d.placing);
  return (
    <Section title={t('tools.dir.teleport')} icon="crosshair">
      <div className="tl-dir__row">
        <select className="tl-select tl-select--grow" value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label={t('tools.dir.teleport')}>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.callsign} · {t(`tools.unit.${u.type}`)}
            </option>
          ))}
        </select>
        <Button
          icon="pin"
          disabled={!unitId}
          className={placing?.kind === 'teleport' ? 'is-armed' : undefined}
          onClick={() => unitId && setPlacing({ kind: 'teleport', unitId })}
        >
          {t('tools.dir.teleportBtn')}
        </Button>
      </div>
    </Section>
  );
}

function CameraTime() {
  const t = useT();
  const hud = useGame((g) => g.hud);
  const realtime = useGame((g) => g.realtime);
  return (
    <Section title={t('tools.dir.camera')} icon="film">
      <div className="tl-dir__toggles">
        <Toggle checked={hud} onChange={(v) => useGame.getState().setHud(v)} label={t('tools.dir.hud')} />
        <Toggle checked={realtime} onChange={(v) => useGame.getState().setRealtime(v)} label={t('tools.dir.realtime')} />
      </div>
    </Section>
  );
}

const SCENE_ICON = { car: 'car', shield: 'shield', fire: 'fire', snow: 'snow' } as const;

function Scenes({ sim }: { sim: SimState }) {
  const t = useT();
  const tx = useTx();
  const scene = useDirector((d) => d.scene);
  return (
    <Section title={t('tools.dir.scenes')} icon="film">
      {sim.regionId !== 'pohja' && <p className="tl-muted-line">{t('tools.dir.scenesNote')}</p>}
      <ul className="tl-scenes" role="list">
        {SCENES.map((sc) => {
          const running = scene?.id === sc.id;
          return (
            <li key={sc.id} className={`tl-scene${running ? ' is-running' : ''}`}>
              <span className="tl-scene__icon">
                <Icon name={SCENE_ICON[sc.icon]} size={18} />
              </span>
              <span className="tl-scene__text">
                <strong>{tx(sc.title)}</strong>
                <span>{tx(sc.desc)}</span>
                {running && scene && (
                  <span className="tl-scene__prog">
                    <i style={{ width: `${(scene.step / scene.total) * 100}%` }} />
                    <em>{t('tools.dir.step', { i: scene.step, n: scene.total })}</em>
                  </span>
                )}
              </span>
              <span className="tl-scene__dur mono">{t('tools.dir.secs', { n: sceneDuration(sc) })}</span>
              {running ? (
                <Button size="sm" variant="danger" icon="pause" onClick={stopScene}>
                  {t('tools.dir.stop')}
                </Button>
              ) : (
                <Button size="sm" icon="play" onClick={() => playScene(sc)}>
                  {t('tools.dir.play')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
