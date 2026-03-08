// ===== api.js =====
// 역할: S-DoT API에서 실시간 센서 데이터를 가져와서 가공하는 파일
// 연결: config.js의 API 설정을 사용하고, init.js에서 호출됨
// 기능: API 호출, 데이터 정리(구별/센서별), 화면 업데이트 함수 제공

// api.js - API 데이터 처리

// S-DoT API에서 실시간 데이터 가져오기 (FastAPI 프록시 경유)
// 이 함수는 서울시 센서 데이터를 가져오는 핵심 함수입니다.
// districtKo: 특정 구만 조회하려면 구 이름 전달 (예: "강남구"), 전체 조회 시 null
async function fetchSdotApiData(districtKo = null, retries = 2) {
    // FastAPI 프록시 서버 URL 생성
    let url = `${REPLAY_API_BASE}/api/v1/sdot-proxy`;
    // 특정 구만 조회하는 경우 쿼리 파라미터 추가
    if (districtKo && districtNameMap[districtKo]) {
        url += `?district=${encodeURIComponent(districtNameMap[districtKo])}`;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        // AbortController로 타임아웃 관리 (15초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            console.log(`S-DoT API 프록시 호출 (시도 ${attempt + 1}/${retries + 1}):`, url);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // 결과 처리 (API 응답 구조에 따라 분기)
            if (result[SDOT_SERVICE] && result[SDOT_SERVICE].RESULT.CODE === 'INFO-000') {
                const rows = result[SDOT_SERVICE].row || [];
                console.log(`S-DoT API 데이터 수신: ${rows.length}건`);
                return rows;
            } else if (result.RESULT && result.RESULT.CODE === 'INFO-200') {
                console.warn('데이터 없음');
                return [];
            } else {
                const errMsg = result[SDOT_SERVICE]?.RESULT?.MESSAGE || result.RESULT?.MESSAGE || 'Unknown error';
                console.warn('S-DoT API 오류:', errMsg);
                return [];
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (attempt < retries) {
                // 재시도 전 대기 (지수 백오프: 1초, 2초)
                const delay = 1000 * (attempt + 1);
                console.warn(`S-DoT API 호출 실패 (시도 ${attempt + 1}), ${delay}ms 후 재시도:`, error.message);
                await new Promise(r => setTimeout(r, delay));
            } else {
                console.error('S-DoT API 호출 최종 실패:', error);
                return [];
            }
        }
    }
    return [];
}

