# repositories

DB 읽기/쓰기를 담당하는 곳이에요. SQL은 여기에만 써요.
`getPool().execute(sql, [값들])` 로 MySQL을 부르고, 결과를 API 모양으로 바꿔서 돌려줘요.
예: `app-version.repository.ts`
