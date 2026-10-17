// Career / HQ management screen ("Prefektuuri juhtimine") — owned by ui-career.
import { Component, useState, type ReactNode } from 'react';
import { useCareer } from '@/store/career';
import { useGame } from '@/store/game';
import { useT } from '@/i18n';
import { Button, Icon, Modal, Tabs, TextField, type TabDef } from '@/ui/components';
import type { CareerProfile } from '@/sim/types';
import { Onboarding } from './career/Onboarding';
import { HqHeader, Inbox, KpiGrid, ShiftBand, useRank } from './career/Overview';
import { StaffTab } from './career/StaffTab';
import { RecruitTab } from './career/RecruitTab';
import { FleetTab } from './career/FleetTab';
import { UpgradesTab } from './career/UpgradesTab';
import { BudgetTab } from './career/BudgetTab';
import { AchievementsTab, HistoryTab } from './career/RecordsTabs';
import { ToastProvider, useToast } from './career/Toasts';
import { useStoredState } from './career/hooks';
import './career/career.css';

const TAB_IDS = ['staff', 'recruit', 'fleet', 'upgrades', 'budget', 'achievements', 'history'] as const;
type TabId = (typeof TAB_IDS)[number];

function isUsable(p: CareerProfile | null): p is CareerProfile {
  return !!p && typeof p === 'object' && typeof p.money === 'number' && typeof p.day === 'number' && Array.isArray(p.staff) && typeof p.regionId === 'string';
}

export function CareerScreen() {
  const profile = useCareer((s) => s.profile);
  return (
    <ToastProvider>
      <div className="cr-screen">
        {isUsable(profile) ? <Hq profile={profile} /> : profile ? <BrokenSave /> : <Onboarding />}
        <p className="cr-disclaimer">{useT()('core.disclaimer')}</p>
      </div>
    </ToastProvider>
  );
}

function Hq({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const rank = useRank(profile);
  const [tab, setTab] = useStoredState<TabId>('epd:career:tab', 'staff', TAB_IDS);
  const staff = profile.staff ?? [];
  const tabs: TabDef<TabId>[] = [
    { id: 'staff', label: t('career.tab.staff'), icon: 'users', badge: staff.length || undefined },
    { id: 'recruit', label: t('career.tab.recruit'), icon: 'plus', badge: (profile.recruits ?? []).length || undefined },
    { id: 'fleet', label: t('career.tab.fleet'), icon: 'car' },
    { id: 'upgrades', label: t('career.tab.upgrades'), icon: 'shield' },
    { id: 'budget', label: t('career.tab.budget'), icon: 'money' },
    { id: 'achievements', label: t('career.tab.achievements'), icon: 'trophy' },
    { id: 'history', label: t('career.tab.history'), icon: 'clock' },
  ];

  return (
    <div className="cr-hq">
      <HqHeader profile={profile} rank={rank} />
      <KpiGrid profile={profile} rank={rank} />
      <ShiftBand profile={profile} />
      <Inbox />
      <section className="cr-card cr-tabs">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="cr-tabs__bar" />
        <TabBoundary key={tab} fallback={<p className="cr-placeholder">{t('career.tabError')}</p>}>
          {tab === 'staff' && <StaffTab profile={profile} goRecruit={() => setTab('recruit')} />}
          {tab === 'recruit' && <RecruitTab profile={profile} />}
          {tab === 'fleet' && <FleetTab profile={profile} rank={rank} />}
          {tab === 'upgrades' && <UpgradesTab profile={profile} rank={rank} />}
          {tab === 'budget' && <BudgetTab profile={profile} />}
          {tab === 'achievements' && <AchievementsTab profile={profile} />}
          {tab === 'history' && <HistoryTab profile={profile} />}
        </TabBoundary>
      </section>
      <DangerZone profile={profile} />
    </div>
  );
}

function DangerZone({ profile }: { profile: CareerProfile }) {
  const t = useT();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === profile.badge;
  const close = () => {
    setOpen(false);
    setTyped('');
  };
  const del = () => {
    if (!ok) return;
    useCareer.getState().reset();
    notify('info', t('career.danger.deleted'));
    close();
  };
  return (
    <section className="cr-danger">
      <div>
        <h3>
          <Icon name="warning" size={14} /> {t('career.danger.title')}
        </h3>
        <p className="dim">{t('career.danger.text')}</p>
      </div>
      <Button variant="danger" icon="x" onClick={() => setOpen(true)}>
        {t('career.danger.delete')}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t('career.danger.confirmTitle')}
        tone="danger"
        icon="warning"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('career.cancel')}
            </Button>
            <Button variant="danger" icon="x" disabled={!ok} onClick={del}>
              {t('career.danger.delete')}
            </Button>
          </>
        }
      >
        <p>{t('career.danger.confirmText', { name: profile.name, day: profile.day })}</p>
        <TextField
          label={t('career.danger.typeBadge', { badge: profile.badge })}
          icon="id"
          mono
          value={typed}
          inputMode="numeric"
          maxLength={3}
          autoFocus
          onChange={(v) => setTyped(v.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={(e) => e.key === 'Enter' && del()}
        />
      </Modal>
    </section>
  );
}

function BrokenSave() {
  const t = useT();
  return (
    <div className="cr-onb">
      <div className="cr-onb__card cr-broken">
        <Icon name="alert" size={28} />
        <h1 className="cr-onb__title">{t('career.broken.title')}</h1>
        <p className="dim">{t('career.broken.text')}</p>
        <div className="cr-onb__actions">
          <Button variant="ghost" icon="chevron-left" onClick={() => useGame.getState().setScreen('menu')}>
            {t('career.back')}
          </Button>
          <Button variant="danger" icon="refresh" onClick={() => useCareer.getState().reset()}>
            {t('career.broken.reset')}
          </Button>
        </div>
      </div>
    </div>
  );
}

class TabBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[EPD career] tab crashed', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
