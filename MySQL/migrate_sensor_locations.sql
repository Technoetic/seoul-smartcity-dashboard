-- S-DoT 센서 위치정보 CSV 로드
-- 이 스크립트는 S-DoT 센서들의 설치 위치 정보(주소, 위도, 경도 등)를 데이터베이스에 로드합니다.
-- 실행: mysql -u root -p --local-infile sdot_db < migrate_sensor_locations.sql

-- 로컬 파일 로드 허용
SET GLOBAL local_infile = 1;

-- S-DoT 센서 위치정보 테이블 생성
CREATE TABLE IF NOT EXISTS sdot_sensor_locations (
    No INT,                      -- 센서 번호
    시리얼 VARCHAR(50),          -- 센서 시리얼 번호 (고유 식별자)
    주소 VARCHAR(255),           -- 센서 설치 주소
    좌표구분코드 VARCHAR(10),    -- 좌표 타입 코드
    위도 DOUBLE,                 -- 위도 (GPS 좌표)
    경도 DOUBLE,                 -- 경도 (GPS 좌표)
    비고 VARCHAR(255)            -- 추가 정보
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CSV 파일에서 위치정보 데이터 로드
LOAD DATA LOCAL INFILE 'C:/Users/Admin/Desktop/Trend/sdot_dashboard/db/서울시 도시데이터 센서(S-DoT) 환경정보 설치 위치정보.csv'
INTO TABLE sdot_sensor_locations
CHARACTER SET utf8mb4                             -- UTF-8 인코딩
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'  -- 쉼표 구분, 따옴표 처리
LINES TERMINATED BY '\n'                          -- 줄 구분자
IGNORE 1 ROWS                                     -- 헤더 행 무시
(No, 시리얼, 주소, 좌표구분코드, 위도, 경도, 비고);  -- 컬럼 순서 지정

-- 로드된 센서 위치정보 개수 확인
SELECT COUNT(*) AS total FROM sdot_sensor_locations;
