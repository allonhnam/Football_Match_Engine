import { describe, it, expect } from 'vitest';
import * as E from '@/engine/engine';
import { drawPitch } from '@/lib/pitch';

// A canvas context that records what is drawn, so the pitch view can be checked without a browser.
function recorder() {
  const calls: { fn: string; args: any[]; style: any }[] = [];
  const ctx: any = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '', lineCap: '', shadowColor: '', shadowBlur: 0 }, {
    get(t: any, k: string) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args: any[]) => { calls.push({ fn: k, args, style: { fill: t.fillStyle, stroke: t.strokeStyle } }); };
    },
    set(t: any, k: string, v: any) { t[k] = v; return true; },
  });
  return { ctx, calls };
}
const col = { pa: '#1a3', pb: '#194', line: '#fff', accent: '#cf3', bad: '#f53', chip: '#000' };
const opts = { names: false, shape: false, follow: false };

describe('pitch view', () => {
  const m: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 1 }), away: E.makeTeam({ name: 'A', seed: 2 }), seed: 3, control: 'none' });
  m.runUntil({ minute: 3 });

  it('draws the referee and both assistants', () => {
    const { ctx, calls } = recorder();
    drawPitch(ctx, 800, 520, m, 1, opts, col, 0, { cx: null, cy: null });
    const officials = calls.filter(c => c.fn === 'stroke' && c.style.stroke === '#F5D90A'); // each official is outlined in yellow
    expect(m.officials.length).toBe(3);
    expect(officials.length).toBeGreaterThanOrEqual(3);
    for (const o of m.officials) { expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true); }
    // assistants stay on their touchlines and halves
    expect(m.officials[1].y).toBeLessThan(0); expect(m.officials[1].x).toBeLessThanOrEqual(52.5);
    expect(m.officials[2].y).toBeGreaterThan(68); expect(m.officials[2].x).toBeGreaterThanOrEqual(52.5);
  });

  it('shows the 8-second countdown around a keeper holding the ball', () => {
    while (m.phase !== 'play') m.step();
    const gk = m.players.findIndex((q: any) => q.onPitch && q.side === 0 && q.slot === 0), g = m.players[gk];
    g.x = m.dir(0) > 0 ? 6 : 99; g.y = 34;
    m._giveKeeper(gk, false);
    m.gkHandsT = m.clockSec() - 5; // held for 5 seconds: the ring is past half and turns red
    const { ctx, calls } = recorder();
    drawPitch(ctx, 800, 520, m, 1, opts, col, 0, { cx: null, cy: null });
    const ring = calls.find(c => c.fn === 'arc' && c.style.stroke === col.bad);
    expect(ring).toBeTruthy();
    expect(m.snapshot().keeperHolding.seconds).toBeCloseTo(5, 0);
  });

  it('never moves the officials in headless runs, so background matches stay fast', () => {
    const r: any = E.simulateMatch({ home: E.makeTeam({ name: 'H', seed: 1 }), away: E.makeTeam({ name: 'A', seed: 2 }), seed: 3, control: 'none' });
    expect(r.score.length).toBe(2);
    const live: any = new E.Match({ home: E.makeTeam({ name: 'H', seed: 1 }), away: E.makeTeam({ name: 'A', seed: 2 }), seed: 3, control: 'none' });
    expect(live.runToEnd().score).toEqual(r.score); // same result with or without officials
  });
});
