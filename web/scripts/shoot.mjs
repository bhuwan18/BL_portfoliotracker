// End-to-end visual check: launches headless Chrome, seeds a sample portfolio into
// IndexedDB, lets the app fetch LIVE prices, and screenshots key screens.
// Usage: node --use-system-ca scripts/shoot.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'http://localhost:5173'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots')
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const userDir = mkdtempSync(join(tmpdir(), 'mf-cdp-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDir}`,
  'about:blank',
])
chrome.on('error', (e) => { console.error('chrome launch error', e); process.exit(1) })

async function getJSON(path) {
  const r = await fetch('http://127.0.0.1:9222' + path)
  return r.json()
}

async function pageWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await getJSON('/json/list')
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error('no page target')
}

function makeClient(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id
      pending.set(myId, { resolve, reject })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
}

const SEED = `(async () => {
  await new Promise((resolve, reject) => {
    const open = indexedDB.open('my-funds');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const idb = open.result; const now = Date.now();
      const tx = idb.transaction(['instruments','transactions'],'readwrite');
      const inst = tx.objectStore('instruments'); const txn = tx.objectStore('transactions');
      inst.put({id:'stock:RELIANCE.NS',type:'stock',name:'Reliance Industries Limited',symbol:'RELIANCE.NS',exchange:'NSE',currency:'INR',createdAt:now});
      inst.put({id:'stock:TCS.NS',type:'stock',name:'Tata Consultancy Services',symbol:'TCS.NS',exchange:'NSE',currency:'INR',createdAt:now});
      inst.put({id:'stock:INFY.NS',type:'stock',name:'Infosys Limited',symbol:'INFY.NS',exchange:'NSE',currency:'INR',createdAt:now});
      inst.put({id:'mf:122639',type:'mf',name:'Parag Parikh Flexi Cap Fund - Direct - Growth',schemeCode:122639,category:'Flexi Cap',currency:'INR',createdAt:now});
      txn.put({id:'t1',instrumentId:'stock:RELIANCE.NS',kind:'buy',date:'2023-01-10',units:50,price:1150,fees:20,createdAt:now});
      txn.put({id:'t2',instrumentId:'stock:RELIANCE.NS',kind:'buy',date:'2024-02-20',units:25,price:1280,fees:10,createdAt:now});
      txn.put({id:'t3',instrumentId:'stock:TCS.NS',kind:'buy',date:'2022-06-15',units:20,price:3300,fees:15,createdAt:now});
      txn.put({id:'t4',instrumentId:'stock:INFY.NS',kind:'buy',date:'2023-09-05',units:40,price:1450,fees:12,createdAt:now});
      txn.put({id:'t5',instrumentId:'mf:122639',kind:'buy',date:'2022-03-01',units:300,price:48,fees:0,createdAt:now});
      txn.put({id:'t6',instrumentId:'mf:122639',kind:'buy',date:'2023-11-01',units:120,price:62,fees:0,createdAt:now});
      tx.oncomplete = () => { idb.close(); resolve('ok'); };
      tx.onerror = () => reject(tx.error);
    };
  });
  return 'seeded';
})()`

async function main() {
  const wsUrl = await pageWsUrl()
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const send = makeClient(ws)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 932, deviceScaleFactor: 2, mobile: true,
  })

  const go = async (path, waitMs) => {
    await send('Page.navigate', { url: BASE + path })
    await sleep(waitMs)
  }
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(SHOTS, name), Buffer.from(data, 'base64'))
    console.log('shot', name)
  }

  // Load app, seed data, reload to pick it up, let live prices arrive.
  await go('/', 3500)
  const seedRes = await send('Runtime.evaluate', { expression: SEED, awaitPromise: true, returnByValue: true })
  console.log('seed:', seedRes.result?.value ?? JSON.stringify(seedRes.exceptionDetails ?? {}))
  await go('/', 9000) // reload + price refresh
  await shot('01-portfolio.png')

  await go('/holdings', 6000)
  await shot('02-holdings.png')

  await go('/instrument/' + encodeURIComponent('stock:RELIANCE.NS'), 6000)
  await shot('03-detail.png')

  await go('/add', 2000)
  await shot('04-add.png')

  await go('/settings', 1800)
  await shot('05-settings.png')

  // Open the instrument search sheet and run a LIVE query to prove search works in-browser.
  await go('/add', 1500)
  await send('Runtime.evaluate', {
    expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/select instrument/i.test(x.textContent||''));if(b)b.click();})()`,
    returnByValue: true,
  })
  await sleep(700)
  await send('Runtime.evaluate', {
    expression: `(()=>{const i=document.querySelector('.sheet input');if(i){const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(i,'tata');i.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
    returnByValue: true,
  })
  await sleep(2600)
  await shot('06-search.png')

  // dump a quick text summary of computed numbers for the log
  const summary = await send('Runtime.evaluate', {
    expression: `(async()=>{const r=await fetch('/api/stocks/quote?symbol=RELIANCE.NS');return await r.text();})()`,
    awaitPromise: true, returnByValue: true,
  })
  console.log('reliance quote via app proxy:', summary.result?.value)

  ws.close()
  chrome.kill()
  await sleep(300)
  console.log('done — shots in', SHOTS)
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED', e)
  chrome.kill()
  process.exit(1)
})
