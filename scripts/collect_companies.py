"""
A股上市公司信息采集脚本
输出 jsonl，每行一条记录，中断可续跑
"""
import json
import time
import sys
from pathlib import Path

import akshare as ak

OUTPUT = Path(__file__).resolve().parent / "companies.jsonl"
SKIP_CODES = set()  # 跳过已退市的


def load_done():
    """读取已采集的 code 集合，支持续跑"""
    if not OUTPUT.exists():
        return set()
    done = set()
    with open(OUTPUT, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    done.add(json.loads(line)["code"])
                except Exception:
                    pass
    return done


def build_chunk(row):
    """拼接用于向量化的文本"""
    industry = str(row.get("所属行业", "") or "")
    biz = str(row.get("主营业务", "") or "")
    scope = str(row.get("经营范围", "") or "")[:300]
    intro = str(row.get("机构简介", "") or "")
    parts = []
    if industry:
        parts.append(f"所属行业：{industry}")
    if biz:
        parts.append(f"主营业务：{biz}")
    if scope:
        parts.append(f"经营范围：{scope}")
    if intro and len(intro) > 30:
        parts.append(f"公司简介：{intro[:150]}")
    return "。".join(parts)


def main():
    print(">>> 获取 A 股列表...")
    stocks = ak.stock_info_a_code_name()
    print(f"    共 {len(stocks)} 只")

    done = load_done()
    print(f"    已采集 {len(done)} 只")

    total = len(stocks)
    success = 0
    fail = 0
    skipped = len(done)

    for i, (_, row) in enumerate(stocks.iterrows()):
        code = row["code"]
        name = row["name"]

        if code in done:
            continue

        # 跳过退市股
        if "退" in name:
            SKIP_CODES.add(code)
            continue

        try:
            df = ak.stock_profile_cninfo(symbol=code)
            chunk = build_chunk(df.iloc[0])
            rec = {
                "code": code,
                "name": name,
                "industry": str(df["所属行业"].iloc[0] or ""),
                "text": chunk,
            }
            with open(OUTPUT, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            success += 1
            done.add(code)
        except Exception as e:
            fail += 1
            msg = str(e)[:80]
            if i < 20 or fail % 50 == 0:  # 前20个都报，之后每50个报一次
                print(f"    [{code}] {name} 失败: {msg}")

        # 进度
        if (i + 1) % 100 == 0:
            print(f"    [{i+1}/{total}] 成功 {success}  失败 {fail}  跳过 {skipped}")

        time.sleep(0.25)

    print(f"\n>>> 完成。总 {total}，成功 {success}，失败 {fail}，跳过 {skipped}")
    print(f"    输出: {OUTPUT}")


if __name__ == "__main__":
    main()
