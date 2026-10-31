import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyze } from '../pro/analysis.js';
import { settings } from '../pro/config.js';
import { fixture, NOW } from '../pro/tests/helpers.js';

const root=resolve(import.meta.dirname,'..'), temp=await mkdtemp(join(tmpdir(),'tr-native-'));
try{
  const cases=[];
  const add=(name,mutate=()=>{})=>{const f=fixture();mutate(f);cases.push({name,f});};
  add('flat');add('book',f=>{f.book={time:NOW,bid:101.99,ask:102.01,depthQuote:10000};});
  add('rising',f=>f.seconds.forEach((b,i)=>{b.open=b.low=102+i*.001;b.close=b.high=102+i*.0015;}));
  add('oscillating',f=>f.seconds.forEach((b,i)=>{b.open=b.high=b.low=b.close=102+Math.sin(i/9)*.4;}));
  add('gap',f=>f.seconds.splice(70,1));add('minute-gap',f=>f.minutes.splice(20,1));add('stale',f=>{f.now+=5000;});
  add('bad-ohlc',f=>{f.seconds[80].high=1;});
  add('no-volume',f=>f.seconds.forEach(b=>{b.quoteVolume=0;b.buyQuote=0;}));
  add('required-volume',f=>{f.config=settings({volumeFilter:true});f.seconds.forEach(b=>{b.quoteVolume=0;b.buyQuote=0;});});
  const fixtures=join(temp,'fixtures'),classes=join(temp,'classes');await mkdir(fixtures);await mkdir(classes);
  for(const {name,f} of cases){const r=analyze(f), lines=[`N\t${f.now}`,`V\t${f.config?.volumeFilter??false}`];
    for(const [type,bars] of [['S',f.seconds],['M',f.minutes]])for(const b of bars)lines.push([type,b.time,b.open,b.high,b.low,b.close,b.volume,b.quoteVolume,b.buyQuote??'NaN',b.last??b.time+999].join('\t'));
    if(f.book)lines.push(['B',f.book.time,f.book.bid,f.book.ask,f.book.depthQuote].join('\t'));
    const expected={...r,...r.indicators,macdLine:r.indicators?.macd.line,macdSignal:r.indicators?.macd.signal,macdHistogram:r.indicators?.macd.histogram};
    for(const key of ['ready','category','score','gainPct','actualChangePct','price','recentMean','referenceMean','volumeRatio','buyShare','spreadPct','ema9','ema21','rsi14','macdLine','macdSignal','macdHistogram','volatilityPct','support','resistance'])lines.push(['E',key,expected[key]==null?'NaN':expected[key]].join('\t'));
    await writeFile(join(fixtures,name+'.tsv'),lines.join('\n'));
  }
  const source='android/app/src/main/java/com/traderadar/pro/';
  const compile=spawnSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-source','17','-target','17','-d',classes,...['NativeScanModel','NativeOutcome','OfficialSource','ScanSessionController','LocalUiPolicy'].map(n=>source+n+'.java'),'android/native-tests/CoreTest.java'],{cwd:root,encoding:'utf8'});
  if(compile.status!==0){process.stderr.write(compile.stderr||'JDK compiler unavailable\n');process.exitCode=1;}else{
    const run=spawnSync('java',['-cp',classes,'CoreTest',fixtures],{cwd:root,encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);if(run.status!==0)process.exitCode=1;
  }
}finally{await rm(temp,{recursive:true,force:true});}
