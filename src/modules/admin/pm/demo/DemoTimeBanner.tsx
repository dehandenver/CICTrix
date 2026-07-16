/**
 * IPCR Demo — Time Simulation banner (PM Account only).
 *
 * Drives getSimulatedDate() for the whole demo by writing offset_days to
 * demo_settings. Used to jump +6 months so a vaulted target set crosses its
 * Phase-2-eligible date on stage. onChange lets the PM console re-render vault
 * eligibility immediately after a jump.
 */

import { useState } from 'react';
import { advanceDemoDays, resetDemoTime, getSimulatedDate } from './api';

export function DemoTimeBanner({ onChange }: { onChange?: () => void }) {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    force((n) => n + 1);
    onChange?.();
  };

  const simulated = getSimulatedDate();

  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-white shadow-sm">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-white/80">Demo Mode — Time Simulation</div>
        <div className="text-sm font-semibold">
          Simulated date: {simulated.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Btn label="+ 1 Day" onClick={() => run(() => advanceDemoDays(1))} />
        <Btn label="+ 1 Week" onClick={() => run(() => advanceDemoDays(7))} />
        <Btn label="+ 1 Month" onClick={() => run(() => advanceDemoDays(30))} />
        {/* 185 days > any 6-calendar-month span (max 184), so one click always
            crosses a vaulted set's Phase-2-eligible date. */}
        <Btn label="+ 6 Months" onClick={() => run(() => advanceDemoDays(185))} />
        <Btn label="Reset to Today" onClick={() => run(() => resetDemoTime())} />
      </div>
    </div>
  );
}
