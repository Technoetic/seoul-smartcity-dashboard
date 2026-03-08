// ===== config.js =====
// 역할: 프로젝트 전체에서 사용하는 설정값과 전역 변수를 정의하는 파일
// 연결: api.js, init.js, map.js, view.js 등 모든 파일에서 이 파일의 변수를 참조함
// 기능: API 주소, 지도 데이터 URL, 자치구 매핑 정보, 센서 데이터 캐시 등을 관리

// config.js - API 설정 및 전역 변수

        // 서울시 행정구역 GeoJSON 데이터 URL (지도를 그리기 위한 구 경계선 데이터)
        const GEOJSON_URL = 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json';
        // 서울시 동 단위 GeoJSON 데이터 URL (구를 클릭했을 때 보여줄 동 경계선 데이터)
        const DONG_GEOJSON_URL = 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_submunicipalities_geo_simple.json';

        // S-DoT Open API 설정
        // API 키는 보안을 위해 백엔드 프록시에서 관리 (FastAPI/.env 파일 참고)
        const SDOT_SERVICE = 'IotVdata017'; // API 서비스명 (응답 파싱용)

        // 자치구 한글-영문 매핑 (API용)
        // API에서 영문으로 자치구 이름을 받을 때 한글로 변환하기 위한 매핑 테이블
        const districtNameMap = {
            "종로구": "Jongno-gu", "중구": "Jung-gu", "용산구": "Yongsan-gu",
            "성동구": "Seongdong-gu", "광진구": "Gwangjin-gu", "동대문구": "Dongdaemun-gu",
            "중랑구": "Jungnang-gu", "성북구": "Seongbuk-gu", "강북구": "Gangbuk-gu",
            "도봉구": "Dobong-gu", "노원구": "Nowon-gu", "은평구": "Eunpyeong-gu",
            "서대문구": "Seodaemun-gu", "마포구": "Mapo-gu", "양천구": "Yangcheon-gu",
            "강서구": "Gangseo-gu", "구로구": "Guro-gu", "금천구": "Geumcheon-gu",
            "영등포구": "Yeongdeungpo-gu", "동작구": "Dongjak-gu", "관악구": "Gwanak-gu",
            "서초구": "Seocho-gu", "강남구": "Gangnam-gu", "송파구": "Songpa-gu",
            "강동구": "Gangdong-gu"
        };

        // 영문-한글 역매핑 (영문 구 이름을 한글로 변환하기 위해 자동 생성)
        const districtNameMapReverse = {};
        Object.entries(districtNameMap).forEach(([ko, en]) => {
            districtNameMapReverse[en] = ko; // 예: "Jongno-gu" → "종로구"
        });

        // ASOS/AWS 관측소 데이터 (DB에서 동적 로딩)
        // ASOS: 종관기상관측장비 (공항 등 주요 지점의 기상 관측소)
        // AWS: 자동기상관측장비 (전국에 분포된 자동 기상 관측소)
        let asosStations = []; // ASOS 관측소 목록 (init.js에서 DB로부터 로드됨)
        let awsStations = [];  // AWS 관측소 목록 (init.js에서 DB로부터 로드됨)
        let rtdStations = [];  // RTD 실시간 도시데이터 관측 지점 (init.js에서 DB로부터 로드됨)

        // 센서 레이어 토글 상태 (화면에 센서를 표시할지 여부를 저장)
        let sensorLayerState = {
            sdot: false,  // S-DoT 센서 표시 여부
            asos: false,  // ASOS 관측소 표시 여부
            aws: false,   // AWS 관측소 표시 여부
            rtd: false    // RTD 실시간 도시데이터 표시 여부
        };

        // 실시간 API 데이터 캐시 (매번 API를 호출하지 않고 최근 데이터를 저장)
        let apiDataCache = {
            lastUpdate: null,    // 마지막 업데이트 시간
            data: [],            // 원본 API 응답 데이터
            byDistrict: {},      // 구별로 정리된 데이터
            bySensor: {}         // 센서ID별로 정리된 데이터
        };

        // Replay 모드 관련 변수 (과거 데이터를 재생하는 기능)
        let replayMode = {
            enabled: false,         // Replay 모드 활성화 여부
            date: null,             // 선택한 날짜
            hour: 12,               // 선택한 시간 (0~23)
            isPlaying: false,       // 자동 재생 중인지 여부
            playInterval: null,     // 자동 재생용 타이머
            cachedData: {},         // 날짜별 데이터 캐시
            cachedKeys: [],         // 캐시 키 목록
            processedCache: {},     // 가공된 데이터 캐시
            isLoading: false,       // 데이터 로딩 중인지 여부
            playSpeed: 1            // 재생 속도 (0.5, 1, 2)
        };

        // Replay API 설정 (MySQL sdot_nature_all 연동)
        // 과거 센서 데이터를 DB에서 불러오기 위한 FastAPI 서버 설정
        const REPLAY_API_BASE = `http://${location.hostname}:8000`; // 현재 호스트의 8000 포트 사용
        const replayApiConfig = {
            metadataLoaded: false,  // 메타데이터 로드 여부
            dateRange: {
                start: '2020-04-01',    // 데이터 시작일
                end: null               // 데이터 종료일 (동적으로 설정됨)
            },
            fetchTimeout: 10000,        // API 요청 타임아웃 (10초)
            currentController: null     // 현재 진행 중인 API 요청 컨트롤러
        };

        // 구 코드 매핑 (행정구역 코드 - 동 데이터를 필터링할 때 사용)
        // 앞 2자리(11)는 서울시, 뒤 2자리는 각 구의 고유 번호
        const districtCodes = {
            "종로구": "1101", "중구": "1102", "용산구": "1103", "성동구": "1104",
            "광진구": "1105", "동대문구": "1106", "중랑구": "1107", "성북구": "1108",
            "강북구": "1109", "도봉구": "1110", "노원구": "1111", "은평구": "1112",
            "서대문구": "1113", "마포구": "1114", "양천구": "1115", "강서구": "1116",
            "구로구": "1117", "금천구": "1118", "영등포구": "1119", "동작구": "1120",
            "관악구": "1121", "서초구": "1122", "강남구": "1123", "송파구": "1124",
            "강동구": "1125"
        };

        // 지도 관련 전역 변수
        let geoData = null;              // 구 경계선 GeoJSON 데이터
        let dongGeoData = null;          // 동 경계선 GeoJSON 데이터
        let districtData = {};           // 구별 집계 데이터 (온도, 습도 등)
        let dongData = {};               // 동별 집계 데이터
        let selectedDistrict = null;     // 현재 선택된 구 이름
        let selectedDong = null;         // 현재 선택된 동 이름
        let currentView = 'city';        // 현재 뷰 상태: 'city'(서울 전체), 'dong'(구 상세), 'dongZoom'(동 확대)
        let mapSvg, mapProjection, mapPath; // D3.js 지도 렌더링 관련 객체
        let currentZoom;                 // D3.js 줌 컨트롤러
        let currentDistrictScale = 1;    // 구 줌 레벨
        let currentDongScale = 1;        // 동 줌 레벨
        let pendingLocationSubtitle = null; // 지역 진입 시 표시할 자막
        let pendingDongNavigation = null;  // 구 줌인 후 이동할 동 이름

        // 센서 데이터 (DB에서 동적 로딩)
        let sensorData = {};             // 구-동-센서 계층 구조로 저장된 센서 정보
        let sensorLocationMap = {};      // 센서ID → 좌표 매핑 (빠른 검색용)

