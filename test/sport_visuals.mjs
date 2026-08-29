import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';

const scriptPath = fileURLToPath(new URL('../sport-visuals.js', import.meta.url));
const failures = [];
function assert(name, cond, extra) {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra ?? ''); failures.push(name); }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head></head><body>
  <div id="situationBox" class="situation hidden">
    <div id="downDistance"></div>
    <div id="lastPlay"></div>
    <div class="field" id="fieldGfx">
      <div id="ezLeft"></div><div id="ezRight"></div><div id="ballMarker"></div>
    </div>
  </div>
</body></html>`);
await page.addScriptTag({ path: scriptPath });

const mlb = await page.evaluate(() => {
  const summary = {
    header: { competitions: [{ status: { period: 7, type: { state: 'in', shortDetail: 'Top 7th' } }, competitors: [
      { homeAway: 'away', team: { id: '1', shortDisplayName: 'Visitors' } },
      { homeAway: 'home', team: { id: '2', shortDisplayName: 'Home' } }
    ] }] },
    plays: [{ text: 'Single to left field.', count: { balls: 2, strikes: 1 }, outs: 1 }]
  };
  const scoreboardEvent = { competitions: [{ situation: {
    balls: 2, strikes: 1, outs: 1,
    onFirst: { athlete: { displayName: 'Runner One' } },
    onSecond: null,
    onThird: { athlete: { displayName: 'Runner Three' } },
    batter: { athlete: { displayName: 'Current Batter' } },
    pitcher: { athlete: { displayName: 'Current Pitcher' }, pitchCount: 81 },
    onDeck: { athlete: { displayName: 'Next Batter' } }
  } }] };
  const model = SportVisuals.renderForSport('mlb', summary, scoreboardEvent, document);
  return {
    kind: model.kind,
    className: document.getElementById('sportVisualGfx').className,
    first: !!document.querySelector('.sv-b1.occupied'),
    second: !!document.querySelector('.sv-b2.occupied'),
    third: !!document.querySelector('.sv-b3.occupied'),
    headline: document.getElementById('downDistance').textContent,
    details: document.getElementById('lastPlay').textContent,
    visualText: document.getElementById('sportVisualGfx').textContent,
    footballHidden: document.getElementById('fieldGfx').style.display === 'none'
  };
});
assert('MLB uses baseball visual', mlb.kind === 'baseball' && mlb.className.includes('sv-baseball'), mlb);
assert('MLB base occupancy updates', mlb.first && !mlb.second && mlb.third, mlb);
assert('MLB live inning renders', mlb.headline.includes('Top 7'), mlb.headline);
assert('MLB count/player metadata renders', mlb.details.includes('Current Batter') && mlb.details.includes('Current Pitcher'), mlb.details);
assert('MLB Gamecast details include pitch count, on-deck batter, and base runners', mlb.details.includes('81') && mlb.details.includes('Next Batter') && mlb.visualText.includes('1B: Runner One') && mlb.visualText.includes('3B: Runner Three'), mlb);
assert('non-football visual hides football field without removing it', mlb.footballHidden);

const nhl = await page.evaluate(() => {
  const summary = {
    header: { competitions: [{ status: { period: 2, type: { state: 'in', shortDetail: '2nd 08:42' } }, competitors: [
      { homeAway: 'away', team: { id: '10', shortDisplayName: 'Away Ice' } },
      { homeAway: 'home', team: { id: '20', shortDisplayName: 'Home Ice' } }
    ] }] },
    plays: [{ text: 'Power play shot from the slot.', team: { id: '20' } }],
    boxscore: { teams: [
      { team: { id: '10' }, statistics: [{ name: 'shotsOnGoal', displayValue: '17' }] },
      { team: { id: '20' }, statistics: [{ name: 'shotsOnGoal', displayValue: '22' }] }
    ] }
  };
  const model = SportVisuals.renderForSport('nhl', summary, null, document);
  return {
    kind: model.kind,
    className: document.getElementById('sportVisualGfx').className,
    puck: document.querySelector('.sv-puck').style.left,
    power: !!document.querySelector('.sv-power'),
    details: document.getElementById('lastPlay').textContent
  };
});
assert('NHL uses rink visual', nhl.kind === 'hockey' && nhl.className.includes('sv-hockey'), nhl);
assert('NHL latest event shifts puck indicator', nhl.puck === '70%', nhl.puck);
assert('NHL power play state renders', nhl.power);
assert('NHL shots render', nhl.details.includes('17') && nhl.details.includes('22'), nhl.details);

const soccer = await page.evaluate(() => {
  const summary = {
    header: { competitions: [{ status: { type: { state: 'in', shortDetail: "67'" } }, competitors: [
      { homeAway: 'away', team: { id: '31', shortDisplayName: 'Away FC' } },
      { homeAway: 'home', team: { id: '41', shortDisplayName: 'Home FC' } }
    ] }] },
    commentary: [{ text: 'Home FC wins a corner.', team: { id: '41' } }],
    boxscore: { teams: [
      { team: { id: '31' }, statistics: [
        { name: 'possessionPct', displayValue: '44%' },
        { name: 'totalShots', displayValue: '8' },
        { name: 'wonCorners', displayValue: '2' }
      ] },
      { team: { id: '41' }, statistics: [
        { name: 'possessionPct', displayValue: '56%' },
        { name: 'totalShots', displayValue: '13' },
        { name: 'wonCorners', displayValue: '6' }
      ] }
    ] }
  };
  const model = SportVisuals.renderForSport('mls', summary, null, document);
  return {
    kind: model.kind,
    className: document.getElementById('sportVisualGfx').className,
    ball: document.querySelector('.sv-ball').style.left,
    headline: document.getElementById('downDistance').textContent,
    details: document.getElementById('lastPlay').textContent
  };
});
assert('soccer uses pitch visual', soccer.kind === 'soccer' && soccer.className.includes('sv-soccer'), soccer);
assert('soccer latest event shifts pitch indicator', soccer.ball === '65%', soccer.ball);
assert('soccer clock renders', soccer.headline.includes("67'"), soccer.headline);
assert('soccer possession/shots/corners render', soccer.details.includes('44%') && soccer.details.includes('13') && soccer.details.includes('6'), soccer.details);

assert('football DOM remains available for NFL renderer', await page.evaluate(() => !!document.getElementById('ballMarker')));

await browser.close();
if (failures.length) {
  console.error('\n' + failures.length + ' sport visual assertion(s) failed');
  process.exit(1);
}
console.log('\nAll sport visual tests passed.');
