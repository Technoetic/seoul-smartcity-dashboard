# -*- coding: utf-8 -*-
"""
이 파일의 역할:
API 엔드포인트(경로) 정의 - 클라이언트가 요청할 수 있는 URL과 응답 처리

주요 API 목록:
- GET /health - 서버 상태 확인
- GET /api/v1/sdot-proxy - 서울시 Open API 프록시 (CORS 우회)
- GET /api/v1/sensors - 센서 위치 목록 조회
- GET /api/v1/metadata - 데이터 범위 메타데이터 조회
- GET /api/v1/replay - 특정 날짜/시간의 센서 데이터 조회
- GET /api/v1/replay/date-range - 날짜 범위 내 데이터가 있는 날짜 목록
- GET /api/v1/cache/clear - 캐시 전체 삭제
- GET /api/v1/cache/stats - 캐시 통계 조회
"""

# os: 파일 경로 관련 기능
import os
# datetime: 날짜/시간 처리
from datetime import datetime
# Optional: 선택적 매개변수 타입 힌트 (값이 있을 수도, 없을 수도 있음)
from typing import Optional

# APIRouter: FastAPI에서 여러 API를 그룹화하는 라우터
from fastapi import APIRouter, HTTPException, Query
# JSONResponse: JSON 형식의 응답을 보낼 때 사용
from fastapi.responses import JSONResponse

# 다른 모듈에서 필요한 객체들 import
from config import logger, TTL_METADATA, TTL_REPLAY_TODAY, TTL_REPLAY_PAST
from database import get_db_connection
from cache import cache

# === API 라우터 생성 ===
# 이 라우터에 등록된 모든 엔드포인트는 replay_api.py에서 앱에 추가됨
router = APIRouter()

# === 정적 파일 경로 설정 ===
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONT_DIR = os.path.join(BASE_DIR, "Front")


@router.get("/health")
async def health_check():
    """
    서버 상태 확인 API (헬스 체크)

    용도:
    - 서버가 정상 작동하는지 간단히 확인
    - 모니터링 도구에서 주기적으로 호출

    응답 예시:
    {
        "status": "OK",
        "timestamp": "2024-01-01T12:00:00",
        "service": "S-DoT Replay API"
    }
    """
    return {
        "status": "OK",  # 서버 상태
        "timestamp": datetime.now().isoformat(),  # 현재 시각 (ISO 8601 형식)
        "service": "S-DoT Replay API"  # 서비스 이름
    }


@router.get("/api/v1/sdot-proxy")
async def sdot_proxy(district: Optional[str] = None):
    """
    서울시 S-DoT Open API 프록시 (CORS 우회용)

    왜 필요한가?
    - 브라우저에서 직접 서울시 API를 호출하면 CORS 에러 발생
    - 이 서버를 거쳐서 호출하면 CORS 문제 해결

    매개변수:
    - district: 자치구명 (선택사항)

    동작:
    1. 서울시 Open API로 HTTP 요청
    2. 받은 데이터를 그대로 클라이언트에 전달
    """
    import httpx  # 비동기 HTTP 클라이언트 라이브러리
    api_key = os.getenv('SDOT_API_KEY', '')  # 서울시 Open API 인증키 (.env에서 관리)
    if not api_key:
        logger.error("SDOT_API_KEY 환경변수가 설정되지 않았습니다")
        raise HTTPException(status_code=500, detail="API 키가 설정되지 않았습니다")
    service = "IotVdata017"  # 서비스 이름
    # API URL 생성 (1~1000번 데이터 요청)
    url = f"http://openapi.seoul.go.kr:8088/{api_key}/json/{service}/1/1000"
    if district:
        url += f"/{district}"  # 자치구 필터 추가
    try:
        # 비동기 HTTP 클라이언트로 서울시 API 호출 (10초 타임아웃)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            return JSONResponse(content=resp.json())  # JSON 응답 반환
    except Exception as e:
        logger.error(f"S-DoT API 프록시 오류: {e}")
        # HTTP 502 에러 (Bad Gateway - 외부 API 호출 실패)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/api/v1/sensors")
