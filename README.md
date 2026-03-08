<div align="center">

# S-DoT 서울 스마트시티 대시보드

**서울시 전역 1,200+ IoT 센서의 환경 데이터를 실시간 시각화하는 도시 모니터링 플랫폼**

[![Live Demo](https://img.shields.io/badge/Live_Demo-서울_스마트시티_대시보드-00d9ff?style=for-the-badge&logo=googlemaps&logoColor=white)](https://seoul-smartcity-dashboard-production.up.railway.app/)

<br>

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=flat-square&logo=d3dotjs&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)

<br>

<img src="docs/dashboard-preview.png" alt="대시보드 미리보기" width="720">

</div>

---

## 프로젝트 개요

| 항목 | 내용 |
|:----:|------|
| 프로젝트명 | 서울시 센서데이터(S-DoT) 기반 기후·환경 안전도시 구현 |
| 수행 기간 | 2026.01.30 ~ 2026.02.05 (7일) |
| 공간 범위 | 서울시 전역 25개 자치구 · 427개 행정동, 1,155개 센서 설치  |
| 내용 범위 | 대기질(PM2.5, PM10, O3), 기온, 습도, 풍향, 소음 등 17종 |
| 목적 | 환경 센서 빅데이터 통합 관리 및 분석을 통한 데이터 기반 정책 대안 발굴 |

| 센서 유형 | 정식 명칭 | 운영 | 센서 수 | 공간 해상도 |
|:--------:|:---------|:----:|:----------------:|:----------:|
| **S-DoT** | Smart Seoul Data of Things | 서울시 | **1,155** | **~500m** |
| RTD | 실시간 도시데이터 | 서울시 | 120 | ~2km |
| AWS | 자동기상관측 | 기상청 | 18 | ~10km |
| ASOS | 종관기상관측 | 기상청 | 1 | ~100km |

---

## 팀 구성

| 이름 | 역할 |
|:----:|------|
| 양우성 | 데이터 수집 · 수집 자동화 시스템 구축 · DB 설계 |
| [전문준](https://github.com/Technoetic/) | 데이터 수집/분석 · 전처리 · 시각화 |
| [박형민](https://github.com/musclepark) | 데이터 분석 · 시계열 분석 · 트렌드 파악 |
| 소혜경 | 기획 · 정책 제안 과제 발굴 · 보고서 작성 |
| 이채영 | 기획 · 분석결과 정책적 해석 · 타당성 검토 |

---

## 주요 기능

### 실시간 모니터링

| 기능 | 설명 |
|:----:|------|
| 🗺️ | 25개 자치구 **온도 히트맵** (영하/서늘/쾌적/더움/폭염) |
| 🔍 | 자치구 → 행정동 → 센서 **3단계 드릴다운** |
| 🌡️ | 온도, 습도, 소음, 풍향/풍속 **실시간 패널** |
| 📡 | ASOS / AWS / RTD / S-DoT **센서 레이어 토글** |
| ⚠️ | PM2.5 등 **이상치 감지 경보** 알림 바 |
| 🧭 | SVG **풍향 나침반** 애니메이션 |

### Replay (과거 데이터 재생)

| 기능 | 설명 |
|:----:|------|
| 📅 | 날짜 선택 + 시간 **슬라이더** (0~23시) |
| ▶️ | 0.5x / 1x / 2x **자동 재생** |
| 🔎 | 데이터 없는 시간대 **±12시간 자동 탐색** |
| 💾 | 오늘: 5분 / 과거: 7일 **TTL 캐시** |

### API 서버 성능

| 기능 | 설명 |
|:----:|------|
| 🗜️ | GZip 압축 (30~70% **전송량 절감**) |
| 🔄 | 서울시 API **CORS 프록시** |
| 📦 | LRU 캐시 **2,600 entries** |
| 🔌 | DB 연결 풀 **최대 10 동시 연결** |

---

## 주요 성과

| 지표 | 수치 |
|:----:|:----:|
| 센서 데이터 수집 | **1,200+** 개소 (서울시 전역 25개 자치구 S-DoT 센서 + ASOS/AWS/RTD 관측소) |
| 공간 커버리지 | **25**개 자치구 · **427**개 행정동 — 모든 자치구 내 행정동 단위까지 센서 배치 |
| 데이터 레코드 | **45,259,792** 건 (2020.04 ~ 2026.01, 약 5년 10개월간 1,155개 센서 × 시간당 수집) |

---

## 시스템 아키텍처

```mermaid
graph TB
    subgraph EXTERNAL["외부 데이터 소스"]
        SDOT_API["서울시 S-DoT Open API<br><i>IotVdata017</i>"]
        GEOJSON["GitHub Raw<br><i>구/동 GeoJSON</i>"]
    end

    subgraph SERVER["FastAPI 서버"]
        direction TB
        MAIN["replay_api.py<br><b>메인 서버</b>"]
        ROUTES["routes.py<br><i>8 API endpoints</i>"]
        CACHE_MOD["cache.py<br><i>LRU Cache</i>"]
        DB_MOD["database.py<br><i>Connection Pool</i>"]
    end

    subgraph DATABASE["MySQL"]
        direction LR
        T1[("sdot_nature_all<br><i>센서 측정 데이터</i>")]
        T2[("sdot_sensor_locations<br><i>센서 위치</i>")]
        T3[("weather_stations<br><i>기상 관측소</i>")]
        T4[("rtd_locations<br><i>RTD 관측 위치</i>")]
    end

    subgraph CLIENT["브라우저"]
        direction TB
        HTML["index.html"]
        D3["D3.js SVG Map"]
        JS["23 JS Modules"]
        CSS["13 CSS Modules"]
    end

    SDOT_API -- "CORS Proxy" --> ROUTES
    GEOJSON -- "fetch()" --> CLIENT
    CLIENT -- "REST API" --> ROUTES
    ROUTES --> CACHE_MOD
    ROUTES --> DB_MOD
    DB_MOD -- "PooledDB" --> DATABASE
    MAIN --> ROUTES

    style EXTERNAL fill:#1a1a2e,stroke:#e94560,color:#fff
    style SERVER fill:#1a1a2e,stroke:#0f3460,color:#fff
    style DATABASE fill:#1a1a2e,stroke:#00d9ff,color:#fff
    style CLIENT fill:#1a1a2e,stroke:#53d769,color:#fff
```

---

## 데이터베이스 관계도

```mermaid
erDiagram
    sdot_nature_all {
        int id PK "AUTO_INCREMENT"
        varchar 시리얼 FK "센서 식별자"
        varchar 자치구 "자치구명"
        varchar 행정동 "행정동명"
        float 온도_평균 "섭씨 온도"
        float 습도_평균 "상대 습도 %"
        datetime 등록일시 "측정 시각"
    }

    sdot_sensor_locations {
        int id PK "AUTO_INCREMENT"
        varchar 시리얼 UK "센서 고유 식별자"
        varchar 주소 "설치 주소"
        varchar 자치구 "자치구명"
        varchar 행정동 "행정동명"
        double 위도 "WGS84"
        double 경도 "WGS84"
        varchar 비고 "비고"
    }

    weather_stations {
        int id PK "관측소 ID"
        varchar name "관측소명"
        varchar type "asos 또는 aws"
        double lat "위도"
        double lng "경도"
    }

    rtd_locations {
        int id PK "AUTO_INCREMENT"
        varchar area_nm "장소명"
        varchar category "카테고리"
        double lat "위도"
        double lng "경도"
        timestamp created_at "생성일시"
    }

    sdot_nature_all }o--|| sdot_sensor_locations : "시리얼"
```

> **관계 설명**
> - `sdot_nature_all.시리얼` → `sdot_sensor_locations.시리얼` : 센서 측정 데이터가 센서 위치를 참조 (논리적 FK, N:1)
> - `weather_stations` / `rtd_locations` : 독립 참조 테이블 — API 레이어(`routes.py`)에서 `sdot_sensor_locations`와 합쳐 통합 센서 목록으로 제공
> - 물리적 FOREIGN KEY 제약은 미설정 (대량 INSERT 성능 우선)

---

## 데이터 파이프라인

```mermaid
flowchart LR
    subgraph LIVE["실시간 모드"]
        direction LR
        A["🌐 서울시<br>S-DoT API"]
        B["🔄 FastAPI<br>Proxy"]
        C["📊 Browser<br>Cache"]
        D["🗺️ D3.js 지도<br>갱신"]
        A -- "30초 주기" --> B --> C --> D
    end

    subgraph REPLAY["Replay 모드"]
        direction LR
        E[("🗄️ MySQL<br>sdot_nature_all")]
        F["⚡ FastAPI<br>+ LRU Cache"]
        G["⏪ Browser<br>시간축 재생"]
        E -- "SQL Query" --> F --> G
    end

    style LIVE fill:#0d1b2a,stroke:#00d9ff,color:#e0e0e0
    style REPLAY fill:#0d1b2a,stroke:#e94560,color:#e0e0e0
```

---

## API 명세

| Endpoint | 설명 | 파라미터 | 캐시 TTL |
|:---------|:-----|:---------|:---------|
| `GET /` | 대시보드 메인 페이지 | - | - |
| `GET /health` | 서버 상태 확인 | - | - |
| `GET /api/v1/sensors` | 센서 위치 목록 (S-DoT + ASOS + AWS + RTD) | - | `1시간` |
| `GET /api/v1/metadata` | 데이터 범위 메타데이터 | - | `24시간` |
| `GET /api/v1/replay` | 특정 날짜/시간의 센서 데이터 | `date`, `hour` | 오늘: `5분`, 과거: `7일` |
| `GET /api/v1/replay/date-range` | 데이터 존재 날짜 목록 | `start`, `end` | `24시간` |
| `GET /api/v1/sdot-proxy` | 서울시 Open API 프록시 | `district` | - |
| `GET /api/v1/cache/stats` | 캐시 통계 | - | - |
| `GET /api/v1/cache/clear` | 캐시 전체 삭제 | - | - |

---

## 프로젝트 구조

```
sdot_dashboard/
├── Dockerfile                    # python:3.11-slim 기반 컨테이너
├── requirements.txt              # Python 의존성
├── start.sh                      # 서버 시작 스크립트
│
├── FastAPI/
│   ├── replay_api.py             # 메인 서버 (CORS, GZip, 정적 파일 서빙)
│   ├── routes.py                 # API 엔드포인트 (8개 라우트)
│   ├── database.py               # DB 연결 풀 관리 (PooledDB)
│   ├── cache.py                  # LRU 캐시 (3개 독립 캐시 + 정리 스레드)
│   ├── config.py                 # 환경변수 로드 + 로깅
│   ├── requirements.txt          # FastAPI 전용 의존성
│   └── .env.example              # 환경변수 템플릿
│
└── Front/
    ├── index.html                # SPA 엔트리 (D3.js + 패널 UI)
    ├── css/                      # 13 stylesheets
    │   ├── style.css             #   통합 진입점
    │   ├── base.css              #   전역 스타일, 다크 테마
    │   ├── map.css               #   지도 SVG
    │   ├── navbar.css            #   상단 네비게이션
    │   ├── panels.css            #   공통 패널
    │   ├── panels-info.css       #   환경정보 패널
    │   ├── panels-replay.css     #   Replay 패널
    │   ├── markers.css           #   센서 마커
    │   ├── legend.css            #   지도 범례
    │   ├── alerts.css            #   경보 알림
    │   ├── animations.css        #   전환 애니메이션
    │   ├── responsive.css        #   반응형
    │   └── utilities.css         #   유틸리티
    └── js/                       # 23 modules
        ├── config.js             #   전역 설정/상태
        ├── init.js               #   초기화
        ├── api.js                #   API 통신
        ├── map.js                #   구 경계선 렌더링
        ├── dong-overlay.js       #   동 경계선 오버레이
        ├── dong-markers.js       #   동 센서 마커
        ├── dong-zoom.js          #   동 확대/축소
        ├── view.js               #   뷰 상태 관리
        ├── sensor-layer.js       #   센서 레이어 토글
        ├── sensor-markers.js     #   센서 마커 생성
        ├── replay.js             #   Replay 토글
        ├── replay-mode.js        #   Replay 진입/해제
        ├── replay-data.js        #   Replay 데이터 처리
        ├── replay-ui.js          #   Replay UI
        ├── anomaly.js            #   이상치 감지
        ├── wind.js               #   풍향 나침반
        ├── location.js           #   지역 진입 연출
        ├── ui.js                 #   공통 UI
        ├── ui-info.js            #   환경정보 패널
        ├── ui-tooltip.js         #   호버 툴팁
        ├── ui-traceback.js       #   발원지 역추적
        ├── http-status.js        #   HTTP 상태 모니터링
        └── utils.js              #   유틸 함수
```

---

## 실행 방법

### 1. 환경변수 설정

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

### 2. 데이터베이스 설정

```sql
CREATE DATABASE sdot_db DEFAULT CHARACTER SET utf8mb4;

-- 센서 측정 데이터
CREATE TABLE sdot_nature_all (
    id INT AUTO_INCREMENT PRIMARY KEY,
    시리얼 VARCHAR(50),
    자치구 VARCHAR(100),
    행정동 VARCHAR(100),
    온도_평균 FLOAT,
    습도_평균 FLOAT,
    등록일시 DATETIME,
    INDEX idx_date (등록일시),
    INDEX idx_serial (시리얼),
    INDEX idx_district (자치구)
);

-- 센서 위치 정보
CREATE TABLE sdot_sensor_locations (
    시리얼 VARCHAR(20) PRIMARY KEY,
    자치구 VARCHAR(20),
    행정동 VARCHAR(30),
    위도 DOUBLE,
    경도 DOUBLE
);

-- 기상 관측소 (ASOS/AWS)
CREATE TABLE weather_stations (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50),
    type VARCHAR(10),  -- 'ASOS' 또는 'AWS'
    lat DOUBLE,
    lng DOUBLE
);

-- RTD 실시간 도시데이터 관측 위치
CREATE TABLE rtd_locations (
    id VARCHAR(10) PRIMARY KEY,
    area_nm VARCHAR(50),
    category VARCHAR(30),
    lat DOUBLE,
    lng DOUBLE
);
```

### 3. 로컬 실행

```bash
pip install -r requirements.txt
cd FastAPI && python replay_api.py
# http://localhost:8000
```

### 4. Docker 실행

```bash
docker build -t sdot-dashboard .
docker run -p 8000:8000 --env-file FastAPI/.env sdot-dashboard
```

### 5. Railway 배포

이 프로젝트는 [Railway](https://railway.app/)에 호스팅되어 있습니다.

#### 배포 파이프라인

```mermaid
flowchart LR
    subgraph DEV["개발"]
        A["💻 로컬 개발<br><i>코드 수정</i>"]
    end

    subgraph GITHUB["GitHub"]
        B["📦 git push<br><i>master 브랜치</i>"]
    end

    subgraph RAILWAY["Railway"]
        direction TB
        C["🔍 Dockerfile 감지<br><i>자동 빌드 트리거</i>"]
        D["🐳 Docker 빌드<br><i>python:3.11-slim</i>"]
        E["⚙️ 환경변수 주입<br><i>DB · API Key · CORS</i>"]
        F["🚀 배포 완료<br><i>.up.railway.app</i>"]
        C --> D --> E --> F
    end

    A -- "git push" --> B
    B -- "Webhook" --> C

    style DEV fill:#1a1a2e,stroke:#53d769,color:#fff
    style GITHUB fill:#1a1a2e,stroke:#e94560,color:#fff
    style RAILWAY fill:#1a1a2e,stroke:#00d9ff,color:#fff
```

#### Railway 서비스 구성

```mermaid
graph TB
    subgraph RAILWAY_PROJECT["Railway 프로젝트"]
        direction TB
        WEB["🌐 Web Service<br><b>FastAPI 서버</b><br><i>Dockerfile 기반</i><br>PORT 자동 할당"]
        DB_EXT["🗄️ MySQL-oTZw<br><i>Railway MySQL</i>"]
    end

    subgraph ENV_VARS["환경변수 (Variables 탭)"]
        direction LR
        V1["DB_HOST<br>DB_PORT<br>DB_USER<br>DB_PASSWORD<br>DB_NAME"]
        V2["SDOT_API_KEY"]
        V3["CORS_ORIGINS"]
    end

    USER["👤 사용자"] -- "https://...up.railway.app" --> WEB
    ENV_VARS -. "주입" .-> WEB
    WEB -- "PyMySQL" --> DB_EXT

    style RAILWAY_PROJECT fill:#0d1b2a,stroke:#00d9ff,color:#e0e0e0
    style ENV_VARS fill:#0d1b2a,stroke:#e94560,color:#e0e0e0
```

#### 배포 단계

**1) GitHub 연결**

Railway 대시보드에서 **New Project → Deploy from GitHub repo** 를 선택하고 이 저장소를 연결합니다.

**2) 환경변수 설정**

Railway 프로젝트의 **Variables** 탭에서 다음 환경변수를 추가합니다:

| 변수 | 설명 |
|:-----|:-----|
| `DB_HOST` | MySQL 호스트 (Railway MySQL 사용 시 자동 제공) |
| `DB_PORT` | MySQL 포트 |
| `DB_USER` | MySQL 사용자 |
| `DB_PASSWORD` | MySQL 비밀번호 |
| `DB_NAME` | `railway` (Railway MySQL 기본값) |
| `SDOT_API_KEY` | 서울시 Open API 인증키 |
| `CORS_ORIGINS` | 허용 Origin (예: `https://your-app.up.railway.app`) |

**3) 빌드 & 배포**

Railway는 Dockerfile을 자동 감지하여 빌드합니다. 별도의 빌드 설정 없이 `master` 브랜치에 push하면 자동 배포됩니다.

- **빌드**: `Dockerfile` 기반 (python:3.11-slim)
- **포트**: Railway가 `PORT` 환경변수를 자동 주입하며, FastAPI 서버가 해당 포트에서 리슨
- **배포 URL**: `https://<project-name>.up.railway.app/`

**4) MySQL 추가**

Railway 내부에서 MySQL을 사용하려면:

1. 프로젝트에서 **+ New** → **Database** → **MySQL** 추가
2. MySQL 서비스의 연결 정보가 환경변수로 자동 주입됨
3. `DB_HOST`, `DB_PORT` 등을 Railway 제공 변수(`${{MySQL.MYSQL_HOST}}` 등)로 참조

> **참고**: 이 프로젝트는 Railway 내부 MySQL을 사용합니다. 위 단계대로 MySQL 서비스를 추가하고 환경변수를 연결하세요.
