import test from 'node:test';import assert from 'node:assert/strict';
import {presentScene,canonicalScene,inkForPaper} from '../Web/src/appearance.mjs';import {notebookScene,notebookFile} from '../Web/src/notebook.mjs';import {snapshot} from '../Web/src/document.mjs';import {contentKey} from '../Web/src/cloud-sync.mjs';
const scene=()=>notebookScene({elements:[{id:'ink',type:'freedraw',x:0,y:0,width:10,height:10,strokeColor:'#343d3a',version:3,versionNonce:12},{id:'photo',type:'image',x:20,y:0,width:10,height:10,fileId:'photo',version:1}],files:{photo:{id:'photo',dataURL:'data:image/png;base64,AAA='}},appState:{viewBackgroundColor:'#fffdf7'}});
test('dark rendering changes neutral ink but never photo assets or canonical document',()=>{
 const s=scene(),base=contentKey(s),p=presentScene(s,'dark');assert.equal(p.elements[0].strokeColor,'#e8edef');assert.equal(p.files.photo,s.files.photo);assert.equal(p.elements[1].fileId,'photo');
 const c=canonicalScene(p.elements,p.files,p.appState,p,s);assert.equal(contentKey(snapshot(s,c.elements,c.appState,c.files)),base);
});
test('edits made in dark rendering survive while presentation versions stay local',()=>{
 const s=scene(),p=presentScene(s,'dark'),edited=p.elements.map(e=>e.id==='ink'?{...e,x:80,version:e.version+1,versionNonce:99}:e);const c=canonicalScene(edited,p.files,p.appState,p,s);assert.equal(c.elements[0].x,80);assert.equal(c.elements[0].strokeColor,'#343d3a');assert.equal(c.elements[0].version,4);assert.equal(c.elements[0].versionNonce,99);
});
test('paper has explicit light/dark overrides and its tone roundtrips',()=>{
 const s=scene();s.whisketch={paper:'grid',paperTone:'dark'};assert.equal(presentScene(s,'light','dark').dark,true);assert.equal(presentScene(s,'dark','light').dark,false);assert.equal(notebookFile(s).pages[0].appearance.paperTone,'dark');assert.equal(inkForPaper('#ff0000',true),'#ff0000');
});
test('paper display attachment is local and original SVG is preserved',()=>{
 const s=scene();s.elements.push({id:'paper',type:'image',x:0,y:0,width:1200,height:1600,version:1,fileId:'paper',customData:{whisketchPaper:true}});s.files.paper={id:'paper',dataURL:'data:image/svg+xml;base64,'+btoa('<svg><rect fill="#fffdf6"/></svg>')};const p=presentScene(s,'dark');assert.ok(p.elements[2].fileId.startsWith('whisketch-display-'));const c=canonicalScene(p.elements,p.files,p.appState,p,s);assert.equal(c.elements[2].fileId,'paper');assert.deepEqual(c.files,s.files);
});