async def get_sensors():
    """
    센서 위치 목록 조회 API

    기능:
    - S-DoT 센서들의 위치 정보 조회
    - 기상 관측소(ASOS, AWS) 위치 정보 조회
    - 자치구 → 행정동 → 센서 계층 구조로 반환

    응답 구조:
    {
        "sensorData": {
            "강남구": {
                "삼성동": [{"id": "센서ID", "lat": 37.5, "lng": 127.0}, ...],
                ...
            },
            ...
        },
        "asosStations": [기상청 관측소 목록],
        "awsStations": [자동 기상 관측소 목록],
        "count": 센서 총 개수
    }
    """
    # 1. 캐시 확인 (1시간 유효)
    cached = cache.get("sensors", 3600)
    if cached:
        return cached  # 캐시된 데이터 반환 (빠름)

    try:
        # 2. 데이터베이스에서 조회
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # S-DoT 센서 위치 조회 (자치구, 행정동 순으로 정렬)
            cursor.execute("SELECT 시리얼, 자치구, 행정동, 위도, 경도 FROM sdot_sensor_locations ORDER BY 자치구, 행정동")
            rows = cursor.fetchall()

            # 기상 관측소 위치 조회 (타입, ID 순으로 정렬)
            cursor.execute("SELECT id, name, type, lat, lng FROM weather_stations ORDER BY type, id")
            ws_rows = cursor.fetchall()

        # 3. 센서 데이터를 계층 구조로 변환
        # {"자치구": {"행정동": [센서 리스트]}} 형태
        sensor_data = {}
        for row in rows:
            serial, district, dong, lat, lng = row
            if not district or not dong:  # 자치구/행정동 정보가 없으면 건너뛰기
                continue
            if district not in sensor_data:
                sensor_data[district] = {}  # 자치구 추가
            if dong not in sensor_data[district]:
                sensor_data[district][dong] = []  # 행정동 추가
            # 센서 정보 추가
            sensor_data[district][dong].append({
                "id": serial, "lat": lat, "lng": lng
            })

        # 4. 기상 관측소 데이터 분류
        asos_stations = []  # ASOS: 기상청 종관기상관측소
        aws_stations = []  # AWS: 자동 기상 관측소
        for ws in ws_rows:
            station = {"id": ws[0], "name": ws[1], "lat": ws[3], "lng": ws[4]}
            if ws[2] == 'asos':
                asos_stations.append(station)
            else:
                aws_stations.append(station)

        # 4-2. RTD(실시간 도시데이터) 위치 조회
        with get_db_connection() as conn2:
            cursor2 = conn2.cursor()
            cursor2.execute("SELECT id, area_nm, category, lat, lng FROM rtd_locations ORDER BY id")
            rtd_rows = cursor2.fetchall()

        rtd_stations = []
        for rtd in rtd_rows:
            rtd_stations.append({
                "id": rtd[0],
                "name": rtd[1],
                "category": rtd[2],
                "lat": rtd[3],
                "lng": rtd[4]
            })

        # 5. 최종 응답 데이터 생성
        result = {
            "sensorData": sensor_data,
            "asosStations": asos_stations,
            "awsStations": aws_stations,
            "rtdStations": rtd_stations,
            "count": len(rows)  # 전체 센서 개수
        }
        # 6. 캐시에 저장 (다음 요청 시 빠른 응답)
        cache.set("sensors", result)
        return result
    except Exception as e:
        logger.error(f"센서 목록 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/v1/metadata")
