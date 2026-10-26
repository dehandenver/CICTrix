// @vitest-environment node
/**
 * Runs the real migration file against Postgres (PGlite, in-process) over a
 * stub applicants table, since the repo has no creating migration for it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const MIGRATION = path.resolve(__dirname, '../../supabase/migrations/20261026015831_applicant_work_experiences.sql');

const setup = async (yearsType: 'numeric' | 'text') => {
  const db = new PGlite();
  await db.exec(`
    create table public.applicants (id int primary key, years_of_experience ${yearsType});
    insert into public.applicants values (1, '2.5'), (2, null), (3, '0'), (4, '2.99'), (5, '7');
  `);
  return db;
};

const rows = async (db: PGlite) =>
  (await db.query<{ id: number; work_experiences: unknown }>('select id, work_experiences from public.applicants order by id')).rows;

// Starting Postgres takes about a second per case; allow headroom on a busy machine.
describe('migration: applicants.work_experiences', { timeout: 30_000 }, () => {
  it('backfills each stored total into a one-item list and leaves the rest empty', async () => {
    const db = await setup('numeric');
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    const byId = Object.fromEntries((await rows(db)).map((r) => [r.id, r.work_experiences]));

    expect(byId[1]).toEqual([{ years: 2, months: 6, position: null, company: null, duties: null }]);
    expect(byId[2]).toEqual([]);
    expect(byId[3]).toEqual([]);
    // 2.99 years rounds to 36 months: 3 y 0 m, never 2 y 12 m.
    expect(byId[4]).toEqual([{ years: 3, months: 0, position: null, company: null, duties: null }]);
    expect(byId[5]).toEqual([{ years: 7, months: 0, position: null, company: null, duties: null }]);
    await db.close();
  });

  it('works on a text column and is safe to run twice', async () => {
    const db = await setup('text');
    const sql = readFileSync(MIGRATION, 'utf8');
    await db.exec(sql);
    await db.query(`update public.applicants set work_experiences = '[{"years":1,"months":0,"position":"Clerk","company":"X","duties":"Y"}]' where id = 1`);
    await db.exec(sql);
    const byId = Object.fromEntries((await rows(db)).map((r) => [r.id, r.work_experiences]));
    // Re-running neither duplicates entries nor overwrites a list already there.
    expect(byId[1]).toEqual([{ years: 1, months: 0, position: 'Clerk', company: 'X', duties: 'Y' }]);
    expect(byId[5]).toHaveLength(1);
    await db.close();
  });

  it('rejects anything but an array', async () => {
    const db = await setup('numeric');
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    await expect(db.query(`update public.applicants set work_experiences = '{}' where id = 2`)).rejects.toThrow(/applicants_work_experiences_is_array/);
    await db.close();
  });
});
