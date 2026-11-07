import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest } from '../src/lib/proxy.ts';
test('Explorer callback bridge forwards the current session to its fixed API without using Club cookies',async()=>{
  const query='?state=oauth1.'+'a'.repeat(43)+'&code=code';
  const path='clubs/development/fcrww/integrations/bexio/callback';
  let outbound='';
  const response=await proxyRequest(new Request('http://fcrww.explorer.localhost:3002/api/explorer/'+path+query),path.split('/'),'fresh-token','http://127.0.0.1:3003',async(url,init)=>{
    outbound=String(url);
    assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer fresh-token');
    assert.equal((init!.headers as Record<string,string>).Cookie,undefined);
    return Response.json({connected:true});
  });
  assert.equal(response.status,200);
  assert.equal(outbound,'http://127.0.0.1:3003/api/club/tenants/development/fcrww/integrations/bexio/callback'+query);
});
