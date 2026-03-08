-- weather_stations CSV 로드
-- 이 스크립트는 기상 관측소(ASOS, AWS) 정보를 데이터베이스에 로드합니다.
-- 실행: mysql -u root -p --local-infile sdot_db < migrate_weather_stations.sql

-- 로컬 파일 로드 허용
SET GLOBAL local_infile = 1;

-- 기상 관측소 테이블 생성
CREATE TABLE IF NOT EXISTS weather_stations (
    id   INT PRIMARY KEY,        -- 관측소 고유 ID
    name VARCHAR(50) NOT NULL,   -- 관측소 이름 (예: 서울, 종로구 등)
    type VARCHAR(10) NOT NULL,   -- 관측소 타입 (ASOS: 종합기상관측장비, AWS: 자동기상관측장비)
    lat  DOUBLE NOT NULL,        -- 위도 (GPS 좌표)
    lng  DOUBLE NOT NULL         -- 경도 (GPS 좌표)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CSV 파일에서 기상 관측소 데이터 로드
LOAD DATA LOCAL INFILE 'C:/Users/Admin/Desktop/Trend/sdot_dashboard/db/weather_stations.csv'
INTO TABLE weather_stations
CHARACTER SET utf8mb4                             -- UTF-8 인코딩
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'  -- 쉼표 구분, 따옴표 처리
LINES TERMINATED BY '\n'                          -- 줄 구분자
IGNORE 1 ROWS                                     -- 헤더 행 무시
(id, name, type, lat, lng);                       -- 컬럼 순서 지정

-- 로드된 기상 관측소 개수 확인
SELECT COUNT(*) AS total FROM weather_stations;