// API 데이터를 구별/센서별로 정리
// 이 함수는 API에서 받은 센서 데이터를 우리가 사용하기 쉬운 형태로 가공합니다.
// rows: API에서 받은 센서 데이터 배열 (각 row는 센서 1개의 측정값)
function processApiData(rows) {
    const byDistrict = {};  // 구별 집계 결과를 저장할 객체
    const bySensor = {};    // 센서별 상세 데이터를 저장할 객체

    rows.forEach(row => {
        // API 응답에서 필요한 정보 추출
        const districtEn = row.CGG;  // 구 이름 (영문)
        const districtKo = row.CGG_KO || districtNameMapReverse[districtEn] || districtEn;  // 구 이름 (한글)
        const sensorId = row.SN;     // 센서 ID
        const dongName = row.DONG_KO || row.DONG;  // 동 이름

        // 구별 데이터 집계 (해당 구에 처음 접근하면 초기화)
        if (!byDistrict[districtKo]) {
            byDistrict[districtKo] = {
                sensors: [],      // 이 구에 속한 센서 ID 목록
                avgTemp: 0,       // 온도 합계 (나중에 개수로 나눠서 평균 구함)
                avgHum: 0,        // 습도 합계
                avgNoise: 0,      // 소음 합계
                tempCount: 0,     // 유효한 온도 측정값 개수
                humCount: 0,      // 유효한 습도 측정값 개수
                noiseCount: 0     // 유효한 소음 측정값 개수
            };
        }

        // 온도 평균 집계 (유효 범위 체크: -50°C ~ 60°C)
        const temp = parseFloat(row.AVG_TP);  // API에서 온도 필드 추출
        if (!isNaN(temp) && temp > -50 && temp < 60) {
            byDistrict[districtKo].avgTemp += temp;
            byDistrict[districtKo].tempCount++;
        }

        // 습도 평균 집계 (유효 범위 체크: 0% ~ 100%)
        const hum = parseFloat(row.AVG_HUM);
        if (!isNaN(hum) && hum >= 0 && hum <= 100) {
            byDistrict[districtKo].avgHum += hum;
            byDistrict[districtKo].humCount++;
        }

        // 소음 평균 집계 (유효 범위 체크: 0dB ~ 150dB)
        const noise = parseFloat(row.AVG_NIS);
        if (!isNaN(noise) && noise >= 0 && noise < 150) {
            byDistrict[districtKo].avgNoise += noise;
            byDistrict[districtKo].noiseCount++;
        }

        byDistrict[districtKo].sensors.push(sensorId);  // 센서 목록에 추가

        // 센서별 데이터 저장
        // 센서 좌표 우선순위: API 응답 > DB에서 로드한 좌표 (sensorLocationMap)
        const locFromApi = (row.LAT && row.LNG) ? { lat: parseFloat(row.LAT), lng: parseFloat(row.LNG) } : null;
        const locFromMap = sensorLocationMap[sensorId] || null;
        const sensorLoc = locFromApi || locFromMap;
        if (!sensorLoc) return; // 좌표 없는 센서는 지도에 표시할 수 없으므로 건너뜀

        // 센서별 상세 정보 저장 (API의 모든 측정값 포함)
        bySensor[sensorId] = {
            district: districtKo,       // 구 이름
            dong: dongName,             // 동 이름
            lat: sensorLoc.lat,         // 위도
            lng: sensorLoc.lng,         // 경도
            measurements: {
                // 온도 (평균, 최대, 최소)
                temp: parseFloat(row.AVG_TP) || null,
                tempMax: parseFloat(row.MAX_TP) || null,
                tempMin: parseFloat(row.MIN_TP) || null,
                // 습도
                humidity: parseFloat(row.AVG_HUM) || null,
                humMax: parseFloat(row.MAX_HUM) || null,
                humMin: parseFloat(row.MIN_HUM) || null,
                // 소음
                noise: parseFloat(row.AVG_NIS) || null,
                noiseMax: parseFloat(row.MAX_NIS) || null,
                noiseMin: parseFloat(row.MIN_NIS) || null,
                // 기타 환경 측정값
                light: parseFloat(row.AVG_INILLU) || null,      // 조도
                uv: parseFloat(row.AVG_UV) || null,             // 자외선
                windSpeed: parseFloat(row.AVG_WSPD) || null,    // 풍속
                windDir: parseFloat(row.AVG_WD) || null,        // 풍향
                vibrationX: parseFloat(row.AVG_VIBR_XCRD) || null,  // 진동 X축
                vibrationY: parseFloat(row.AVG_VIBR_YCRD) || null,  // 진동 Y축
                vibrationZ: parseFloat(row.AVG_VIBR_ZCRD) || null,  // 진동 Z축
                blackGlobe: parseFloat(row.AVG_GT) || null,         // 흑구온도
                // 대기오염 물질
                no2: parseFloat(row.AVG_NTDX) || null,  // 이산화질소
                co: parseFloat(row.AVG_CBMX) || null,   // 일산화탄소
                so2: parseFloat(row.AVG_SO) || null,    // 이산화황
                nh3: parseFloat(row.AVG_NH3) || null,   // 암모니아
                h2s: parseFloat(row.AVG_H2S) || null,   // 황화수소
                o3: parseFloat(row.AVG_OZON) || null    // 오존
            },
            measurementTime: row.MSRMT_HR,  // 측정 시간
            registeredAt: row.REG_DT,       // 등록 시간
            region: row.RGN                 // 지역
        };
    });

    // 구별 평균 계산 (합계를 개수로 나눔)
    Object.keys(byDistrict).forEach(district => {
        const d = byDistrict[district];
        if (d.tempCount > 0) d.avgTemp /= d.tempCount;
        if (d.humCount > 0) d.avgHum /= d.humCount;
        if (d.noiseCount > 0) d.avgNoise /= d.noiseCount;
    });

    return { byDistrict, bySensor };  // 가공된 데이터 반환
}

