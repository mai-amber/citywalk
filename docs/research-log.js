export const COLUMNS = ['schema_version','session_id','participant_code','platform','condition','event_index','event','elapsed_ms','utc_time','view_id','visit_index','heading_deg','pitch_deg','roll_deg','zoom','source','qx','qy','qz','qw','x_m','y_m','z_m','tracking_valid','display_state','target_view_id','detail'];
export function csvCell(value) {
  if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) return '';
  let text = typeof value === 'number' ? String(Math.round(value * 1000000) / 1000000) : String(value);
  // Participant-entered text must remain text when opened in a spreadsheet.
  if (typeof value !== 'number' && /^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
export function filename(meta) { return `CityWalk_${meta.participant.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,32)}_${meta.id}.csv`; }
export class ResearchLog {
  constructor({platform, context = () => ({}), now = () => performance.now(), utc = () => new Date().toISOString(), id = () => crypto.randomUUID()} = {}) {
    Object.assign(this, {platform, context, now, utc, id}); this.active = false; this.lines = []; this.meta = null;
  }
  start(participant) {
    if (this.active) return false;
    this.started = this.now(); this.lastSample = -Infinity; this.sequence = 0; this.visit = 0;
    this.view = this.context().view_id || ''; this.lines = [];
    this.meta = {id:this.id(), participant:(participant.trim() || 'anonymous').slice(0,32), platform:this.platform, started:this.utc(), state:'recording', lastElapsed:0, lastUtc:this.utc()};
    this.active = true; this.event('session_start', {detail:'pose_sampling_hz=20'}); this.event('view_enter'); return true;
  }
  event(event, data = {}) {
    if (!this.active) return;
    const context = this.context();
    const row = {...context, ...data, schema_version:1, session_id:this.meta.id, participant_code:this.meta.participant, platform:this.platform, event_index:this.sequence++, event, elapsed_ms:Math.max(0,this.now()-this.started), utc_time:this.utc(), visit_index:this.visit};
    this.meta.lastElapsed = row.elapsed_ms; this.meta.lastUtc = row.utc_time;
    this.lines.push(COLUMNS.map(k => csvCell(row[k])).join(',') + '\r\n');
    return row;
  }
  viewChanged(view) {
    if (!this.active || !view || this.view === view) return;
    this.event('view_leave', {view_id:this.view}); this.view = view; this.visit++;
    this.event('view_enter', {view_id:view});
  }
  sample(data = {}, additional = []) {
    if (!this.active || this.now() - this.lastSample < 50) return false;
    this.lastSample = this.now(); this.event('pose', data);
    for (const pose of additional) this.event('pose', pose);
    return true;
  }
  finish(reason = 'finish_button') {
    if (!this.active) return false;
    this.event('session_end', {detail:reason}); this.active = false; this.meta.state = 'finished'; return true;
  }
  csv() { return '\uFEFF' + COLUMNS.join(',') + '\r\n' + this.lines.join(''); }
}

// Append-only browser storage. Previous sessions are retained until browser data is cleared.
export class BrowserLogStore {
  async open() {
    if (this.db) return;
    this.db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('citywalk-research-v1',1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sessions',{keyPath:'id'});
        db.createObjectStore('chunks',{keyPath:['id','offset']}).createIndex('session','id');
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async write(meta, lines = [], offset = 0) {
    await this.open();
    await new Promise((resolve,reject) => {
      const tx = this.db.transaction(['sessions','chunks'],'readwrite');
      tx.objectStore('sessions').put({...meta});
      if (lines.length) tx.objectStore('chunks').put({id:meta.id,offset,lines});
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage unavailable'));
    });
  }
  async read(store, method, key) {
    await this.open();
    return new Promise((resolve,reject) => {
      const request = this.db.transaction(store).objectStore(store)[method](key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async list() { return (await this.read('sessions','getAll')).sort((a,b)=>b.started.localeCompare(a.started)); }
  async csv(id) {
    await this.open();
    const chunks = await new Promise((resolve,reject) => {
      const r = this.db.transaction('chunks').objectStore('chunks').index('session').getAll(id);
      r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
    });
    let csv='\uFEFF' + COLUMNS.join(',') + '\r\n' + chunks.sort((a,b)=>a.offset-b.offset).flatMap(c=>c.lines).join('');
    const meta=await this.read('sessions','get',id);
    if(meta.state==='recording') {
      const row={schema_version:1,session_id:id,participant_code:meta.participant,platform:meta.platform,event_index:meta.rowCount,event:'session_incomplete',elapsed_ms:meta.lastElapsed,utc_time:meta.lastUtc,detail:'Unfinished recording export; timestamp is last saved event, end time is unknown.'};
      csv+=COLUMNS.map(k=>csvCell(row[k])).join(',')+'\r\n';
    }
    return csv;
  }
}
