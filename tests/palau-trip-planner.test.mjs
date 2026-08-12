import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../palau-trip-planner.html', import.meta.url), 'utf8');

function loadInlineFunction(name, context = {}) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[^}]*\\}`));
  assert.ok(match, `${name} should exist in the inline planner script`);
  return vm.runInNewContext(`(${match[0]})`, context);
}

test('潛導／導遊服務有獨立計費人數控制', () => {
  assert.match(source, /id="guideCard"/);
  assert.match(source, /id="guidePax"/);
  assert.match(source, /onclick="adjustGuidePax\(-1\)"/);
  assert.match(source, /onclick="adjustGuidePax\(1\)"/);
});

test('計費人數預設跟隨一般團員，也可獨立覆寫', () => {
  const effectiveGuidePax = loadInlineFunction('effectiveGuidePax');

  assert.equal(effectiveGuidePax(6, null), 6);
  assert.equal(effectiveGuidePax(6, 4), 4);
  assert.equal(effectiveGuidePax(6, 0), 0);
  assert.equal(effectiveGuidePax(-2, null), 0);
});

test('服務費只依計費人數與行程天數計算，不會把 FOC 加入', () => {
  const calculateGuideFee = loadInlineFunction('calculateGuideFee', { GUIDE_FEE: 10 });

  assert.equal(calculateGuideFee(6, 3), 180);
  assert.equal(calculateGuideFee(6, 0), 0);
  assert.equal(calculateGuideFee(0, 3), 0);
  assert.equal(calculateGuideFee(-1, 3), 0);
});

test('FOC 人數可獨立調整為兩位以上', () => {
  assert.match(source, /<input type="number" id="foc" value="0" min="0"/);
  assert.match(source, /onclick="adjust\('foc', 1\)"/);
  assert.doesNotMatch(source, /id="foc"[^>]*max="1"/);
});

test('每日行程可收合，並保留已選行程摘要', () => {
  assert.match(source, /function toggleDay\(id\)/);
  assert.match(source, /day\.expanded = !day\.expanded/);
  assert.match(source, /class="day-toggle"/);
  assert.match(source, /aria-expanded="\$\{day\.expanded\}"/);
  assert.match(source, /class="day-selection-summary"/);
  assert.match(source, /\.day-card\.is-collapsed \.day-body\s*\{\s*display:\s*none/);
});

test('手機版總計明細改成三行堆疊', () => {
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*?\.breakdown-row\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*?\.breakdown-row \.calc\s*\{[\s\S]*?text-align:\s*left/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*?\.breakdown-row \.amt\s*\{[\s\S]*?text-align:\s*left/);
});

test('浮動總額會顯示即時金額並連回總計', () => {
  assert.match(source, /id="floatingTotal"/);
  assert.match(source, /href="#summary"/);
  assert.match(source, /id="floatingGrandTotal"/);
  assert.match(source, /getElementById\('floatingGrandTotal'\)\.textContent = formatNum\(grandTotal\)/);
  assert.match(source, /id="summary"/);
});

test('匯出報價圖使用深海藍外框與暖白明細層', () => {
  assert.match(source, /\.quote-card\s*\{[\s\S]*?background:\s*#1f4755/);
  assert.match(source, /\.quote-card \.qc-body\s*\{[\s\S]*?background:\s*#f6f0e4/);
  assert.match(source, /\.quote-card \.qc-row\s*\{[\s\S]*?color:\s*#294f5c/);
});

test('報價圖總額使用深色重點面板與金色幣別', () => {
  assert.match(source, /\.quote-card \.qc-total\s*\{[\s\S]*?background:\s*#1f4755/);
  assert.match(source, /\.quote-card \.qc-total-amt \.ccy\s*\{[\s\S]*?color:\s*#d9c47a/);
});

test('報價圖輸出底色跟隨暖白紙張色', () => {
  assert.match(source, /html2canvas\(card,\s*\{[\s\S]*?backgroundColor:\s*'#f6f0e4'/);
});

test('操作入口使用緊湊雙欄 Hero，手機版縮短品牌圖高度', () => {
  assert.match(source, /class="hero-copy"/);
  assert.match(source, /\.hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(/);
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*?\.brand-banner\s*\{[\s\S]*?height:\s*108px/);
});

test('頁首描述使用完整報價流程文案', () => {
  assert.match(source, /<p class="hero-sub">依團員人數自由搭配帛琉每日行程，獨立計算活動、出海證、裝備與導遊服務費，快速完成完整報價。<\/p>/);
  assert.doesNotMatch(source, /自由搭配每日自潛／水肺／浮潛／立槳／陸遊行程/);
});

test('每日行程直接顯示全部活動，不提供活動分類或快速方案', () => {
  assert.match(source, /Object\.entries\(ACTIVITIES\)\.map\(\(\[key, a\]\) =>/);
  assert.doesNotMatch(source, /const ACTIVITY_GROUPS\s*=/);
  assert.doesNotMatch(source, /const DAY_PRESETS\s*=/);
  assert.doesNotMatch(source, /activity-group-tabs|day-presets/);
  assert.doesNotMatch(source, /setActivityGroup|applyDayPreset|presetActivityKeys/);
  assert.doesNotMatch(source, />快速加入<|>活動分類</);
});

test('合法草稿可恢復，版本錯誤或缺少天數資料會被拒絕', () => {
  const isDraftUsable = loadInlineFunction('isDraftUsable', { DRAFT_VERSION: 1, Array, Boolean });

  assert.equal(isDraftUsable({ version: 1, state: { days: [] } }), true);
  assert.equal(isDraftUsable({ version: 2, state: { days: [] } }), false);
  assert.equal(isDraftUsable({ version: 1, state: {} }), false);
  assert.equal(isDraftUsable(null), false);
});

test('草稿數字會限制在安全範圍並處理損壞輸入', () => {
  const safeNumber = loadInlineFunction('safeNumber', { Number, Math });

  assert.equal(safeNumber('8', 0, 999), 8);
  assert.equal(safeNumber(-3, 0, 999), 0);
  assert.equal(safeNumber(5000, 0, 999), 999);
  assert.equal(safeNumber('not-a-number', 6, 999), 6);
});

test('報價狀態會自動儲存並在載入時嘗試恢復', () => {
  assert.match(source, /const STORAGE_KEY\s*=\s*'trislander-palau-quote-v1'/);
  assert.match(source, /function saveDraft\(\)/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(source, /function restoreDraft\(\)/);
  assert.match(source, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(source, /id="draftStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(source, /已恢復上次未完成的報價/);
});

test('刪除行程後提供可操作的復原機會', () => {
  assert.match(source, /let lastDeletedDay\s*=\s*null/);
  assert.match(source, /function undoRemoveDay\(\)/);
  assert.match(source, /showActionToast\([^)]*'復原'/);
  assert.match(source, /id="actionToast"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('主要數字控制有標籤，隱藏報價卡不進入無障礙樹', () => {
  assert.match(source, /<label for="people">一般團員 Participants<\/label>/);
  assert.match(source, /<label for="foc">FOC 教練／攝影師<\/label>/);
  assert.match(source, /aria-label="減少一般團員人數"/);
  assert.match(source, /aria-label="增加 FOC 人數"/);
  assert.match(source, /<div class="quote-stage" aria-hidden="true" inert hidden>/);
});

test('鍵盤焦點清楚且主要觸控目標至少 44px', () => {
  assert.match(source, /:where\(button, a, input\):focus-visible/);
  assert.match(source, /\.counter button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px/);
  assert.match(source, /\.day-remove\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px/);
  assert.match(source, /--muted:\s*#526f78/);
});
