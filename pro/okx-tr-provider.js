import WebSocket from 'ws';
import { TradeCandles } from './candles.js';
import { parseOkxTrInstruments, parseOkxTrTrade, parseOkxTrMinuteCandles, parseOkxTrBook } from './okx-tr-schema.js';

const REST = 'https://tr.okx.com';
const STREAM = 'wss://ws.okx.com/ws/v5/public';
const MAX_BATCH = 40;
const MAX_RESPONSE = 12 * 1024 * 1024;
const safe = error => String(error?.message || 'Connection error').slice(0, 140);

// An opt-in, read-only provider for staged verification. Not connected to the
// production engine until device-level REST + WS contracts have been observed.
export class OkxTrProvider {
  constructor({ fetchFn = fetch, socketFactory = url => new WebSocket(url, { handshakeTimeout: 12000, maxPayload: 1024*1024 }),
    clock = Date.now, verified = false } = {}) {
    Object.assign(this, { fetchFn, socketFactory, clock, verified });
    this.markets = new Map(); this.feeds = new Map(); this.sockets = new Set();
    this.stopped = true; this.timers = new Set(); this.abort = new AbortController();
    this.queue = Promise.resolve(); this.nextRequest = 0;
    this.state = { source: 'OKX TR', adapterEnabled: false, sourceVerification: 'LIVE DEVICE VERIFICATION REQUIRED',
      documentationUrl: 'https://tr.okx.com/docs-v5/en/', connected: false,
      catalogAt: null, lastMessageAt: null, receivedTrades: 0, rejected: 0, errors: 0, requests: 0, error: null };
  }
  async request(path) {
    const job = this.queue.then(async () => {
      const wait = Math.max(0, this.nextRequest - this.clock());
      if (wait) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        this.abort.signal.addEventListener('abort', () => { clearTimeout(timer); reject(Error('Stopped')); }, { once: true });
      });
      if (this.stopped) throw Error('Stopped');
      this.nextRequest = this.clock() + 350;
      this.state.requests++;
      const response = await this.fetchFn(REST + path, { signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(12000)]),
        redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw Error('OKX TR HTTP ' + response.status);
      const reader = response.body?.getReader();
      if (!reader) throw Error('Missing response stream');
      const parts=[]; let size=0;
      for (;;) {
        const {done,value}=await reader.read(); if(done)break;
        size+=value.byteLength;
        if(size>MAX_RESPONSE){await reader.cancel();throw Error('Response too large');}
        parts.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    }).catch(error => {this.state.errors++;this.state.error=safe(error);throw error;});
    this.queue = job.catch(() => {});
    return job;
  }
  async refresh() {
    const markets = parseOkxTrInstruments(await this.request('/api/v5/public/instruments?instType=SPOT'));
    if (this.stopped) return;
    this.markets = new Map(markets.map(m => [m.symbol,m]));
    this.state.catalogAt = this.clock();
    for (const key of this.feeds.keys()) if(!this.markets.has(key))this.feeds.delete(key);
    this.reconnect();
  }
  reconnect() {
    for(const socket of this.sockets){socket.retired=true;socket.terminate();}
    this.sockets.clear();
    for(const feed of this.feeds.values())feed.disconnect();
    const markets=[...this.markets.values()];
    for(let i=0;i<markets.length;i+=MAX_BATCH)this.connectBatch(markets.slice(i,i+MAX_BATCH),0);
  }
  connectBatch(markets, attempt) {
    if(this.stopped||!markets.length)return;
    const socket=this.socketFactory(STREAM);
    this.sockets.add(socket);
    const allowed=new Map(markets.map(m=>[m.wireSymbol,m]));
    let subscribed=false;
    let heartbeat;
    socket.on('open',()=>{
      socket.send(JSON.stringify({op:'subscribe',args:markets.map(m=>({channel:'trades',instId:m.wireSymbol}))}));
      heartbeat=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.ping();},30000);
      heartbeat.unref?.();
    });
    socket.on('message',raw=>{
      try {
        if(String(raw)==='pong')return;
        const msg=JSON.parse(String(raw));
        if(msg.event==='error')throw Error('OKX TR subscription rejected');
        if(msg.event==='subscribe'&&msg.arg?.channel==='trades'){
          const market=allowed.get(msg.arg.instId);
          if(!market)throw Error('Unknown subscription');
          const feed=this.feeds.get(market.symbol)??new TradeCandles();
          feed.connect(this.clock());this.feeds.set(market.symbol,feed);subscribed=true;return;
        }
        if(msg.arg?.channel!=='trades'||!Array.isArray(msg.data))return;
        const market=allowed.get(msg.arg.instId);
        if(!market||!subscribed)throw Error('Unverified trade subscription');
        for(const row of msg.data){
          if(row.instId!==market.wireSymbol)throw Error('Instrument mismatch');
          const trade=parseOkxTrTrade(row,this.clock());
          const feed=this.feeds.get(market.symbol);
          if(feed?.add(trade,this.clock())){
            this.state.receivedTrades++;this.state.lastMessageAt=this.clock();
          }
        }
      }catch(error){this.state.rejected++;this.state.error=safe(error);}
    });
    socket.on('error',error=>{this.state.errors++;this.state.error=safe(error);});
    socket.on('close',()=>{
      clearInterval(heartbeat);this.sockets.delete(socket);
      for(const market of markets)this.feeds.get(market.symbol)?.disconnect();
      if(this.stopped||socket.retired)return;
      const delay=Math.min(300000,5000*2**Math.min(attempt,6));
      const timer=setTimeout(()=>{this.timers.delete(timer);this.connectBatch(markets.filter(m=>this.markets.has(m.symbol)),attempt+1);},delay);
      timer.unref?.();this.timers.add(timer);
    });
  }
  async minutes(market) {
    if(!this.markets.has(market.symbol))throw Error('Unknown OKX TR instrument');
    const path='/api/v5/market/candles?instId='+encodeURIComponent(market.wireSymbol)+'&bar=1m&limit=100';
    return parseOkxTrMinuteCandles(await this.request(path),this.clock());
  }
  async book(market) {
    if(!this.markets.has(market.symbol))throw Error('Unknown OKX TR instrument');
    const requestedAt=this.clock();
    return parseOkxTrBook(await this.request('/api/v5/market/books?instId='+encodeURIComponent(market.wireSymbol)+'&sz=5'),requestedAt);
  }
  snapshot() {
    return {...this.state,connected:[...this.sockets].some(s=>s.readyState===WebSocket.OPEN),
      socketCount:this.sockets.size,eligibleMarkets:this.markets.size,
      streamSupportedMarkets:this.markets.size,
      fresh:this.state.lastMessageAt!==null&&this.clock()-this.state.lastMessageAt<=5000};
  }
  async start() {
    if(!this.verified){this.state.error='OKX TR device REST/WebSocket verification pending; adapter disabled';return;}
    if(!this.stopped)return;
    this.stopped=false;this.abort=new AbortController();this.state.adapterEnabled=true;
    try{await this.refresh();}catch(error){this.state.error=safe(error);}
    const refresh=()=>{if(this.stopped)return;this.refresh().catch(error=>{this.state.error=safe(error);}).finally(()=>{
      if(!this.stopped){const timer=setTimeout(()=>{this.timers.delete(timer);refresh();},900000);timer.unref?.();this.timers.add(timer);}
    });};
    const timer=setTimeout(()=>{this.timers.delete(timer);refresh();},900000);timer.unref?.();this.timers.add(timer);
  }
  stop() {
    this.stopped=true;this.state.adapterEnabled=false;this.abort.abort();
    for(const timer of this.timers)clearTimeout(timer);this.timers.clear();
    for(const feed of this.feeds.values())feed.disconnect();
    for(const socket of this.sockets){socket.retired=true;socket.terminate();}
    this.sockets.clear();
  }
}
