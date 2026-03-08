// ===== init.js =====
// 역할: 프로그램이 시작될 때 모든 초기화 작업을 수행하는 파일
// 연결: window.addEventListener('load', init)로 페이지 로드 시 자동 실행됨
// 기능: 센서 데이터 로딩, 지도 데이터 로딩, 이벤트 핸들러 등록, 주기적 업데이트 설정

// init.js - 초기화 및 GeoJSON 로딩

// DB에서 센서 위치 데이터 로딩
// FastAPI 서버의 /api/v1/sensors 엔드포인트에서 센서 좌표와 관측소 정보를 가져옵니다.
async function loadSensorDataFromDB() {
    try {
        const response = await fetch(`${REPLAY_API_BASE}/api/v1/sensors`);
        const result = await response.json();
        if (result.sensorData) {
            sensorData = result.sensorData;  // 전역 변수에 저장
            // sensorLocationMap 빌드 (센서ID로 빠르게 좌표를 찾기 위한 맵)
            sensorLocationMap = {};
            Object.keys(sensorData).forEach(district => {
                Object.keys(sensorData[district]).forEach(dong => {
                    sensorData[district][dong].forEach(s => {
                        sensorLocationMap[s.id] = { lat: s.lat, lng: s.lng };
                    });
                });
            });
            console.log(`센서 데이터 DB 로드 완료: ${result.count}개`);
        }
        // ASOS/AWS 관측소 데이터도 함께 로드
        if (result.asosStations) asosStations = result.asosStations;
        if (result.awsStations) awsStations = result.awsStations;
        if (result.rtdStations) rtdStations = result.rtdStations;
    } catch (error) {
        console.error('센서 데이터 DB 로드 실패:', error);
    }
}

// 초기화 - 프로그램의 메인 함수
// 이 함수가 실행되면 대시보드가 완전히 초기화되고 실행됩니다.
async function init() {
    const loadingEl = document.querySelector('#seoulMap .loading span');

    // 1단계: DB에서 센서 위치 데이터 로딩
    if (loadingEl) loadingEl.textContent = '센서 위치 데이터 로딩 중...';
    try {
        await loadSensorDataFromDB();
    } catch (e) {
        console.error('센서 위치 데이터 로딩 실패:', e);
    }

    // 2단계: Replay 날짜 입력 초기화 (과거 데이터 재생 기능)
    initReplayDateInput();

    // 3단계: 이벤트 핸들러 초기화 (버튼 클릭 등)
    initEventHandlers();

    // 4단계: 구별 데이터 구조 초기화
    initDistrictData();

    // 5단계: GeoJSON 로드 (지도 그리기 위한 지리 데이터)
    if (loadingEl) loadingEl.textContent = '지도 데이터 로딩 중...';
    try {
        await loadGeoJSON();      // 구 경계선 데이터
    } catch (e) {
        console.error('구 GeoJSON 로딩 실패:', e);
    }
    try {
        await loadDongGeoJSON();  // 동 경계선 데이터
    } catch (e) {
        console.error('동 GeoJSON 로딩 실패:', e);
    }

    // 6단계: 실시간 API 데이터 로드
    if (loadingEl) loadingEl.textContent = '실시간 센서 데이터 로딩 중...';
    try {
        await updateFromApi();
    } catch (e) {
        console.error('실시간 API 데이터 로딩 실패:', e);
    }

    // 7단계: 지도 렌더링 (API 데이터 로드 후, GeoJSON 필수)
    if (loadingEl) loadingEl.textContent = '지도 렌더링 중...';
    if (geoData) {
        renderMap();
    } else {
        console.error('GeoJSON 데이터가 없어 지도를 렌더링할 수 없습니다');
        if (loadingEl) loadingEl.textContent = '지도 로드 실패. 새로고침 해주세요.';
    }

    // 8단계: 초기 풍향/풍속 정보 표시
    updateWindIndicator();

    // 9단계: 시계 표시 시작 (1초마다 업데이트)
    updateTime();
    const intervalIds = [];
    intervalIds.push(setInterval(updateTime, 1000));

    // 10단계: 초기 HTTP 상태 확인
    checkHttpStatus();

    // 11단계: 주기적 업데이트 설정
    // 실시간 API 데이터 갱신 (30초마다) + 지도 색상 업데이트
    intervalIds.push(setInterval(async () => {
        await updateFromApi();        // API에서 데이터 가져오기
        updateMapColorsFromApi();     // 지도 색상 업데이트
    }, 30000));

    // 경보 업데이트 (10초마다)
    updateAlertFromApi();
    intervalIds.push(setInterval(updateAlertFromApi, 10000));

    // 풍향/풍속 표시 업데이트 (5초마다)
    intervalIds.push(setInterval(updateWindIndicator, 5000));

    // 페이지 종료 시 타이머 정리 (메모리 누수 방지)
    window.addEventListener('beforeunload', () => {
        intervalIds.forEach(id => clearInterval(id));
    });
}

// GeoJSON 로드 (렌더링 없이 데이터만 로드)
// GeoJSON은 지도 경계선을 그리기 위한 지리 정보 포맷입니다.
async function loadGeoJSON() {
    try {
        const response = await fetch(GEOJSON_URL);
        geoData = await response.json();  // 구 경계선 데이터 저장
        console.log('GeoJSON 로드 완료:', geoData.features.length, '개 구');
    } catch (error) {
        console.error('GeoJSON 로드 실패:', error);
        document.getElementById('seoulMap').innerHTML = '<div class="loading"><span>지도 로드 실패. 새로고침 해주세요.</span></div>';
    }
}

