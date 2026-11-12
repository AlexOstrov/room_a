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
  assert.strictEqual(s.light, 2);
  assert.strictEqual(s.corner, false);
  assert.strictEqual(s.ai, false);
  assert.deepStrictEqual(s.led, { picture: false, wall: false, peg: false });
  assert.strictEqual(s.decor, 1);
});

test("sanitize: значения зажимаются в допустимые диапазоны", function () {
  var s = Core.sanitize({
    decor: 99, mode: "X", peg: 9, light: -4, corner: 1, ai: 1,
    led: { picture: 1, wall: 1, peg: 1 }
  });
  assert.strictEqual(s.decor, 3);
  assert.strictEqual(s.mode, "B");
  assert.strictEqual(s.peg, 3);
  assert.strictEqual(s.light, 0);
  assert.strictEqual(s.corner, true);
  assert.strictEqual(s.ai, true);
  assert.deepStrictEqual(s.led, { picture: false, wall: true, peg: true });

  var weird = Core.sanitize({ decor: NaN, peg: undefined, light: null, led: null });
  assert.strictEqual(weird.decor, 0);
  assert.strictEqual(weird.peg, 1);
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

test("pegboard: все четыре варианта в пределах стены", function () {
  var states = [0, 1, 2, 3];
  var rects = states.map(function (p) {
    return Core.pegRect({ peg: p, mode: "B" });
  });
  assert.strictEqual(rects[0], null);
  for (var i = 1; i < rects.length; i++) {
    var r = rects[i];
    assert(r.x1 > r.x0 && r.y1 > r.y0);
    assert(inside(r, { x0: -Core.WALL.W / 2, x1: Core.WALL.W / 2, y0: 0, y1: Core.WALL.H }));
    if (i === 3) {
      /* максимальная доска 4:3 ровно по ширине стола и над его центром */
      assert(close((r.x1 - r.x0) / (r.y1 - r.y0), 4 / 3, 1e-9));
      assert(close(r.x0, Core.DESK.x0));
      assert(close(r.x1, Core.DESK.x1));
      assert(close((r.x0 + r.x1) / 2, (Core.DESK.x0 + Core.DESK.x1) / 2));
      assert(close(r.y0, Core.MON.top + Core.PEG.gapAboveMonitor));
      assert(close(r.x1 - r.x0, Core.DESK.x1 - Core.DESK.x0));
    } else {
      /* варианты 1 и 2 сохраняют пропорции фото 640 × 445 */
      assert(close((r.x1 - r.x0) / (r.y1 - r.y0), 640 / 445, 1e-6));
      assert(!overlap(r, Core.pictureRect()), "пегборд не должен закрывать картину в режиме B");
    }
  }

  /* вариант 1 — над монитором; при нехватке места сдвинут вправо,
     чтобы LED-рамка не наезжала на раму картины */
  assert(rects[1].x0 - Core.PEG.edgePad >=
    Core.pictureRect().x1 + Core.PICT.frame, "LED-рамка не должна пересекать раму картины");
  assert((rects[1].x0 + rects[1].x1) / 2 >= Core.MON.cx);
  assert(close((rects[2].x0 + rects[2].x1) / 2, 0), "вариант 2 центрирован по стене");
  assert(rects[2].y0 - Core.PEG.edgePad >=
    Core.pictureRect().y1 + Core.PICT.frame, "нижняя LED-рамка не должна наезжать на раму");
  assert(rects[3].y1 <= Core.PEG.top + 1e-9);
  assert(rects[3].y0 >= Core.MON.top);
});

test("pegboard: вариант 2 поднимается над картиной и уменьшается под карниз", function () {
  var r = Core.pegRect({ peg: 2, mode: "B" });
  assert(r.y0 >= Core.pictureRect().y1 + Core.PEG.gap - 1e-9);
  assert(r.y1 <= Core.PEG.top + 1e-9);
  assert(r.x0 < 0 && r.x1 > 0);
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
  assert.strictEqual(s.light, 2);
  assert.strictEqual(s.corner, true);
  assert.deepStrictEqual(s.led, { picture: false, wall: false, peg: true });
});

test("summary: подсказки соответствуют доступности", function () {
  var b = Core.summary(Core.sanitize({ mode: "B", peg: 1 }));
  assert.strictEqual(b.pictureVisible, true);
  assert.strictEqual(b.pegVisible, true);
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