// 실시간 데이터로 대시보드 업데이트
// 이 함수는 API에서 최신 데이터를 가져와서 화면 전체를 업데이트합니다.
// init.js에서 주기적으로 호출됩니다.
async function updateFromApi() {
    const rows = await fetchSdotApiData();  // API에서 데이터 가져오기
    if (rows.length > 0) {
        const processed = processApiData(rows);  // 데이터 가공
        // 전역 캐시에 저장
        apiDataCache = {
            lastUpdate: new Date(),
            data: rows,
            byDistrict: processed.byDistrict,
            bySensor: processed.bySensor
        };

        // 화면 업데이트 함수들 호출
        updateDistrictDataFromApi();        // 구별 데이터 업데이트
        updateSensorStatusFromApi();        // 센서 상태 업데이트
        updateWindDataFromApi();            // 풍향/풍속 업데이트
        updateApiStatusDisplay();           // 상태 표시 업데이트
        updateDataRefreshTime(rows);        // 데이터 갱신 시간 표시
        checkAllSensorsForPollution();      // 대기오염 물질 체크

        console.log('대시보드 데이터 업데이트 완료:', new Date().toLocaleTimeString());
    }
}

// 데이터 갱신 시간 표시 업데이트
// 이 함수는 API 데이터에서 가장 최근 측정 시간을 찾아서 화면에 표시합니다.
function updateDataRefreshTime(rows) {
    const lastDataTimeEl = document.getElementById('lastDataTime');
    if (!lastDataTimeEl || !rows || rows.length === 0) return;

    // 디버깅: 첫번째 row의 키 확인
    if (rows[0]) {
        console.log('API 데이터 필드:', Object.keys(rows[0]));
    }

    // API 데이터에서 가장 최근 측정 시간 찾기
    // MSRMT_HR 형식: YYYYMMDD_HHMMSS (예: 20260202_143000)
    // REG_DT 형식: YYYY-MM-DD HH:MM:SS (예: 2026-02-02 14:30:00)
    let latestTime = null;      // 가장 최근 시간 문자열
    let latestTimeStr = '';     // 화면에 표시할 형식
    let useRegDt = false;       // REG_DT를 사용했는지 여부

    rows.forEach(row => {
        // 먼저 MSRMT_HR 체크
        if (row.MSRMT_HR) {
            const timeStr = row.MSRMT_HR;
            if (!latestTime || timeStr > latestTime) {
                latestTime = timeStr;
                useRegDt = false;
            }
        }
        // MSRMT_HR 없으면 REG_DT 사용
        else if (row.REG_DT) {
            const timeStr = row.REG_DT;
            if (!latestTime || timeStr > latestTime) {
                latestTime = timeStr;
                useRegDt = true;
            }
        }
    });

    if (latestTime) {
        if (useRegDt) {
            // REG_DT는 이미 YYYY-MM-DD HH:MM:SS 형식
            latestTimeStr = latestTime;
        } else {
            // MSRMT_HR 형식 파싱
            const parts = latestTime.split('_');
            if (parts.length === 2) {
                const datePart = parts[0];
                const timePart = parts[1];

                // 형식 1: YYYY-MM-DD_HH:MM:SS (구분자 포함)
                if (datePart.includes('-')) {
                    latestTimeStr = `${datePart} ${timePart}`;
                }
                // 형식 2: YYYYMMDD_HHMMSS (구분자 없음)
                else if (datePart.length === 8 && timePart.length >= 4) {
                    const year = datePart.substring(0, 4);
                    const month = datePart.substring(4, 6);
                    const day = datePart.substring(6, 8);
                    const hour = timePart.substring(0, 2);
                    const min = timePart.substring(2, 4);
                    const sec = timePart.length >= 6 ? timePart.substring(4, 6) : '00';

                    latestTimeStr = `${year}-${month}-${day} ${hour}:${min}:${sec}`;
                }
                // 기타: 그대로 표시
                else {
                    latestTimeStr = latestTime.replace('_', ' ');
                }
            } else {
                // 언더스코어 없으면 그대로 표시
                latestTimeStr = latestTime;
            }
        }
    }

    console.log('최근 데이터 시간:', latestTimeStr);
    lastDataTimeEl.textContent = latestTimeStr || '--:--:--';
}

