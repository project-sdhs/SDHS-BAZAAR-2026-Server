# 시드 데이터 (DB-05 · DB-06 · DB-17)

부스 · 메뉴 · 지도 · 입금 계좌 · 바자회 설정을 CSV로 적어서 DB에 넣어요.

| 폴더                 | 내용                                | git                            |
| -------------------- | ----------------------------------- | ------------------------------ |
| `seed-data/example/` | 팀 목업 데이터 (개발 DB · 테스트용) | 올림                           |
| `seed-data/real/`    | 실제 행사 데이터 (DB-17)            | **올리지 않음** (`.gitignore`) |

레포가 public이라 실제 계좌번호 · 학생 정보는 `seed-data/real/`에만 두고 커밋하지 않아요.

## 명령

```bash
npm run seed:check                          # example CSV 검사만 (DB 안 씀)
npm run seed:check -- seed-data/real        # 실데이터 검사
npm run db:seed                             # example 을 .env 의 DB에 넣기
npm run db:seed -- seed-data/real --replace # 실데이터로 교체 (행사 전에만)
```

- 한 트랜잭션으로 넣어서, 하나라도 실패하면 아무것도 안 들어가요.
- 부스 · 메뉴 · 지도 · 입금 계좌 표에 이미 행이 있으면 멈춰요. `--replace`면 그 표들을 비우고 다시 넣어요.
  결제 · 캐셔 · QR 등이 부스를 쓰고 있으면 지울 수 없어서 실패해요.
- `bazaar_settings`는 INSERT하지 않아요. 마이그레이션(037)이 만든 1행을 이 CSV 값으로 UPDATE해요.
  CSV가 헤더만 있으면 설정은 그대로 둬요.
- `booths.min_price` · `menu_count`는 판매 중 메뉴로 계산해서 넣어요.

## 적는 법

- 파일 8개, 첫 줄은 헤더 (열 순서는 상관없음). UTF-8 (엑셀의 "CSV UTF-8" 저장도 됨)
- 값에 쉼표가 있으면 큰따옴표로 감싸기: `"겉바속촉 타코야끼, 4알 · 8알"`
- 시각 `10:00` · 날짜 `2027-11-20` · 참거짓 `true` / `false` · 비워도 되는 칸은 빈칸
- 다른 파일은 id 대신 이름 · 코드로 가리켜요. (DB id는 넣을 때 정해져요)

| 파일                   | 열                                                                                                                                                                                                                                             | 메모                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildings.csv`        | `name`, `sort_order`                                                                                                                                                                                                                           | 건물 이름은 겹치면 안 됨                                                                                                                                              |
| `floors.csv`           | `building_name`, `level`, `label`, `map_image_url`, `width_m`, `height_m`                                                                                                                                                                      | 건물 · 층 번호는 겹치면 안 됨                                                                                                                                         |
| `zones.csv`            | `building_name`, `floor_level`, `name`                                                                                                                                                                                                         | 층마다 구역 이름은 겹치면 안 됨                                                                                                                                       |
| `booths.csv`           | `booth_code`, `name`, `category`, `type`, `grade`, `class_no`, `hidden`, `featured_order`, `open_time`, `close_time`, `description`, `image_url`                                                                                               | 부스 코드 숫자 6자리. `normal`은 운영 반(`grade` · `class_no`) 필수 · 반당 1개, `special`은 반을 비우고 `featured_order`를 적을 수 있음. `hidden=true`면 앱에 안 보임 |
| `menus.csv`            | `booth_code`, `name`, `description`, `price`, `on_sale`, `sort_order`, `image_url`                                                                                                                                                             | 가격 1~100,000, 설명 40자                                                                                                                                             |
| `booth_locations.csv`  | `booth_code`, `building_name`, `floor_level`, `zone_name`, `x`, `y`                                                                                                                                                                            | 부스당 1개, `x` · `y`는 층 지도 기준 0~1, 구역은 비워도 됨                                                                                                            |
| `deposit_accounts.csv` | `account_key`, `bank_name`, `account_no`, `holder_name`                                                                                                                                                                                        | `account_key`는 설정에서 가리키는 이름 (DB에는 안 들어감)                                                                                                             |
| `bazaar_settings.csv`  | `event_name`, `event_start_date`, `event_end_date`, `default_open_time`, `default_close_time`, `app_open`, `charge_min`, `charge_max`, `balance_limit`, `refund_window_hours`, `daily_payment_no_reset`, `block_old_qr`, `deposit_account_key` | 0행 또는 1행. 한도는 비우면 제한 없음                                                                                                                                 |