// 동 경계선 GeoJSON 로드
async function loadDongGeoJSON() {
    try {
        const response = await fetch(DONG_GEOJSON_URL);
        dongGeoData = await response.json();  // 동 경계선 데이터 저장
    } catch (error) {
        console.error('동 GeoJSON 로드 실패:', error);
    }
}

// 구별 데이터 구조 초기화 (실시간 데이터로 채워짐)
// 서울시 25개 자치구의 데이터 저장 공간을 미리 만들어둡니다.
function initDistrictData() {
    const names = Object.keys(districtCodes);  // 25개 구 이름 가져오기
    names.forEach(name => {
        districtData[name] = {
            temp: null,         // 온도 (나중에 API 데이터로 채워짐)
            humidity: null,     // 습도
            noise: null,        // 소음
            sensorCount: 0,     // 센서 개수
            lastUpdate: null    // 마지막 업데이트 시간
        };
    });
}

// 동별 데이터 초기화 (API 데이터 기반)
function initDongDataForDistrict(districtName) {
    if (!dongGeoData) return;
    const code = districtCodes[districtName];
    if (!code) return;

    dongGeoData.features.forEach(f => {
        if (f.properties.code && f.properties.code.startsWith(code)) {
            const dongName = f.properties.name;
            const key = `${districtName}_${dongName}`;
            if (!dongData[key]) {
                dongData[key] = {
                    temp: null,
                    humidity: null,
                    noise: null,
                    sensorCount: 0
                };
            }
        }
    });

    // API 캐시에서 해당 구의 동별 데이터 채우기
    if (apiDataCache.bySensor) {
        Object.values(apiDataCache.bySensor).forEach(sensor => {
            if (sensor.district === districtName) {
                // 동 이름 매칭 시도
                const dongKeys = Object.keys(dongData).filter(k => k.startsWith(districtName + '_'));
                dongKeys.forEach(key => {
                    const dongName = key.replace(districtName + '_', '');
                    // API 동 이름과 GeoJSON 동 이름 매칭
                    // 동 이름 매칭: 숫자/가/동 접미사 제거 후 비교
                    const dongBase = dongName.replace(/[0-9()·동가]/g, '');
                    const sensorDongBase = sensor.dong ? sensor.dong.replace(/[0-9()·동가\-]/g, '').replace(/(il|i|sam|sa|o|yuk|chil|pal|gu|sip)/g, '') : '';
                    if (sensor.dong && (
                        sensor.dong.includes(dongName) ||
                        dongName.includes(sensor.dong.replace(/[0-9가]*/g, '')) ||
                        dongBase === sensorDongBase ||
                        (dongBase.length >= 2 && sensorDongBase.includes(dongBase)) ||
                        (sensorDongBase.length >= 2 && dongBase.includes(sensorDongBase))
                    )) {
                        const m = sensor.measurements;
                        if (m.temp !== null) {
                            if (dongData[key].temp === null) {
                                dongData[key].temp = m.temp;
                                dongData[key].sensorCount = 1;
                            } else {
                                dongData[key].temp = (dongData[key].temp * dongData[key].sensorCount + m.temp) / (dongData[key].sensorCount + 1);
                                dongData[key].sensorCount++;
                            }
                        }
                        if (m.humidity !== null) dongData[key].humidity = m.humidity;
                        if (m.noise !== null) dongData[key].noise = m.noise;
                    }
                });
            }
        });
    }
}

// 이벤트 핸들러 바인딩 (인라인 이벤트 대체)
// HTML의 버튼들에 클릭 이벤트를 연결합니다.
function initEventHandlers() {
    // 센서 토글 버튼 (ASOS, AWS, S-DoT 센서를 지도에 표시/숨김)
    const toggleAsos = document.getElementById('toggleAsos');
    const toggleAws = document.getElementById('toggleAws');
    const toggleRtd = document.getElementById('toggleRtd');
    const toggleSdot = document.getElementById('toggleSdot');
    if (toggleAsos) toggleAsos.addEventListener('click', () => toggleSensorLayer('asos'));
    if (toggleAws) toggleAws.addEventListener('click', () => toggleSensorLayer('aws'));
    if (toggleRtd) toggleRtd.addEventListener('click', () => toggleSensorLayer('rtd'));
    if (toggleSdot) toggleSdot.addEventListener('click', () => toggleSensorLayer('sdot'));

    // 리플레이 토글 (과거 데이터 재생 모드 On/Off)
    const replayToggle = document.getElementById('replayToggle');
    if (replayToggle) replayToggle.addEventListener('click', toggleReplayMode);

    // 리플레이 날짜 선택
    const replayDate = document.getElementById('replayDate');
    if (replayDate) replayDate.addEventListener('change', onReplayDateChange);

    // 리플레이 슬라이더 (시간대 선택) - debounce로 과도한 API 호출 방지
    const replaySlider = document.getElementById('replaySlider');
    const debouncedSliderChange = debounce((value) => onReplaySliderChange(value), 300);
    if (replaySlider) replaySlider.addEventListener('input', (e) => debouncedSliderChange(e.target.value));

    // 리플레이 컨트롤 버튼 (이전/재생/다음)
    const prevBtn = document.getElementById('replayPrevBtn');
    const playBtn = document.getElementById('replayPlayBtn');
    const nextBtn = document.getElementById('replayNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', replayPrevHour);
    if (playBtn) playBtn.addEventListener('click', toggleReplayPlay);
    if (nextBtn) nextBtn.addEventListener('click', replayNextHour);

    // 뒤로가기 버튼 (동 → 구 → 서울시 전체)
    const backButton = document.getElementById('backButton');
    if (backButton) backButton.addEventListener('click', zoomOut);
}

// 시작 - DOM 완전히 로드된 후 실행
// 페이지 로딩이 완료되면 자동으로 init() 함수를 실행합니다.
window.addEventListener('load', init);
