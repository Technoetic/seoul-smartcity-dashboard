# -*- coding: utf-8 -*-
"""
이 파일의 역할:
데이터베이스 연결을 효율적으로 관리하는 연결 풀(Connection Pool) 제공

왜 연결 풀이 필요한가?
- 매번 DB 연결을 새로 만들면 느림 (연결 생성 비용이 큼)
- 연결 풀: 미리 연결을 여러 개 만들어두고 재사용 → 빠름
- 예: 카페에서 컵을 매번 새로 사는 대신, 여러 컵을 준비해두고 돌려쓰는 것과 동일

주요 기능:
- 데이터베이스 연결 풀 초기화
- 연결 가져오기/반환 (컨텍스트 매니저 패턴)
- 연결 풀 종료
"""

# contextmanager: with문으로 자원 자동 관리 (파일, DB 연결 등)
from contextlib import contextmanager
# HTTPException: FastAPI에서 HTTP 에러 응답을 보낼 때 사용
from fastapi import HTTPException
# pymysql: Python에서 MySQL 데이터베이스에 접속하기 위한 라이브러리
import pymysql
# PooledDB: 데이터베이스 연결 풀을 관리하는 클래스 (dbutils 라이브러리)
from dbutils.pooled_db import PooledDB

# config.py에서 DB 설정과 로거 가져오기
from config import DB_CONFIG, logger

# === 전역 변수: 데이터베이스 연결 풀 ===
# 애플리케이션 시작 시 initialize_db_pool()로 초기화됨
db_pool = None


def initialize_db_pool():
    """
    데이터베이스 연결 풀 초기화 (서버 시작 시 1번만 실행)

    연결 풀 설정:
    - maxconnections: 최대 연결 수 (10개)
    - mincached: 풀에 항상 유지할 최소 연결 수 (2개)
    - maxcached: 풀에 캐시할 최대 연결 수 (5개)
    - maxshared: 스레드 간 공유 가능한 최대 연결 수 (3개)
    - blocking: 연결이 부족하면 대기할지 여부 (True = 대기)
    - ping: 연결 상태 확인 주기 (1 = 사용 전 확인)
    """
    global db_pool  # 전역 변수 db_pool을 수정
    try:
        db_pool = PooledDB(
            creator=pymysql,  # 연결을 만들 때 사용할 라이브러리
            maxconnections=10,  # 동시에 최대 10개까지 연결 허용
            mincached=2,  # 최소 2개의 연결을 항상 준비
            maxcached=5,  # 최대 5개의 연결을 재사용 가능하게 보관
            maxshared=3,  # 최대 3개의 연결을 여러 스레드가 공유 가능
            blocking=True,  # 연결이 부족하면 기다림 (False면 에러 발생)
            ping=1,  # 연결 사용 전 상태 확인 (끊어진 연결 방지)
            **DB_CONFIG  # config.py의 DB_CONFIG 설정값 적용
        )
        logger.info("DB 연결 풀 초기화 완료")
    except Exception as e:
        logger.error(f"DB 연결 풀 초기화 실패: {e}")
        raise  # 에러를 상위로 전달 (서버 시작 중단)


@contextmanager
def get_db_connection():
    """
    데이터베이스 연결을 가져오는 컨텍스트 매니저

    사용 방법:
    ```python
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM table")
        # conn.close()는 자동 호출됨 (finally 블록)
    ```

    컨텍스트 매니저란?
    - with문과 함께 사용하는 패턴
    - 자원(DB 연결, 파일 등)을 자동으로 정리해줌
    - 에러가 발생해도 반드시 conn.close()가 실행됨 (메모리 누수 방지)
    """
    conn = None
    try:
        conn = db_pool.connection()  # 풀에서 연결 가져오기
        yield conn  # 연결을 호출자에게 전달 (with문의 as 변수로)
    except Exception as e:
        logger.error(f"DB 연결 오류: {e}")
        # HTTP 500 에러 발생 (Internal Server Error)
        raise HTTPException(status_code=500, detail="데이터베이스 연결 실패")
    finally:
        # 성공/실패 여부와 관계없이 항상 실행
        if conn:
            conn.close()  # 연결을 풀에 반환 (실제로는 닫지 않고 재사용 대기 상태로)


def close_db_pool():
    """
    데이터베이스 연결 풀 종료 (서버 종료 시 1번만 실행)

    왜 필요한가?
    - 서버 종료 시 열려있는 모든 DB 연결을 정리
    - 메모리 누수 방지
    """
    global db_pool  # 전역 변수 db_pool을 수정
    if db_pool:
        try:
            db_pool.close()  # 풀의 모든 연결 닫기
            logger.info("DB 연결 풀 종료")
        except Exception as e:
            logger.error(f"DB 연결 풀 종료 오류: {e}")
