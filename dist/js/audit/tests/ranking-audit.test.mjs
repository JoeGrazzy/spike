import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const feed=await readFile('feed.html','utf8');
const start=feed.indexOf('const FEED_RANKING_CONFIG=');
const end=feed.indexOf('let signalRefreshTimer=',start);
assert.ok(start>=0 && end>start,'Feed ranking engine must be present');
const source=feed.slice(start,end);
const context={
  window:{SPIKE_FEED_RANKING_OVERRIDES:{}},
  reactionLikeCount:p=>Number(p?.likes||0),
  normalizedReactionEntries:p=>Object.entries(p?.reactions||{}),
};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__ranking={FEED_RANKING_CONFIG,FEED_CONTRACTS,FeedRankingEngine};`,context);
const {FEED_RANKING_CONFIG:c,FEED_CONTRACTS,FeedRankingEngine:R}=context.__ranking;

const now=Date.parse('2026-09-06T12:00:00Z');
const post=(id,author,createdAt,extra={})=>({id,authorUid:author,createdAt,content:extra.content||`Signal #topic${id}`,likes:extra.likes??0,comments:extra.comments??0,saveCount:extra.saveCount??0,views:extra.views??100,mediaType:extra.mediaType||'text',...extra});
const ctx=(posts,signals={})=>({userId:'u1',following:new Set(['u2']),signals,creatorAffinity:{},topicAffinity:{},explorationIds:new Set(),recentEngagement:{},now,posts});

test('ranking contract weights sum to exactly 1',()=>{
  const sum=Object.values(c.base).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(sum-1)<1e-12);
});

test('every ranking contract returns finite scores in [0,1]',()=>{
  const posts=[post('a','u2','2026-09-06T11:00:00Z',{likes:20,comments:4,saveCount:3}),post('b','u3','2026-09-05T08:00:00Z',{likes:3,views:20,mediaType:'video'})];
  for(const mode of Object.keys(FEED_CONTRACTS)){
    const ranked=R.rank(posts,ctx(posts),mode,10);
    assert.equal(ranked.length,2,mode);
    for(const row of ranked) assert.ok(Number.isFinite(row.score)&&row.score>=0&&row.score<=1,`${mode} score must be finite and bounded`);
  }
});

test('ranking is deterministic for identical input',()=>{
  const posts=[post('a','u2','2026-09-06T11:00:00Z',{likes:20}),post('b','u3','2026-09-06T10:00:00Z',{likes:10}),post('c','u4','2026-09-06T09:00:00Z',{likes:5})];
  const a=R.rank(posts,ctx(posts),'forYou',3).map(x=>[x.post.id,x.score]);
  const b=R.rank(posts,ctx(posts),'forYou',3).map(x=>[x.post.id,x.score]);
  assert.deepEqual(a,b);
});

test('ranked output contains no duplicate post ids',()=>{
  const posts=[post('a','u2','2026-09-06T11:00:00Z',{likes:20}),post('a','u2','2026-09-06T10:00:00Z',{likes:10}),post('b','u3','2026-09-06T09:00:00Z',{likes:5})];
  const ranked=R.rank(posts,ctx(posts),'forYou',10);
  assert.equal(new Set(ranked.map(x=>x.post.id)).size,ranked.length);
});

test('diversity caps creator and media-type concentration when alternatives exist',()=>{
  const posts=[];
  for(let i=0;i<6;i++) posts.push(post(`a${i}`,'u2',`2026-09-06T${String(11-i).padStart(2,'0')}:00:00Z`,{likes:100-i}));
  for(let i=0;i<4;i++) posts.push(post(`b${i}`,'u3',`2026-09-06T0${String(9-i)}:00:00Z`,{likes:10-i,mediaType:'video'}));
  const ranked=R.rank(posts,ctx(posts),'forYou',4);
  const creators={}; const types={};
  for(const x of ranked){creators[x.post.authorUid]=(creators[x.post.authorUid]||0)+1;types[R.type(x.post)]=(types[R.type(x.post)]||0)+1}
  assert.ok(Math.max(...Object.values(creators))<=2);
  assert.ok(Math.max(...Object.values(types))<=4);
});

test('server hide feedback is honored by negative ranking modifier',()=>{
  const p=post('h','u2','2026-09-06T11:00:00Z',{likes:50});
  const clean=R.score(p,ctx([p]),FEED_CONTRACTS.forYou);
  const hidden=R.score(p,ctx([p],{h:{hides:20,hide:20}}),FEED_CONTRACTS.forYou);
  assert.ok(hidden.score<clean.score,'hidden content must be down-ranked');
  assert.ok(hidden.modifiers.negative<0);
});

test('saved ranking exposes a consistent base score',()=>{
  const p=post('s','u2','2026-01-01T00:00:00Z');
  const row=R.score(p,ctx([p]),FEED_CONTRACTS.saved);
  assert.equal(row.baseScore,row.score);
});
