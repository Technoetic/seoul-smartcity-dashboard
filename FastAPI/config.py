# -*- coding: utf-8 -*-
"""
이 파일의 역할:
애플리케이션 전체에서 사용할 설정값(Config)과 로거(Logger) 정의

주요 내용:
- 로깅 설정: 서버 실행 중 발생하는 이벤트를 기록
- 데이터베이스 연결 정보: MySQL 접속에 필요한 설정
- TTL(Time To Live) 상수: 캐시 유지 시간 정의
"""

# logging: Python 표준 로깅 라이브러리 (에러, 경고, 정보 메시지 기록)
import logging
import logging.handlers
import os

# dotenv: .env 파일에서 환경 변수를 로드하는 라이브러리
from dotenv import load_dotenv

# .env 파일 로드 (현재 디렉토리에서 .env 파일 탐색)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# === 로깅 설정 ===
# 로그 파일 저장 디렉토리 생성
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

# 서버 실행 중 발생하는 모든 이벤트를 콘솔과 파일에 출력
logging.basicConfig(
    level=logging.INFO,  # INFO 레벨 이상의 로그만 출력 (DEBUG < INFO < WARNING < ERROR)
    format='%(asctime)s - %(levelname)s - %(message)s',  # 로그 형식: 시간 - 레벨 - 메시지
    handlers=[
        logging.StreamHandler(),  # 콘솔 출력
        logging.handlers.RotatingFileHandler(
            os.path.join(LOG_DIR, 'server.log'),
            maxBytes=10*1024*1024,  # 10MB 초과 시 새 파일 생성
            backupCount=5,  # 최대 5개 백업 파일 유지
            encoding='utf-8'
        )
    ]
)
# logger 객체 생성 (다른 파일에서 'from config import logger'로 사용)
logger = logging.getLogger(__name__)

# === 데이터베이스 설정 ===
# MySQL 데이터베이스 연결에 필요한 정보를 .env 파일에서 로드
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),  # 데이터베이스 서버 주소
    'port': int(os.getenv('DB_PORT', '3306')),  # MySQL 포트 번호
    'user': os.getenv('DB_USER', 'root'),  # 데이터베이스 사용자 이름
    'password': os.getenv('DB_PASSWORD', ''),  # 데이터베이스 비밀번호 (.env에서 관리)
    'database': os.getenv('DB_NAME', 'sdot_db'),  # 사용할 데이터베이스 이름
    'charset': 'utf8mb4',  # 문자 인코딩 (utf8mb4: 한글, 이모지 등 모든 문자 지원)
    'auth_plugin_map': {  # 인증 방식 설정 (MySQL 버전 호환성)
        'mysql_native_password': 'mysql_native_password',
        'auth_gssapi_client': 'mysql_native_password'
    }
}

# === TTL 설정 (초 단위) ===
# TTL(Time To Live): 캐시 데이터가 유효한 시간
TTL_METADATA = 86400      # 24시간 (24 * 60 * 60 = 86400초) - 메타데이터용
TTL_REPLAY_PAST = 604800  # 7일 (7 * 24 * 60 * 60 = 604800초) - 과거 데이터용
TTL_REPLAY_TODAY = 300    # 5분 (5 * 60 = 300초) - 오늘 데이터용 (자주 갱신 필요)
