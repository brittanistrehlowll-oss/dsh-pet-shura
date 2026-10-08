import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/pet-client.js', import.meta.url), 'utf8');

function sourceBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'production code block must exist');
  return source.slice(start, end);
}

class FakeElement {
  constructor() { this.children = []; this.style = {}; this.value = ''; }
  appendChild(child) { this.children.push(child); return child; }
  set textContent(value) { this.children = []; this.value = String(value); }
  get textContent() { return this.value + this.children.map(child => child.textContent).join(''); }
}

test('speech bubble retains its tail across text updates', () => {
  const block = sourceBlock("  const speech = document.createElement('div');", '  // ── 状态符号');
  const create = new Function('document', 'root', 'setTimeout', 'clearTimeout',
    block + '\nreturn { speech, speechTail, say };');
  const { speech, speechTail, say } = create(
    { createElement: () => new FakeElement() }, new FakeElement(), () => 1, () => {});
  say('首次播报', 500);
  say('第二次播报', 500);
  assert.equal(speech.textContent, '第二次播报');
  assert.ok(speech.children.includes(speechTail), 'speech tail must remain attached');
});

test('status card measures visible height and never places its top above viewport', () => {
  const block = sourceBlock('  function placeStatusCard() {', '  async function showStatusCard() {');
  const root = { getBoundingClientRect: () => ({ left: 280, right: 320, top: 370 }) };
  const statusCard = { style: {}, offsetHeight: 180 };
  const viewport = { innerWidth: 400, innerHeight: 400 };
  const placeStatusCard = new Function('root', 'statusCard', 'window',
    block + '\nreturn placeStatusCard;')(root, statusCard, viewport);
  placeStatusCard();
  assert.equal(statusCard.style.top, '212px');
  statusCard.offsetHeight = 440;
  placeStatusCard();
  assert.equal(statusCard.style.top, '8px');

  const showBlock = sourceBlock('  async function showStatusCard() {', '  function closeStatusCard() {');
  const visible = showBlock.indexOf("statusCard.style.display = 'block';");
  const measured = showBlock.lastIndexOf('placeStatusCard();');
  assert.ok(visible >= 0 && measured > visible, 'measure only after making the card visible');
});
