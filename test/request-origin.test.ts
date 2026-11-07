import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../src/lib/request-origin.ts';
const check = (origin: string | undefined, host='fcrww.explorer.localhost:3002', forwarded='https://foreign.example') =>
  isSameOriginRequest(new Request('http://localhost:3002/api/vault-v2/consent', {
    method:'PUT', headers:{host, ...(origin ? {origin} : {}), 'x-forwarded-host':forwarded},
  }));
test('Vault writes accept their public tenant origin despite Next internal listener URL',()=>{
  assert.equal(check('http://fcrww.explorer.localhost:3002'),true);
});
test('Vault writes deny foreign, missing, internal-listener and malformed origins',()=>{
  for(const origin of [undefined,'null','https://foreign.example','http://localhost:3002','http://other.explorer.localhost:3002']) assert.equal(check(origin),false);
  for(const host of ['fcrww.explorer.localhost:3002/path','attacker@fcrww.explorer.localhost:3002','fcrww.explorer.localhost:3002,foreign.example']) assert.equal(check('http://fcrww.explorer.localhost:3002',host),false);
});
