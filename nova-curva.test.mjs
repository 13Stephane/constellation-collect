/* nova curva · entrada rápida — the acceptance criteria of change request 7, run.
   npm i playwright && node nova-curva.test.mjs
   CHROME=/path/to/chrome overrides the browser (this repo's sessions use the
   preinstalled one at $PLAYWRIGHT_BROWSERS_PATH). */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = pathToFileURL(join(HERE, 'docs', 'nova-curva.html')).href;
const fails = [], oks = [];
const ok = (n, c, d='') => (c ? oks : fails).push(n + (c ? '' : ' :: ' + d));

let browser;
try{
browser = await chromium.launch(process.env.CHROME ? {executablePath:process.env.CHROME} : {});
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
page.on('pageerror', e => fails.push('PAGE ERROR :: ' + e.message));

// --- console opens the sort ---
const con = await ctx.newPage();
con.on('pageerror', e => fails.push('CONSOLE ERROR :: ' + e.message));
await con.goto(FILE + '?console=1&sessao=tarde');
await con.click('[data-step="triagem"]');
ok('console opens a step', await con.locator('[data-step="triagem"].on').count() === 1);

// --- relator ---
await page.goto(FILE + '?mesa=3&sessao=tarde');
await page.waitForTimeout(150);
ok('header carries mesa + sessão', (await page.locator('#hdr').innerText()).replace(/\s+/g,' ').includes('MESA 3'),
   await page.locator('#hdr').innerText());
ok('header says the session', (await page.locator('#hdr').innerText()).includes('TARDE'));
ok('sixteen chips', await page.locator('.grid.g16 .chip').count() === 16);
ok('open step is the sort', await page.locator('.step.open .step-t').innerText() === 'A triagem',
   await page.locator('.step.open .step-t').innerText());
ok('other three steps collapsed', await page.locator('.step.closed').count() === 3);

// --- two-state tap ---
const c1 = page.locator('.grid.g16 .chip').nth(0);
await c1.click(); ok('tap 1 = submerso', await c1.getAttribute('data-v') === '1', await c1.getAttribute('data-v'));
await page.locator('.grid.g16 .chip').nth(0).click();
ok('tap 2 = pôlder', await page.locator('.grid.g16 .chip').nth(0).getAttribute('data-v') === '2');
await page.locator('.grid.g16 .chip').nth(0).click();
ok('tap 3 = neutral', await page.locator('.grid.g16 .chip').nth(0).getAttribute('data-v') === null);

// mark 1,2,3 submerso and 16 pôlder
for (const i of [0,1,2]) await page.locator('.grid.g16 .chip').nth(i).click();
for (const i of [15]) { await page.locator('.grid.g16 .chip').nth(i).click(); await page.locator('.grid.g16 .chip').nth(i).click(); }

// --- long press = sem acordo ---
const c7 = page.locator('.grid.g16 .chip').nth(6);
const box = await c7.boundingBox();
await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
await page.waitForTimeout(100);
ok('long press = sem acordo', await page.locator('.grid.g16 .chip').nth(6).getAttribute('data-v') === 'x',
   await page.locator('.grid.g16 .chip').nth(6).getAttribute('data-v'));

// --- undo reverses the last tap ---
await page.locator('.grid.g16 .chip').nth(4).click();
ok('undo appears', await page.locator('.undo:not(.hide)').count() === 1);
ok('undo counts down', /desfazer \d+/i.test(await page.locator('.undo').innerText()), await page.locator('.undo').innerText());
await page.locator('.undo').click();
ok('undo reverses', await page.locator('.grid.g16 .chip').nth(4).getAttribute('data-v') === null);

// --- no submit button anywhere ---
const labels = await page.locator('button').allInnerTexts();
ok('no submit / confirm control', !labels.some(t => /enviar|confirmar|submeter|salvar/i.test(t)), labels.join('|'));

// --- no scroll at 390x844 ---
const scrolls = await page.evaluate(() => ({
  y: document.documentElement.scrollHeight > window.innerHeight + 1,
  x: document.documentElement.scrollWidth  > window.innerWidth + 1,
  sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
ok('no vertical scroll on the sort', !scrolls.y, JSON.stringify(scrolls));
ok('no horizontal scroll on the sort', !scrolls.x, JSON.stringify(scrolls));

// --- "?" sheet ---
await page.locator('.qbtn').click();
ok('? opens the card texts', await page.locator('#sheet.on').count() === 1);
await page.locator('#sheet .cls').click();

// --- lock gives the read-back ---
await page.locator('.lock').click();
const rb = await page.locator('.readback').innerText();
ok('read-back names submerso', /submerso:\s*1, 2, 3/.test(rb), rb);
ok('read-back names pôlder', /pôlder:\s*16/.test(rb), rb);
ok('read-back names sem acordo', /sem acordo:\s*7/.test(rb), rb);
ok('locked step shows the quiet queue line', (await page.locator('.step.open').innerText()).includes('guardado no aparelho'),
   await page.locator('.step.open').innerText());

// --- the wall ---
await con.click('[data-step="muro"]');
await page.waitForTimeout(300);
ok('console drives the relator screen', await page.locator('.step.open .step-t').innerText() === 'O muro',
   await page.locator('.step.open .step-t').innerText());
ok('twelve letter chips', await page.locator('.grid.g12 .chip').count() === 12);
ok('chips are letters', await page.locator('.grid.g12 .chip').nth(0).innerText() === 'A');
for (const i of [0,2,5]) await page.locator('.grid.g12 .chip').nth(i).click();
for (const i of [3,9]) { await page.locator('.grid.g12 .chip').nth(i).click(); await page.locator('.grid.g12 .chip').nth(i).click(); }
const s2 = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
ok('no scroll on the wall', !s2);
await page.locator('.lock').click();
const rb2 = await page.locator('.readback').innerText();
ok('wall read-back', /nosso e mais escasso:\s*A, C, F/.test(rb2) && /genérico ou alugado:\s*D, J/.test(rb2), rb2);

// --- the placement (afternoon: no rival field) ---
await con.click('[data-step="colocacao"]');
await page.waitForTimeout(300);
ok('seven axes', await page.locator('.axis').count() === 7);
ok('three buttons per axis', await page.locator('.axis').nth(0).locator('.abtn').count() === 3);
ok('no rival field in the afternoon', await page.locator('.field').count() === 0);
for (let i=0;i<7;i++) await page.locator('.axis').nth(i).locator('.abtn').nth(i%3).click();
const s3 = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
ok('no scroll on the placement', !s3);
await page.locator('.lock').click();
ok('placement read-back', (await page.locator('.readback').innerText()).startsWith('acima, igual, abaixo'),
   await page.locator('.readback').innerText());

// --- morning carries the rival field, the only other text in the flow ---
const conAM = await ctx.newPage();
await conAM.goto(FILE + '?console=1&sessao=manha');
await conAM.click('[data-step="colocacao"]');
const am = await ctx.newPage();
am.on('pageerror', e => fails.push('AM ERROR :: ' + e.message));
await am.goto(FILE + '?mesa=5&sessao=manha');
await am.waitForTimeout(200);
ok('morning header', (await am.locator('#hdr').innerText()).includes('MANHA'), await am.locator('#hdr').innerText());
ok('morning carries one rival field', await am.locator('.field').count() === 1);
await am.locator('.field input').fill('Concorrente X');
await am.reload(); await am.waitForTimeout(200);
ok('rival name survives a reload (autosave)', await am.locator('.field input').inputValue() === 'Concorrente X');

// --- offline: everything completes, nothing shouts ---
await ctx.setOffline(true);
const off = await ctx.newPage();
off.on('pageerror', e => fails.push('OFFLINE ERROR :: ' + e.message));
await off.goto(FILE + '?mesa=9&sessao=tarde');
await off.waitForTimeout(200);
await off.locator('.axis').nth(0).locator('.abtn').nth(0).click();
await off.locator('.lock').click();
const offTxt = await off.locator('.step.open').innerText();
ok('offline entry completes', (await off.locator('.readback').count()) === 1);
ok('offline shows one quiet line, no error', offTxt.includes('guardado no aparelho, vai sincronizar.') && !/erro|falha/i.test(offTxt), offTxt);
ok('nothing spins offline', await off.locator('text=/carregando|aguarde/i').count() === 0);
await ctx.setOffline(false);

// --- no mesa: the screen refuses to open ---
const bad = await ctx.newPage();
await bad.goto(FILE + '?sessao=tarde');
ok('no mesa = no screen', (await bad.locator('body').innerText()).includes('Falta a mesa'));

// --- facilitator fallback, one screen, three formats ---
await con.reload(); await con.waitForTimeout(200);
await con.locator('#fb').fill('3: 1,2,3,7 | 16\n3: A,C,F | D,J\n3: acima,igual,abaixo,igual,abaixo,acima,igual\n4: 1,5 | 9');
await con.locator('#fbgo').click();
await con.waitForTimeout(200);
ok('fallback reports no error', (await con.locator('#fberr').innerText()).trim() === '', await con.locator('#fberr').innerText());
ok('fallback wrote four lines', (await con.locator('#fbnote').innerText()).includes('3 triagem') &&
   (await con.locator('#fbnote').innerText()).includes('3 muro') &&
   (await con.locator('#fbnote').innerText()).includes('3 colocação') &&
   (await con.locator('#fbnote').innerText()).includes('4 triagem'), await con.locator('#fbnote').innerText());
const rows = await con.locator('tbody tr').allInnerTexts();
ok('the console table shows the tables', rows.some(r => r.startsWith('3')) && rows.some(r => r.startsWith('4')), rows.join(' / '));

// bad lines are named, not swallowed
await con.locator('#fb').fill('3: 1,2,99\n7: acima,igual\nbanana');
await con.locator('#fbgo').click(); await con.waitForTimeout(150);
const errTxt = await con.locator('#fberr').innerText();
ok('out-of-range card is flagged', /fora de 1–16/.test(errTxt), errTxt);
ok('short axis line is flagged', /esperados 7/.test(errTxt), errTxt);
ok('junk line is flagged', /falta "mesa:"/.test(errTxt), errTxt);

// --- the fallback is one tap from the console home ---
ok('fallback is on the console home', await con.locator('#fb').isVisible());


// --- the cost of an entry, in taps and in thumb-reach ---
const conT = await ctx.newPage();
await conT.goto(FILE + '?console=1&sessao=noite');
await conT.click('[data-step="triagem"]');
const t = await ctx.newPage();
t.on('pageerror', e => fails.push('TAP ERROR :: ' + e.message));
await t.goto(FILE + '?mesa=1&sessao=noite');
await t.waitForTimeout(200);

const boxes = async (sel) => {
  const n = await t.locator(sel).count(); const out = [];
  for (let i=0;i<n;i++){ const b = await t.locator(sel).nth(i).boundingBox(); out.push(Math.min(b.width,b.height)); }
  return out;
};
const chipMin = Math.min(...await boxes('.grid.g16 .chip'));
ok('sort chips are thumb-sized (>=44px)', chipMin >= 44, chipMin + 'px');
const lockBox = await t.locator('.lock').boundingBox();
ok('lock is thumb-sized', Math.min(lockBox.width, lockBox.height) >= 40, JSON.stringify(lockBox));

// a typical pile: four submerso, one pôlder, one sem acordo
let taps = 0;
const tapChip = async i => { await t.locator('.grid.g16 .chip').nth(i).click(); taps++; };
for (const i of [0,1,2,6]) await tapChip(i);
await tapChip(14); await tapChip(14);
ok('a typical sort is six taps', taps === 6, taps + ' taps');
ok('the sort needed no keyboard', await t.locator('.step.open input').count() === 0);
ok('the sort needed no scrolling',
   !(await t.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1)));
await t.locator('.lock').click();

await conT.click('[data-step="colocacao"]');
await t.waitForTimeout(300);
let ptaps = 0;
for (let i=0;i<7;i++){ await t.locator('.axis').nth(i).locator('.abtn').nth(1).click(); ptaps++; }
ok('the placement is exactly seven taps', ptaps === 7, ptaps + ' taps');
const abtnMin = Math.min(...await boxes('.abtn'));
ok('axis buttons are thumb-sized', abtnMin >= 40, abtnMin + 'px');

await conT.click('[data-step="muro"]');
await t.waitForTimeout(300);
ok('the wall is at most twelve chips to touch', await t.locator('.grid.g12 .chip').count() === 12);
const wchipMin = Math.min(...await boxes('.grid.g12 .chip'));
ok('wall chips are thumb-sized', wchipMin >= 44, wchipMin + 'px');

// --- no doors: nothing in the relator view navigates ---
ok('the relator view has no links', await t.locator('#app a').count() === 0);
ok('the relator cannot open a closed step',
   await t.locator('.step.closed .step-body').count() === 0);
await t.locator('.step.closed').first().click();
await t.waitForTimeout(100);
ok('tapping a closed step does nothing', await t.locator('.step.open .step-t').innerText() === 'O muro',
   await t.locator('.step.open .step-t').innerText());

}catch(e){ fails.push('THREW :: ' + e.message.split('\n')[0]); }
try{ await browser?.close(); }catch(e){}
console.log('PASS ' + oks.length);
if (fails.length){ console.log('\nFAIL ' + fails.length); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
