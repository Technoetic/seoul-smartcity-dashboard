-- S-DoT NATURE CSV → sdot_nature_all 마이그레이션
-- 이 스크립트는 S-DoT 환경 센서 CSV 파일을 MySQL 데이터베이스로 가져옵니다.
-- 실행: mysql -u root -p --local-infile sdot_db < migrate_sdot_nature.sql
-- CSV 22컬럼 중 시리얼(3), 기온(5), 습도(6), 전송시간(21) 만 사용

-- 로컬 파일 로드 허용 (보안 설정)
SET GLOBAL local_infile = 1;

-- 1) 임시 테이블 생성
-- CSV 파일의 모든 컬럼을 임시로 저장할 테이블 (22개 컬럼)
DROP TABLE IF EXISTS _csv_tmp;
CREATE TABLE _csv_tmp (
    c1  VARCHAR(50),  c2  VARCHAR(50),  c3  VARCHAR(50),
    c4  VARCHAR(10),  c5  VARCHAR(20),  c6  VARCHAR(20),
    c7  VARCHAR(20),  c8  VARCHAR(20),  c9  VARCHAR(20),
    c10 VARCHAR(20),  c11 VARCHAR(20),  c12 VARCHAR(20),
    c13 VARCHAR(20),  c14 VARCHAR(20),  c15 VARCHAR(20),
    c16 VARCHAR(20),  c17 VARCHAR(20),  c18 VARCHAR(20),
    c19 VARCHAR(20),  c20 VARCHAR(20),  c21 VARCHAR(50),
    c22 VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) CSV 로드 (파일 경로만 변경해서 반복)
-- CSV 파일을 임시 테이블로 불러옵니다. 여러 CSV 파일이 있다면 이 부분을 반복 실행하세요.
LOAD DATA LOCAL INFILE 'C:/Users/Admin/Desktop/Trend/sdot_dashboard/db/S-DoT_NATURE/2020/S-DoT_NATURE_2020.04.01-04.30.csv'
INTO TABLE _csv_tmp
CHARACTER SET euckr                             -- CSV 파일 인코딩 (EUC-KR)
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'  -- 쉼표 구분, 따옴표로 감싸진 필드 처리
LINES TERMINATED BY '\n'                        -- 줄 구분자
IGNORE 1 ROWS;                                  -- 첫 행(헤더) 무시

-- 3) 본 테이블 생성
-- 실제로 사용할 4개 컬럼(id, 시리얼, 온도_평균, 습도_평균, 등록일시)만 포함하는 테이블
CREATE TABLE IF NOT EXISTS sdot_nature_all (
    id       INT AUTO_INCREMENT PRIMARY KEY,    -- 자동 증가 고유 ID
    시리얼   VARCHAR(50),                        -- 센서 시리얼 번호
    온도_평균 FLOAT,                             -- 평균 온도 (°C)
    습도_평균 FLOAT,                             -- 평균 습도 (%)
    등록일시  DATETIME,                          -- 데이터 전송 시간
    INDEX idx_시리얼 (시리얼),                  -- 시리얼 번호로 빠른 조회를 위한 인덱스
    INDEX idx_등록일시 (등록일시)               -- 시간으로 빠른 조회를 위한 인덱스
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) 필요한 4개 컬럼만 본 테이블에 INSERT
-- 임시 테이블에서 필요한 컬럼만 추출하여 본 테이블에 저장합니다.
INSERT INTO sdot_nature_all (시리얼, 온도_평균, 습도_평균, 등록일시)
SELECT
    c3,  -- 시리얼 번호 (3번째 컬럼)
    -- 온도 값 변환: 숫자 형태인 경우만 FLOAT로 변환, 아니면 NULL
    CASE WHEN c5 REGEXP '^-?[0-9]' THEN CAST(c5 AS DECIMAL(5,1)) ELSE NULL END,
    -- 습도 값 변환: 숫자 형태인 경우만 FLOAT로 변환, 아니면 NULL
    CASE WHEN c6 REGEXP '^[0-9]'   THEN CAST(c6 AS DECIMAL(5,1)) ELSE NULL END,
    -- 전송시간 변환: '2020.4.1 12:30' 형식을 DATETIME으로 변환
    STR_TO_DATE(c21, '%Y.%c.%e %H:%i')
FROM _csv_tmp
WHERE c3 IS NOT NULL AND c3 != '';  -- 시리얼 번호가 있는 행만 삽입

-- 5) 정리
-- 임시 테이블 삭제 (더 이상 필요 없음)
DROP TABLE _csv_tmp;

-- 전체 데이터 개수 확인
SELECT COUNT(*) AS total FROM sdot_nature_all;
