import initSqlJs, { type Database } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical, validateEvent } from './security.js';
import type { ChatEvent, Roster } from './types.js';

export class Store {
  private constructor(private db:Database,private path:string) {}
  static async open(path:string,wasmPath?:string):Promise<Store> {
    const SQL=await initSqlJs(wasmPath?{locateFile:()=>wasmPath}:{});
    const db=new SQL.Database(path!==':memory:'&&existsSync(path)?readFileSync(path):undefined);
    db.run('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, author TEXT NOT NULL, seq INTEGER NOT NULL, clock INTEGER NOT NULL, raw TEXT NOT NULL, UNIQUE(author,seq)); CREATE TABLE IF NOT EXISTS receipts (event TEXT NOT NULL, peer TEXT NOT NULL, PRIMARY KEY(event,peer));');
    return new Store(db,path);
  }
  private rows(sql:string,params:any[]=[]):any[] { const stmt=this.db.prepare(sql); try {stmt.bind(params); const rows=[];while(stmt.step()) rows.push(stmt.getAsObject());return rows;} finally {stmt.free();} }
  flush() { if(this.path===':memory:')return; mkdirSync(dirname(this.path),{recursive:true}); writeFileSync(this.path+'.tmp',this.db.export());renameSync(this.path+'.tmp',this.path); }
  append(input:unknown,roster:Roster):boolean {
    const e=validateEvent(input,roster),raw=canonical(e);
    const old=this.rows('SELECT raw FROM events WHERE id=?',[e.id])[0];
    if(old) {if(old.raw!==raw) throw new Error('Çakışan mesaj kimliği.');return false;}
    this.db.run('INSERT INTO events VALUES (?,?,?,?,?)',[e.id,e.author,e.seq,e.clock,raw]);
    try{this.flush();}catch(error){this.db.run('DELETE FROM events WHERE id=?',[e.id]);throw error;}
    return true;
  }
  events(roster:Roster):ChatEvent[] {return this.rows('SELECT raw FROM events ORDER BY clock,author,seq').map(row=>JSON.parse(row.raw)).filter(e=>!(e.author in roster.revoked) || e.seq<=roster.revoked[e.author]);}
  missing(heads:Record<string,number>,roster:Roster,limit=64):ChatEvent[] {return this.events(roster).filter(e=>e.seq>(heads[e.author]??0)).slice(0,limit);}
  heads():Record<string,number> {const heads:Record<string,number>={};for(const r of this.rows('SELECT author,seq FROM events ORDER BY author,seq')){if(r.seq===(heads[r.author]??0)+1)heads[r.author]=r.seq;}return heads;}
  maxSeq(author:string):number {return Number(this.rows('SELECT COALESCE(MAX(seq),0) n FROM events WHERE author=?',[author])[0].n);}
  maxClock():number {return Number(this.rows('SELECT COALESCE(MAX(clock),0) n FROM events')[0].n);}
  acknowledge(id:string,peer:string) {if(!this.rows('SELECT id FROM events WHERE id=?',[id]).length || this.isBackedUpBy(id,peer))return;this.db.run('INSERT OR IGNORE INTO receipts VALUES (?,?)',[id,peer]);try{this.flush();}catch(error){this.db.run('DELETE FROM receipts WHERE event=? AND peer=?',[id,peer]);throw error;}}
  private isBackedUpBy(id:string,peer:string):boolean {return this.rows('SELECT 1 FROM receipts WHERE event=? AND peer=?',[id,peer]).length>0;}
  isBackedUp(id:string):boolean {return this.rows('SELECT 1 FROM receipts WHERE event=? LIMIT 1',[id]).length>0;}
  close(){this.flush();this.db.close();}
}
