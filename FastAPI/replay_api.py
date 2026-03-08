# -*- coding: utf-8 -*-
"""
이 파일의 역할:
S-DoT Replay API 서버의 메인 실행 파일 (FastAPI 애플리케이션 초기화 및 실행)

전체 시스템 구조:
┌─────────────┐
│ replay_api  │ ← 현재 파일 (메인 서버)
└─────────────┘
      ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  config.py  │ database.py │  cache.py   │  routes.py  │
│  (설정)     │ (DB 연결풀) │ (캐시)      │ (API 경로)  │
└─────────────┴─────────────┴─────────────┴─────────────┘

주요 기능:
- FastAPI 앱 초기화 및 설정
- CORS 설정 (브라우저에서 다른 도메인 API 호출 허용)
- 정적 파일 서빙 (HTML, CSS, JS)
- API 라우터 등록
- 서버 시작/종료 이벤트 처리
"""

# os: 운영체제 관련 기능 (파일 경로, 디렉토리 등)
import os
# sys: Python 시스템 관련 기능 (모듈 경로, 종료 등)
import sys
# contextlib: 컨텍스트 매니저 유틸리티 (lifespan용)
from contextlib import asynccontextmanager

# 현재 디렉토리를 모듈 검색 경로에 추가
# 왜 필요? → 같은 폴더의 다른 .py 파일을 import할 수 있게 함
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# FastAPI: 빠르고 현대적인 Python 웹 프레임워크
from fastapi import FastAPI
# CORSMiddleware: CORS(Cross-Origin Resource Sharing) 설정 미들웨어
from fastapi.middleware.cors import CORSMiddleware
# GZipMiddleware: API 응답을 gzip 압축하여 전송 크기 절감
from fastapi.middleware.gzip import GZipMiddleware
# FileResponse: HTML 파일 등을 응답으로 보낼 때 사용
from fastapi.responses import FileResponse
# StaticFiles: CSS, JS, 이미지 등 정적 파일을 서빙하기 위한 클래스
from fastapi.staticfiles import StaticFiles

# 같은 폴더의 다른 모듈들 import
from config import logger  # 로거 (로그 기록)
from database import initialize_db_pool, get_db_connection, close_db_pool  # DB 연결 관리
from cache import cache  # 캐시 객체
from routes import router  # API 엔드포인트 모음


# === FastAPI 라이프사이클 관리 ===
@asynccontextmanager
async def lifespan(app):
    """
    서버 시작/종료 시 자동 실행되는 라이프사이클 관리자

    시작 시:
    1. 데이터베이스 연결 풀 초기화
    2. 캐시 정리 스레드 시작
    3. DB 연결 테스트 (정상 작동 확인)

    종료 시:
    1. 캐시 정리 스레드 종료
    2. 데이터베이스 연결 풀 종료
    """
    # === 시작 시 실행 ===
    try:
        initialize_db_pool()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
        logger.info("DB 연결 풀 테스트 성공")
    except Exception as e:
        logger.warning(f"DB 연결 실패 (서버는 계속 시작): {e}")

    cache.start_cleanup_thread(cleanup_interval=60)

    yield  # 서버 실행 중

    # === 종료 시 실행 ===
    cache.stop_cleanup_thread()
    close_db_pool()


# === FastAPI 앱 초기화 ===
# FastAPI 애플리케이션 생성 (웹 서버의 핵심 객체)
app = FastAPI(
    title="S-DoT Replay API",  # API 문서에 표시될 제목
    description="서울 스마트시티 센서 데이터 시간대별 재생 API",  # API 설명
    version="1.0.0",  # API 버전
    lifespan=lifespan  # 라이프사이클 관리자 등록
)

# === CORS 미들웨어 설정 ===
# CORS(Cross-Origin Resource Sharing): 브라우저에서 이 API를 호출할 수 있게 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 origin 허용 (내부망 대시보드이므로)
    allow_methods=["GET"],  # 읽기 전용 API이므로 GET만 허용
    allow_headers=["*"],  # 모든 HTTP 헤더 허용
)

# === GZip 압축 미들웨어 설정 ===
# 1KB 이상의 응답을 자동 gzip 압축하여 전송 크기 30-70% 절감
app.add_middleware(GZipMiddleware, minimum_size=1000)

# === 정적 파일 경로 설정 ===
# 현재 파일의 상위 디렉토리 경로 계산
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONT_DIR = os.path.join(BASE_DIR, "Front")  # 프론트엔드 파일 폴더

# === 정적 파일 서빙 (HTML, CSS, JS 제공) ===
# /css로 시작하는 요청 → Front/css 폴더의 파일 반환
app.mount("/css", StaticFiles(directory=os.path.join(FRONT_DIR, "css")), name="css")
# /js로 시작하는 요청 → Front/js 폴더의 파일 반환
app.mount("/js", StaticFiles(directory=os.path.join(FRONT_DIR, "js")), name="js")

# === API 라우터 등록 ===
# routes.py에 정의된 모든 API 엔드포인트를 앱에 추가
app.include_router(router)


# === 대시보드 메인 페이지 ===
@app.get("/", response_class=FileResponse)
async def serve_dashboard():
    """
    루트 경로(/) 접속 시 대시보드 HTML 파일 반환

    동작:
    - 브라우저에서 http://localhost:8000/ 접속
    - Front/index.html 파일을 응답으로 전송
    """
    return FileResponse(os.path.join(FRONT_DIR, "index.html"))


# === 서버 실행 ===
# 이 파일을 직접 실행할 때만 서버 시작 (import될 때는 실행 안 됨)
if __name__ == "__main__":
    # uvicorn: FastAPI 서버를 실행하는 ASGI 서버
    import uvicorn

    # 서버 시작 안내 메시지 출력
    print("=" * 50)
    print("S-DoT Replay API Server")
    print("=" * 50)
    print(f"서버 시작: http://localhost:8000")  # 대시보드 주소
    print(f"API 문서: http://localhost:8000/docs")  # Swagger 자동 생성 문서
    print("=" * 50)

    # 서버 실행
    port = int(os.getenv("PORT", 8000))  # Railway는 PORT 환경변수를 제공
    uvicorn.run(
        app,  # FastAPI 앱 객체
        host="0.0.0.0",  # 모든 네트워크 인터페이스에서 접속 허용 (외부 접속 가능)
        port=port,  # 포트 번호
        log_level="info"  # 로그 레벨 (info 이상만 출력)
    )
