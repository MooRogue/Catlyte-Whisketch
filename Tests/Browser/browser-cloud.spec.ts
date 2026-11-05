import {test,expect,type BrowserContext,type Page} from '@playwright/test';
test('two browser devices exchange a multipage notebook through conditional WebDAV',async({browser})=>{
 const files=new Map<string,{json:string,etag:string}>();let rev=0;
 async function setup(context:BrowserContext) {
  await context.route('https://cloud.example/**',async route=>{
   const q=route.request(),method=q.method(),url=q.url(),headers=q.headers();
   const common={'access-control-allow-origin':'http://127.0.0.1:18862','access-control-allow-methods':'GET,PUT,MKCOL,MOVE,PROPFIND,OPTIONS','access-control-allow-headers':'authorization,depth,content-type,if-match,if-none-match,destination,overwrite','access-control-expose-headers':'ETag'};
   const reply=(status:number,body='',extra={})=>route.fulfill({status,body,headers:{...common,...extra}});
   if(method==='OPTIONS')return reply(204);
   if(!headers.authorization)return reply(401);
   if(method==='MKCOL')return reply(405);
   if(method==='PROPFIND')return reply(207,'<d:multistatus xmlns:d="DAV:">'+[...files.keys()].map(u=>'<d:response><d:href>'+new URL(u).pathname+'</d:href></d:response>').join('')+'</d:multistatus>',{'content-type':'application/xml'});
   const old=files.get(url);
   if(method==='GET')return old?reply(200,old.json,{ETag:old.etag}):reply(404);
   if(method==='PUT'){
    if((headers['if-none-match']==='*'&&old)||(headers['if-match']&&headers['if-match']!==old?.etag))return reply(412);
    files.set(url,{json:q.postData()!,etag:'"'+(++rev)+'"'});return reply(old?204:201);
   }
   return reply(405);
  });
 }
 async function connect(page:Page) {
  await page.goto('/');await page.waitForFunction(()=>window.Whisketch?.isReady());await page.getByRole('button',{name:'Notebook actions'}).click();await page.getByRole('button',{name:'Connect Nextcloud'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Nextcloud address').fill('https://cloud.example');await dialog.getByLabel('Username').fill('alice');await dialog.getByLabel('App password').fill('test-only');await dialog.getByRole('button',{name:'Connect and sync'}).click();await expect(dialog.getByText('Connected. Opened notebooks sync automatically.')).toBeVisible();
 }
 const one=await browser.newContext();await setup(one);const p=await one.newPage();await connect(p);await p.getByRole('button',{name:'Close connection'}).click();await p.getByRole('button',{name:'Close notebooks'}).click();
 await p.evaluate(()=>window.Whisketch.insertText('Device one'));
 await p.getByRole('button',{name:'Add page',exact:true}).click();await p.waitForFunction(()=>window.Whisketch.isReady());await p.evaluate(()=>window.Whisketch.insertText('Another page'));
 await expect.poll(()=>[...files.values()].some(d=>{const x=JSON.parse(d.json);return x.pages?.length===2&&x.pages[1].content.objects.some((o:any)=>o.text==='Another page');})).toBe(true);
 const two=await browser.newContext();await setup(two);const p2=await two.newPage();await connect(p2);await p2.getByRole('dialog').getByRole('button',{name:'My first notebook.whisketch',exact:true}).click();await p2.waitForFunction(()=>window.Whisketch.isReady() && window.Whisketch.notebook().pages.length===2);
 const doc=await p2.evaluate(()=>window.Whisketch.notebook());expect(doc.pages).toHaveLength(2);expect(doc.pages[0].content.objects.some((o:any)=>o.text==='Device one')).toBe(true);expect(doc.pages[1].content.objects.some((o:any)=>o.text==='Another page')).toBe(true);
 await one.close();await two.close();
});
