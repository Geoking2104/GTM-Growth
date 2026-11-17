import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
const root='deploy/kayroslab-vps/keycloak/themes/gtm-growth';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('provides a self-contained account wordmark, font and light theme under native Keycloak properties',()=>{
 const properties=readFileSync(`${root}/account/theme.properties`,'utf8');
 expect(properties).toContain('parent=keycloak.v3');expect(properties).toContain('darkMode=false');
 const logo=properties.match(/^logo=(.+)$/m)![1];expect(existsSync(`${root}/account/resources/${logo}`)).toBe(true);
 expect(readFileSync(`${root}/account/resources/${logo}`,'utf8')).toContain('GTM Growth');
 expect(existsSync(`${root}/account/resources/fonts/InterVariable.woff2`)).toBe(true);
 expect(readFileSync(`${root}/account/resources/css/gtm-growth-account-v2.css`,'utf8')).toContain('--gtm-purple:#6935dc');
});
it.each(['fr','en'])('preserves the console return destination and locale for account management in %s',async lang=>{
 vi.stubGlobal('location',{origin:'https://gtm.kayroslab.com',pathname:'/console/',search:`?lang=${lang}`});
 vi.stubGlobal('document',{documentElement:{lang}});vi.stubGlobal('localStorage',{getItem:()=>lang,setItem(){}});vi.stubGlobal('sessionStorage',{getItem:()=>null});
 const {accountConsoleUrl}=await import('../site/console/auth.js');
 const link=new URL(accountConsoleUrl('https://auth.example.com/realms/customer/account/'));
 expect(link.origin).toBe('https://auth.example.com');expect(link.pathname).toBe('/realms/customer/account/');
 expect(link.searchParams.get('referrer')).toBe('gtm-console');expect(link.searchParams.get('referrer_uri')).toBe(`https://gtm.kayroslab.com/console/?lang=${lang}`);expect(link.searchParams.get('kc_locale')).toBe(lang);
});
