import { ResearchLog, BrowserLogStore, COLUMNS } from './research-log.js';

export function sessionUI({platform, context, canStart=()=>true}) {
  const logger=new ResearchLog({platform,context}),store=new BrowserLogStore();
  const root=document.createElement('section');root.id='session-tools';root.setAttribute('aria-label','Session data');
  root.innerHTML='<button id="download-csv" disabled>Download CSV</button><p id="session-note" role="status" hidden></p>';
  document.body.append(root);
  const button=root.querySelector('button'),note=root.querySelector('p');
  let saved=0,queue=Promise.resolve(),busy=false,storageError=false;
  const initialized=store.open().catch(()=>{});
  function warn(){storageError=true;note.hidden=false;note.textContent='Storage unavailable. Download before closing this page.';}
  function persist(){
    const id=logger.meta?.id;if(!id)return Promise.resolve();
    queue=queue.catch(()=>{}).then(async()=>{
      if(logger.meta?.id!==id)return;
      const count=logger.lines.length;
      await store.write({...logger.meta,rowCount:count},logger.lines.slice(saved,count),saved);saved=count;
    });
    queue.catch(warn);return queue;
  }
  async function start(){
    await initialized;
    if(logger.active||!canStart())return;
    await queue.catch(()=>{});
    logger.start('AUTO-'+crypto.randomUUID().slice(0,8).toUpperCase());saved=0;
    button.disabled=false;persist();
  }
  function finish(reason='page_exit'){
    if(!logger.active)return;
    logger.finish(reason);persist();
  }
  async function download(){
    if(busy)return;busy=true;button.disabled=true;
    logger.event('csv_export',{detail:'Snapshot; recording continues'});
    const currentId=logger.meta?.id,currentCsv=logger.csv();
    try {
      await persist().catch(()=>{});
      let sessions=[];try{sessions=await store.list();}catch{warn();}
      const parts=[];
      for(const meta of sessions.sort((a,b)=>a.started.localeCompare(b.started))) {
        const csv=meta.id===currentId?currentCsv:await store.csv(meta.id);
        parts.push(csv.slice(csv.indexOf('\r\n')+2));
      }
      if(currentId&&!sessions.some(s=>s.id===currentId))parts.push(currentCsv.slice(currentCsv.indexOf('\r\n')+2));
      const csv='\uFEFF'+COLUMNS.join(',')+'\r\n'+parts.join('');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='CityWalk_'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      if(!storageError){note.hidden=false;note.textContent='Downloaded. Recording continues.';setTimeout(()=>{if(!storageError)note.hidden=true;},3500);}
    }catch{note.hidden=false;note.textContent='Download did not start. Try again.';}
    finally{busy=false;button.disabled=false;}
  }
  button.onclick=download;
  setInterval(()=>{if(logger.active)persist();},1000);
  document.addEventListener('visibilitychange',()=>{logger.event(document.hidden?'app_hidden':'app_visible');persist();});
  window.addEventListener('pagehide',()=>finish('page_exit'));
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  return {logger,start,finish,persist,download};
}
