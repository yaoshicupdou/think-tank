"""
A股公司数据导入脚本 — 每家公司一个文本文件，上传到知识库
"""
import json
import time
import sys
from pathlib import Path
import tempfile
import os

import requests

API = "http://192.168.1.5:8000/api/v1"
JSONL = Path(r"C:\Users\Administrator\think-tank\scripts\companies.jsonl")
USERNAME = "admin"
PASSWORD = "admin"

def login():
    r = requests.post(f"{API}/auth/login",
        json={"username": USERNAME, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def list_docs(token):
    r = requests.get(f"{API}/documents/",
        headers={"Authorization": f"Bearer {token}"})
    return {d["filename"] for d in r.json()}


def safe_filename(name):
    """清理文件名中的非法字符"""
    forbidden = '*\\/:?<>"|'
    for ch in forbidden:
        name = name.replace(ch, '_')
    return name


def upload_file(token, filepath, group_name):
    with open(filepath, "rb") as f:
        r = requests.post(
            f"{API}/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (os.path.basename(filepath), f, "text/plain")},
            data={"group_name": group_name},
        )
    if r.status_code == 409:
        # already exists
        return "skipped"
    r.raise_for_status()
    return "ok"


def main():
    # 加载数据
    print(">>> 加载公司数据...")
    companies = []
    with open(JSONL, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                companies.append(json.loads(line))
    print(f"    共 {len(companies)} 家公司")

    # 登录
    print(">>> 登录...")
    token = login()
    print("    OK")

    # 已有文档
    existing = list_docs(token)
    print(f"    已有 {len(existing)} 个文档")

    # 在 temp 目录创建 txt 文件
    tmpdir = tempfile.mkdtemp(prefix="thinktank_companies_")
    print(f"    temp dir: {tmpdir}")

    success = 0
    skipped = 0
    fail = 0

    # 准备 txt 文件并上传
    for i, c in enumerate(companies):
        code = c["code"]
        name = c["name"]
        industry = c["industry"] or "未分类"
        text = c["text"]
        filename = f"{code}_{safe_filename(name)}.txt"

        # 跳过已存在
        if filename in existing:
            skipped += 1
            continue

        # 写入临时文件
        filepath = os.path.join(tmpdir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"股票代码: {code}\n")
            f.write(f"公司名称: {name}\n")
            f.write(f"所属行业: {industry}\n")
            f.write(f"{text}\n")

        # 上传
        try:
            result = upload_file(token, filepath, industry)
            if result == "skipped":
                skipped += 1
            else:
                success += 1
                existing.add(filename)
        except Exception as e:
            fail += 1
            if fail <= 10:
                print(f"    [{code}] {name} 上传失败: {e}")

        # 清理临时文件
        try:
            os.remove(filepath)
        except Exception:
            pass

        # 进度
        if (i + 1) % 200 == 0:
            print(f"    [{i+1}/{len(companies)}] 成功 {success}  跳过 {skipped}  失败 {fail}")

        time.sleep(0.05)  # 避免打爆 API

    # 清理
    try:
        os.rmdir(tmpdir)
    except Exception:
        pass

    total_docs = len(list_docs(token))
    print(f"\n>>> 完成。知识库总文档: {total_docs}")
    print(f"    本次: 成功 {success}  跳过 {skipped}  失败 {fail}")


if __name__ == "__main__":
    main()
