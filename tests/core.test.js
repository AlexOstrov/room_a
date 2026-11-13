/*
 * Unit-тесты чистой логики 3droom.html.
 * Запуск: node tests/core.test.js
 *
 * Блок CORE не зависит от DOM и THREE — его можно выполнить в Node
 * и проверить все геометрические правила без браузера.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");

var file = path.join(__dirname, "..", "3droom.html");
var html = fs.readFileSync(file, "utf8");
var m = /\/\*==CORE-BEGIN==\*\/([\s\S]*?)\/\*==CORE-END==\*\//.exec(html);
if (!m) throw new Error("CORE-маркеры не найдены в 3droom.html");

var coreSource = m[1];
assert(!/\bTHREE\b/.test(coreSource), "CORE не должен зависеть от THREE");
assert(!/\bdocument\b/.test(coreSource), "CORE не должен обращаться к DOM");

var Core = new Function(coreSource + "\nreturn Core;")();
var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok   " + name);
  } catch (e) {
    console.error("FAIL " + name);
    throw e;
  }
}

function close(a, b, eps) {
  return Math.abs(a - b) <= (eps || 1e-9);
}

function inside(r, bounds, eps) {
  eps = eps || 1e-9;
  return r.x0 >= bounds.x0 - eps && r.x1 <= bounds.x1 + eps &&
         r.y0 >= bounds.y0 - eps && r.y1 <= bounds.y1 + eps;
}

function overlap(a, b) {
  var eps = 1e-9;
  return a.x0 < b.x1 - eps && a.x1 > b.x0 + eps &&
         a.y0 < b.y1 - eps && a.y1 > b.y0 + eps;
}

function rectContains(r, x, y) {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

test("defaults: стартовое состояние соответствует ТЗ", function () {
  var s = Core.defaults();
  assert.strictEqual(s.mode, "B");
  assert.strictEqual(s.peg, 1);
  assert.strictEqual(s.panno, 0);
  assert.strictEqual(s.light, 2);
  assert.strictEqual(s.corner, false);
  assert.strictEqual(s.ai, false);
  assert.deepStrictEqual(s.led, { picture: false, wall: false, peg: false });
  assert.strictEqual(s.decor, 1);
});

test("dimensions: реальные габариты стены и предметов", function () {
  assert(close(Core.WALL.W, 4.9));
  assert(close(Core.WALL.H, 2.7));
  assert(close(Core.PICT.w, 2.7));
  assert(close(Core.PICT.h, 1.6));
  assert(close(Core.DESK.x1 - Core.DESK.x0, 1.25));
  assert(close(Core.DESK.top, 0.75));
  assert(close(Core.NIGHT.w, 0.45));
  assert(close(Core.NIGHT.h, 0.54));
  assert(close(Core.PEG.cell.w, 0.30));
  assert(close(Core.PEG.cell.h, 0.42));

  var pic = Core.pictureRect();
  assert(close(pic.x1 - pic.x0, 2.7));
  assert(close(pic.y1 - pic.y0, 1.6));
  assert(close((pic.x0 + pic.x1) / 2, 0));
  assert(inside(pic, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));

  var desk = Core.DESK;
  assert(desk.x1 <= Core.WALL.W / 2);
  assert(desk.x0 >= -Core.WALL.W / 2);

  var n = Core.nightstandRect();
  assert(close(n.x1 - n.x0, 0.45));
  assert(close(n.y1 - n.y0, 0.54));
  assert(n.x1 <= desk.x0, "тумбочка должна стоять слева от стола");
  assert(close(n.y0, 0));
});

test("sanitize: значения зажимаются в допустимые диапазоны", function () {
  var s = Core.sanitize({
    decor: 99, mode: "X", peg: 9, panno: 99, light: -4, corner: 1, ai: 1,
    led: { picture: 1, wall: 1, peg: 1 }
  });
  assert.strictEqual(s.decor, 3);
  assert.strictEqual(s.mode, "B");
  assert.strictEqual(s.peg, 1, "панно вытесняет «Максимум» из центра стены");
  assert.strictEqual(s.panno, 3);
  assert.strictEqual(s.light, 0);
  assert.strictEqual(s.corner, true);
  assert.strictEqual(s.ai, true);
  assert.deepStrictEqual(s.led, { picture: false, wall: true, peg: true });

  var weird = Core.sanitize({ decor: NaN, peg: undefined, panno: null, light: null, led: null });
  assert.strictEqual(weird.decor, 0);
  assert.strictEqual(weird.peg, 1);
  assert.strictEqual(weird.panno, 0);
  assert.strictEqual(weird.light, 0);
  assert.deepStrictEqual(weird.led, { picture: false, wall: false, peg: false });
});

test("sanitize: режим A гасит LED картины", function () {
  var s = Core.sanitize({ mode: "A", led: { picture: true, wall: true, peg: true } });
  assert.strictEqual(s.led.picture, false);
  assert.strictEqual(s.led.wall, true);
  assert.strictEqual(s.led.peg, true);
});

test("sanitize: пегборд 0 гасит LED пегборда", function () {
  var s = Core.sanitize({ peg: 0, led: { picture: true, wall: true, peg: true } });
  assert.strictEqual(s.led.peg, false);
  assert.strictEqual(s.led.picture, true);
});

test("sanitize: «Максимум» скрывает картину и гасит её LED", function () {
  var s = Core.sanitize({ mode: "B", peg: 3, led: { picture: true, wall: true, peg: true } });
  assert.strictEqual(s.led.picture, false);
  assert.strictEqual(s.led.wall, true);
  assert.strictEqual(s.led.peg, true);
  assert.strictEqual(Core.pictureVisible(s), false);
  assert.strictEqual(Core.summary(s).pictureVisible, false);
  assert.strictEqual(Core.summary(s).ledPictureAvailable, false);

  var back = Core.sanitize({ mode: "B", peg: 1, led: { picture: true, wall: false, peg: false } });
  assert.strictEqual(back.led.picture, true);
  assert.strictEqual(Core.pictureVisible(back), true);
});

test("panno: панно скрывает картину, гасит её LED и убирает вырез панелей", function () {
  var s = Core.sanitize({ mode: "B", peg: 1, panno: 2, led: { picture: true, wall: true, peg: true } });
  assert.strictEqual(s.panno, 2);
  assert.strictEqual(s.led.picture, false);
  assert.strictEqual(s.led.wall, true);
  assert.strictEqual(Core.pictureVisible(s), false);
  assert.strictEqual(Core.summary(s).pannoVisible, true);
  assert.strictEqual(Core.summary(s).pannoName, "Горы");
  assert.strictEqual(Core.summary(s).ledPictureAvailable, false);

  var panels = Core.panelRects(s);
  assert.strictEqual(panels.length, 1, "МДФ закрывает стену без выреза под картину");

  var lr = Core.ledRects(s);
  assert(lr.peg);
  assert.strictEqual(lr.picture, undefined, "у скрытой картины нет LED-рамки");

  var off = Core.sanitize({ mode: "B", peg: 1, panno: 0, led: { picture: true } });
  assert.strictEqual(off.led.picture, true);
  assert.strictEqual(Core.pictureVisible(off), true);
  assert.strictEqual(Core.panelRects(off).length, 4);
});

test("panno: «4 квадрата» — общий габарит 38,5 × 38,5 см", function () {
  var q = Core.PANNO.squares;
  assert(close(q.tile, 0.18), "плитка должна быть 18 см");
  assert(close(q.gap, 0.025), "центральный зазор должен быть 2,5 см");
  assert(close(2 * q.tile + q.gap, 0.385), "габарит всего панно должен быть 38,5 см");

  var r = Core.pannoRect({ panno: 1 });
  assert(close(r.x1 - r.x0, 0.385));
  assert(close(r.y1 - r.y0, 0.385));
  assert(close(Core.PANNO.variants[0].w, 2 * q.tile + q.gap));
  assert(close(Core.PANNO.variants[0].h, 2 * q.tile + q.gap));
});

test("panno: все варианты центрированы по стене и помещаются в неё", function () {
  for (var p = 1; p <= Core.PANNO.variants.length; p++) {
    var r = Core.pannoRect({ panno: p });
    assert(r, "нет прямоугольника для варианта " + p);
    assert(close((r.x0 + r.x1) / 2, 0), "панно не центрировано по X");
    assert(close((r.y0 + r.y1) / 2, Core.PANNO.cy), "панно не центрировано по Y");
    assert(close(r.x1 - r.x0, Core.PANNO.variants[p - 1].w));
    assert(close(r.y1 - r.y0, Core.PANNO.variants[p - 1].h));
    assert(inside(r, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));
    assert(overlap(r, Core.pictureRect()), "панно должно занимать место картины");
  }
  assert.strictEqual(Core.pannoRect({ panno: 0 }), null);
  assert.strictEqual(Core.pannoRect({ panno: 9 }), null);
});

test("panno: «Максимум» и панно не сосуществуют", function () {
  var s = Core.sanitize({ mode: "B", peg: 3, panno: 3, led: { picture: true } });
  assert.strictEqual(s.panno, 3, "панно сохраняется");
  assert.strictEqual(s.peg, 1, "пегборд откатывается к обычному варианту");
  assert.strictEqual(s.led.picture, false);
  assert.strictEqual(Core.pictureVisible(s), false);
  assert.strictEqual(Core.summary(s).pegVisible, true);
  assert.strictEqual(Core.summary(s).pannoVisible, true);
});

test("geometry: картина и панели режима A/B", function () {
  var pic = Core.pictureRect();
  assert(close(pic.x0, -Core.PICT.w / 2));
  assert(close(pic.x1, Core.PICT.w / 2));
  assert(close(pic.y0, Core.PICT.cy - Core.PICT.h / 2));
  assert(close(pic.y1, Core.PICT.cy + Core.PICT.h / 2));

  var a = Core.panelRects({ mode: "A" });
  assert.strictEqual(a.length, 1);
  assert(close(a[0].x0, -Core.WALL.W / 2 + Core.WALL.EDGE));
  assert(close(a[0].x1, Core.WALL.W / 2 - Core.WALL.EDGE));
  assert(close(a[0].y0, Core.WALL.PANEL_Y0));
  assert(close(a[0].y1, Core.WALL.PANEL_Y1));

  var b = Core.panelRects({ mode: "B" });
  assert.strictEqual(b.length, 4);
  for (var i = 0; i < b.length; i++) {
    assert(inside(b[i], { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));
    assert(!rectContains(b[i], 0, Core.PICT.cy), "панель не должна закрывать центр картины");
    assert(!overlap(b[i], pic), "панель не должна пересекать полотно картины");
    for (var j = i + 1; j < b.length; j++) {
      assert(!overlap(b[i], b[j]), "области МДФ не должны пересекаться");
    }
  }

  /* «Максимум» убирает картину — вырез в панелях тоже исчезает */
  var max = Core.panelRects({ mode: "B", peg: 3 });
  assert.strictEqual(max.length, 1);
  assert(close(max[0].x0, -Core.WALL.W / 2 + Core.WALL.EDGE));
  assert(close(max[0].x1, Core.WALL.W / 2 - Core.WALL.EDGE));
  assert(close(max[0].y1, Core.WALL.PANEL_Y1));
});

