import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxyRequest} from '../src/lib/proxy.ts';
test('SMTP test traverses the frontend proxy only as an authenticated same-origin POST',async()=>{
 const path='clubs/development/fcrww/integrations/smtp/test-email';let calls=0;
 const transport:typeof fetch=async(url,init)=>{calls++;assert.ok(String(url).endsWith('/api/club/tenants/development/fcrww/integrations/smtp/test-email'));assert.equal(init?.method,'POST');return Response.json({status:'accepted'});};
 const request=(method='POST',origin='http://fcrww.explorer.localhost:3002')=>new Request('http://fcrww.explorer.localhost:3002/api/explorer/'+path,{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 assert.equal((await proxyRequest(request(),path.split('/'),'token','http://localhost:3003',transport)).status,200);
 assert.equal((await proxyRequest(request('GET'),path.split('/'),'token','http://localhost:3003',transport)).status,400);
 assert.equal((await proxyRequest(request('POST','https://other.example'),path.split('/'),'token','http://localhost:3003',transport)).status,403);
 assert.equal(calls,1);
});
test('mailbox diagnostic admits only same-origin tenant POST without a recipient',async()=>{
 const path='clubs/development/fcrww/integrations/imap/test-mailbox';let calls=0;
 const transport:typeof fetch=async(url,init)=>{calls++;assert.ok(String(url).endsWith('/integrations/imap/test-mailbox'));assert.deepEqual(JSON.parse(new TextDecoder().decode(init?.body as ArrayBuffer)),{expectedRevision:'r1',resourceId:'imap-resource',versionId:'v1'});return Response.json({status:'connected',folders:[]});};
 const req=(method='POST',origin='http://fcrww.explorer.localhost:3002')=>new Request('http://fcrww.explorer.localhost:3002/api/explorer/'+path,{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({expectedRevision:'r1',resourceId:'imap-resource',versionId:'v1'})}:{})});
 assert.equal((await proxyRequest(req(),path.split('/'),'token','http://localhost:3003',transport)).status,200);
 assert.equal((await proxyRequest(req('GET'),path.split('/'),'token','http://localhost:3003',transport)).status,400);
 assert.equal((await proxyRequest(req('POST','https://other.example'),path.split('/'),'token','http://localhost:3003',transport)).status,403);assert.equal(calls,1);
});