// API 데이터로 구별 데이터 업데이트
function updateDistrictDataFromApi() {
    Object.keys(apiDataCache.byDistrict).forEach(districtKo => {
        const apiData = apiDataCache.byDistrict[districtKo];
        if (districtData[districtKo]) {
            // 실제 온도/습도 데이터 반영
            if (apiData.tempCount > 0) {
                districtData[districtKo].temp = apiData.avgTemp;
            }
            if (apiData.humCount > 0) {
                districtData[districtKo].humidity = apiData.avgHum;
            }
            // PM2.5는 API에서 제공하지 않으므로 Mock 유지 (미세먼지법에 따라 비공개)
        }
    });
}

// API 데이터로 센서 상태 업데이트
function updateSensorStatusFromApi() {
    Object.keys(apiDataCache.bySensor).forEach(sensorId => {
        const apiSensorData = apiDataCache.bySensor[sensorId];
        const m = apiSensorData.measurements;

        // 기존 sensorStatus에 실제 측정값 반영
        if (sensorStatus[sensorId]) {
            // 실제 측정값으로 업데이트
            if (m.temp !== null) sensorStatus[sensorId].measurements.temp = m.temp;
            if (m.humidity !== null) sensorStatus[sensorId].measurements.humidity = m.humidity;
            if (m.noise !== null) sensorStatus[sensorId].measurements.noise = m.noise;
            if (m.light !== null) sensorStatus[sensorId].measurements.light = m.light;
            if (m.uv !== null) sensorStatus[sensorId].measurements.uv = m.uv;
            if (m.vibrationX !== null) sensorStatus[sensorId].measurements.vibration = Math.max(m.vibrationX, m.vibrationY || 0, m.vibrationZ || 0);
            if (m.windSpeed !== null) sensorStatus[sensorId].measurements.windSpeed = m.windSpeed;
            if (m.windDir !== null) sensorStatus[sensorId].measurements.windDir = m.windDir;
            if (m.o3 !== null) sensorStatus[sensorId].measurements.o3 = m.o3;
            if (m.no2 !== null) sensorStatus[sensorId].measurements.no2 = m.no2;
            if (m.co !== null) sensorStatus[sensorId].measurements.co = m.co;
            if (m.so2 !== null) sensorStatus[sensorId].measurements.so2 = m.so2;
            if (m.nh3 !== null) sensorStatus[sensorId].measurements.nh3 = m.nh3;
            if (m.h2s !== null) sensorStatus[sensorId].measurements.h2s = m.h2s;
            if (m.blackGlobe !== null) sensorStatus[sensorId].measurements.blackGlobe = m.blackGlobe;

            // 이상값 재확인
            const abnormalItems = checkAbnormalItems(sensorStatus[sensorId].measurements);
            sensorStatus[sensorId].abnormalItems = abnormalItems;

            let status = 'normal';
            if (abnormalItems.some(item => item.level === 'danger')) {
                status = 'danger';
            } else if (abnormalItems.length > 0) {
                status = 'warning';
            }
            sensorStatus[sensorId].status = status;
        }
    });
}

// API 데이터에서 풍향/풍속 추출
function updateWindDataFromApi() {
    let totalWindDir = 0, totalWindSpeed = 0;
    let windDirCount = 0, windSpeedCount = 0;

    Object.values(apiDataCache.bySensor).forEach(sensor => {
        const m = sensor.measurements;
        if (m.windDir !== null && !isNaN(m.windDir)) {
            totalWindDir += m.windDir;
            windDirCount++;
        }
        if (m.windSpeed !== null && !isNaN(m.windSpeed)) {
            totalWindSpeed += m.windSpeed;
            windSpeedCount++;
        }
    });

    if (windDirCount > 0) {
        windData.direction = totalWindDir / windDirCount;
    }
    if (windSpeedCount > 0) {
        windData.speed = totalWindSpeed / windSpeedCount;
    }
}

// API 상태 표시 업데이트
function updateApiStatusDisplay() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-indicator span');

    if (apiDataCache.lastUpdate) {
        const timeDiff = (new Date() - apiDataCache.lastUpdate) / 1000;
        if (timeDiff < 120) {
            statusDot.style.background = 'var(--success)';
            statusText.textContent = `실시간 연결됨 (1155건)`;
        } else {
            statusDot.style.background = 'var(--warning)';
            statusText.textContent = '데이터 갱신 중...';
        }
    }
}
