import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const authModule = 'data:text/javascript,' + encodeURIComponent(
  "export async function auth(){return {userId:'fixture-user',getToken:async()=> 'fixture-token'}}",
);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@clerk/nextjs/server') return {url:authModule,shortCircuit:true};
    return next(specifier, context);
  },
});
after(() => hooks.deregister());
const { GET } = await import('../src/app/api/club-branding/[environment]/[id]/[variant]/route.ts');
const host = 'fcrww.explorer.localhost:3002';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
async function requestBranding(variant: string) {
  return GET(new Request('http://' + host + '/api/club-branding/development/fcrww/' + variant + '?v=c8e3e677', {headers:{host}}), {
    params:Promise.resolve({environment:'development',id:'fcrww',variant}),
  });
}
const names = ['SECRETS_KEYS_STRATEGY','EXPLORER_API_ORIGIN','EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY'];
let previous: Record<string,string|undefined>;
beforeEach(()=>{
  previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  process.env.SECRETS_KEYS_STRATEGY='ENV_VARIABLES';
  process.env.EXPLORER_API_ORIGIN='http://127.0.0.1:3003';
  process.env.EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY='fixture-server-secret';
});
afterEach(()=>{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}});
function realm() {
  return Response.json({host,club:true,publishableKey:'pk_test_fixture',secretVariable:'EXPLORER_CLUB_FCRWW_CLERK_SECRET_KEY'});
}

test('signed-in branding requests serve both icons and do not forward cache query parameters',async(t)=>{
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(input: RequestInfo | URL,init?: RequestInit)=>{
    const url=String(input);
    if(url.includes('/public/realm?'))return realm();
    calls.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer fixture-token');
    return Response.json({branding:{faviconLight:{dataUrl:png},faviconDark:{dataUrl:png}}});
  });
  for(const variant of ['faviconLight','faviconDark']){
    const response=await requestBranding(variant);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    assert.ok((await response.arrayBuffer()).byteLength>0);
  }
  assert.deepEqual(calls,Array(2).fill('http://127.0.0.1:3003/api/club/tenants/development/fcrww/branding'));
});

test('signed-in branding preserves upstream failures with an empty asset response',async(t)=>{
  let status=500;
  t.mock.method(globalThis,'fetch',async(input: RequestInfo | URL)=>String(input).includes('/public/realm?')?realm():Response.json({message:'private upstream detail'},{status}));
  for(status of [401,403,500,503]){
    const response=await requestBranding('faviconLight');
    assert.equal(response.status,status);
    assert.equal(response.headers.get('x-explorer-branding-stage'),'upstream');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(await response.text(),'');
  }
});
