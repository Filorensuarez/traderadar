#!/usr/bin/env node
// Read-only OKX TR public WebSocket diagnostic. No API key, orders or signal generation.
// Run locally: node scripts/check-okxtr-ws.mjs
import WebSocket from 'ws';
import { parseOkxTrInstruments, parseOkxTrTrade } from '../pro/okx-tr-schema.js';

const base = 'https://tr.okx.com';
const socketUrl = 'wss://ws.okx.com/ws/v5/public';
const timeoutMs = 20000;
let socket;
let timer;
function close() { clearTimeout(timer); if (socket) socket.terminate(); }
try {
  const response = await fetch(base + '/api/v5/public/instruments?instType=SPOT', {
    signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' }, redirect: 'error'
  });
  if (!response.ok) throw Error('REST HTTP ' + response.status);
  const instruments = parseOkxTrInstruments(await response.json());
  // Subscribe to a symbol returned by OKX TR REST, never assume Global pairs are eligible.
  const market = instruments.find(x => x.symbol === 'BTC_TRY') ?? instruments[0];
  if (!market) throw Error('No eligible OKX TR spot instrument');
  console.log(JSON.stringify({stage:'catalog',ok:true,eligibleMarkets:instruments.length,selected:market.wireSymbol}));
  await new Promise((resolve,reject) => {
    let subscribed = false, trades = 0, settled = false;
    const finish = (error) => { if (settled) return; settled=true; close(); error ? reject(error) : resolve(); };
    socket = new WebSocket(socketUrl, {handshakeTimeout:12000,maxPayload:1024*1024});
    timer = setTimeout(()=>finish(Error('WebSocket timed out waiting for verified trades')),timeoutMs);
    socket.on('open',()=>socket.send(JSON.stringify({op:'subscribe',args:[{channel:'trades',instId:market.wireSymbol}]})));
    socket.on('message',raw=>{
      try {
        if (String(raw)==='pong') return;
        const message=JSON.parse(String(raw));
        if (message.event==='error') return finish(Error('WebSocket subscription rejected: '+String(message.code ?? 'unknown')));
        if (message.event==='subscribe' && message.arg?.channel==='trades' &&
          message.arg.instId===market.wireSymbol) { subscribed=true; console.log(JSON.stringify({stage:'subscription',ok:true})); return; }
        if (message.arg?.channel!=='trades' || message.arg.instId!==market.wireSymbol || !Array.isArray(message.data)) return;
        if (!subscribed) return finish(Error('Trades received without subscription acknowledgement'));
        for (const row of message.data) {
          if (row.instId!==market.wireSymbol) throw Error('Trade instrument mismatch');
          parseOkxTrTrade(row);
          trades++;
        }
        if (trades>0) {
          console.log(JSON.stringify({stage:'trades',ok:true,received:trades,instrument:market.wireSymbol}));
          finish();
        }
      } catch(error) { finish(error); }
    });
    socket.on('error',finish);
    socket.on('close',()=>{if(!settled)finish(Error('WebSocket closed before validated trades'));});
  });
  console.log('OKX TR public trades observed. Full-universe stream and Android lifecycle still unverified.');
} catch(error) {
  close();
  console.error(JSON.stringify({ok:false,error:String(error?.message||'network failure').slice(0,180)}));
  process.exitCode=1;
}
