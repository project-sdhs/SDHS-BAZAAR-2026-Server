
import csv
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "seed-data"
VALIDATOR = ROOT / "scripts" / "validate_seed.py"

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    data_dir = root / "seed-data"
    scripts_dir = root / "scripts"

    shutil.copytree(SOURCE, data_dir)
    scripts_dir.mkdir()
    shutil.copy2(VALIDATOR, scripts_dir / "validate_seed.py")

    # 테스트용 CSV에 잘못된 메뉴 추가
    menu_file = data_dir / "menus.csv"

    with menu_file.open(
        "r", encoding="utf-8-sig", newline=""
    ) as file:
        headers = next(csv.reader(file))

    row = dict.fromkeys(headers, "")
    row.update({
        "booth_code": "NOT_FOUND",
        "name": "테스트 메뉴",
        "price": "0",
        "sort_order": "1",
    })

    with menu_file.open(
        "a", encoding="utf-8", newline=""
    ) as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writerow(row)

    # Windows 한글 인코딩 문제 해결
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, str(scripts_dir / "validate_seed.py")],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )

    print(result.stdout)

    # 검증기가 잘못된 데이터를 거부했는지 확인
    assert result.returncode != 0, (
        "잘못된 데이터를 넣었는데도 검증이 통과했습니다."
    )

    assert "존재하지 않는 부스 코드" in result.stdout
    assert "가격은 1~100000" in result.stdout

    print("테스트 통과: 잘못된 부스 코드와 가격을 탐지했습니다.")