async def get_metadata():
    """
    데이터 범위 메타데이터 조회 API

    기능:
    - DB에 저장된 센서 데이터의 전체 범위 정보 제공
    - 최소/최대 날짜, 센서 개수, 총 레코드 수 등

    응답 예시:
    {
        "min_date": "2024-01-01",
        "max_date": "2024-12-31",
        "total_days": 365,
        "sensor_count": 1200,
        "total_records": 15000000
    }

    캐시:
    - 24시간 동안 캐시 유지 (자주 변경되지 않는 데이터)
    """
    # 1. 캐시 확인
    cached = cache.get("metadata", TTL_METADATA)
    if cached:
        logger.info("메타데이터 캐시 히트")
        return cached  # 캐시된 데이터 반환

    try:
        # 2. 데이터베이스에서 메타데이터 조회
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # 집계 함수를 사용하여 통계 정보 추출
            cursor.execute("""
                SELECT
                    MIN(DATE(등록일시)) as min_date,  -- 가장 오래된 데이터 날짜
                    MAX(DATE(등록일시)) as max_date,  -- 가장 최신 데이터 날짜
                    COUNT(DISTINCT 시리얼) as sensor_count,  -- 센서 개수 (중복 제거)
                    COUNT(*) as total_records  -- 전체 레코드 수
                FROM sdot_nature_all
            """)
            row = cursor.fetchone()

        # 3. 데이터가 없는 경우 에러 반환
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="데이터가 없습니다")

        # 4. 결과 파싱
        min_date, max_date, sensor_count, total_records = row
        # 총 일수 계산 (최대 날짜 - 최소 날짜 + 1)
        total_days = (max_date - min_date).days + 1 if min_date and max_date else 0

        # 5. 응답 데이터 생성
        response = {
            "min_date": str(min_date),  # 최소 날짜
            "max_date": str(max_date),  # 최대 날짜
            "total_days": total_days,  # 총 일수
            "sensor_count": sensor_count,  # 센서 개수
            "total_records": total_records  # 총 레코드 수
        }

        # 6. 캐시에 저장 (24시간 유지)
        cache.set("metadata", response)
        logger.info(f"메타데이터 조회 완료: {min_date} ~ {max_date}")
        return response

    except HTTPException:
        raise  # HTTPException은 그대로 전달
    except Exception as e:
        logger.error(f"메타데이터 조회 오류: {e}")
        raise HTTPException(status_code=500, detail="메타데이터 조회 실패")


