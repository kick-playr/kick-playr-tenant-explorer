import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';

test('a resolved tenant realm shows tenant sign-in without a global Clerk ENV key',async()=>{
 const previous=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
 delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
 const hooks=registerHooks({
  resolve(specifier,context,next){
   if(specifier==='@/lib/server-component-realm')return{url:'fixture:resolved-tenant',shortCircuit:true};
   if(specifier==='@/components/theme-logo')return{url:'fixture:logo',shortCircuit:true};
   if(specifier==='@clerk/nextjs')return{url:'fixture:signin-widget',shortCircuit:true};
   if(specifier==='next/headers')return{url:'fixture:tenant-host',shortCircuit:true};
   return next(specifier,context);
  },
  load(url,context,next){
   const source:Record<string,string>={
    'fixture:resolved-tenant':"export async function serverComponentRealm(){return {ok:true,realm:{club:true,publishableKey:'pk_test_tenant',secretKey:'SYNTHETIC_PRIVATE'}}}",
    'fixture:logo':"export function BrandLogo(){return 'Tenant logo'}",
    'fixture:signin-widget':"export function SignIn(){return 'TENANT_SIGN_IN_WIDGET'}",
    'fixture:tenant-host':"export async function headers(){return new Headers({host:'fcrww.explorer.localhost:3002'})}",
   };
   if(source[url])return{format:'module',source:source[url],shortCircuit:true};
   return next(url,context);
  },
 });
 try{
  const{default:SignInPage}=await import('../src/app/sign-in/[[...sign-in]]/page');
  const html=renderToStaticMarkup(await SignInPage());
  assert.match(html,/tenant administrator account/);
  assert.match(html,/TENANT_SIGN_IN_WIDGET/);
  assert.doesNotMatch(html,/platform operator|Configure Clerk|SYNTHETIC_PRIVATE/);
 }finally{hooks.deregister();if(previous===undefined)delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=previous;}
});
