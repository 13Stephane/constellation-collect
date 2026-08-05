#!/usr/bin/env python3
"""Inject a schema-v2 JSON into the Constellation viewer template.

Usage:
    python3 build-viewer.py outputs/ASML_schema-v2.json [outputs/ASML_model.html]

Reads constellation-model.template.html, replaces the #constellation-data block
with the given JSON, and writes a standalone HTML that opens straight to the model
(no paste, no server). Falls back path defaults to outputs/<COMPANY-or-stem>_model.html.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "constellation-model.template.html"

def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python3 build-viewer.py <schema-v2.json> [out.html]", file=sys.stderr)
        return 2
    data_path = Path(sys.argv[1])
    data = json.loads(data_path.read_text())
    for k in ("years", "income", "balance"):
        if k not in data:
            raise SystemExit(f"not a schema-v2 file: missing '{k}'")

    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else (
        HERE / "outputs" / f"{data_path.stem.replace('_schema-v2', '')}_model.html")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    html = TEMPLATE.read_text()
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    # replace whatever sits inside the data script block
    pattern = re.compile(
        r'(<script id="constellation-data" type="application/json">)(.*?)(</script>)',
        re.DOTALL)
    if not pattern.search(html):
        raise SystemExit("template is missing the #constellation-data block")
    html = pattern.sub(lambda m: m.group(1) + "\n" + payload + "\n" + m.group(3), html)
    out_path.write_text(html)
    print(f"wrote {out_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
