import {
  A0, alcoveKey, center, coxeterLength, crossedWall, edges, formatWord,
  fromKey, neighborAcross, neighborLabel, parseWord, rootCenter, toCartesian,
  toRoot, vertices, type Alcove, type CartesianPoint, type Edge, type WallType,
} from './math/affineA2.js';
import { Walk } from './math/walk.js';
import { PROJECT_PROMPT } from './ui/prompt.js';
import { FoldExplorer, actionLabel } from './ui/foldExplorer.js';
import type { FoldPath } from './math/folded.js';
import { galleryDistance } from './math/folded.js';
import { RamExplorer } from './ui/ramExplorer.js';

type Tool = 'draw' | 'pan';
interface Camera { ox: number; oy: number; scale: number }
const COLORS = ['#709967','#cb8290','#6798bf'] as const;
const SUB = ['₀','₁','₂'] as const;
const STORAGE = 'alcove-walk-visualizer:v1';
const walk = new Walk();
const svg = document.getElementById('alcove-canvas') as unknown as SVGSVGElement;
let camera: Camera = {ox:0,oy:0,scale:122};
let cameraReady=false;
let snap=true;
let tool: Tool='draw';
let spaceHeld=false;
let drag: {id:number,x:number,y:number,ox:number,oy:number,moved:boolean}|null=null;
let draggedRecently=false;
let toastHandle: ReturnType<typeof setTimeout> | undefined;
let explorer: FoldExplorer;
let ram: RamExplorer;

function currentFoldPath(): FoldPath | null {return ram?.active ? ram.path : explorer?.active ? explorer.path : null;}
function syncMode(): void {
  const active=!!ram?.active;
  $('ram-panel').hidden=!active;
  $('weight-explorer-panel').hidden=active;
  $('word-form').closest<HTMLElement>('section')!.hidden=active;
  $('open-ram-mode').setAttribute('aria-pressed',String(active));
  $('open-free-mode').setAttribute('aria-pressed',String(!active));
}

