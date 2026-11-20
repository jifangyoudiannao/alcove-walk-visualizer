import test from 'node:test';
import assert from 'node:assert/strict';
import { A0, edges, neighborAcross, toCartesian } from '../dist/js/math/affineA2.js';
import { Walk } from '../dist/js/math/walk.js';
import { freeRoutesSVG } from '../dist/js/ui/freeRoutes.js';

const project = p => ({ x: p.u * 120, y: p.v * 120 });
const draw = (paths, active = 1) => freeRoutesSVG(paths, active, project, 120);

test('shared crossings have stable separate lanes and each path has its own arrow color', () => {
  const first = { id: 1, color: '#703a8e', walk: new Walk() };
  const second = { id: 2, color: '#b86912', walk: new Walk() };
  for (const path of [first, second]) path.walk.setWord([1, 2]);
  const paths = [first, second];
  function routesById(active) {
    const svg = draw(paths, active);
    return new Map([...svg.matchAll(/<g data-free-path="(\d+)"([^]*?)(?=<g data-free-path|$)/g)].map(([, id, group]) => {
      const color = paths[Number(id) - 1].color;
      assert.ok(group.includes(`color="${color}"`));
      assert.ok(group.includes(`fill="${color}"`));
      assert.ok(group.includes(`marker-end="url(#free-arrow-${id})"`));
      return [id, [...group.matchAll(/data-action="cross" data-step="\d+" d="([^"]+)"/g)].map(match => match[1])];
    }));
  }
  const before = routesById(1), after = routesById(2);
  assert.equal(before.get('1').length, 2);
  assert.notDeepEqual(before.get('1'), before.get('2'));
  assert.deepEqual(before, after);
});

test('fold rendering reaches its actual wall from the unsnapped path, records repeated turns', () => {
  const path = { id: 1, color: '#703a8e', walk: new Walk() };
  const adjacent = neighborAcross(A0, 1);
  const point = toCartesian({ x: -.3, y: .7 });
  path.walk.append(adjacent, point);
  path.walk.fold(0);
  path.walk.fold(0);
  const wall = edges(adjacent).find(e => e.type === 0);
  const svg = draw([path]);
  assert.equal((svg.match(/data-action="cross"/g) ?? []).length, 1);
  assert.ok(svg.includes('data-action="fold" data-steps="2,3"'));
  assert.ok(svg.includes(`on ${wall.equation}, steps 2, 3`));
  const p = project(point);
  const contact = project(toCartesian({ x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 }));
  const pointText = p => [p.x, p.y].map(value => Number(value.toFixed(2))).join(' ');
  assert.ok(svg.includes(`M ${pointText(p)} Q`));
  assert.ok(svg.includes(` ${pointText(contact)} Q`));
  assert.ok(svg.includes('f₀ · 2,3'));
});
