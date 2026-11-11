import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A0, alcoveKey, coxeterLength, crossedWall, edges, neighborAcross, neighborLabel,
  parseWord, sameAlcove, vertexType, wordIsReduced, wordToAlcove,
} from '../dist/js/math/affineA2.js';
import {Walk} from '../dist/js/math/walk.js';

test('A₀ walls follow the standard s₀/s₁/s₂ convention',()=>{
  const e=edges(A0);
  assert.equal(e.find(x=>x.equation==='x + y = 1').type,0);
  assert.equal(e.find(x=>x.equation==='x = 0').type,1);
  assert.equal(e.find(x=>x.equation==='y = 0').type,2);
  assert.equal(coxeterLength(A0),0);
});
test('all visible triangle edges have three distinct labels; neighbors agree about shared wall',()=>{
  for(let i=-8;i<=8;i++)for(let j=-8;j<=8;j++)for(const half of ['L','U']){
    const a={i,j,half},ee=edges(a);
    assert.deepEqual(ee.map(e=>e.type).sort(),[0,1,2]);
    for(const e of ee){
      const back=crossedWall(e.adjacent,a);
      assert.ok(back,`missing back edge ${alcoveKey(a)}`);
      assert.equal(back.type,e.type,`inconsistent shared wall ${alcoveKey(a)}`);
      assert.ok(sameAlcove(neighborAcross(e.adjacent,e.type),a));
    }
  }
});
test('each generator is an involution, braid sᵢsⱼsᵢ = sⱼsᵢsⱼ',()=>{
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++)for(const half of ['L','U']) {
    const a={i,j,half};
    for(const s of [0,1,2])assert.ok(sameAlcove(neighborAcross(neighborAcross(a,s),s),a));
    for(const s of [0,1,2])for(const t of [0,1,2])if(s!==t){
      const left=neighborAcross(neighborAcross(neighborAcross(a,s),t),s);
      const right=neighborAcross(neighborAcross(neighborAcross(a,t),s),t);
      assert.ok(sameAlcove(left,right));
    }
  }
});
test('length by separating hyperplanes changes by one on every step',()=>{
  for(let i=-8;i<=8;i++)for(let j=-8;j<=8;j++)for(const half of ['L','U']){
    const a={i,j,half};for(const e of edges(a))assert.equal(Math.abs(coxeterLength(e.adjacent)-coxeterLength(a)),1);
  }
});
test('word parser accepts s symbols, unicode subscripts, and compact digits',()=>{
  for(const w of ['0 2 1 2','s₀ s₂ s₁ s₂','s_0s_2s_1s_2','s_{0} s_{2} s_{1} s_{2}'])assert.deepEqual(parseWord(w),[0,2,1,2]);
  assert.throws(()=>parseWord('0 9 1'));
});
test('example 2.19(a) is length four',()=>{
  const word=[0,2,1,2];assert.equal(coxeterLength(wordToAlcove(word)),4);assert.equal(wordIsReduced(word),true);
});
test('walk click, backtrack, undo and redo preserve complete word',()=>{
  const walk=new Walk();
  assert.equal(walk.steps,0);
  assert.equal(walk.append(neighborAcross(A0,0)),true);
  assert.equal(walk.append(A0),true);
  assert.deepEqual(walk.word,[0,0]);
  assert.equal(walk.steps,2);
  assert.equal(walk.distinct,2);
  assert.equal(walk.undo(),true);assert.deepEqual(walk.word,[0]);
  assert.equal(walk.redo(),true);assert.deepEqual(walk.word,[0,0]);
  assert.equal(walk.append({i:22,j:22,half:'L'}),false);
  const saved=walk.serialize();const other=new Walk();assert.equal(other.restore(saved),true);
  assert.deepEqual(other.word,walk.word);
});
test('an alcove center is valid and vertex types distinguish every triangle corner',()=>{
  for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){
    assert.deepEqual([vertexType({x:i,y:j}),vertexType({x:i+1,y:j}),vertexType({x:i,y:j+1})].sort(),[0,1,2]);
    assert.equal(neighborLabel({i,j,half:'L'},{i,j,half:'U'}),((i+2*j)%3+3)%3);
  }
});
