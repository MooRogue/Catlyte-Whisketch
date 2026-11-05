import {test,expect} from '@playwright/test';
test('mixed pages retain text, images and ink across switching, export and reopening',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.Whisketch?.isReady());
 await page.evaluate(()=>window.Whisketch.insertText('First page thoughts'));
 await expect(page.getByRole('status')).toHaveText('Saved on this device');
 await page.getByRole('button',{name:'Add page',exact:true}).click();
 await page.getByRole('textbox',{name:'Page title',exact:true}).fill('Sketches');
 await page.waitForFunction(()=>window.Whisketch.notebook().pages.length===2);
 await page.waitForFunction(()=>window.Whisketch.isReady());
 await page.evaluate(()=>window.Whisketch.insertText('Second page ideas'));
 await expect(page.getByRole('status')).toHaveText('Saved on this device');
 await page.getByRole('button',{name:'Show notebook pages'}).click();
 await page.getByRole('button',{name:/Page 1.*items/}).click();
 await page.waitForFunction(()=>window.Whisketch.isReady());
 const notebook=await page.evaluate(()=>window.Whisketch.notebook());
 expect(notebook.type).toBe('whisketch-notebook');expect(notebook.pages).toHaveLength(2);
 expect(notebook.pages[0].content.objects.some((o:any)=>o.text==='First page thoughts')).toBe(true);
 expect(notebook.pages[1].content.objects.some((o:any)=>o.text==='Second page ideas')).toBe(true);
 await page.reload();await page.waitForFunction(()=>window.Whisketch?.isReady());
 const reopened=await page.evaluate(()=>window.Whisketch.notebook());
 expect(reopened.pages[1].title).toBe('Sketches');expect(reopened.pages[1].content.objects).toEqual(notebook.pages[1].content.objects);
});
test('notebook and whiteboard share content and image insertion does not create placeholder text',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.Whisketch?.isReady());
 await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;c.getContext('2d')!.fillRect(0,0,80,40);window.Whisketch.insertCapture(c.toDataURL(),'');});
 await expect.poll(async()=>page.evaluate(()=>window.Whisketch.notebook().pages[0].content.objects.length)).toBe(1);
 const first=await page.evaluate(()=>window.Whisketch.notebook());
 expect(first.pages[0].content.objects[0].type).toBe('image');
 await page.getByRole('button',{name:'Toggle notebook and whiteboard'}).click();
 expect(await page.evaluate(()=>window.Whisketch.notebook())).toEqual(first);
 await expect(page.getByRole('button',{name:'Arrow',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Shape',exact:true})).toBeVisible();
 await page.screenshot({path:'../whisketch-notebooks-release-20261104/whiteboard-desktop.png'});
});
test('page controls and drawing tools fit phone and dark appearance',async({page})=>{
 await page.setViewportSize({width:440,height:900});await page.goto('/');await page.waitForFunction(()=>window.Whisketch?.isReady());
 await expect(page.getByRole('button',{name:'Add page',exact:true})).toBeVisible();
 const bar=await page.getByRole('navigation',{name:'Writing tools'}).boundingBox();expect(bar!.x).toBeGreaterThanOrEqual(0);expect(bar!.x+bar!.width).toBeLessThanOrEqual(440);
 await page.screenshot({path:'../whisketch-notebooks-release-20261104/notebook-phone.png'});
 await page.getByRole('button',{name:'Notebook actions'}).click();await page.getByRole('button',{name:'Toggle appearance'}).click();await page.getByRole('button',{name:'Close notebooks'}).click();
 await page.screenshot({path:'../whisketch-notebooks-release-20261104/notebook-dark-phone.png'});
});

test('upgrade preserves the original local library and leaves old cloud links untouched',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.Whisketch?.isReady());
 await page.evaluate(async()=>{
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const old=[{id:'old',title:'Existing notes',updated:1,scene:{type:'excalidraw',version:2,elements:[{id:'ink',type:'freedraw',x:5,y:5,width:10,height:10,points:[[0,0],[10,10]],pressures:[.2,.8]}],files:{},appState:{}},cloud:{url:'https://cloud.example/Existing.whiteboard',scope:'old',etag:'"old"'}}];
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put(old,'whisketch-library-v1');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 });
 await page.reload();await page.waitForFunction(()=>window.Whisketch?.isReady());
 await expect(page.getByRole('textbox',{name:'Notebook title',exact:true})).toHaveValue('Existing notes');
 const doc=await page.evaluate(()=>window.Whisketch.notebook());expect(doc.pages[0].content.objects[0].pressures).toEqual([.2,.8]);
 const backup=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('keyval-store');r.onsuccess=()=>resolve(r.result);});return await new Promise<any>(resolve=>{const r=db.transaction('keyval').objectStore('keyval').get('whisketch-before-notebooks-v2');r.onsuccess=()=>{db.close();resolve(r.result);};});});
 expect(backup[0].cloud.url).toBe('https://cloud.example/Existing.whiteboard');expect(backup[0].scene.elements).toHaveLength(1);
});
