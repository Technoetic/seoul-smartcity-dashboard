# S-DoT 서울 스마트시티 대시보드

> 서울시 전역 1,200+ IoT 센서의 환경 데이터를 D3.js 인터랙티브 지도 위에 실시간 시각화하고, 과거 시점의 데이터를 시간축으로 재생할 수 있는 도시 환경 모니터링 대시보드

<div align="center">

**[Live Demo](https://seoul-smartcity-dashboard.onrender.com/)**

</div>

---

## 시스템 구성도

```
┌─ Browser ──────────────────────────────────────────────────────────┐
│                                                                     │
│  index.html ── D3.js (SVG 지도 렌더링)                              │
│       │                                                             │
│  ┌────┴────────────────────────────────────────────────┐            │
│  │  config.js    GeoJSON URL, 자치구 코드, 전역 상태     │            │
│  │  api.js       서울시 Open API 프록시 호출             │            │
│  │  map.js       구 경계선 SVG 렌더링 + 온도 색상 매핑    │            │
│  │  dong-*.js    동 단위 확대/오버레이/마커               │            │
│  │  sensor-*.js  ASOS/AWS/RTD/S-DoT 마커 레이어          │            │
│  │  replay-*.js  과거 데이터 시간축 재생 UI/로직           │            │
│  │  anomaly.js   이상치 감지 + 경보 알림                  │            │
│  │  wind.js      풍향 나침반 SVG 애니메이션               │            │
│  └────┬────────────────────────────────────────────────┘            │
│       │ fetch()                                                     │
└───────┼─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ FastAPI (Python) ──────────────────────────────────────────────────┐
│                                                                      │
│  replay_api.py ── 메인 서버 (정적 파일 서빙 + API 라우팅)              │
│       │                                                              │
│  ┌────┴──────────────────────────────────────────────┐               │
│  │  routes.py    /api/v1/sensors       센서 위치 조회   │               │
│  │               /api/v1/replay        시간대별 데이터   │               │
│  │               /api/v1/metadata      데이터 범위 정보  │               │
│  │               /api/v1/sdot-proxy    서울시 API 프록시 │               │
│  │               /api/v1/cache/*       캐시 관리         │               │
│  │  database.py  PooledDB 연결 풀 (pymysql)             │               │
│  │  cache.py     LRU 캐시 (TTL: 오늘 5분 / 과거 7일)    │               │
│  │  config.py    환경변수 로드 + 로깅                    │               │
│  └───────────────────────────────────────────────────┘               │
│       │                                                              │
└───────┼──────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ MySQL ─────────────────────────────────────────────────────────────┐
│  sdot_nature_all        센서 측정 데이터 (온도, 습도, 등록일시)         │
│  sdot_sensor_locations  센서 설치 위치 (위도, 경도, 자치구, 행정동)      │
│  weather_stations       기상 관측소 위치 (ASOS, AWS)                   │
│  rtd_locations          실시간 도시데이터 관측 지점                      │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ External API ──────────────────────────────────────────────────────┐
│  서울시 S-DoT Open API (IotVdata017) ── 실시간 센서 데이터 (30초 주기) │
│  GitHub Raw (southkorea/seoul-maps) ── 구/동 GeoJSON 경계선 데이터    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 주요 기능

### 실시간 모니터링

- 서울시 25개 자치구를 온도 기반 5단계 색상(영하 ~ 폭염)으로 표현하는 D3.js SVG 지도
- 자치구 클릭 시 행정동 단위로 드릴다운, 동 클릭 시 해당 센서까지 확대
- 실시간 환경정보 패널: 온도, 습도, 소음, 풍향(SVG 나침반), 풍속
- 센서 레이어 토글: ASOS (종관기상관측), AWS (자동기상관측), RTD (실시간 도시데이터), S-DoT 개별 ON/OFF
- 이상치 감지 경보 알림 바 (PM2.5 등 환경 이상 발생 시 흐르는 텍스트 알림)

### Replay (과거 데이터 재생)

- 날짜/시간 슬라이더로 과거 센서 데이터를 시간축 탐색
- 자동 재생: 0.5x / 1x / 2x 속도로 시간대별 자동 전환
- 데이터 없는 시간대는 ±12시간 범위에서 가장 가까운 시간대 자동 탐색
- DB 캐시: 오늘 데이터 5분, 과거 데이터 7일 TTL

### API 서버

- GZip 압축 미들웨어 (1KB 이상 응답 자동 압축, 30~70% 전송량 절감)
- 서울시 Open API CORS 프록시 (브라우저 직접 호출 불가 → 서버 경유)
- LRU 캐시 (metadata 100개/24h, replay 2,000개/1h, daterange 500개/24h)
- 연결 풀링 (PooledDB, 최대 10개 동시 연결)

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| Frontend | Vanilla JS, D3.js v7 (SVG 지도 렌더링), CSS Grid/Flexbox |
| Backend | Python 3.11, FastAPI, Uvicorn (ASGI) |
| Database | MySQL (PyMySQL + DBUtils 연결 풀) |
| 캐시 | In-memory LRU Cache (TTL + 백그라운드 정리 스레드) |
| 배포 | Docker, Render |
| 외부 API | 서울시 S-DoT Open API |

---

## 프로젝트 구조

```
sdot_dashboard/
├── Dockerfile                    # 컨테이너 빌드 (python:3.11-slim)
├── requirements.txt              # Python 의존성
├── start.sh                      # 서버 시작 스크립트
│
├── FastAPI/
│   ├── replay_api.py             # 메인 서버 (CORS, GZip, 정적 파일 서빙)
│   ├── routes.py                 # API 엔드포인트 (6개 라우트)
│   ├── database.py               # DB 연결 풀 관리
│   ├── cache.py                  # LRU 캐시 (3개 독립 캐시)
│   ├── config.py                 # 환경변수 로드, 로깅 설정
│   ├── requirements.txt          # FastAPI 전용 의존성
│   └── .env.example              # 환경변수 템플릿
│
└── Front/
    ├── index.html                # SPA 엔트리 (D3.js + 패널 UI)
    ├── css/
    │   ├── style.css             # CSS 통합 진입점 (@import)
    │   ├── base.css              # 전역 스타일, 다크 테마
    │   ├── map.css               # 지도 SVG 스타일
    │   ├── navbar.css            # 상단 네비게이션 바
    │   ├── panels.css            # 공통 패널 박스
    │   ├── panels-info.css       # 실시간 환경정보 패널
    │   ├── panels-replay.css     # Replay 컨트롤 패널
    │   ├── markers.css           # 센서 마커 스타일
    │   ├── legend.css            # 지도 범례
    │   ├── alerts.css            # 경보 알림 바
    │   ├── animations.css        # 전환 애니메이션
    │   ├── responsive.css        # 반응형 레이아웃
    │   └── utilities.css         # 유틸리티 클래스
    └── js/
        ├── config.js             # 전역 설정/상태 (API URL, 구 코드 매핑)
        ├── init.js               # 초기화 (센서 로드 → GeoJSON → 렌더링)
        ├── api.js                # API 통신 (실시간 데이터 fetch + 파싱)
        ├── map.js                # D3.js 구 경계선 SVG 렌더링
        ├── dong-overlay.js       # 동 단위 경계선 오버레이
        ├── dong-markers.js       # 동 내 센서 마커 배치
        ├── dong-zoom.js          # 동 확대/축소 전환
        ├── view.js               # 뷰 상태 관리 (city → dong → dongZoom)
        ├── sensor-layer.js       # 센서 레이어 토글 (ASOS/AWS/RTD/S-DoT)
        ├── sensor-markers.js     # 센서 마커 SVG 생성
        ├── replay.js             # Replay 모드 토글/상태 관리
        ├── replay-mode.js        # Replay 모드 진입/해제 로직
        ├── replay-data.js        # Replay API 호출 + 데이터 처리
        ├── replay-ui.js          # Replay 슬라이더/버튼 UI
        ├── anomaly.js            # 이상치 감지 알고리즘
        ├── wind.js               # 풍향 나침반 SVG 회전
        ├── location.js           # 지역 진입 연출 애니메이션
        ├── ui.js                 # 공통 UI 유틸리티
        ├── ui-info.js            # 환경정보 패널 업데이트
        ├── ui-tooltip.js         # 마우스 호버 툴팁
        ├── ui-traceback.js       # 발원지 역추적 UI
        ├── http-status.js        # HTTP 응답 상태 모니터링
        └── utils.js              # 유틸 함수 (debounce, 색상 계산 등)
```

---

## API 명세

| Method | Endpoint | 설명 | 캐시 TTL |
|--------|----------|------|----------|
| `GET` | `/` | 대시보드 메인 페이지 (index.html) | - |
| `GET` | `/health` | 서버 상태 확인 | - |
| `GET` | `/api/v1/sensors` | 센서 위치 목록 (S-DoT + ASOS + AWS + RTD) | 1시간 |
| `GET` | `/api/v1/metadata` | 데이터 범위 메타데이터 (최소/최대 날짜, 센서 수) | 24시간 |
| `GET` | `/api/v1/replay?date=YYYY-MM-DD&hour=0-23` | 특정 날짜/시간의 센서 데이터 | 오늘: 5분, 과거: 7일 |
| `GET` | `/api/v1/replay/date-range?start=...&end=...` | 날짜 범위 내 데이터 존재 날짜 목록 | 24시간 |
| `GET` | `/api/v1/sdot-proxy?district=...` | 서울시 Open API 프록시 (CORS 우회) | - |
| `GET` | `/api/v1/cache/stats` | 캐시 통계 (히트율, 크기) | - |
| `GET` | `/api/v1/cache/clear` | 캐시 전체 삭제 | - |

---

## 실행 방법

### 환경변수 설정

```bash
cp FastAPI/.env.example FastAPI/.env
```

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sdot_db
SDOT_API_KEY=your_seoul_api_key
```

### 로컬 실행

```bash
pip install -r requirements.txt
cd FastAPI && python replay_api.py
# http://localhost:8000
```

### Docker 실행

```bash
docker build -t sdot-dashboard .
docker run -p 8000:8000 --env-file FastAPI/.env sdot-dashboard
```

---

## 데이터 파이프라인

```
서울시 S-DoT Open API ──(30초 주기 fetch)──▶ Browser
                                              │
                                              ▼
                                     apiDataCache (메모리)
                                              │
                                              ▼
                                     D3.js SVG 지도 색상 업데이트
                                     + 환경정보 패널 갱신
                                     + 경보 알림 판정


MySQL sdot_nature_all ──(Replay API)──▶ FastAPI ──▶ Browser
                                          │
                                     LRU Cache
                                     (2,000 entries, TTL 기반)
```

- **실시간 모드**: 브라우저가 서울시 API를 FastAPI 프록시 경유로 30초마다 호출
- **Replay 모드**: 사용자가 날짜/시간 선택 시 FastAPI가 MySQL에서 조회 후 캐시

---

## 라이선스

MIT License
