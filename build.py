#!/usr/bin/env python
"""Сборка автономного 3droom.html из фрагментов _build и встроенных текстур."""
from pathlib import Path
import base64
import io
import json

from PIL import Image

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "_build"
OUT = ROOT / "3droom.html"

PARTS = [
    "part1_head.html",
    "part2_ui.html",
    "part3_core.html",
    "part4_app1.html",
    "part5_app2.html",
    "part6_app3.html",
    "part7_app4.html",
]


def jpeg_uri(img, quality=88):
    img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=False)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def make_assets():
    """Уменьшаем исходники: итоговый HTML должен оставаться лёгким."""
    decor = []
    for i in range(1, 5):
        path = next((ROOT / "panels").glob(f"panel_0{i}_*.png"))
        img = Image.open(path).convert("RGB").resize((512, 2048), Image.LANCZOS)
        decor.append(jpeg_uri(img, 88))

    # Пегборд: только доска, без стола, лампы и растений под ней.
    peg_src = Image.open(ROOT / "pegbord.png").convert("RGB")
    peg = peg_src.crop((3790, 3739, 4372, 4143)).resize((640, 445), Image.LANCZOS)
    peg.save(ROOT / "peg_final.jpg", "JPEG", quality=90, optimize=True)

    picture = Image.open(ROOT / "pic_final.jpg").convert("RGB")
    return {
        "picture": jpeg_uri(picture, 88),
        "pegboard": jpeg_uri(peg, 90),
        "decor": decor,
    }


def main():
    html = ""
    for name in PARTS:
        path = BUILD / name
        if not path.exists():
            raise SystemExit(f"Нет фрагмента: {name}")
        html += path.read_text(encoding="utf-8")

    assets = make_assets()
    assets_js = (
        "var ASSETS = {\n"
        "  picture: " + json.dumps(assets["picture"]) + ",\n"
        "  pegboard: " + json.dumps(assets["pegboard"]) + ",\n"
        "  decor: [\n    " + ",\n    ".join(json.dumps(x) for x in assets["decor"]) + "\n  ]\n"
        "};"
    )
    if "/*__ASSETS__*/" not in html:
        raise SystemExit("Не найден маркер вставки ASSETS")
    html = html.replace("/*__ASSETS__*/", assets_js, 1)
    if "/*__ASSETS__*/" in html:
        raise SystemExit("Остался лишний маркер ASSETS")
    if "</html>" not in html:
        raise SystemExit("В сборке нет закрывающего </html>")

    OUT.write_text(html, encoding="utf-8")
    print(f"Собрано: {OUT}")
    print(f"Размер: {OUT.stat().st_size / 1024 / 1024:.2f} МБ")
    print("Текстуры: 4 декора + картина + пегборд (data URI)")


if __name__ == "__main__":
    main()
