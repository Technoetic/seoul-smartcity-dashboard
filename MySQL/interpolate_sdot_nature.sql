-- sdot_nature_all 온도/습도 NULL 선형 보간
-- 이 스크립트는 S-DoT 센서 데이터에서 누락된(NULL) 온도/습도 값을 선형 보간법으로 채워넣습니다.
-- 실행: mysql -u root -p sdot_db < interpolate_sdot_nature.sql
-- migrate_sdot_nature.sql 실행 후 사용

-- 1) 온도 보간
-- 이 쿼리는 온도 값이 NULL인 행을 찾아, 이전/이후 온도 값을 기준으로 시간에 비례하여 보간합니다.
UPDATE sdot_nature_all AS cur
JOIN (
    SELECT
        n.id,
        prev.온도_평균 AS prev_val,    -- 이전 유효한 온도 값
        prev.등록일시  AS prev_dt,      -- 이전 유효한 온도의 시간
        nxt.온도_평균  AS next_val,     -- 다음 유효한 온도 값
        nxt.등록일시   AS next_dt,      -- 다음 유효한 온도의 시간
        n.등록일시     AS cur_dt        -- 현재(보간 대상) 시간
    FROM sdot_nature_all n
    -- 이전 유효 데이터 찾기: 같은 시리얼에서 현재보다 이전 시간이면서 온도가 NULL이 아닌 가장 최근 데이터
    JOIN sdot_nature_all prev ON prev.시리얼 = n.시리얼
        AND prev.등록일시 < n.등록일시
        AND prev.온도_평균 IS NOT NULL
        AND prev.id = (
            -- 서브쿼리: 이전 시간 중 가장 가까운 유효 온도 데이터의 id 찾기
            SELECT p2.id FROM sdot_nature_all p2
            WHERE p2.시리얼 = n.시리얼
              AND p2.등록일시 < n.등록일시
              AND p2.온도_평균 IS NOT NULL
            ORDER BY p2.등록일시 DESC LIMIT 1
        )
    -- 다음 유효 데이터 찾기: 같은 시리얼에서 현재보다 이후 시간이면서 온도가 NULL이 아닌 가장 가까운 데이터
    JOIN sdot_nature_all nxt ON nxt.시리얼 = n.시리얼
        AND nxt.등록일시 > n.등록일시
        AND nxt.온도_평균 IS NOT NULL
        AND nxt.id = (
            -- 서브쿼리: 이후 시간 중 가장 가까운 유효 온도 데이터의 id 찾기
            SELECT n2.id FROM sdot_nature_all n2
            WHERE n2.시리얼 = n.시리얼
              AND n2.등록일시 > n.등록일시
              AND n2.온도_평균 IS NOT NULL
            ORDER BY n2.등록일시 ASC LIMIT 1
        )
    -- 온도가 NULL인 행만 보간 대상으로 선택
    WHERE n.온도_평균 IS NULL
) AS interp ON cur.id = interp.id
-- 선형 보간 공식: 이전 값 + (다음 값 - 이전 값) * (현재 시간 - 이전 시간) / (다음 시간 - 이전 시간)
SET cur.온도_평균 = ROUND(
    interp.prev_val
    + (interp.next_val - interp.prev_val)
      * TIMESTAMPDIFF(SECOND, interp.prev_dt, interp.cur_dt)  -- 현재까지 경과 시간 (초)
      / TIMESTAMPDIFF(SECOND, interp.prev_dt, interp.next_dt) -- 전체 구간 시간 (초)
, 1);  -- 소수점 첫째 자리까지 반올림

-- 2) 습도 보간
-- 온도와 동일한 방식으로 습도 NULL 값을 선형 보간합니다.
UPDATE sdot_nature_all AS cur
JOIN (
    SELECT
        n.id,
        prev.습도_평균 AS prev_val,    -- 이전 유효한 습도 값
        prev.등록일시  AS prev_dt,      -- 이전 유효한 습도의 시간
        nxt.습도_평균  AS next_val,     -- 다음 유효한 습도 값
        nxt.등록일시   AS next_dt,      -- 다음 유효한 습도의 시간
        n.등록일시     AS cur_dt        -- 현재(보간 대상) 시간
    FROM sdot_nature_all n
    -- 이전 유효 데이터 찾기: 같은 시리얼에서 현재보다 이전 시간이면서 습도가 NULL이 아닌 가장 최근 데이터
    JOIN sdot_nature_all prev ON prev.시리얼 = n.시리얼
        AND prev.등록일시 < n.등록일시
        AND prev.습도_평균 IS NOT NULL
        AND prev.id = (
            -- 서브쿼리: 이전 시간 중 가장 가까운 유효 습도 데이터의 id 찾기
            SELECT p2.id FROM sdot_nature_all p2
            WHERE p2.시리얼 = n.시리얼
              AND p2.등록일시 < n.등록일시
              AND p2.습도_평균 IS NOT NULL
            ORDER BY p2.등록일시 DESC LIMIT 1
        )
    -- 다음 유효 데이터 찾기: 같은 시리얼에서 현재보다 이후 시간이면서 습도가 NULL이 아닌 가장 가까운 데이터
    JOIN sdot_nature_all nxt ON nxt.시리얼 = n.시리얼
        AND nxt.등록일시 > n.등록일시
        AND nxt.습도_평균 IS NOT NULL
        AND nxt.id = (
            -- 서브쿼리: 이후 시간 중 가장 가까운 유효 습도 데이터의 id 찾기
            SELECT n2.id FROM sdot_nature_all n2
            WHERE n2.시리얼 = n.시리얼
              AND n2.등록일시 > n.등록일시
              AND n2.습도_평균 IS NOT NULL
            ORDER BY n2.등록일시 ASC LIMIT 1
        )
    -- 습도가 NULL인 행만 보간 대상으로 선택
    WHERE n.습도_평균 IS NULL
) AS interp ON cur.id = interp.id
-- 선형 보간 공식: 온도와 동일한 방식으로 습도 계산
SET cur.습도_평균 = ROUND(
    interp.prev_val
    + (interp.next_val - interp.prev_val)
      * TIMESTAMPDIFF(SECOND, interp.prev_dt, interp.cur_dt)  -- 현재까지 경과 시간
      / TIMESTAMPDIFF(SECOND, interp.prev_dt, interp.next_dt) -- 전체 구간 시간
, 1);  -- 소수점 첫째 자리까지 반올림

-- 3) 결과 확인
-- 보간 작업 후 여전히 NULL로 남아있는 온도/습도 데이터 개수를 확인합니다.
SELECT
    SUM(온도_평균 IS NULL) AS 온도_NULL잔여,  -- 보간 후에도 NULL인 온도 행 개수
    SUM(습도_평균 IS NULL) AS 습도_NULL잔여,  -- 보간 후에도 NULL인 습도 행 개수
    COUNT(*) AS total                         -- 전체 행 개수
FROM sdot_nature_all;