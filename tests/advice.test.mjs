import test from 'node:test';
import assert from 'node:assert/strict';
import { BaZi, MingLi } from './helpers/engine.mjs';

/* 行动建议引擎（事业 / 婚姻 / 八宅落地 / 姓名优选）的回归约束。
   这些函数把结构翻译成建议，口径一旦漂移，用户看到的结论就会前后矛盾。 */

function chart(opt) {
  return BaZi.paipan(
    Object.assign(
      {
        name: '刘曙宾',
        gender: '男',
        year: 2005,
        month: 8,
        day: 13,
        hour: 8,
        minute: 58,
        lng: 118.18,
        useTrueSolar: true,
        liuNianYears: 120,
      },
      opt
    )
  );
}

test('十神力量：五组权重之和等于总权重，比例之和约等于 1', () => {
  const p = chart();
  const sp = MingLi.shiShenPower(p);
  const sum = Object.values(sp.w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - sp.total) < 1e-6, '分组权重之和应等于 total');
  const pctSum = Object.values(sp.pct).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(pctSum - 1) < 1e-9, '比例之和应为 1');
  assert.equal(sp.rank.length, 5);
  assert.equal(sp.strongest, sp.rank[0]);
  assert.equal(sp.weakest, sp.rank[4]);
  for (const k of sp.rank) assert.ok(['比劫', '食伤', '财', '官杀', '印'].includes(k));
});

test('十神判定与 bazi.js 口径一致', () => {
  for (let other = 0; other < 10; other++) {
    const expected = BaZi.shiShen(5, other); // 己土日主
    assert.equal(MingLi.shiShenOf(5, other, BaZi.GAN_WX, BaZi.GAN_YY), expected, `己 -> ${BaZi.GAN[other]}`);
  }
});

test('事业方向：主次十神合法，且能对上当前年份所在大运', () => {
  const p = chart();
  const nowYear = 2026;
  const c = MingLi.career(p, nowYear);
  const groups = ['比劫', '食伤', '财', '官杀', '印'];
  assert.ok(groups.includes(c.primary));
  assert.ok(groups.includes(c.secondary));
  assert.notEqual(c.primary, c.secondary);
  assert.ok(c.primaryText.length > 0 && c.secondaryText.length > 0);
  assert.ok(c.step, '应能定位当前大运');
  assert.ok(nowYear >= c.step.startYear, '当前大运起始年份不应晚于当前年份');
  assert.ok(c.stepRate && c.stepRate.label.length > 0);
  assert.ok(c.notes.length >= 1);
});

test('事业方向：不在任何大运区间内时返回 null 而不抛错', () => {
  const p = chart();
  const c = MingLi.career(p, 1900);
  assert.equal(c.step, null);
  assert.equal(c.stepRate, null);
  assert.equal(c.nextStep, null);
  assert.equal(c.notes.length, 0);
});

test('婚姻：评分有界、层级合法、应期落在未来十二年且分数不低于门槛', () => {
  const p = chart();
  const nowYear = 2026;
  const m = MingLi.marriage(p, nowYear);
  assert.ok(m.score >= 20 && m.score <= 95);
  assert.ok(['顺', '偏顺', '平', '需留意'].includes(m.level));
  assert.ok(m.palace.zhi && m.palace.wx && m.palace.shiShen);
  assert.equal(m.isMale, true);
  assert.ok(m.starPct >= 0 && m.starPct <= 1);
  for (const y of m.years) {
    assert.ok(y.year >= nowYear && y.year <= nowYear + 11, `${y.year} 应落在窗口内`);
    assert.ok(y.score >= 2, `${y.year} 应达到动象门槛`);
    assert.ok(y.why.length > 0);
  }
  const years = m.years.map((y) => y.year);
  assert.equal(new Set(years).size, years.length, '应期年份不应重复');
});

test('婚姻：女命看官杀，与男命取星不同', () => {
  const male = MingLi.marriage(chart(), 2026);
  const female = MingLi.marriage(chart({ gender: '女' }), 2026);
  assert.equal(male.isMale, true);
  assert.equal(female.isMale, false);
  assert.match(male.starName, /财/);
  assert.match(female.starName, /官杀/);
});

