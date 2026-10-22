// Custom game (kohandatud mäng, src/sim/custom.ts): the prefecture and the area, then the draft. "On to the briefing"
// hands the setup to the briefing screen, which adds the date, the time and the conditions and starts the shift.
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { useT, useTx } from '@/i18n';
import { REGION_IDS } from '@/data/regions';
import { adaptSetup, budgetOf, costOf, defaultSetup, parseCustom, type CustomSetup } from '@/sim/custom';
import { normalizeArea, sectorsOf } from '@/sim/sectors';
import type { RegionId } from '@/sim/types';
import { Segmented } from '@/ui/components';
import { ShellPage, useEnter } from '../shell/ShellPage';
import { CustomEditor } from './CustomEditor';
import '../shell/lobby.css';
import './custom.css';

const KEY = 'epd:custom';

interface Saved {
  regionId: RegionId;
  sectors: string[];
  setup: CustomSetup;
}

/** The last custom game (a per-browser convenience: nothing breaks without it). */
function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (!v.regionId || !REGION_IDS.includes(v.regionId)) return null;
    const setup = parseCustom(v.setup, v.regionId);
    if (!setup) return null;
    return { regionId: v.regionId, sectors: normalizeArea(v.regionId, v.sectors ?? []), setup };
  } catch {
    return null;
  }
}

function save(v: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

export function CustomScreen() {
  const t = useT();
  const tx = useTx();
  const briefing = useGame((s) => s.briefing);
  const setBriefing = useGame((s) => s.setBriefing);
  const setScreen = useGame((s) => s.setScreen);
  const [state, setState] = useState<Saved>(() => {
    // Back from the briefing: what was there; else the last custom game; else the standard force of Põhja.
    if (briefing.custom && briefing.regionId) {
      const setup = parseCustom(briefing.custom, briefing.regionId);
      if (setup)
        return {
          regionId: briefing.regionId,
          sectors: normalizeArea(briefing.regionId, briefing.sectors ?? []),
          setup,
        };
    }
    return loadSaved() ?? { regionId: 'pohja', sectors: [], setup: defaultSetup('pohja', []) };
  });
  const { regionId, sectors, setup } = state;
  useEffect(() => save(state), [state]);

  const all = sectorsOf(regionId);
  const budget = useMemo(() => budgetOf(regionId, sectors), [regionId, sectors]);
  const over = setup.budget !== false && costOf(regionId, setup) > budget;
  const ready = setup.crews.length > 0 && !over;

  const setRegion = (r: RegionId) => {
    if (r === regionId) return;
    setState({ regionId: r, sectors: [], setup: { ...defaultSetup(r, []), budget: setup.budget } });
  };
  const toggleSector = (id: string) => {
    const next = sectors.includes(id) ? sectors.filter((x) => x !== id) : [...sectors, id];
    const area = normalizeArea(regionId, next);
    setState({ regionId, sectors: area, setup: adaptSetup(regionId, area, setup) });
  };
  const whole = () => setState({ regionId, sectors: [], setup: adaptSetup(regionId, [], setup) });

  const next = () => {
    if (!ready) return;
    setBriefing({ mode: 'free', regionId, sectors, custom: setup });
    setScreen('briefing');
  };
  useEnter(next);

  return (
    <ShellPage
      title={t('custom.title')}
      subtitle={t('custom.subtitle')}
      onBack={() => setScreen('menu')}
      backTo="menu"
      actions={
        <button
          type="button"
          className="vk-btn vk-btn--primary vk-go"
          onClick={next}
          disabled={!ready}
          data-sfx="click"
        >
          <span>{t('custom.next')}</span>
          <span className="vk-go__key" aria-hidden="true">
            ⏎
          </span>
        </button>
      }
      className="vk-cu-page"
    >
      <section className="vk-panel vk-cu-page__area" aria-labelledby="vk-cu-area">
        <div className="vk-panel__head">
          <h2 className="vk-h" id="vk-cu-area">
            {t('custom.area')}
          </h2>
        </div>
        <div className="vk-cu-page__areaBody">
          <Segmented<RegionId>
            size="sm"
            label={t('shell.brief.region')}
            value={regionId}
            onChange={setRegion}
            options={REGION_IDS.map((r) => ({ value: r, label: t(`account.lb.region.${r}`) }))}
          />
          <div className="vk-cu-page__sectors" role="group" aria-label={t('custom.area')}>
            <button
              type="button"
              role="checkbox"
              aria-checked={!sectors.length}
              className={`vk-mp__desk${!sectors.length ? ' is-on' : ''}`}
              onClick={whole}
            >
              <span className="vk-mp__check" aria-hidden="true" />
              {t('custom.whole')}
            </button>
            {all.map((x) => (
              <button
                key={x.id}
                type="button"
                role="checkbox"
                aria-checked={sectors.includes(x.id)}
                className={`vk-mp__desk${sectors.includes(x.id) ? ' is-on' : ''}`}
                data-sector={x.id}
                onClick={() => toggleSector(x.id)}
              >
                <span className="vk-mp__check" aria-hidden="true" />
                {tx(x.name)}
              </button>
            ))}
          </div>
          <p className="vk-cu__hint" style={{ padding: 0 }}>
            {t('custom.areaHint')} {t('custom.unranked')}
          </p>
        </div>
      </section>
      <CustomEditor
        regionId={regionId}
        sectors={sectors}
        value={setup}
        onChange={(s) => setState({ regionId, sectors, setup: s })}
      />
    </ShellPage>
  );
}
