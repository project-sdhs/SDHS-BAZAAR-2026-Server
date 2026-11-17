
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "seed-data"

EXPECTED_HEADERS = {
    "booths.csv": [
        "class_id", "name", "category", "type",
        "open_time", "close_time", "booth_code", "description"
    ],
    "menus.csv": [
        "booth_code", "name", "description",
        "price", "on_sale", "sort_order", "image_url"
    ],
    "buildings.csv": [
        "name", "sort_order"
    ],
    "floors.csv": [
        "building_name", "level", "label",
        "map_image_url", "width_m", "height_m"
    ],
    "zones.csv": [
        "building_name", "floor_level", "name"
    ],
    "booth_locations.csv": [
        "booth_code", "building_name",
        "floor_level", "zone_name", "x", "y"
    ],
    "bazaar_settings.csv": [
        "event_name", "event_start_date", "event_end_date",
        "default_open_time", "default_close_time",
        "app_open", "charge_min", "charge_max",
        "balance_limit", "refund_window_hours",
        "daily_payment_no_reset", "block_old_qr",
        "deposit_account_key"
    ],
    "deposit_accounts.csv": [
        "account_key", "bank_name", "account_no", "holder_name"
    ],
}

errors = []
data = {}

for filename, expected in EXPECTED_HEADERS.items():
    file_path = DATA_DIR / filename

    if not file_path.exists():
        errors.append(f"{filename}: 파일이 없습니다.")
        continue

    with file_path.open(
        encoding="utf-8-sig", newline=""
    ) as file:
        reader = csv.DictReader(file)

        if reader.fieldnames != expected:
            errors.append(f"{filename}: CSV 헤더가 일치하지 않습니다.")
            continue

        rows = list(reader)
        data[filename] = rows

        for index, row in enumerate(rows, start=2):
            if None in row:
                errors.append(
                    f"{filename}:{index} 컬럼 개수가 맞지 않습니다."
                )

        print(f"[확인] {filename}: {len(rows)}개 데이터")

# 부스 코드 중복 검사
booths = data.get("booths.csv", [])
booth_codes = [
    row["booth_code"] for row in booths
    if row.get("booth_code")
]

if len(booth_codes) != len(set(booth_codes)):
    errors.append("booths.csv: booth_code가 중복되었습니다.")

# 메뉴가 존재하는 부스에 연결되는지 검사
for index, row in enumerate(
    data.get("menus.csv", []), start=2
):
    if row["booth_code"] not in booth_codes:
        errors.append(
            f"menus.csv:{index} 존재하지 않는 부스 코드입니다."
        )

# 지도 위치 좌표 범위 검사
for index, row in enumerate(
    data.get("booth_locations.csv", []), start=2
):
    for coordinate in ("x", "y"):
        try:
            value = float(row[coordinate])
            if not 0 <= value <= 1:
                raise ValueError
        except (ValueError, TypeError):
            errors.append(
                f"booth_locations.csv:{index} "
                f"{coordinate} 좌표가 잘못되었습니다."
            )

from datetime import date

# 1. 필수값 검사
REQUIRED_FIELDS = {
    "booths.csv": [
        "name", "type", "open_time",
        "close_time", "booth_code"
    ],
    "menus.csv": [
        "booth_code", "name", "price", "sort_order"
    ],
    "buildings.csv": ["name"],
    "floors.csv": [
        "building_name", "level", "label",
        "map_image_url", "width_m", "height_m"
    ],
    "zones.csv": [
        "building_name", "floor_level", "name"
    ],
    "booth_locations.csv": [
        "booth_code", "building_name",
        "floor_level", "x", "y"
    ],
    "bazaar_settings.csv": [
        "event_name", "event_start_date",
        "event_end_date"
    ],
    "deposit_accounts.csv": [
        "account_key", "bank_name",
        "account_no", "holder_name"
    ],
}

for filename, fields in REQUIRED_FIELDS.items():
    for line, row in enumerate(data.get(filename, []), 2):
        for field in fields:
            if not (row.get(field) or "").strip():
                errors.append(
                    f"{filename}:{line} {field} 필수값 누락"
                )

# 2. 메뉴 가격 검사
for line, row in enumerate(data.get("menus.csv", []), 2):
    try:
        price = int(row["price"])
        if not 1 <= price <= 100000:
            raise ValueError
    except (ValueError, TypeError):
        errors.append(
            f"menus.csv:{line} 가격은 1~100000이어야 합니다."
        )

# 3. 행사 날짜 검사
settings = data.get("bazaar_settings.csv", [])

if len(settings) > 1:
    errors.append(
        "bazaar_settings.csv: 행사 설정은 1행만 허용합니다."
    )

for line, row in enumerate(settings, 2):
    try:
        start = date.fromisoformat(row["event_start_date"])
        end = date.fromisoformat(row["event_end_date"])

        if start > end:
            errors.append(
                f"bazaar_settings.csv:{line} 종료일이 시작일보다 빠릅니다."
            )
    except (ValueError, TypeError):
        errors.append(
            f"bazaar_settings.csv:{line} 날짜 형식은 YYYY-MM-DD입니다."
        )

# 4. 건물과 층 연결 검사
buildings = {
    row["name"]
    for row in data.get("buildings.csv", [])
    if row.get("name")
}

floors = {
    (row["building_name"], row["level"])
    for row in data.get("floors.csv", [])
    if row.get("building_name") and row.get("level")
}

for line, row in enumerate(data.get("floors.csv", []), 2):
    if row["building_name"] not in buildings:
        errors.append(
            f"floors.csv:{line} 존재하지 않는 건물입니다."
        )

# 5. 구역과 층 연결 검사
zones = set()

for line, row in enumerate(data.get("zones.csv", []), 2):
    floor_key = (
        row["building_name"],
        row["floor_level"]
    )

    if floor_key not in floors:
        errors.append(
            f"zones.csv:{line} 존재하지 않는 층입니다."
        )

    zones.add((*floor_key, row["name"]))

# 6. 부스 위치 연결 검사
for line, row in enumerate(
    data.get("booth_locations.csv", []), 2
):
    floor_key = (
        row["building_name"],
        row["floor_level"]
    )

    if row["booth_code"] not in booth_codes:
        errors.append(
            f"booth_locations.csv:{line} 존재하지 않는 부스입니다."
        )

    if floor_key not in floors:
        errors.append(
            f"booth_locations.csv:{line} 존재하지 않는 층입니다."
        )

    if row.get("zone_name"):
        zone_key = (*floor_key, row["zone_name"])

        if zone_key not in zones:
            errors.append(
                f"booth_locations.csv:{line} 존재하지 않는 구역입니다."
            )

# 7. 입금 계좌 연결 검사
account_keys = {
    row["account_key"]
    for row in data.get("deposit_accounts.csv", [])
    if row.get("account_key")
}

for line, row in enumerate(settings, 2):
    account_key = row.get("deposit_account_key", "")

    if account_key and account_key not in account_keys:
        errors.append(
            f"bazaar_settings.csv:{line} 존재하지 않는 입금 계좌입니다."
        )

print()

if errors:
    print("검증 실패!")
    for error in errors:
        print(f" - {error}")
    raise SystemExit(1)

print("검증 통과! CSV 구조와 기본 연결을 확인했습니다.")
print("※ 실제 데이터의 모든 제약조건을 검증한 것은 아닙니다.")
