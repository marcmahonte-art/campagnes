const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const filename = path.join(root,'lib/distribution-export.ts');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=module.paths;loaded._compile(compiled,filename);
const { PrivateExportCoordinator }=loaded.exports;
let passed=0;
const file={blob:new Blob(['fichier local'],{type:'image/png'}),filename:'temoin.png'};
const hash='a'.repeat(64);
function storage() { const values=new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; }
function transport() {
  const operations=new Map();let lostReserve=false,lostConfirm=false;let confirmations=0;
  return {operations,get confirmations(){return confirmations;},loseReserve(){lostReserve=true;},loseConfirm(){lostConfirm=true;},
    call:async(action,request)=> {
      let value=operations.get(request.operationId);
      if(action==='reserve'&&!value){value={state:'RESERVED',operationId:request.operationId};operations.set(request.operationId,value);}
      if(action==='cancel'&&value?.state!=='CONFIRMED'){value={state:'CANCELLED'};operations.set(request.operationId,value);}
      if(action==='confirm'&&value?.state==='RESERVED'){confirmations++;value={state:'CONFIRMED',operationId:request.operationId,receipt:'recu-unique'};operations.set(request.operationId,value);}
      if(action==='reserve'&&lostReserve){lostReserve=false;return{error:'réponse perdue'};}
      if(action==='confirm'&&lostConfirm){lostConfirm=false;return{error:'réponse perdue'};}
      return {data:value??{state:'UNAVAILABLE'}};
    }};
}
async function check(label,run){await run();passed++;console.log('OK '+label);}
(async()=> {
 await check('Réservation perdue : même opération rejouée après reconstruction du coordinateur',async()=> {
   const mem=storage(),net=transport();net.loseReserve();const first=new PrivateExportCoordinator(mem,'test',net.call);
   await assert.rejects(()=>first.run('png',hash,async()=>file));
   assert.equal(net.operations.size,1);assert.ok(mem.getItem('test'));
   const resumed=new PrivateExportCoordinator(mem,'test',net.call);
   assert.equal(await resumed.run('png',hash,async()=>file),file);assert.equal(net.operations.size,1);assert.equal(net.confirmations,1);
 });
 await check('Confirmation perdue : Blob conservé, rendu unique et pas de double débit',async()=> {
   const net=transport(),coordinator=new PrivateExportCoordinator(storage(),'test',net.call);let renders=0;net.loseConfirm();
   const render=async()=>{renders++;return file;};
   await assert.rejects(()=>coordinator.run('png',hash,render));
   assert.equal(await coordinator.run('png',hash,render),file);assert.equal(renders,1);assert.equal(net.confirmations,1);
   assert.equal(coordinator.confirmedFile,file);
 });
 await check('Rendu échoué : annulation et aucune confirmation',async()=> {
   const net=transport(),coordinator=new PrivateExportCoordinator(storage(),'test',net.call);
   await assert.rejects(()=>coordinator.run('png',hash,async()=>{throw new Error('PNG impossible');}));
   assert.equal(net.confirmations,0);assert.equal([...net.operations.values()][0].state,'CANCELLED');
 });
 await check('Stockage refusé : aucun appel réseau avant préservation du secret',async()=> {
   let calls=0;const coordinator=new PrivateExportCoordinator({getItem:()=>null,setItem:()=>{throw new Error('Stockage bloqué');},removeItem:()=>{}},'test',async()=>{calls++;return{data:{state:'RESERVED'}};});
   await assert.rejects(()=>coordinator.run('png',hash,async()=>file));assert.equal(calls,0);
 });
 await check('Nouvelle composition : ancienne annulation puis nouvelle identité',async()=> {
   const net=transport(),coordinator=new PrivateExportCoordinator(storage(),'test',net.call);
   await coordinator.run('png',hash,async()=>file);await coordinator.run('png','b'.repeat(64),async()=>file);
   assert.equal(net.operations.size,2);assert.equal(net.confirmations,2);
 });
 await check('Double-clic : un seul rendu en cours',async()=> {
   const net=transport(),coordinator=new PrivateExportCoordinator(storage(),'test',net.call);let finish;
   const first=coordinator.run('png',hash,()=>new Promise(resolve=>{finish=resolve;}));
   await new Promise(resolve=>setImmediate(resolve));
   await assert.rejects(()=>coordinator.run('png',hash,async()=>file));finish(file);await first;assert.equal(net.confirmations,1);
 });
 console.log(`${passed} groupes de reprise d’export réussis.`);
 fs.writeFileSync(path.join(root,'outputs/distribution-tests-export.json'),JSON.stringify({passed},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