test('八宅落地：八个方位齐全且吉凶标注唯一', () => {
  const p = chart();
  const ws = MingLi.wangShuai(p);
  const gua = MingLi.mingGua(p.input.year, p.gender);
  const lp = MingLi.layoutPlan(MingLi.baZhai(gua.gua), ws);
  assert.equal(lp.rows.length, 8);
  assert.equal(new Set(lp.rows.map((r) => r.dir)).size, 8);
  assert.equal(lp.rows.filter((r) => r.star === '生气').length, 1);
  assert.equal(lp.rows.filter((r) => r.star === '绝命').length, 1);
  for (const r of lp.rows) assert.ok(r.use.length > 0, `${r.dir} 应有宜用说明`);
  assert.ok(lp.bedHead && lp.desk && lp.altar);
});

test('八宅落地：床头取吉方，且不落在绝命或五鬼', () => {
  const p = chart();
  const ws = MingLi.wangShuai(p);
  const bz = MingLi.baZhai(MingLi.mingGua(p.input.year, p.gender).gua);
  const lp = MingLi.layoutPlan(bz, ws);
  const bed = bz.list.find((f) => f.dir === lp.bedHead);
  assert.ok(bed, '床头方位应在八宅表中');
  assert.notEqual(bed.star, '绝命');
  assert.notEqual(bed.star, '五鬼');
  assert.ok(
    bz.jiFang.some((f) => f.dir === lp.bedHead),
    '床头应取吉方'
  );
});

test('姓名优选：返回候选且人格与地格都不为凶', () => {
  const p = chart();
  const ws = MingLi.wangShuai(p);
  const na = MingLi.nameAdvise(p.name, ws);
  assert.equal(na.ok, true);
  assert.ok(na.picks.length > 0, '应给出候选');
  assert.ok(na.picks.length <= 6);
  for (const k of na.picks) {
    assert.notEqual(k.detail['人格'].ji, '凶', `人格 ${k.ge['人格']} 不应为凶`);
    assert.notEqual(k.detail['地格'].ji, '凶', `地格 ${k.ge['地格']} 不应为凶`);
    assert.ok(k.strokes >= 3 && k.strokes <= 24);
    assert.ok(['中间字', '末字'].includes(k.posLabel));
  }
  const scores = na.picks.map((k) => k.score);
  assert.deepEqual(
    scores,
    scores.slice().sort((a, b) => b - a),
    '候选应按得分降序'
  );
});

test('姓名优选：未收录字形返回 ok:false 而不抛错', () => {
  const p = chart();
  const ws = MingLi.wangShuai(p);
  const na = MingLi.nameAdvise('刘龗宾', ws);
  assert.equal(na.ok, false);
  assert.ok(na.reason);
});

test('姓名优选：不改姓，天格始终等于姓的笔画加一', () => {
  const p = chart();
  const ws = MingLi.wangShuai(p);
  const na = MingLi.nameAdvise(p.name, ws);
  const tian = MingLi.wuGe(p.name).bi[0] + 1;
  for (const k of na.picks) assert.equal(k.ge['天格'], tian, '天格应固定不动');
});

test('格五行：按笔画尾数取，尾数 1/2 木、3/4 火、5/6 土、7/8 金、9/0 水', () => {
  const cases = [
    [1, '木'],
    [2, '木'],
    [3, '火'],
    [4, '火'],
    [5, '土'],
    [6, '土'],
    [7, '金'],
    [8, '金'],
    [9, '水'],
    [10, '水'],
    [11, '木'],
    [24, '火'],
  ];
  for (const [n, wx] of cases) assert.equal(MingLi.geWX(n), wx, `${n} 画`);
});

test('三才判定：比和或相生为顺，相克计为逆', () => {
  assert.equal(MingLi.sanCaiJudge('木', '木', '木').level, '三才相生');
  assert.equal(MingLi.sanCaiJudge('木', '火', '土').bad, 0);
  assert.equal(MingLi.sanCaiJudge('木', '土', '水').bad, 2);
  assert.equal(MingLi.sanCaiJudge('木', '土', '水').level, '三才相克');
});
