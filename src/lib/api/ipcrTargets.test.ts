import { describe, expect, it, vi } from 'vitest';
import {
  blankMfo,
  emptyTargets,
  flattenForWorkspace,
  hasSubmittableTarget,
  saveTargetSetting,
  type TargetsByFunction,
} from './ipcrTargets';

const { loadEffectiveSchedulesMock } = vi.hoisted(() => ({ loadEffectiveSchedulesMock: vi.fn() }));

vi.mock('./phaseSchedules', async (importActual) => ({
  ...(await importActual<typeof import('./phaseSchedules')>()),
  loadEffectiveSchedules: loadEffectiveSchedulesMock,
}));

// Every query resolves to "no row / query error", so anything past the submit
// guard fails fast instead of touching a database.
vi.mock('../supabase', () => {
  const result = { data: null, error: { message: 'stubbed supabase' } };
  const chain: any = new Proxy(() => chain, {
    get: (_t, prop) => (prop === 'then' ? (resolve: any) => resolve(result) : chain),
  });
  return { supabase: chain };
});

describe('emptyTargets', () => {
  it('gives every category exactly one blank MFO with one blank indicator', () => {
    const t = emptyTargets();
    for (const fn of ['core', 'strategic', 'support'] as const) {
      expect(t[fn]).toHaveLength(1);
      expect(t[fn][0].title).toBe('');
      expect(t[fn][0].indicators).toHaveLength(1);
      expect(t[fn][0].indicators[0].description).toBe('');
    }
  });

  it('does not share MFO objects between categories', () => {
    const t = emptyTargets();
    t.core[0].title = 'Payroll';
    expect(t.strategic[0].title).toBe('');
    expect(t.support[0].title).toBe('');
  });
});

describe('hasSubmittableTarget', () => {
  it('is false for a freshly blank form', () => {
    expect(hasSubmittableTarget(emptyTargets())).toBe(false);
  });

  it('is false when an MFO has a title but no indicator text', () => {
    const t = emptyTargets();
    t.core[0].title = 'Payroll Management';
    expect(hasSubmittableTarget(t)).toBe(false);
  });

  it('is false when an indicator is only whitespace', () => {
    const t = emptyTargets();
    t.core[0].indicators[0].description = '   ';
    expect(hasSubmittableTarget(t)).toBe(false);
  });

  it('is true when any category has an MFO with a non-empty indicator', () => {
    const t = emptyTargets();
    t.support[0].indicators[0].description = 'Resolve tickets in 15 minutes';
    expect(hasSubmittableTarget(t)).toBe(true);
  });

  it('is true even when the MFO title is blank but the indicator is filled', () => {
    const t = emptyTargets();
    t.strategic[0].indicators[0].description = 'Run 4 trainings';
    expect(hasSubmittableTarget(t)).toBe(true);
  });
});

describe('flattenForWorkspace', () => {
  it('drops MFOs that are entirely empty', () => {
    expect(flattenForWorkspace([blankMfo(), blankMfo()])).toBe('');
  });

  it('renders a title with its indicators indented beneath it', () => {
    const out = flattenForWorkspace([
      { title: 'Payroll Management', indicators: [{ description: 'Process payroll in 3 days' }] },
    ]);
    expect(out).toBe('Payroll Management\n  - Process payroll in 3 days');
  });

  it('keeps an MFO whose title is blank but has indicators, labelling it', () => {
    const out = flattenForWorkspace([{ title: '', indicators: [{ description: 'Do the thing' }] }]);
    expect(out).toBe('(untitled MFO)\n  - Do the thing');
  });

  it('drops blank indicators but keeps the MFO title', () => {
    const out = flattenForWorkspace([{ title: 'IT Helpdesk', indicators: [{ description: '  ' }] }]);
    expect(out).toBe('IT Helpdesk');
  });

  it('separates multiple MFOs with a blank line', () => {
    const out = flattenForWorkspace([
      { title: 'A', indicators: [{ description: 'a1' }] },
      { title: 'B', indicators: [{ description: 'b1' }, { description: 'b2' }] },
    ]);
    expect(out).toBe('A\n  - a1\n\nB\n  - b1\n  - b2');
  });

  it('round-trips what the employee typed into something the PDF can show', () => {
    const targets: TargetsByFunction = emptyTargets();
    targets.core = [
      { title: 'Payroll Management', indicators: [{ description: 'Process payroll within 3 days' }] },
    ];
    expect(flattenForWorkspace(targets.core)).toContain('Process payroll within 3 days');
  });
});

describe('saveTargetSetting submit guard', () => {
  const PHASE_CLOSED_ERROR =
    'Phase 1 (Target Setting) is not currently open. The PM Division will notify you when it opens.';
  const submittable = (): TargetsByFunction => {
    const t = emptyTargets();
    t.core[0].title = 'Payroll';
    t.core[0].indicators[0].description = 'Pay on time';
    return t;
  };
  const submit = () =>
    saveTargetSetting({ employeeId: 'emp-1', cycleId: 1, targets: submittable(), submit: true });

  it('lets an employee submit when their resolved (office override) target schedule is Open', async () => {
    loadEffectiveSchedulesMock.mockResolvedValue({ target: { mode: 'Open' }, rating: null });
    const res = await submit();
    expect(loadEffectiveSchedulesMock).toHaveBeenCalledWith('emp-1');
    expect(res.ok === false && res.error).not.toBe(PHASE_CLOSED_ERROR);
  });

  it('blocks submit when the resolved target schedule is Closed', async () => {
    loadEffectiveSchedulesMock.mockResolvedValue({ target: { mode: 'Closed' }, rating: null });
    expect(await submit()).toEqual({ ok: false, error: PHASE_CLOSED_ERROR });
  });
});
