import { afterEach, expect, it, vi } from "vitest";
import { parseRegistryCsv } from "../site/console/local-seo-csv.js";
class ElementStub {
 children: ElementStub[]=[]; textContent="";value="";onclick?:()=>unknown;onchange?:()=>unknown;
 constructor(public tagName:string){} append(...nodes:ElementStub[]){this.children.push(...nodes);} replaceChildren(...nodes:ElementStub[]){this.children=nodes;} setAttribute(){}
}
const flatten=(n:ElementStub):ElementStub[]=>[n,...n.children.flatMap(flatten)];
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it("parses quoted CSV, keeps language dimensions and rejects hostile columns",()=>{
 const text='id,name,brand,country,languages,timezone,kind,page\r\none,"Name, with comma",Brand,BE,fr-BE;nl-BE,Europe/Brussels,physical,https://example.com';
 expect(parseRegistryCsv(text)[0]).toMatchObject({name:"Name, with comma",languages:["fr-BE","nl-BE"]});
 expect(()=>parseRegistryCsv(text.replace("brand","__proto__"))).toThrow();
 expect(()=>parseRegistryCsv(text+'\n"unterminated')).toThrow();
});
it.each(["fr","en"])("renders the free planner and workspace in %s without changing research language",async(lang)=>{
 vi.stubGlobal("Node",ElementStub);vi.stubGlobal("location",{search:`?lang=${lang}`});vi.stubGlobal("localStorage",{getItem:()=>lang,setItem:()=>{}});
 vi.stubGlobal("document",{documentElement:{lang},getElementById:()=>null,createElement:(tag:string)=>new ElementStub(tag),createTextNode:(text:string)=>{const n=new ElementStub("text");n.textContent=text;return n;}});
 const {renderLocalSeoPreview}=await import("../site/local-seo-preview.js");const planner=renderLocalSeoPreview(lang) as unknown as ElementStub;
 const select=flatten(planner).find(n=>n.tagName==="select")!;select.value="web-only";select.onchange!();
 expect(flatten(planner).map(n=>n.textContent).join(" ")).toContain(lang==="fr"?"non applicables":"not applicable");
 const {renderLocalSeo}=await import("../site/console/local-seo.js");
 const api=vi.fn(async()=>({sites:[{id:"one",name:"One",country:"BE",languages:["nl-BE"],kind:"physical",timezone:"Europe/Brussels"}],observations:[],actions:[]}));
 const root=await renderLocalSeo({api,me:{role:"tenant-admin",tenant:{name:"Acme",domains:["example.com"]}}}) as unknown as ElementStub;
 expect(flatten(root).map(n=>n.textContent).join(" ")).toContain(lang==="fr"?"SEO global et local":"Global and local SEO");
 expect(flatten(root).map(n=>n.textContent).join(" ")).toContain("BE · nl-BE");
 expect(api).toHaveBeenCalledWith("/local-seo/state",{});
});