@router.get("/api/v1/replay")
async def get_replay_data(
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="날짜 (YYYY-MM-DD)"),
    hour: int = Query(0, ge=0, le=23, description="시간 (0-23)")
):
    """
    특정 날짜/시간의 센서 데이터 조회 API (시간대별 재생)

    매개변수:
    - date: 날짜 (YYYY-MM-DD 형식, 예: "2024-01-15")
    - hour: 시간 (0~23, 예: 14 = 오후 2시)

    기능:
    1. 해당 날짜/시간의 모든 센서 데이터 조회
    2. 데이터가 없으면 인접 시간대 데이터 자동 탐색 (±12시간)
    3. 결과를 캐시에 저장 (오늘: 5분, 과거: 7일)

    응답 예시:
    {
        "date": "2024-01-15",
        "hour": 14,
        "actual_hour": 14,
        "data": [센서 데이터 배열],
        "record_count": 1200,
        "cached": false
    }
    """
    # 1. 캐시 키 생성 (예: "replay_2024-01-15_14")
    cache_key = f"replay_{date}_{hour:02d}"
    today = datetime.now().strftime("%Y-%m-%d")
    # 오늘 데이터는 5분마다 갱신, 과거 데이터는 7일 동안 캐시
    ttl = TTL_REPLAY_TODAY if date == today else TTL_REPLAY_PAST

    # 2. 캐시 확인
    cached = cache.get(cache_key, ttl)
    if cached:
        logger.info(f"재생 데이터 캐시 히트: {date} {hour}시")
        cached["cached"] = True  # 캐시된 데이터임을 표시
        return cached

    try:
        # 3. 데이터베이스에서 센서 데이터 조회
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # SQL 쿼리: 센서 데이터 + 위치 정보 조인
            cursor.execute("""
                SELECT
                    a.시리얼, a.자치구, a.행정동,  -- 센서 기본 정보
                    a.온도_평균, a.습도_평균,  -- 센서 측정값
                    DATE_FORMAT(a.등록일시, '%%Y%%m%%d%%H%%i') as MSRMT_HR,  -- 측정 시각 (형식 변환)
                    a.등록일시,  -- 원본 등록 시각
                    b.위도, b.경도,  -- 센서 위치 좌표
                    b.자치구 as 자치구_한글,  -- 위치 정보 (한글)
                    b.행정동 as 행정동_한글
                FROM sdot_nature_all a  -- 센서 데이터 테이블
                LEFT JOIN sdot_sensor_locations b ON a.시리얼 = b.시리얼  -- 위치 정보와 조인
                WHERE a.등록일시 >= CONCAT(%s, ' ', LPAD(%s, 2, '0'), ':00:00')
                  AND a.등록일시 < CONCAT(%s, ' ', LPAD(%s, 2, '0'), ':00:00') + INTERVAL 1 HOUR
                ORDER BY a.시리얼  -- 센서 ID 순으로 정렬
                LIMIT 100000  -- 최대 10만 건 (과도한 데이터 방지)
            """, (date, hour, date, hour))
            rows = cursor.fetchall()  # 모든 결과 가져오기

        # 4. 데이터가 없는 경우 인접 시간대 탐색 (단일 쿼리로 최적화)
        actual_hour = hour  # 실제로 사용된 시간대 (처음엔 요청한 시간)
        if not rows:
            logger.info(f"{date} {hour}시 데이터 없음, 인접 시간 탐색")
            # ±12시간 범위에서 데이터가 있는 시간대를 단일 쿼리로 탐색
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT HOUR(등록일시) as h, COUNT(*) as cnt
                    FROM sdot_nature_all
                    WHERE 등록일시 >= CONCAT(%s, ' 00:00:00')
                      AND 등록일시 < CONCAT(%s, ' 00:00:00') + INTERVAL 1 DAY
                    GROUP BY HOUR(등록일시)
                """, (date, date))
                available_hours = {row[0]: row[1] for row in cursor.fetchall()}

            # 가장 가까운 시간대 찾기 (±12시간)
            best_hour = None
            for offset in range(1, 13):
                for check_hour in [hour - offset, hour + offset]:
                    if 0 <= check_hour < 24 and check_hour in available_hours:
                        best_hour = check_hour
                        break
                if best_hour is not None:
                    break

            # 가장 가까운 시간대의 데이터 조회
            if best_hour is not None:
                actual_hour = best_hour
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT
                            a.시리얼, a.자치구, a.행정동,
                            a.온도_평균, a.습도_평균,
                            DATE_FORMAT(a.등록일시, '%%Y%%m%%d%%H%%i'),
                            a.등록일시,
                            b.위도, b.경도,
                            b.자치구 as 자치구_한글,
                            b.행정동 as 행정동_한글
                        FROM sdot_nature_all a
                        LEFT JOIN sdot_sensor_locations b ON a.시리얼 = b.시리얼
                        WHERE a.등록일시 >= CONCAT(%s, ' ', LPAD(%s, 2, '0'), ':00:00')
                          AND a.등록일시 < CONCAT(%s, ' ', LPAD(%s, 2, '0'), ':00:00') + INTERVAL 1 HOUR
                        ORDER BY a.시리얼
                        LIMIT 100000
                    """, (date, best_hour, date, best_hour))
                    rows = cursor.fetchall()
                logger.info(f"대체 시간 {best_hour}시 데이터 사용")

        # 5. 데이터 변환 (DB 행 → JSON 형식)
        data = []
        for row in rows:
            sensor_data = {
                "SN": row[0],  # Serial Number (센서 ID)
                "CGG": row[1],  # 자치구
                "DONG": row[2],  # 행정동
                "AVG_TP": float(row[3]) if row[3] is not None else None,  # 평균 온도
                "AVG_HUM": float(row[4]) if row[4] is not None else None,  # 평균 습도
                "MSRMT_HR": row[5],  # 측정 시각 (형식: YYYYMMDDHHmm)
                "REG_DT": str(row[6]) if row[6] else None,  # 등록 일시
                "LAT": float(row[7]) if row[7] is not None else None,  # 위도
                "LNG": float(row[8]) if row[8] is not None else None,  # 경도
                "CGG_KO": row[9] if row[9] else None,  # 자치구 (한글)
                "DONG_KO": row[10] if row[10] else None  # 행정동 (한글)
            }
            data.append(sensor_data)

        # 6. 최종 응답 데이터 생성
        response = {
            "date": date,  # 요청한 날짜
            "hour": hour,  # 요청한 시간
            "actual_hour": actual_hour,  # 실제로 사용된 시간 (데이터 없을 때 다를 수 있음)
            "data": data,  # 센서 데이터 배열
            "record_count": len(data),  # 레코드 개수
            "cached": False  # 새로 조회한 데이터임을 표시
        }

        # 7. 데이터가 있으면 캐시에 저장
        if data:
            cache.set(cache_key, response)

        logger.info(f"재생 데이터 조회: {date} {hour}시 → {len(data)}건")
        return response

    except HTTPException:
        raise  # HTTPException은 그대로 전달
    except Exception as e:
        logger.error(f"재생 데이터 조회 오류: {e}")
        raise HTTPException(status_code=500, detail="재생 데이터 조회 실패")


