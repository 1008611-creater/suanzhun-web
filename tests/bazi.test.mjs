import test from 'node:test';
import assert from 'node:assert/strict';
import { BaZi, MingLi } from './helpers/engine.mjs';

/* 真值来源：已知标准日柱 / 节气 / 五虎遁 / 五鼠遁 对照。
   这些是命理排盘的硬约束，任何引擎改动都必须让它们继续通过。 */

function pillar(opt) {
  return BaZi.paipan(Object.assign({ lng: 120, useTrueSolar: false }, opt)).gz;
}

test('日柱：已知标准日期', () => {
  const cases = [
    [1949, 10, 1, '甲子'],
    [2000, 1, 1, '戊午'],
    [1984, 2, 2, '丙寅'],
    [1990, 6, 15, '辛亥'],
    [2011, 8, 20, '丁未'],
  ];
  for (const [y, m, d, expected] of cases) {
    assert.equal(pillar({ year: y, month: m, day: d, hour: 12, minute: 0 })[2], expected, `${y}-${m}-${d} 日柱`);
  }
});

test('年柱：以立春为界切换', () => {
  assert.equal(pillar({ year: 2024, month: 2, day: 4, hour: 10 })[0], '癸卯');
  assert.equal(pillar({ year: 2024, month: 2, day: 4, hour: 20 })[0], '甲辰');
  assert.equal(pillar({ year: 1990, month: 6, day: 15, hour: 12 })[0], '庚午');
  assert.equal(pillar({ year: 2026, month: 6, day: 1, hour: 12 })[0], '丙午');
});

test('时柱：戊日五鼠遁', () => {
  const expected = { 0: '壬子', 1: '癸丑', 3: '甲寅', 5: '乙卯', 7: '丙辰', 9: '丁巳', 11: '戊午' };
  for (const [hour, gz] of Object.entries(expected)) {
    assert.equal(pillar({ year: 2000, month: 1, day: 1, hour: Number(hour), minute: 0 })[3], gz, `${hour} 时时柱`);
  }
});

test('真太阳时：东经 116.41 修正与时辰归属', () => {
  const p = BaZi.paipan({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, lng: 116.41, useTrueSolar: true });
  assert.equal(p.trueSolar.h, 14);
  assert.equal(p.trueSolar.mi, 15);
  assert.ok(p.trueSolar.lonFix < 0, '经度在 120E 以西，修正为负');
  assert.equal(p.gz.join(' '), '庚午 壬午 辛亥 乙未');
});

test('十神：以日干为我', () => {
  const jia = 0;
  const pairs = [
    [0, '比肩'],
    [1, '劫财'],
    [2, '食神'],
    [3, '伤官'],
    [4, '偏财'],
    [5, '正财'],
    [6, '七杀'],
    [7, '正官'],
    [8, '偏印'],
    [9, '正印'],
  ];
  for (const [other, name] of pairs) {
    assert.equal(BaZi.shiShen(jia, other), name, `甲 -> ${BaZi.GAN[other]}`);
  }
});

test('旬空：甲子旬空戌亥', () => {
  assert.equal(BaZi.xunKong(0).join(','), '戌,亥');
});

test('旺衰：日主强弱与用忌神自洽', () => {
  const p = BaZi.paipan({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, lng: 116.41, useTrueSolar: true });
  const ws = MingLi.wangShuai(p);
  assert.ok(['身强', '偏强', '中和偏弱', '身弱'].includes(ws.strong));
  assert.ok(ws.yong.length >= 1 && ws.ji.length >= 1);
  assert.ok(!ws.yong.some((w) => ws.ji.includes(w)), '用神与忌神不应重叠');
});

test('命卦：1990 男坎 / 女艮，1985 男乾 / 女离', () => {
  assert.equal(MingLi.mingGua(1990, '男').gua, '坎');
  assert.equal(MingLi.mingGua(1990, '女').gua, '艮');
  assert.equal(MingLi.mingGua(1985, '男').gua, '乾');
  assert.equal(MingLi.mingGua(1985, '女').gua, '离');
  assert.equal(MingLi.mingGua(1990, '男').eastWest, '东四命');
});

test('八宅：生气与绝命唯一且方位齐全', () => {
  const bz = MingLi.baZhai('巽');
  assert.equal(bz.list.length, 8);
  const dirs = new Set(bz.list.map((x) => x.dir));
  assert.equal(dirs.size, 8);
  assert.equal(bz.list.filter((x) => x.star === '生气').length, 1);
  assert.equal(bz.list.filter((x) => x.star === '绝命').length, 1);
});