test("pegboard: варианты собраны из ячеек 30 × 42 см", function () {
  var cell = Core.PEG.cell;
  var v1 = Core.pegRect({ peg: 1, mode: "B" });
  var v2 = Core.pegRect({ peg: 2, mode: "B" });
  var v3 = Core.pegRect({ peg: 3, mode: "B" });

  assert.strictEqual(Core.pegRect({ peg: 0, mode: "B" }), null);

  [v1, v2].forEach(function (r) {
    assert(close(r.x1 - r.x0, 3 * cell.w), "вариант должен быть 3 ячейки по ширине");
    assert(close(r.y1 - r.y0, cell.h), "вариант должен быть 1 ячейка по высоте");
    assert(inside(r, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));
    assert(!overlap(r, Core.pictureRect()), "пегборд не должен закрывать картину в режиме B");
  });

  /* вариант 1 — справа от картины, вариант 2 — по центру над картиной */
  assert(v1.x0 >= Core.pictureRect().x1 + Core.PICT.frame, "вариант 1 должен быть справа от картины");
  assert(close((v2.x0 + v2.x1) / 2, 0), "вариант 2 должен быть центрирован по стене");
  assert(v2.y0 >= Core.pictureRect().y1 + Core.PICT.frame, "вариант 2 должен быть выше картины");
  assert(v2.y1 <= Core.PEG.top + 1e-9);

  /* без картины вариант 1 центрируется над монитором */
  var a = Core.pegRect({ mode: "A", peg: 1 });
  assert(close((a.x0 + a.x1) / 2, Core.MON.cx));

  /* «Максимум»: 4×3 ячейки, по центру стола, картина скрыта */
  assert(close(v3.x1 - v3.x0, 4 * cell.w));
  assert(close(v3.y1 - v3.y0, 3 * cell.h));
  assert(close(v3.x1 - v3.x0, Core.PEG.maxW));
  assert(close(v3.y1 - v3.y0, Core.PEG.maxH));
  assert(close((v3.x0 + v3.x1) / 2, (Core.DESK.x0 + Core.DESK.x1) / 2));
  assert(v3.x1 - v3.x0 <= Core.DESK.x1 - Core.DESK.x0, "доска не шире стола");
  assert(v3.y0 >= Core.MON.top + Core.PEG.gapAboveMonitor - 1e-9);
  assert(v3.y1 <= Core.PEG.top + 1e-9);
  assert(inside(v3, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));

  /* LED-рамки вариантов 1 и 2 не пересекают раму картины */
  var pic = Core.pictureRect(), f = Core.PICT.frame;
  var framed = { x0: pic.x0 - f, x1: pic.x1 + f, y0: pic.y0 - f, y1: pic.y1 + f };
  for (var p = 1; p <= 2; p++) {
    var lr = Core.ledRects({ mode: "B", peg: p }).peg;
    assert(!overlap(lr, framed), "LED-рамка пегборда пересекает картину при peg=" + p);
  }
});

