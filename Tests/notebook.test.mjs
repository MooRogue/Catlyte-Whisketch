import test from 'node:test';
import assert from 'node:assert/strict';
import {notebookScene,capturePage,pageScene,notebookFile,readNotebook} from '../Web/src/notebook.mjs';
import {parseBoard,snapshot} from '../Web/src/document.mjs';
import {contentKey,syncPlan} from '../Web/src/cloud-sync.mjs';
const ink={id:'ink',type:'freedraw',x:10,y:20,width:50,height:30,points:[[0,0],[50,30]],pressures:[.2,.9],customData:{recognizedText:'cat'}};
const legacy={type:'excalidraw',version:2,elements:[ink],files:{photo:{id:'photo',dataURL:'data:image/png;base64,AAA='}},appState:{viewBackgroundColor:'#fffdf7'}};
test('legacy ink pressure, images and metadata survive notebook migration and file roundtrip',()=>{
 const s=notebookScene(structuredClone(legacy),'p1');const file=notebookFile(s),back=parseBoard(JSON.stringify(file));
 assert.equal(file.type,'whisketch-notebook');assert.equal(file.elements,undefined);
 assert.deepEqual(back.elements,legacy.elements);assert.deepEqual(back.files,legacy.files);
 assert.equal(contentKey(back),contentKey(s));
});
test('switching and editing pages never replaces another page',()=>{
 let s=notebookScene(structuredClone(legacy),'p1');s.pages.push({id:'p2',title:'Second',elements:[],files:{},appState:{},paper:'dots'});
 s=pageScene(s,'p2');s=snapshot(s,[{...ink,id:'second'}],{},{});
 s=pageScene(s,'p1');assert.equal(s.elements[0].id,'ink');assert.equal(s.pages[1].elements[0].id,'second');
 const f=notebookFile(s);assert.equal(f.pages.length,2);assert.equal(f.pages[1].paper,'dots');
});
test('page selection and viewport changes do not create cloud edits',()=>{
 const s=notebookScene(structuredClone(legacy),'p1');s.pages.push({id:'p2',title:'Second',elements:[],files:{},appState:{},paper:'plain'});
 const base=contentKey(s);const second=pageScene(s,'p2');second.appState={zoom:{value:2},scrollX:44};
 assert.equal(contentKey(second),base);assert.equal(syncPlan(second,base,notebookFile(s)),'equal');
});
test('a change on another page triggers the safe three-way conflict',()=>{
 const s=notebookScene(structuredClone(legacy),'p1');const base=contentKey(s);
 const local=structuredClone(s),remote=structuredClone(s);local.elements=[{...ink,x:30}];remote.elements=[{...ink,x:40}];
 assert.equal(syncPlan(local,base,notebookFile(remote)),'conflict');
});
test('duplicate pages, unsupported schema and invalid objects are rejected',()=>{
 const f=notebookFile(notebookScene(legacy));
 assert.throws(()=>readNotebook({...f,version:99}));assert.throws(()=>readNotebook({...f,pages:[f.pages[0],f.pages[0]]}));
 const broken=structuredClone(f);broken.pages[0].content.objects[0].x=NaN;assert.throws(()=>parseBoard(broken));
});
