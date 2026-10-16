#!/usr/bin/env python3
"""Maak een los te openen HTML-preview zonder buildafhankelijkheden."""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def main():
    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    css = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    js = (PUBLIC / "app.js").read_text(encoding="utf-8")
    data = json.loads((PUBLIC / "data/editions.json").read_text(encoding="utf-8"))
    html, css_count = re.subn(
        r'<link\b(?=[^>]*\brel=[\"\']stylesheet[\"\'])[^>]*\bhref=[\"\'](?:\./)?styles\.css[\"\'][^>]*>',
        lambda _: "<style>" + css + "</style>", html,
    )
    html, js_count = re.subn(
        r'<script\b[^>]*\bsrc=[\"\'](?:\./)?app\.js[\"\'][^>]*>\s*</script>',
        "", html,
    )
    if css_count != 1 or js_count != 1:
        raise SystemExit("Stylesheet of app-script niet eenduidig gevonden.")
    embedded = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    bundle = '<script id="edition-data" type="application/json">' + embedded + '</script>\n'
    bundle += "<script>" + js.replace("</script", "<\\/script") + "</script>\n"
    html = html.replace("</body>", bundle + "</body>")
    favicon = PUBLIC / "assets/favicon.svg"
    if favicon.exists():
        encoded = base64.b64encode(favicon.read_bytes()).decode("ascii")
        html = re.sub(r'([\"\'])(?:\./)?assets/favicon\.svg\1',
                      lambda _: '"data:image/svg+xml;base64,' + encoded + '"', html)
    target = ROOT / "Ochtend-preview.html"
    target.write_text(html, encoding="utf-8")
    print(f"Preview: {target}")


if __name__ == "__main__":
    main()