test("LED: рамки соответствуют видимым объектам", function () {
  var a = Core.ledRects({ mode: "A", peg: 1 });
  assert(a.picture === undefined);
  assert(a.wall && a.peg);
  assert(a.wall.z > 0 && a.peg.z > 0);

  var b = Core.ledRects({ mode: "B", peg: 0 });
  assert(b.picture && b.wall);
  assert(b.peg === undefined);
  assert(inside(b.picture, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));
  assert(inside(b.wall, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));

  var c = Core.ledRects({ mode: "B", peg: 3 });
  assert(c.peg);
  assert(c.picture === undefined, "у «Максимума» картина скрыта — LED картины не нужен");
  assert(inside(c.peg, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));

  /* варианты 1 и 2: LED-рамка пегборда не пересекает раму картины */
  var framed = Core.pictureRect(), f = Core.PICT.frame;
  framed = { x0: framed.x0 - f, x1: framed.x1 + f, y0: framed.y0 - f, y1: framed.y1 + f };
  for (var p = 1; p <= 2; p++) {
    var lr = Core.ledRects({ mode: "B", peg: p }).peg;
    assert(!overlap(lr, framed), "LED-рамка пегборда пересекает картину при peg=" + p);
  }
});

test("UV: повтор текстуры непрерывен на границах областей", function () {
  var tile = Core.decorTile(1);
  assert(close(tile.tileW, Core.DECORS[1].slats * Core.SLAT));
  /* по V не должно быть ни одного шва в пределах стены */
  assert(tile.tileH >= Core.WALL.H, "повтор по высоте должен перекрывать стену");

  var x = -1.00001;
  var u1 = Core.uvAt(x, 1.5, tile.tileW, tile.tileH).u;
  var u2 = Core.uvAt(x + 0.00002, 1.5, tile.tileW, tile.tileH).u;
  assert(close(u2 - u1, 0.00002 / tile.tileW, 1e-12));

  for (var i = 0; i < Core.DECORS.length; i++) {
    var t = Core.decorTile(i);
    assert(t.tileW > 0 && t.tileH > 0);
    assert(close(t.tileW / Core.SLAT, Core.DECORS[i].slats, 1e-9));
  }
});

