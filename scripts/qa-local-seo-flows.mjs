/** Execute the exported core flows against a local stub, never Google. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const runtime=process.env.NODE_RED_ENTRY;
assert.ok(runtime,'Set NODE_RED_ENTRY to the pinned node-red/red.js');
const directory=await mkdtemp(path.join(tmpdir(),'gtm-flow-qa-'));
const received=new Set(), expected=['WF-02','WF-03','WF-07','WF-09','WF-10'];
const token='fixture_only_no_live_credentials_123456789';
let complete,fail;
const done=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});
const server=createServer(async(req,res)=>{try {
 assert.equal(req.method,'POST');assert.equal(req.url,'/api/internal/local-seo/tick');assert.equal(req.headers.authorization,`Bearer ${token}`);
 let body='';for await(const chunk of req)body+=chunk;
 const input=JSON.parse(body);assert.deepEqual(Object.keys(input),['workflow']);assert.ok(expected.includes(input.workflow));
 received.add(input.workflow);res.writeHead(200,{'content-type':'application/json'});res.end('{"status":"idle"}');
 if(received.size===expected.length)complete();
 }catch(error){res.writeHead(400);res.end();fail(error);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const endpoint=`http://127.0.0.1:${server.address().port}/api/internal/local-seo/tick`;
const compose=await readFile('deploy/node-red/compose.yaml','utf8');
assert.match(compose,/FLOWS: ""/);assert.match(compose,/command: \[--settings, \/flows\/settings.cjs\]/);assert.match(compose,/healthcheck:\s+disable: true/);
const flows=JSON.parse(await readFile('deploy/node-red/local-seo.json','utf8'));
assert.equal(flows.filter(f=>f.type==='tab').length,10);
assert.equal(flows.filter(f=>f.type==='http request').length,5);
for(const flow of flows){if(flow.type==='inject'){flow.once=true;flow.repeat='';}if(flow.type==='function')flow.func=flow.func.replaceAll('http://gtm-growth:3000/api/internal/local-seo/tick',endpoint);}
await writeFile(path.join(directory,'flows.json'),JSON.stringify(flows));
let settings=await readFile('deploy/node-red/settings.cjs','utf8');
settings=settings.replace('"/flows/local-seo.json"',JSON.stringify(path.join(directory,'flows.json')));
assert.match(settings,/httpAdminRoot: false/);assert.match(settings,/httpNodeRoot: false/);
await writeFile(path.join(directory,'settings.cjs'),settings);
const child=spawn(process.execPath,[runtime,'--userDir',directory,'--settings',path.join(directory,'settings.cjs')],{env:{...process.env,LOCAL_SEO_BACKEND:endpoint,LOCAL_SEO_WORKER_TOKEN:token,NODE_RED_CREDENTIAL_SECRET:'fixture'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
child.on('error',fail);child.on('exit',code=>{if(received.size!==5)fail(new Error(`Node-RED exited ${code}: ${output}`));});
const timeout=setTimeout(()=>fail(new Error(`Node-RED timeout: ${output}`)),30000);
try{await done;assert.deepEqual([...received].sort(),expected);console.log('Node-RED: all five exported pollers passed; no publication route.');}
finally{clearTimeout(timeout);child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