test('姓名五格：三字姓名康熙笔画与五格', () => {
  const n5 = MingLi.wuGe('李思远');
  assert.ok(n5.ok);
  assert.equal(n5.bi.join(','), '7,9,17');
  assert.equal(JSON.stringify(n5.ge), JSON.stringify({ 天格: 8, 人格: 16, 地格: 26, 外格: 18, 总格: 33 }));
});

test('姓名五格：两字姓名外格固定为 2', () => {
  const n5 = MingLi.wuGe('张伟');
  assert.ok(n5.ok);
  assert.equal(n5.bi.join(','), '11,11');
  assert.equal(JSON.stringify(n5.ge), JSON.stringify({ 天格: 12, 人格: 22, 地格: 12, 外格: 2, 总格: 22 }));
});

test('姓名五格：未收录字形返回 ok:false 而非抛错', () => {
  const n5 = MingLi.wuGe('刘龘龘龘龘');
  assert.equal(n5.ok, false);
});

test('合婚：输出评分在 20-95 且层级合法', () => {
  const a = BaZi.paipan({
    gender: '男',
    year: 1990,
    month: 6,
    day: 15,
    hour: 14,
    minute: 30,
    lng: 116.41,
    useTrueSolar: true,
  });
  const b = BaZi.paipan({
    gender: '女',
    year: 1993,
    month: 3,
    day: 8,
    hour: 10,
    minute: 20,
    lng: 121.47,
    useTrueSolar: true,
  });
  const h = MingLi.hehun(a, b);
  assert.ok(h.score >= 20 && h.score <= 95);
  assert.ok(['上等', '中上', '中等', '偏下'].includes(h.level));
});

test('大运：顺逆排与起运年龄合理', () => {
  const p = BaZi.paipan({
    gender: '男',
    year: 1990,
    month: 6,
    day: 15,
    hour: 14,
    minute: 30,
    lng: 116.41,
    useTrueSolar: true,
  });
  assert.equal(p.daYun.list.length, 10);
  assert.ok(p.daYun.startAge > 0 && p.daYun.startAge < 10);
  for (let i = 1; i < p.daYun.list.length; i++) {
    assert.equal(p.daYun.list[i].startYear - p.daYun.list[i - 1].startYear, 10, '每步大运相差十年');
  }
});

test('晚子时：23 点后日柱进位到次日', () => {
  const late = pillar({ year: 2024, month: 2, day: 4, hour: 23, minute: 30 });
  const nextDay = pillar({ year: 2024, month: 2, day: 5, hour: 0, minute: 30 });
  assert.equal(late[2], nextDay[2], '晚子时与次日子时日柱应一致');
  assert.equal(late[3], nextDay[3], '晚子时与次日子时时柱应一致');
});

test('流年：不传年数时默认一个完整甲子（60 年），且不依赖系统时间', () => {
  const p = BaZi.paipan({ year: 1990, month: 6, day: 15, hour: 12, minute: 0, lng: 120, useTrueSolar: false });
  assert.equal(p.liuNian.length, 60, '默认 60 年');
  assert.equal(p.liuNian[0].year, 1991);
  assert.equal(p.liuNian[59].year, 2050);
});

test('流年：早年生人可通过 liuNianYears 覆盖到当前年份之后', () => {
  const nowY = new Date().getFullYear();
  const birth = 1965;
  const want = nowY + 10 - birth;
  const p = BaZi.paipan({
    year: birth,
    month: 6,
    day: 15,
    hour: 12,
    minute: 0,
    lng: 120,
    useTrueSolar: false,
    liuNianYears: want,
  });
  assert.ok(p.liuNian.length >= want, '年数不少于请求值');
  const last = p.liuNian[p.liuNian.length - 1].year;
  assert.ok(last >= nowY, `最后一年 ${last} 应覆盖当前年份 ${nowY}`);
  const hasNow = p.liuNian.some((x) => x.year === nowY);
  assert.ok(hasNow, '包含当前年份');
});

test('流年：小于 60 的请求仍被夹到下限 60，非法值回退 60', () => {
  const base = { year: 2000, month: 6, day: 15, hour: 12, minute: 0, lng: 120, useTrueSolar: false };
  assert.equal(BaZi.paipan(Object.assign({}, base, { liuNianYears: 10 })).liuNian.length, 60);
  assert.equal(BaZi.paipan(Object.assign({}, base, { liuNianYears: -5 })).liuNian.length, 60);
  assert.equal(BaZi.paipan(Object.assign({}, base, { liuNianYears: 'abc' })).liuNian.length, 60);
});