test("AI-пресет: контрастный декор, максимум пегборда, нейтральный LED", function () {
  var s = Core.presetState();
  assert.strictEqual(s.ai, true);
  assert.strictEqual(s.decor, 3);
  assert.strictEqual(s.mode, "B");
  assert.strictEqual(s.peg, 3);
  assert.strictEqual(s.panno, 0);
  assert.strictEqual(s.light, 2);
  assert.strictEqual(s.corner, true);
  assert.deepStrictEqual(s.led, { picture: false, wall: false, peg: true });
});

test("summary: подсказки соответствуют доступности", function () {
  var b = Core.summary(Core.sanitize({ mode: "B", peg: 1 }));
  assert.strictEqual(b.pictureVisible, true);
  assert.strictEqual(b.pegVisible, true);
  assert.strictEqual(b.pannoVisible, false);
  assert.strictEqual(b.pannoName, "Нет");
  assert.strictEqual(b.ledPictureAvailable, true);
  assert.strictEqual(b.ledPegAvailable, true);

  var a = Core.summary(Core.sanitize({ mode: "A", peg: 0 }));
  assert.strictEqual(a.pictureVisible, false);
  assert.strictEqual(a.pegVisible, false);
  assert.strictEqual(a.ledPictureAvailable, false);
  assert.strictEqual(a.ledPegAvailable, false);
  assert.strictEqual(a.tileWmm, Math.round(Core.decorTile(1).tileW * 1000));

  var mx = Core.summary(Core.sanitize({ mode: "B", peg: 3 }));
  assert.strictEqual(mx.pictureVisible, false);
  assert.strictEqual(mx.pegVisible, true);
  assert.strictEqual(mx.ledPictureAvailable, false);
  assert.strictEqual(mx.ledPegAvailable, true);
});

test("corner: МДФ-расширение не выходит за правую стену", function () {
  var c = Core.cornerRect();
  assert.strictEqual(c.u0, 0.02);
  assert(c.u1 > c.u0 && c.u1 < 1.9);
  assert(close(c.y0, Core.WALL.PANEL_Y0));
  assert(close(c.y1, Core.WALL.PANEL_Y1));
});

console.log("\n" + passed + " тестов пройдено.");
