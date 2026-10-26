// @vitest-environment node
/**
 * Guards the header's colour cascade (see the comment at the top of
 * portal-header.css). jsdom applies no stylesheets, so this reads the CSS.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '_internal/portal-header.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** [selector, declarations] for every rule, media queries flattened. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);

describe('portal-header.css', () => {
  it('scopes every colour rule under .ph, so load order cannot turn header text dark', () => {
    const colourRules = rules.filter(([, body]) => /(^|[;\s])color\s*:/.test(body));
    expect(colourRules.length).toBeGreaterThan(5);
    for (const [selector] of colourRules) {
      for (const part of selector.split(',')) {
        expect(part.trim(), `"${part.trim()}" sets a colour without the .ph scope`).toMatch(/^\.ph \./);
      }
    }
  });

  it('never colours the .ph root itself (it ties with .abyan-ds on the same element)', () => {
    const root = rules.filter(([selector]) => selector === '.ph');
    expect(root.length).toBeGreaterThan(0);
    for (const [, body] of root) expect(body).not.toMatch(/(^|[;\s])color\s*:/);
  });

  it('draws Logout as a pill with white text in every state', () => {
    const logout = rules.find(([selector]) => selector === '.ph .ph-logout');
    expect(logout?.[1]).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(logout?.[1]).toMatch(/color:\s*var\(--color-white\)/);
    for (const state of [':hover', ':active', ':focus-visible']) {
      expect(rules.some(([selector]) => selector === `.ph .ph-logout${state}`), state).toBe(true);
    }
  });
});