@router.get("/api/v1/replay/date-range")
async def get_available_dates(
    start: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="시작 날짜"),
    end: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="종료 날짜")
):
    """
    날짜 범위 내 데이터가 존재하는 날짜 목록 조회 API

    매개변수:
    - start: 시작 날짜 (YYYY-MM-DD)
    - end: 종료 날짜 (YYYY-MM-DD)

    기능:
    - 지정한 기간 내에 실제로 센서 데이터가 있는 날짜만 반환
    - UI에서 캘린더에 표시할 활성화 날짜를 결정할 때 사용

    응답 예시:
    {
        "start": "2024-01-01",
        "end": "2024-01-31",
        "available_dates": ["2024-01-01", "2024-01-03", "2024-01-05", ...],
        "count": 28
    }

    캐시:
    - 24시간 동안 캐시 유지
    """
    # 1. 캐시 키 생성
    cache_key = f"daterange_{start}_{end}"

    # 2. 캐시 확인
    cached = cache.get(cache_key, TTL_METADATA)
    if cached:
        return cached

    try:
        # 3. 데이터베이스에서 날짜 목록 조회
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # DISTINCT: 중복 제거 (같은 날짜에 여러 레코드가 있어도 날짜는 1번만)
            cursor.execute("""
                SELECT DISTINCT DATE(등록일시) as date
                FROM sdot_nature_all
                WHERE 등록일시 >= CONCAT(%s, ' 00:00:00')
                  AND 등록일시 < CONCAT(%s, ' 00:00:00') + INTERVAL 1 DAY
                ORDER BY date  -- 날짜 순으로 정렬
            """, (start, end))
            rows = cursor.fetchall()

        # 4. 날짜를 문자열 리스트로 변환
        dates = [str(row[0]) for row in rows]

        # 5. 응답 데이터 생성
        response = {
            "start": start,  # 요청한 시작 날짜
            "end": end,  # 요청한 종료 날짜
            "available_dates": dates,  # 데이터가 있는 날짜 목록
            "count": len(dates)  # 날짜 개수
        }

        # 6. 캐시에 저장
        cache.set(cache_key, response)
        logger.info(f"날짜 범위 조회: {start} ~ {end} → {len(dates)}일")
        return response

    except Exception as e:
        logger.error(f"날짜 범위 조회 오류: {e}")
        raise HTTPException(status_code=500, detail="날짜 범위 조회 실패")


@router.get("/api/v1/cache/clear")
async def clear_cache():
    """
    캐시 전체 삭제 API

    용도:
    - 캐시된 데이터를 강제로 삭제하고 새로 조회하게 함
    - 개발/디버깅 시 유용
    - 데이터가 업데이트되었을 때 즉시 반영하고 싶을 때 사용

    응답 예시:
    {
        "status": "OK",
        "message": "캐시가 삭제되었습니다"
    }
    """
    cache.clear()  # 모든 캐시 삭제
    logger.info("캐시 삭제됨")
    return {"status": "OK", "message": "캐시가 삭제되었습니다"}


@router.get("/api/v1/cache/stats")
async def get_cache_stats():
    """
    캐시 통계 조회 API

    용도:
    - 캐시 성능 모니터링
    - 히트율이 높으면 캐시가 잘 작동하는 것
    - 캐시 크기와 사용량 파악

    응답 예시:
    {
        "timestamp": "2024-01-15T14:30:00",
        "summary": {
            "total_entries": 1500,
            "overall_hit_rate": 87.5
        },
        "metadata": { 캐시 상세 통계 },
        "replay": { 캐시 상세 통계 },
        "daterange": { 캐시 상세 통계 }
    }
    """
    stats = cache.get_all_stats()  # 모든 캐시의 통계 조회
    logger.info(f"캐시 통계 조회: 총 항목 {stats['summary']['total_entries']}개, 히트율 {stats['summary']['overall_hit_rate']}%")
    return stats
