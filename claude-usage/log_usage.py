#!/usr/bin/env python3
"""Claude Code利用実績を usage_log.json に追記する簡易CLI。

使い方:
  python log_usage.py --skill pptx --model sonnet --input-tokens 12000 --output-tokens 3000 --task "資料作成"
"""
import argparse
import json
from datetime import date, datetime
from pathlib import Path

LOG_PATH = Path(__file__).parent / "usage_log.json"
DATA_JS_PATH = Path(__file__).parent / "usage_data.js"

# $ per million tokens (input, output)
PRICING = {
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (1.0, 5.0),
}


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    in_price, out_price = PRICING[model]
    return input_tokens / 1_000_000 * in_price + output_tokens / 1_000_000 * out_price


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill", required=True, help="使用したスキル/ツール名")
    parser.add_argument("--model", required=True, choices=PRICING.keys())
    parser.add_argument("--input-tokens", type=int, required=True)
    parser.add_argument("--output-tokens", type=int, required=True)
    parser.add_argument("--task", default="", help="タスクの概要")
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()

    entry = {
        "date": args.date,
        "task": args.task,
        "skill": args.skill,
        "model": args.model,
        "input_tokens": args.input_tokens,
        "output_tokens": args.output_tokens,
        "cost_usd": round(cost_usd(args.model, args.input_tokens, args.output_tokens), 4),
        "what_if": {
            m: round(cost_usd(m, args.input_tokens, args.output_tokens), 4)
            for m in PRICING
        },
        "recorded_at": datetime.now().isoformat(timespec="seconds"),
    }

    data = json.loads(LOG_PATH.read_text(encoding="utf-8")) if LOG_PATH.exists() else []
    data.append(entry)
    LOG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    js_content = "// log_usage.py により自動生成。直接編集しないこと。\n"
    js_content += "const USAGE_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    DATA_JS_PATH.write_text(js_content, encoding="utf-8")

    print(f"記録しました: {entry['skill']} / {entry['model']} / ${entry['cost_usd']}")


if __name__ == "__main__":
    main()
