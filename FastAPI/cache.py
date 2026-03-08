# -*- coding: utf-8 -*-
"""
이 파일의 역할:
데이터베이스 조회 결과를 메모리에 임시 저장(캐싱)하여 응답 속도를 빠르게 하는 캐시 시스템

주요 기능:
- LRU(Least Recently Used) 방식으로 오래된 데이터부터 자동 삭제
- TTL(Time To Live) 설정으로 일정 시간 후 데이터 자동 만료
- 멀티스레드 환경에서 안전하게 동작 (Lock 사용)
- 백그라운드에서 만료된 데이터 자동 정리
"""

# 멀티스레딩: 여러 작업을 동시에 처리하기 위한 라이브러리
import threading
# 날짜/시간 처리: 캐시 만료 시간 계산에 사용
from datetime import datetime, timedelta
# OrderedDict: 데이터 입력 순서를 기억하는 딕셔너리 (LRU 캐시 구현에 필수)
from collections import OrderedDict
# 타입 힌트: 코드 가독성과 IDE 자동완성을 위한 타입 표시
from typing import Optional, Dict, Any, Tuple

# 설정 파일에서 로거와 TTL(Time To Live, 캐시 유지 시간) 상수 가져오기
from config import logger, TTL_REPLAY_TODAY, TTL_REPLAY_PAST