function displayedNodes() {
  const path=currentFoldPath();
  if (path) return path.nodes.map((alcove, k) => ({alcove, point: center(alcove), via: k ? path.steps[k-1].type : null}));
  return walk.nodes;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing UI element #${id}`);
  return el;
}
function showToast(text: string): void {
  const el=$('toast');
  el.textContent=text;
  el.classList.add('show');
  if(toastHandle) clearTimeout(toastHandle);
  toastHandle=setTimeout(()=>el.classList.remove('show'),2400);
}
function n(v: number): string { return Number(v.toFixed(2)).toString(); }
function clamp(v:number,lo:number,hi:number): number {return Math.max(lo,Math.min(hi,v));}
function dims(): {w:number,h:number} { return {w:svg.clientWidth||1000,h:svg.clientHeight||760}; }
function scenePoint(p: CartesianPoint, cam: Camera): {x:number,y:number} {
  return {x:cam.ox+cam.scale*p.u,y:cam.oy+cam.scale*p.v};
}
function cartesianAt(px:number,py:number, cam:Camera):CartesianPoint {
  return {u:(px-cam.ox)/cam.scale,v:(py-cam.oy)/cam.scale};
}
function mousePoint(e: PointerEvent | MouseEvent | WheelEvent): {x:number,y:number} {
  const b=svg.getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top};
}
function initialCamera(w:number,h:number):Camera {return {ox:w*.36,oy:h*.86,scale:122};}
function fitCamera(w:number,h:number,pad=105,maxScale=175):Camera {
  // Fit the whole path in either direction; preserve the actual free-click points.
  const pts=ram?.active ? ram.fitAlcoves.flatMap(a=>vertices(a).map(toCartesian)) : explorer?.active ? explorer.fitAlcoves.flatMap(a=>vertices(a).map(toCartesian)) : walk.nodes.map(n=>n.point);
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
  for(const p of pts){minU=Math.min(minU,p.u);maxU=Math.max(maxU,p.u);minV=Math.min(minV,p.v);maxV=Math.max(maxV,p.v);}
  const rangeU=Math.max(maxU-minU,1.9),rangeV=Math.max(maxV-minV,1.9);
  const scale=Math.min(maxScale,Math.max(3,Math.min((w-2*pad)/rangeU,(h-2*pad)/rangeV)));
  const u=(minU+maxU)/2, v=(minV+maxV)/2;
  return {ox:w/2-u*scale,oy:h/2-v*scale,scale};
}
function polygonPoints(a:Alcove,cam:Camera):string {
  return vertices(a).map(v=>{const p=scenePoint(toCartesian(v),cam);return `${n(p.x)},${n(p.y)}`;}).join(' ');
}
function edgeKey(edge:Edge):string {
  const a=`${edge.start.x}:${edge.start.y}`,b=`${edge.end.x}:${edge.end.y}`;
  return a<b?`${a}|${b}`:`${b}|${a}`;
}
function visibleAlcoves(w:number,h:number,cam:Camera):Alcove[] {
  const corners = [[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>toRoot(cartesianAt(x,y,cam)));
  let minI=Math.floor(Math.min(...corners.map(p=>p.x)))-2;
  let maxI=Math.ceil(Math.max(...corners.map(p=>p.x)))+2;
  let minJ=Math.floor(Math.min(...corners.map(p=>p.y)))-2;
  let maxJ=Math.ceil(Math.max(...corners.map(p=>p.y)))+2;
  // Avoid arbitrarily huge DOM work if someone zooms out far.
  const maxSpan=120;
  if(maxI-minI>maxSpan){const mid=(minI+maxI)/2;minI=Math.floor(mid-maxSpan/2);maxI=Math.ceil(mid+maxSpan/2);}
  if(maxJ-minJ>maxSpan){const mid=(minJ+maxJ)/2;minJ=Math.floor(mid-maxSpan/2);maxJ=Math.ceil(mid+maxSpan/2);}
  const tiles:Alcove[]=[];
  for(let i=minI;i<=maxI;i++)for(let j=minJ;j<=maxJ;j++) {
    tiles.push({i,j,half:'L'},{i,j,half:'U'});
  }
  return tiles;
}
function nodeSVG(cam:Camera,w:number,h:number):string {
  const nodes=displayedNodes(), current=nodes[nodes.length-1].alcove, steps=nodes.length-1;
  const allowed=new Map<string,WallType>();
  if(!explorer?.active&&!ram?.active)for(const edge of edges(walk.current))allowed.set(alcoveKey(edge.adjacent),edge.type);
  const visible=visibleAlcoves(w,h,cam);
  const uniqueEdges=new Map<string,Edge>();
  const bg:string[]=[];
  const hits:string[]=[];
  for(const a of visible){
    const key=alcoveKey(a),poly=polygonPoints(a,cam);
    if(key==='0,0,L')bg.push(`<polygon points="${poly}" fill="#f5d67c" fill-opacity="0.68"/>`);
    if(allowed.has(key))bg.push(`<polygon points="${poly}" fill="#cddfcd" fill-opacity="0.38"/>`);
    if(key===alcoveKey(current) && (steps>0||ram?.active))bg.push(`<polygon points="${poly}" fill="#cfddd0" fill-opacity="0.45"/>`);
    if(explorer?.active && explorer.gallery && key===alcoveKey(explorer.gallery.target))bg.push(`<polygon points="${poly}" fill="#c7b6e4" fill-opacity="0.65" stroke="#8b70b1" stroke-width="2"/>`);
    if(ram?.active && ram.reference && key===alcoveKey(ram.reference.target))bg.push(`<polygon points="${poly}" fill="#c7b6e4" fill-opacity="0.65" stroke="#8b70b1" stroke-width="2"/>`);
    hits.push(`<polygon points="${poly}" data-alcove="${key}" fill="transparent" stroke="none" aria-label="alcove ${key}"/>`);
    for(const e of edges(a))if(!uniqueEdges.has(edgeKey(e)))uniqueEdges.set(edgeKey(e),e);
  }
  const grid:string[]=[];
  for(const e of uniqueEdges.values()){
    const a=scenePoint(toCartesian(e.start),cam),b=scenePoint(toCartesian(e.end),cam);
    const important=!!crossedWall(A0,e.adjacent) && e.start.x>=0 && e.start.y>=0 && e.end.x>=0 && e.end.y>=0;
    grid.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[e.type]}" stroke-width="${important?'1.2':'0.88'}" stroke-opacity="${important?'.8':'.5'}"/>`);
  }
  // Strongly render the fundamental alcove boundary, including labels.
  const fundamental=edges(A0).map(e=>{
    const a=scenePoint(toCartesian(e.start),cam),b=scenePoint(toCartesian(e.end),cam);
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const ctr=scenePoint(center(A0),cam);
    const dx=mx-ctr.x,dy=my-ctr.y,len=Math.hypot(dx,dy)||1;
    const tx=mx+dx/len*13,ty=my+dy/len*13;
    return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[e.type]}" stroke-width="3"/><text x="${n(tx)}" y="${n(ty)}" font-size="12" font-family="Georgia,serif" fill="${COLORS[e.type]}" text-anchor="middle">s${SUB[e.type]}</text>`;
  }).join('');
  const centroid=scenePoint(center(A0),cam);
  const tags=`<text x="${n(centroid.x-12)}" y="${n(centroid.y-20)}" font-family="Georgia,serif" font-style="italic" font-size="19" fill="#9e8142" text-anchor="middle">A₀</text>`;
  const route:string[]=[];
  if(ram?.active) {
    if(ram.referencePath)route.push(foldedRouteSVG(ram.referencePath,cam,'#7692ad',false,true));
    if(ram.overlay)for(const item of ram.page)route.push(foldedRouteSVG(item.path,cam,'#9b80b1',false));
    route.push(foldedRouteSVG(ram.path,cam,'#303834',true));
    if(ram.reference){
      const target=scenePoint(center(ram.reference.target),cam);
      route.push(`<text x="${n(target.x)}" y="${n(target.y+30)}" text-anchor="middle" font-size="12" fill="#735295" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">A₀ + λ</text>`);
    }
    for(const edge of edges(current)){
      const p=scenePoint(toCartesian({x:(edge.start.x+edge.end.x)/2,y:(edge.start.y+edge.end.y)/2}),cam);
      route.push(`<text x="${n(p.x+7)}" y="${n(p.y-8)}" font-size="13" fill="${COLORS[edge.type]}" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">s${SUB[edge.type]}</text>`);
    }
    const next=ram.next;
    if(next){
      const a=scenePoint(toCartesian(next.wall.start),cam),b=scenePoint(toCartesian(next.wall.end),cam);
      const p=scenePoint(center(current),cam),neighbor=scenePoint(center(next.wall.adjacent),cam);
      route.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#fffefa" stroke-width="9"/><line data-current-ram-wall="true" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${COLORS[next.wall.type]}" stroke-width="5"/><text x="${n((a.x+b.x)/2+10)}" y="${n((a.y+b.y)/2-15)}" font-size="12" fill="#303834" paint-order="stroke" stroke="#fffefa" stroke-width="4">s${SUB[next.wall.type]} · ${next.wall.equation}</text><text x="${n(p.x)}" y="${n(p.y+23)}" text-anchor="middle" font-size="11" fill="#42653e" paint-order="stroke" stroke="#fffefa" stroke-width="3">当前 ${next.side>0?'正侧 +':'负侧 −'}</text><text x="${n(neighbor.x)}" y="${n(neighbor.y+23)}" text-anchor="middle" font-size="11" fill="#727b7e" paint-order="stroke" stroke="#fffefa" stroke-width="3">${next.side>0?'负侧 −':'正侧 +'}</text>`);
    }
  } else if(explorer?.active && explorer.path && explorer.reference && explorer.gallery) {
    route.push(foldedRouteSVG(explorer.reference,cam,'#7692ad',false,true));
    if(explorer.overlay)for(const item of explorer.page)route.push(foldedRouteSVG(item.path,cam,'#9b80b1',false));
    route.push(foldedRouteSVG(explorer.path,cam,'#303834',true));
    const target=scenePoint(center(explorer.gallery.target),cam);
    route.push(`<text x="${n(target.x)}" y="${n(target.y+30)}" text-anchor="middle" font-size="12" font-family="Georgia,serif" fill="#735295" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">A₀ − λ</text>`);
  } else {
  for(let k=1;k<nodes.length;k++){
    const a=scenePoint(nodes[k-1].point,cam),b=scenePoint(nodes[k].point,cam);
    const len=Math.hypot(b.x-a.x,b.y-a.y);if(len<0.01)continue;
    const margin=Math.min(16,len*.25);
    const ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
    route.push(`<path d="M ${n(a.x+ux*margin)} ${n(a.y+uy*margin)} L ${n(b.x-ux*margin)} ${n(b.y-uy*margin)}" fill="none" stroke="#303834" stroke-width="2.65" stroke-linecap="round" marker-end="url(#walk-arrow)"/>`);
  }
  // Draw nodes *after* the route; number is legible even after crossing.
  for(let k=0;k<nodes.length;k++){
    const p=scenePoint(nodes[k].point,cam),start=k===0,current=k===steps;
    const fill=start?'#dfb453':'#343d38';
    route.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${current?14:12.7}" fill="#fffefa" fill-opacity=".93"/>`);
    route.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${current?10.7:9.7}" fill="${fill}" stroke="${current?'#fff':fill}" stroke-width="1"/>`);
    route.push(`<text x="${n(p.x)}" y="${n(p.y+.8)}" dominant-baseline="middle" text-anchor="middle" font-family="'DM Sans',sans-serif" font-weight="700" font-size="${k>=100?7:k>=10?9:10}" fill="white">${k}</text>`);
  }
  }
  return `<defs><marker id="walk-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#303834"/></marker><marker id="fold-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a3558b"/></marker></defs><rect width="${w}" height="${h}" fill="#fbfaf7"/><g>${bg.join('')}</g><g>${grid.join('')}</g><g>${fundamental}${tags}</g><g class="hit-regions">${hits.join('')}</g><g pointer-events="none">${route.join('')}</g>`;
}
function foldedRouteSVG(path:FoldPath,cam:Camera,color:string,selected:boolean,dashed=false):string {
  const parts:string[]=[];
  for(const step of path.steps){
    const a=scenePoint(center(step.from),cam),b=scenePoint(center(step.to),cam);
    let d:string;
    if(step.kind==='fold') {
      const mid=scenePoint(toCartesian({x:(step.wall.start.x+step.wall.end.x)/2,y:(step.wall.start.y+step.wall.end.y)/2}),cam);
      const dx=mid.x-a.x,dy=mid.y-a.y,len=Math.hypot(dx,dy)||1;
      const offset=Math.min(6,cam.scale*.035),px=-dy/len*offset,py=dx/len*offset;
      d=`M ${n(a.x+px)} ${n(a.y+py)} Q ${n(mid.x+px)} ${n(mid.y+py)} ${n(mid.x)} ${n(mid.y)} Q ${n(mid.x-px)} ${n(mid.y-py)} ${n(a.x-px)} ${n(a.y-py)}`;
      if(selected)parts.push(`<circle cx="${n(mid.x)}" cy="${n(mid.y)}" r="4" fill="#a3558b"/><text x="${n(mid.x+8)}" y="${n(mid.y-6)}" font-size="10" fill="#93487c" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">${step.index}: f${SUB[step.type]}${step.sign>0?'⁺':'⁻'}</text>`);
    } else d=`M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}`;
    parts.push(`<path d="${d}" fill="none" stroke="${selected&&step.kind==='fold'?'#a3558b':color}" stroke-width="${selected?2.5:dashed?2:1.5}" stroke-opacity="${selected?1:dashed?.75:.22}"${dashed?' stroke-dasharray="6 5"':''}${selected?` marker-end="url(#${step.kind==='fold'?'fold-arrow':'walk-arrow'})"`:''}/>`);
    if(selected && step.kind==='cross')parts.push(`<text x="${n((a.x+b.x)/2+6)}" y="${n((a.y+b.y)/2-5)}" font-size="10" fill="#303834" paint-order="stroke" stroke="#fbfaf7" stroke-width="3">${step.index}${ram?.active?`: c${SUB[step.type]}${step.sign>0?'⁺':'⁻'}`:''}</text>`);
  }
  if(selected) {
    const start=scenePoint(center(path.nodes[0]),cam),end=scenePoint(center(path.nodes[path.nodes.length-1]),cam);
    parts.push(`<circle cx="${n(start.x)}" cy="${n(start.y)}" r="6" fill="#dfb453" stroke="#fffefa" stroke-width="2"/><circle cx="${n(end.x)}" cy="${n(end.y)}" r="5" fill="#303834" stroke="#fffefa" stroke-width="2"/>`);
  }
  return parts.join('');
}
function render():void {
  syncMode();
  const {w,h}=dims();
  if(!cameraReady){camera=initialCamera(w,h);cameraReady=true;}
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.innerHTML=nodeSVG(camera,w,h);
  const nodes=displayedNodes(),steps=nodes.length-1,current=nodes[steps].alcove;
  $('step-count').textContent=String(steps);
  const length=ram?.active?galleryDistance(nodes[0].alcove,current):coxeterLength(current);
  $('length-count').textContent=String(length);
  $('unique-count').textContent=String(new Set(nodes.map(nd=>alcoveKey(nd.alcove))).size);
  const path=currentFoldPath();
  const word=path?path.steps.map(s=>s.type):walk.word;
  const chips=$('word-chips');
  chips.innerHTML=path?`<span class="fold-action-word">${actionLabel(path)}</span>`:word.length?word.map(t=>`<span class="word-chip s${t}">s${SUB[t]}</span>`).join(''):'<span class="empty-word">e</span>';
  const badge=$('reduced-badge');
  const reduced=steps===length;
  badge.textContent=ram?.active?`${ram.walk?.complete?'已完成':'进行中'} · ${path!.folds} folds`:path?.folds?`${path.folds} 次折叠`:reduced?'约化路线':'非约化路线';
  badge.classList.toggle('not-reduced',!reduced);
  $('endpoint-label').textContent=path?`${ram?.active&&!ram.walk?.complete?'当前':'终点'} ${alcoveKey(current)}`:`终点 A${toSubscript(steps)}`;
  $('undo-btn').toggleAttribute('disabled',!!path||!walk.canUndo);
  $('redo-btn').toggleAttribute('disabled',!!path||!walk.canRedo);
  $('clear-btn').toggleAttribute('disabled',!!path||walk.steps===0);
  $('zoom-label').textContent=`${Math.round(camera.scale/122*100)}%`;
  $('canvas-footnote').textContent=path?'虚线：参考路径 · 紫色回环：折叠 · 淡线：本页路径 · 点击记录定位':`已记录 ${walk.steps} 步 · 点击浅绿色相邻 alcove 继续，点击记录可定位`;
  $('drawing-status').textContent=ram?.active?'Ram 逐步行走':explorer?.active?'折叠路径浏览':tool==='pan'?'平移模式':'打点模式';
  document.querySelector('.canvas-heading h1')!.textContent=ram?.active?'Ram Alcove Walk Mode':explorer?.active?'Weight → reduced path → folded walks':'从 A₀ 出发，点击相邻 alcove';
  document.querySelector('.canvas-heading p')!.textContent=ram?.active?'粗线是当前指定墙；按几何方向选择 crossing / folding。':explorer?.active?'紫色 alcove 是 A₀ − λ；折叠后的终点可以不同。':'沿着三色墙，画出你的路线。';
  const live=document.querySelector('.live-dot')!;live.innerHTML=`<i></i>${ram?.active?'Ram 模式':explorer?.active?'折叠路径':'自由绘制'}`;
  const next=ram?.active?ram.next:null;
  $('ram-choice-popup').hidden=!next?.canFold;
  if(next?.canFold){
    $('ram-popup-info').textContent=`第 ${ram.walk!.position+1} 步 · ${next.wall.equation} · 当前${next.side>0?'正':'负'}侧 / 参考 ${next.referenceSign>0?'+':'−'}`;
    $('ram-popup-cross').textContent=$('ram-cross').textContent;
    $('ram-popup-fold').textContent=$('ram-fold').textContent;
  }
  renderLog();
}
function toSubscript(n:number):string {return String(n).replace(/[0-9]/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);}
function renderLog():void {
  const html:string[]=[];
  const nodes=displayedNodes();
  for(let k=0;k<nodes.length;k++){
    const nd=nodes[k];
    if(k===0){html.push(`<li data-step="0"><span class="log-index">0</span><span class="log-main"><span class="log-title">${ram?.active?'wA₀':'A₀'}</span><br/><span class="log-subtitle">${ram?.active?alcoveKey(nd.alcove):'Fundamental alcove'}</span></span><span class="log-type">起点</span></li>`);continue;}
    const previous=nodes[k-1].alcove;
    const foldStep=currentFoldPath()?.steps[k-1];
    const edge=foldStep?.wall??crossedWall(previous,nd.alcove);
    if(foldStep){const side=foldStep.kind==='fold'?foldStep.sign:-foldStep.sign;html.push(`<li data-step="${k}"><span class="log-index">${k}</span><span class="log-main"><span class="log-title">${foldStep.kind==='fold'?'↶ 折叠 · 留在当前 alcove':'→ 穿墙'} (${foldStep.sign>0?'+':'−'})</span><br/><span class="log-subtitle">${edge?.equation} · ${alcoveKey(nd.alcove)}${ram?.active?`<br/>当前侧 ${side>0?'+':'−'} · 参考 ε = ${ram.reference!.signs[k-1]>0?'+':'−'}`:''}</span></span><span class="log-type t${nd.via}">${foldStep.kind==='fold'?'f':'c'}${SUB[nd.via!]}${foldStep.sign>0?'⁺':'⁻'}</span></li>`);continue;}
    html.push(`<li data-step="${k}"><span class="log-index">${k}</span><span class="log-main"><span class="log-title">A${toSubscript(k-1)} → A${toSubscript(k)}</span><br/><span class="log-subtitle">${edge?.equation ?? '—'} · ${alcoveKey(nd.alcove)}</span></span><span class="log-type t${nd.via}">s${SUB[nd.via!]}</span></li>`);
  }
  $('walk-log').innerHTML=html.join('');
}
function persist():void {try{localStorage.setItem(STORAGE,JSON.stringify({nodes:walk.nodes,camera,snap}));}catch{/* Storage optional */}}
function update():void {render();persist();}
function setTool(next:Tool):void {
  tool=next;
  for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))b.classList.toggle('selected',b.dataset.tool===next);
  svg.classList.toggle('pan-cursor',next==='pan');
  $('drawing-status').textContent=ram?.active?'Ram 逐步行走':explorer?.active?'折叠路径浏览':next==='pan'?'平移模式':'打点模式';
}
function setZoom(factor:number,px?:number,py?:number):void {
  const {w,h}=dims(),x=px??w/2,y=py??h/2;
  const world=cartesianAt(x,y,camera);
  const scale=clamp(camera.scale*factor,3,400);
  camera={scale,ox:x-world.u*scale,oy:y-world.v*scale};update();
}
function recenter():void {const {w,h}=dims();camera=initialCamera(w,h);update();}
function fitPath():void {const {w,h}=dims();camera=fitCamera(w,h);update();}
function onAlcoveClick(key:string,e:MouseEvent):void {
  if(tool!=='draw'||spaceHeld||draggedRecently)return;
  if(ram.active){showToast('请用 Crossing / Folding 按钮执行当前指定墙；拖动可平移画布');return;}
  if(explorer.active){showToast('正在浏览折叠路径；点击「返回自由绘制」可继续手动画图');return;}
  const a=fromKey(key),edge=crossedWall(walk.current,a);
  if(!edge){showToast('只能进入与当前 alcove 共边的邻居');return;}
  const pixel=mousePoint(e);
  const point=snap?center(a):cartesianAt(pixel.x,pixel.y,camera);
  try{walk.append(a,point);update();}
  catch(error){showToast((error as Error).message);}
}
function loadWord(word:readonly WallType[]):void {
  try{walk.setWord(word);explorer.deactivate();ram.deactivate();fitPath();showToast(`已绘制 ${word.length} 步：${formatWord(word)}`);}
  catch(err){showToast((err as Error).message);}
}
async function copy(text:string):Promise<void>{
  try{await navigator.clipboard.writeText(text);showToast('已复制到剪贴板');}
  catch{showToast('浏览器未授予复制权限，请手动选择文本复制');}
}
function download(name:string,content:string,mime:string):void {
  const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),800);
}
function exportSVG():void {
  // Export a *new* scene with a camera that fits the whole path, not the current crop.
  const w=1200,h=900,c=fitCamera(w,h,115,250);
  const content=nodeSVG(c,w,h).replace(/<g class="hit-regions">[\s\S]*?<\/g>/,'');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
  download('alcove-path-A2.svg',xml,'image/svg+xml;charset=utf-8');showToast('SVG 已导出：完整路线自动适配画面');
}
function restore():void {
  try{
    const text=localStorage.getItem(STORAGE);if(!text)return;
    const data=JSON.parse(text);
    if(data?.nodes)walk.restore(JSON.stringify(data.nodes));
    if(typeof data?.snap==='boolean')snap=data.snap;
    if(data?.camera && ['ox','oy','scale'].every(k=>Number.isFinite(data.camera[k])) && data.camera.scale>=3 && data.camera.scale<=500){camera=data.camera;cameraReady=true;}
  }catch{/* Ignore malformed local storage */}
}
explorer=new FoldExplorer(fit=>{if(explorer.active)ram?.deactivate();if(fit)fitPath();else update();});
ram=new RamExplorer(fit=>{if(ram.active&&explorer.active)explorer.deactivate();if(fit)fitPath();else update();});
restore();
explorer.restore();
ram.restore();
if(ram.active)explorer.deactivate();
$('open-free-mode').addEventListener('click',()=>{ram.deactivate();explorer.deactivate();fitPath();});
$('open-ram-mode').addEventListener('click',()=>{explorer.deactivate();ram.activate();});
$('ram-popup-cross').addEventListener('click',()=>ram.perform('cross'));
$('ram-popup-fold').addEventListener('click',()=>ram.perform('fold'));
($('snap-checkbox') as HTMLInputElement).checked=snap;
// Mouse / pen / touch interaction.
svg.addEventListener('click',e=>{
  if(draggedRecently){draggedRecently=false;return;}
  const target=e.target as Element;
  const hit=target.closest<SVGElement>('[data-alcove]');
  if(hit?.dataset.alcove)onAlcoveClick(hit.dataset.alcove,e);
});
svg.addEventListener('pointerdown',e=>{
  const hit=(e.target as Element).closest('[data-alcove]');
  if(ram.active||explorer.active||tool==='pan'||spaceHeld||!hit){
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:camera.ox,oy:camera.oy,moved:false};
    svg.setPointerCapture(e.pointerId);svg.classList.add('is-dragging');
  }
});
svg.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.hypot(dx,dy)>3)drag.moved=true;
  camera.ox=drag.ox+dx;camera.oy=drag.oy+dy;render();
});
function endDrag(e:PointerEvent):void {
  if(!drag||e.pointerId!==drag.id)return;
  if(drag.moved)draggedRecently=true;
  drag=null;svg.classList.remove('is-dragging');persist();
  if(draggedRecently)setTimeout(()=>{draggedRecently=false;},20);
}
svg.addEventListener('pointerup',endDrag);
svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('wheel',e=>{e.preventDefault();const p=mousePoint(e);setZoom(Math.exp(-e.deltaY*.0012),p.x,p.y);},{passive:false});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))b.addEventListener('click',()=>setTool(b.dataset.tool as Tool));
$('zoom-in').addEventListener('click',()=>setZoom(1.22));
$('zoom-out').addEventListener('click',()=>setZoom(1/1.22));
$('recenter-btn').addEventListener('click',recenter);
$('fit-btn').addEventListener('click',fitPath);
$('undo-btn').addEventListener('click',()=>{if(walk.undo())update();});
$('redo-btn').addEventListener('click',()=>{if(walk.redo())update();});
$('clear-btn').addEventListener('click',()=>{walk.clear();update();showToast('已清空，重新从 A₀ 出发');});
$('snap-checkbox').addEventListener('change',e=>{snap=(e.target as HTMLInputElement).checked;persist();});
$('word-form').addEventListener('submit',e=>{e.preventDefault();try{loadWord(parseWord(($('word-input') as HTMLInputElement).value));}catch(err){showToast((err as Error).message);}});
$('load-example').addEventListener('click',()=>{
  const input=$('example-select') as HTMLSelectElement;
  if(!input.value){showToast('请先选择示例路线');return;}
  loadWord(input.value.split(',').map(x=>Number(x) as WallType));
});
$('copy-word').addEventListener('click',()=>void copy(currentFoldPath()?actionLabel(currentFoldPath()!):formatWord(walk.word)));
$('prompt-btn').addEventListener('click',()=>void copy(PROJECT_PROMPT));
$('export-btn').addEventListener('click',exportSVG);
$('walk-log').addEventListener('click',e=>{
  const item=(e.target as Element).closest<HTMLElement>('[data-step]');
  if(!item)return;
  const idx=Number(item.dataset.step),node=displayedNodes()[idx];
  if(!node)return;
  const {w,h}=dims();camera.ox=w/2-camera.scale*node.point.u;camera.oy=h/2-camera.scale*node.point.v;update();
});
$('export-json').addEventListener('click',()=>{download('alcove-path-A2.json',JSON.stringify((ram.active?ram.exportData():null)??explorer.exportData()??{rootSystem:'A2_affine',convention:'right action',nodes:walk.nodes,word:walk.word},null,2),'application/json;charset=utf-8');showToast('已导出 JSON');});
const dialog=$('help-dialog') as HTMLDialogElement;
$('help-btn').addEventListener('click',()=>dialog.showModal());
$('help-close').addEventListener('click',()=>dialog.close());
$('help-ok').addEventListener('click',()=>dialog.close());
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLSelectElement)) { e.preventDefault();spaceHeld=true;svg.classList.add('pan-cursor'); }
  if(e.ctrlKey||e.metaKey){
    if(ram.active||explorer.active||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
    if(e.key.toLowerCase()==='z') {e.preventDefault();if(e.shiftKey){if(walk.redo())update();}else{if(walk.undo())update();}}
    if(e.key.toLowerCase()==='y'){e.preventDefault();if(walk.redo())update();}
    return;
  }
  if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || dialog.open)return;
  if(e.key.toLowerCase()==='d')setTool('draw');
  if(e.key.toLowerCase()==='h')setTool('pan');
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;svg.classList.toggle('pan-cursor',tool==='pan');}});
window.addEventListener('blur',()=>{spaceHeld=false;svg.classList.toggle('pan-cursor',tool==='pan');});
let previousView:{w:number,h:number}|null=null;
new ResizeObserver(()=>{
  const current=dims();
  if(previousView){
    if(current.w<previousView.w*.8 || current.h<previousView.h*.75){
      camera=fitCamera(current.w,current.h,Math.min(90,current.w*.18));
    } else {
      const world=cartesianAt(previousView.w/2,previousView.h/2,camera);
      camera.ox=current.w/2-world.u*camera.scale;
      camera.oy=current.h/2-world.v*camera.scale;
    }
    persist();
  }
  previousView=current;
  render();
}).observe(svg);
render();