class LRUCache:
    """
    LRU(Least Recently Used) 캐시 클래스

    가장 오래 사용되지 않은 데이터부터 자동으로 삭제하는 캐시
    예: 캐시가 가득 차면 가장 오래된 데이터를 삭제하고 새 데이터를 저장
    """

    def __init__(self, max_size: int = 1000, default_ttl: int = 3600):
        """
        캐시 초기화

        매개변수:
        - max_size: 최대 저장 가능한 항목 수 (기본값: 1000개)
        - default_ttl: 기본 캐시 유지 시간(초) (기본값: 3600초 = 1시간)
        """
        self.max_size = max_size  # 캐시에 저장 가능한 최대 항목 수
        self.default_ttl = default_ttl  # 기본 캐시 만료 시간 (초 단위)
        # store: 실제 데이터를 저장하는 공간 (키 → (값, 저장시간, TTL) 형태)
        self.store: OrderedDict[str, Tuple[Any, datetime, int]] = OrderedDict()
        # _lock: 멀티스레드 환경에서 동시 접근 방지 (데이터 충돌 방지)
        self._lock = threading.RLock()
        # stats: 캐시 성능 통계 (히트/미스/제거 횟수)
        self.stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, key: str, ttl_seconds: Optional[int] = None) -> Optional[Any]:
        """
        캐시에서 데이터 가져오기 (TTL 만료 여부 확인)

        매개변수:
        - key: 찾을 데이터의 키(이름)
        - ttl_seconds: TTL 재정의 (None이면 저장 시 설정한 TTL 사용)

        반환값:
        - 캐시된 데이터 또는 None (데이터 없음/만료됨)
        """
        with self._lock:  # 스레드 안전성을 위해 Lock 획득
            # 1. 캐시에 데이터가 없는 경우
            if key not in self.store:
                self.stats["misses"] += 1  # 캐시 미스 카운트 증가
                return None

            # 2. 캐시에서 데이터 꺼내기
            data, timestamp, ttl = self.store[key]
            check_ttl = ttl_seconds if ttl_seconds is not None else ttl

            # 3. TTL 만료 확인 (현재 시간 - 저장 시간 > TTL이면 만료)
            if datetime.now() - timestamp > timedelta(seconds=check_ttl):
                del self.store[key]  # 만료된 데이터 삭제
                self.stats["misses"] += 1
                return None

            # 4. 데이터가 유효한 경우 - 최근 사용 표시 (LRU 알고리즘)
            self.store.move_to_end(key)  # 맨 뒤로 이동 = 최근 사용됨
            self.stats["hits"] += 1  # 캐시 히트 카운트 증가
            return data

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        캐시에 데이터 저장하기

        매개변수:
        - key: 저장할 데이터의 키(이름)
        - value: 저장할 실제 데이터
        - ttl: 캐시 유지 시간(초), None이면 기본값 사용
        """
        if ttl is None:
            ttl = self.default_ttl  # TTL이 없으면 기본값 사용

        with self._lock:  # 스레드 안전성을 위해 Lock 획득
            # 1. 이미 같은 키가 있으면 먼저 삭제 (중복 방지)
            if key in self.store:
                del self.store[key]

            # 2. 캐시가 가득 찬 경우 - 가장 오래된 항목 삭제 (LRU)
            while len(self.store) >= self.max_size:
                oldest_key, _ = self.store.popitem(last=False)  # 맨 앞(오래된) 항목 제거
                self.stats["evictions"] += 1  # 제거 카운트 증가
                logger.debug(f"캐시 제거 (용량 초과): {oldest_key}")

            # 3. 새 데이터 저장 (값, 현재 시간, TTL)
            self.store[key] = (value, datetime.now(), ttl)

    def cleanup_expired(self) -> int:
        """
        만료된 캐시 항목을 찾아서 삭제

        반환값:
        - 삭제된 항목 수
        """
        with self._lock:  # 스레드 안전성을 위해 Lock 획득
            current_time = datetime.now()  # 현재 시간
            expired_keys = []  # 만료된 키들을 저장할 리스트

            # 1. 모든 캐시 항목을 순회하며 만료 여부 확인
            for key, (data, timestamp, ttl) in self.store.items():
                if current_time - timestamp > timedelta(seconds=ttl):
                    expired_keys.append(key)  # 만료된 키 기록

            # 2. 만료된 항목 삭제
            for key in expired_keys:
                del self.store[key]

            # 3. 로그 기록
            if expired_keys:
                logger.debug(f"캐시 정리 완료: {len(expired_keys)}개 항목 삭제")

            return len(expired_keys)  # 삭제된 항목 개수 반환

    def get_stats(self) -> Dict[str, Any]:
        """
        캐시 성능 통계 조회

        반환값:
        - size: 현재 저장된 항목 수
        - max_size: 최대 저장 가능 항목 수
        - hits: 캐시 히트 횟수 (캐시에서 데이터를 찾은 횟수)
        - misses: 캐시 미스 횟수 (캐시에 데이터가 없었던 횟수)
        - hit_rate: 캐시 히트율 (%) - 높을수록 캐시 효율이 좋음
        - evictions: 용량 초과로 삭제된 항목 수
        """
        with self._lock:  # 스레드 안전성을 위해 Lock 획득
            total = self.stats["hits"] + self.stats["misses"]  # 전체 요청 수
            # 히트율 계산: (히트 수 / 전체 요청 수) * 100
            hit_rate = self.stats["hits"] / total * 100 if total > 0 else 0

            return {
                "size": len(self.store),  # 현재 캐시 크기
                "max_size": self.max_size,  # 최대 캐시 크기
                "hits": self.stats["hits"],  # 히트 횟수
                "misses": self.stats["misses"],  # 미스 횟수
                "hit_rate": round(hit_rate, 2),  # 히트율 (소수점 2자리)
                "evictions": self.stats["evictions"]  # 제거된 항목 수
            }

    def clear(self) -> None:
        """
        캐시 전체 초기화 (모든 데이터와 통계 삭제)
        """
        with self._lock:  # 스레드 안전성을 위해 Lock 획득
            self.store.clear()  # 저장된 데이터 모두 삭제
            self.stats = {"hits": 0, "misses": 0, "evictions": 0}  # 통계 초기화


class CacheCleanupThread(threading.Thread):
    """
    백그라운드에서 만료된 캐시를 자동으로 정리하는 스레드

    왜 필요한가?
    - 캐시 get() 호출 시에만 만료 확인을 하면, 사용하지 않는 데이터는 계속 메모리 차지
    - 이 스레드가 주기적으로 만료된 항목을 삭제하여 메모리 효율 향상
    """

    def __init__(self, cache: LRUCache, cleanup_interval: int = 60):
        """
        초기화

        매개변수:
        - cache: 정리할 LRUCache 객체
        - cleanup_interval: 정리 주기(초) - 기본 60초마다 정리
        """
        super().__init__(daemon=True)  # daemon=True: 메인 프로그램 종료 시 자동 종료
        self.cache = cache  # 관리할 캐시 객체
        self.cleanup_interval = cleanup_interval  # 정리 주기
        self._stop_event = threading.Event()  # 스레드 종료 신호
        self.name = "CacheCleanupThread"  # 스레드 이름

    def run(self):
        """
        스레드 실행 메서드 (백그라운드에서 계속 실행됨)
        """
        logger.info(f"캐시 정리 스레드 시작 (정리 주기: {self.cleanup_interval}초)")
        while not self._stop_event.is_set():  # 종료 신호가 올 때까지 반복
            try:
                # 만료된 캐시 항목 삭제
                removed_count = self.cache.cleanup_expired()
                if removed_count > 0:
                    logger.info(f"백그라운드 캐시 정리: {removed_count}개 항목 삭제")
            except Exception as e:
                logger.error(f"캐시 정리 오류: {e}")
            # 다음 정리 시간까지 대기 (cleanup_interval초)
            self._stop_event.wait(timeout=self.cleanup_interval)

    def stop(self):
        """
        스레드 종료 요청
        """
        logger.info("캐시 정리 스레드 종료 신호")
        self._stop_event.set()  # 종료 신호 발송
        self.join(timeout=5)  # 최대 5초 대기 후 강제 종료


class ImprovedCache:
    """
    여러 종류의 캐시를 관리하는 통합 캐시 매니저

    왜 3개로 분리?
    - 각 데이터 유형마다 특성이 다르므로 별도 관리
    - metadata: 시스템 메타데이터 (변경 적음, 오래 보관)
    - replay: 센서 데이터 (자주 조회, 빠른 만료 필요)
    - daterange: 날짜 범위 정보 (중간 수준)
    """

    def __init__(self):
        """
        3개의 독립적인 캐시 초기화

        - metadata_cache: 메타데이터 (최대 100개, 24시간 유지)
        - replay_cache: 재생 데이터 (최대 2000개, 1시간 유지)
        - daterange_cache: 날짜 범위 (최대 500개, 24시간 유지)
        """
        self.metadata_cache = LRUCache(max_size=100, default_ttl=86400)  # 24시간
        self.replay_cache = LRUCache(max_size=2000, default_ttl=3600)  # 1시간
        self.daterange_cache = LRUCache(max_size=500, default_ttl=86400)  # 24시간
        self.cleanup_thread: Optional[CacheCleanupThread] = None  # 정리 스레드

    def start_cleanup_thread(self, cleanup_interval: int = 60):
        """
        백그라운드 캐시 정리 스레드 시작

        매개변수:
        - cleanup_interval: 정리 주기(초)
        """
        # 스레드가 없거나 이미 종료된 경우 새로 시작
        if self.cleanup_thread is None or not self.cleanup_thread.is_alive():
            self.cleanup_thread = CacheCleanupThread(
                self.replay_cache,  # replay_cache만 자동 정리 (가장 자주 변경되므로)
                cleanup_interval=cleanup_interval
            )
            self.cleanup_thread.start()  # 스레드 시작
            logger.info("캐시 정리 스레드가 시작되었습니다")

    def stop_cleanup_thread(self):
        """
        백그라운드 캐시 정리 스레드 종료
        """
        if self.cleanup_thread and self.cleanup_thread.is_alive():
            self.cleanup_thread.stop()  # 스레드에 종료 신호 전송
            logger.info("캐시 정리 스레드가 종료되었습니다")

    def get_metadata(self, key: str) -> Optional[Any]:
        """메타데이터 캐시에서 데이터 가져오기"""
        return self.metadata_cache.get(key)

    def set_metadata(self, key: str, value: Any) -> None:
        """메타데이터 캐시에 데이터 저장하기"""
        self.metadata_cache.set(key, value)

    def get_replay(self, key: str, ttl_seconds: Optional[int] = None) -> Optional[Any]:
        """재생 데이터 캐시에서 데이터 가져오기 (TTL 재정의 가능)"""
        return self.replay_cache.get(key, ttl_seconds=ttl_seconds)

    def set_replay(self, key: str, value: Any, is_today: bool = False) -> None:
        """
        재생 데이터 캐시에 데이터 저장하기

        매개변수:
        - is_today: 오늘 데이터인지 여부
          - True: 5분마다 갱신 (TTL_REPLAY_TODAY = 300초)
          - False: 7일 동안 유지 (TTL_REPLAY_PAST = 604800초)

        왜 다르게?
        - 오늘 데이터: 계속 업데이트되므로 짧은 TTL
        - 과거 데이터: 변경되지 않으므로 긴 TTL
        """
        ttl = TTL_REPLAY_TODAY if is_today else TTL_REPLAY_PAST
        self.replay_cache.set(key, value, ttl=ttl)

    def get_daterange(self, key: str) -> Optional[Any]:
        """날짜 범위 캐시에서 데이터 가져오기"""
        return self.daterange_cache.get(key)

    def set_daterange(self, key: str, value: Any) -> None:
        """날짜 범위 캐시에 데이터 저장하기"""
        self.daterange_cache.set(key, value)

    def cleanup_all_expired(self) -> int:
        """
        모든 캐시(metadata, replay, daterange)의 만료된 항목 정리

        반환값:
        - 전체 삭제된 항목 수
        """
        count = 0
        count += self.metadata_cache.cleanup_expired()
        count += self.replay_cache.cleanup_expired()
        count += self.daterange_cache.cleanup_expired()
        return count

    def get_all_stats(self) -> Dict[str, Any]:
        """
        모든 캐시의 통합 통계 조회

        반환값:
        - timestamp: 조회 시각
        - summary: 전체 요약 (총 항목 수, 전체 히트율)
        - metadata/replay/daterange: 각 캐시별 상세 통계
        """
        # 각 캐시의 통계 수집
        metadata_stats = self.metadata_cache.get_stats()
        replay_stats = self.replay_cache.get_stats()
        daterange_stats = self.daterange_cache.get_stats()

        # 전체 통계 계산
        total_size = metadata_stats["size"] + replay_stats["size"] + daterange_stats["size"]
        total_hits = metadata_stats["hits"] + replay_stats["hits"] + daterange_stats["hits"]
        total_misses = metadata_stats["misses"] + replay_stats["misses"] + daterange_stats["misses"]
        total = total_hits + total_misses
        overall_hit_rate = total_hits / total * 100 if total > 0 else 0

        return {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total_entries": total_size,  # 전체 캐시 항목 수
                "overall_hit_rate": round(overall_hit_rate, 2)  # 전체 히트율
            },
            "metadata": metadata_stats,  # 메타데이터 캐시 통계
            "replay": replay_stats,  # 재생 데이터 캐시 통계
            "daterange": daterange_stats  # 날짜 범위 캐시 통계
        }

    def clear_all(self) -> None:
        """
        모든 캐시 초기화
        """
        self.metadata_cache.clear()
        self.replay_cache.clear()
        self.daterange_cache.clear()
        logger.info("모든 캐시가 삭제되었습니다")

    # --- 호환성을 위한 메서드 (기존 코드와의 호환) ---
    def get(self, key: str, ttl_seconds: int = None) -> Optional[Any]:
        """기존 코드 호환: metadata_cache.get() 호출"""
        return self.metadata_cache.get(key)

    def set(self, key: str, value: Any) -> None:
        """기존 코드 호환: metadata_cache.set() 호출"""
        self.metadata_cache.set(key, value)

    def clear(self) -> None:
        """기존 코드 호환: clear_all() 호출"""
        self.clear_all()


# === 전역 캐시 인스턴스 ===
# 애플리케이션 전체에서 사용할 단일 캐시 객체 생성
cache = ImprovedCache()
