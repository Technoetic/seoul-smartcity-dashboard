// ===== ui-info.js =====
// 프로젝트 역할: 지도 위에서 마우스를 올렸을 때(호버) 정보를 표시하고, 클릭 이벤트를 처리하는 파일
// 연결 파일:
//   - main.js: 지도 렌더링 시 이벤트 핸들러를 등록
//   - data-api.js: 실시간 API 데이터를 가져와서 정보박스에 표시
//   - district-zoom.js, dong-zoom.js: 클릭 시 줌인 애니메이션 호출
//   - ui-tooltip.js: 센서에 마우스 올렸을 때 툴팁 표시

// 호버 펄스 애니메이션 상태 관리
// WeakMap: JavaScript의 Map과 비슷하지만, 메모리 누수를 방지하는 특별한 자료구조
const hoverPulseState = new WeakMap();

// 호버 펄스 트리거 (한 번만 실행)
// 마우스를 올렸을 때 지도 구역이 "두근!" 하고 커지는 효과를 줍니다
function triggerHoverPulse(element) {
    if (!element) return; // 요소가 없으면 바로 종료

    // 이미 애니메이션 중이면 무시 (중복 실행 방지)
    if (hoverPulseState.get(element)) return;

    // 애니메이션 실행 중 플래그 설정 (중복 방지용)
    hoverPulseState.set(element, true);

    // 클래스 추가로 애니메이션 트리거 (CSS에 정의된 애니메이션 실행)
    element.classList.add('hover-pulse-active');

    // 애니메이션 종료 후 클래스 제거 (애니메이션 시간과 동일하게 설정)
    setTimeout(() => {
        element.classList.remove('hover-pulse-active'); // 0.7초 후 클래스 제거
    }, 700); // 0.7s 애니메이션 시간과 일치
}

// 호버 이벤트 종료 시 상태 리셋
// 마우스가 구역을 벗어났을 때 애니메이션 상태를 초기화합니다
function resetHoverPulse(element) {
    if (!element) return; // 요소가 없으면 바로 종료
    hoverPulseState.set(element, false); // 애니메이션 플래그 해제
    element.classList.remove('hover-pulse-active'); // 애니메이션 클래스 제거
}

// 호버 이벤트 (실시간 API 데이터 표시)
// 마우스를 구(區, 예: 강남구) 위에 올렸을 때 실행되는 함수
function handleDistrictHover(event, d) {
    // 구/동 지도에 들어가 있을 때는 hover 이벤트 무시
    // (서울시 전체 지도일 때만 동작)
    if (currentView !== 'city') {
        return;
    }

    // 두근! 효과 - 한 번만 실행
    triggerHoverPulse(event.target);

    const name = d.properties.name; // 구 이름 (예: "강남구")

    // API 데이터에서 실시간 정보 가져오기 (온도, 습도, 소음 등)
    const apiDistrictData = apiDataCache.byDistrict[name];
    updateInfoBox(name, null, apiDistrictData); // 정보박스 업데이트
}

// 마우스가 구역을 벗어났을 때 서울시 전체 데이터 표시
// 특정 구에서 마우스가 벗어나면 서울시 전체 평균 데이터를 보여줍니다
function handleDistrictLeave(event, d) {
    // 호버 상태 리셋 (두근 효과 해제)
    resetHoverPulse(event.target);

    if (currentView === 'city') {
        showSeoulTotalInfo(); // 서울시 전체 데이터 표시
    }
}

// 선택된 구의 평균 데이터 표시
// 특정 구를 클릭해서 들어간 상태에서 해당 구의 평균 데이터를 보여줍니다
function showDistrictTotalInfo() {
    if (!selectedDistrict) return; // 선택된 구가 없으면 종료
    const districtData = apiDataCache.byDistrict[selectedDistrict]; // 해당 구의 API 데이터
    updateInfoBox(selectedDistrict, null, districtData); // 정보박스 업데이트
}

// 마우스가 동을 벗어났을 때
// 동(洞, 예: 역삼동)에서 마우스가 벗어났을 때 어떤 정보를 표시할지 결정합니다
function handleDongLeave() {
    if (currentView === 'dong' && selectedDistrict) {
        // 구 레벨에서는 구 전체 데이터 표시
        showDistrictTotalInfo();
    } else if (currentView === 'dongZoom' && selectedDong) {
        // 동 줌인 상태에서는 선택된 동 데이터 유지
        showDongInfo(selectedDong);
    }
}

// 마우스를 동(洞) 위에 올렸을 때
// 해당 동의 센서들로부터 평균 온도, 습도, 소음을 계산해서 표시합니다
function handleDongHover(event, d) {
    // 동 줌인 상태에서는 hover 이벤트 무시 (선택된 동만 표시)
    if (currentView === 'dongZoom') {
        return;
    }

    const dongName = d.properties.name; // 동 이름 (예: "역삼동")

    // API 데이터에서 해당 동의 센서 정보 집계
    let apiDongData = null; // 동의 평균 데이터를 저장할 변수
    if (apiDataCache.bySensor) {
        // 1. 해당 동에 속한 센서들만 필터링
        const dongSensors = Object.values(apiDataCache.bySensor).filter(s => {
            if (!s.dong || !s.district) return false; // 동/구 정보 없으면 제외
            if (s.district !== selectedDistrict) return false; // 다른 구는 제외
            // 동 이름 매칭 (API 동 이름과 GeoJSON 동 이름이 다를 수 있어서 유연하게 매칭)
            const apiDong = s.dong.replace(/\d+\([^)]+\)-dong/, '').replace(/-dong$/, '');
            return dongName.includes(apiDong) || apiDong.includes(dongName);
        });

        // 2. 필터링된 센서들의 평균값 계산
        if (dongSensors.length > 0) {
            let tempSum = 0, humSum = 0, noiseSum = 0; // 합계
            let tempCnt = 0, humCnt = 0, noiseCnt = 0; // 개수 (평균 계산용)

            // 모든 센서를 순회하며 합산
            dongSensors.forEach(s => {
                if (s.measurements.temp !== null && !isNaN(s.measurements.temp)) { tempSum += s.measurements.temp; tempCnt++; }
                if (s.measurements.humidity !== null && !isNaN(s.measurements.humidity)) { humSum += s.measurements.humidity; humCnt++; }
                if (s.measurements.noise !== null && !isNaN(s.measurements.noise)) { noiseSum += s.measurements.noise; noiseCnt++; }
            });

            // 평균 계산 및 데이터 객체 생성
            apiDongData = {
                avgTemp: tempCnt > 0 ? tempSum / tempCnt : null, // 평균 온도
                avgHum: humCnt > 0 ? humSum / humCnt : null,     // 평균 습도
                avgNoise: noiseCnt > 0 ? noiseSum / noiseCnt : null, // 평균 소음
                sensorCount: dongSensors.length // 센서 개수
            };
        }
    }

    // 정보박스에 "강남구 역삼동" 형식으로 표시
    updateInfoBox(`${selectedDistrict} ${dongName}`, null, apiDongData);
}

// 정보박스 업데이트 (화면 좌측 상단의 정보 패널)
// name: 표시할 지역 이름, data: (사용안함), apiData: API에서 가져온 실시간 데이터
function updateInfoBox(name, data, apiData = null) {
    document.getElementById('infoName').textContent = name; // 지역 이름 표시

    // 실시간 API 데이터만 표시
    let tempVal = '-', humVal = '-', noiseVal = '-'; // 초기값은 '-' (데이터 없음)
    let sensorCount = 0; // 센서 개수

    // API 데이터가 있으면 값을 표시
    if (apiData) {
        // 온도 (소수점 1자리까지)
        if (apiData.avgTemp !== null && !isNaN(apiData.avgTemp)) {
            tempVal = apiData.avgTemp.toFixed(1);
        }
        // 습도 (정수로)
        if (apiData.avgHum !== null && !isNaN(apiData.avgHum)) {
            humVal = apiData.avgHum.toFixed(0);
        }
        // 소음 (정수로)
        if (apiData.avgNoise !== null && !isNaN(apiData.avgNoise)) {
            noiseVal = apiData.avgNoise.toFixed(0);
        }
        sensorCount = apiData.sensorCount || apiData.tempCount || 0;
    }

    // 정보박스에 온도와 습도 표시 (단위 포함)
    document.getElementById('infoTemp').textContent = tempVal !== '-' ? `${tempVal}°C` : '- °C';
    document.getElementById('infoHumidity').textContent = humVal !== '-' ? `${humVal}%` : '- %';

    // Replay 모드: DB에 소음/풍속/풍향 없으므로 비활성화
    // (과거 데이터 재생 모드에서는 일부 데이터가 없음)
    if (replayMode.enabled) {
        document.getElementById('infoNoise').textContent = '- dB'; // 소음 데이터 없음
        document.getElementById('infoWindDir').textContent = '-'; // 풍향 데이터 없음
        document.getElementById('infoWindSpeed').textContent = '- m/s'; // 풍속 데이터 없음
        const arrow = document.getElementById('infoWindArrow'); // 풍향 화살표
        if (arrow) arrow.setAttribute('transform', 'rotate(0)'); // 화살표 방향 초기화
    } else {
        // 실시간 모드: 소음 데이터 표시
        document.getElementById('infoNoise').textContent = noiseVal !== '-' ? `${noiseVal} dB` : '- dB';

        // 풍향/풍속 (실시간 API 데이터)
        if (windData.direction !== null && !isNaN(windData.direction)) {
            // 풍향을 텍스트로 표시 (예: "북풍", "남서풍" 등)
            document.getElementById('infoWindDir').textContent = `${getWindDirectionText(windData.direction)}풍`;
            const arrow = document.getElementById('infoWindArrow');
            // 풍향 화살표 회전 (180도 더하는 이유: 화살표가 바람이 "불어오는" 방향을 가리키도록)
            if (arrow) arrow.setAttribute('transform', `rotate(${windData.direction + 180})`);
        } else {
            document.getElementById('infoWindDir').textContent = '-';
        }

        if (windData.speed !== null && !isNaN(windData.speed)) {
            // 풍속 표시 (소수점 1자리)
            document.getElementById('infoWindSpeed').textContent = `${windData.speed.toFixed(1)} m/s`;
        } else {
            document.getElementById('infoWindSpeed').textContent = '- m/s';
        }
    }

    // API 상태 배지 업데이트 (Replay 모드가 아닐 때만)
    // 화면에 "LIVE", "OFFLINE", "REPLAY" 배지를 표시합니다
    const badge = document.getElementById('apiStatusBadge');
    if (badge && !replayMode.enabled) {
        // 실시간 모드
        if (apiDataCache.lastUpdate && Object.keys(apiDataCache.bySensor).length > 0) {
            badge.style.background = '#2ecc71'; // 초록색
            badge.textContent = 'LIVE'; // 실시간 데이터 수신 중
        } else {
            badge.style.background = '#c0392b'; // 빨간색
            badge.textContent = 'OFFLINE'; // API 연결 끊김
        }
    } else if (badge && replayMode.enabled) {
        // Replay 모드
        badge.style.background = '#9b59b6'; // 보라색
        badge.textContent = 'REPLAY'; // 과거 데이터 재생 중
    }
}

// 클릭 이벤트
// 구(區)를 클릭했을 때 실행되는 함수
function handleDistrictClick(event, d) {
    selectedDistrict = d.properties.name; // 선택된 구 이름 저장
    selectedDong = null; // 동 선택 초기화
    zoomIntoDistrict(event.target, d); // 해당 구로 줌인 애니메이션 실행
}

// 동(洞)을 클릭했을 때 실행되는 함수
function handleDongClick(event, d) {
    selectedDong = d.properties.name; // 선택된 동 이름 저장
    d3.selectAll('.dong-path').classed('selected', false); // 기존 선택 해제
    d3.select(event.target).classed('selected', true); // 현재 동을 선택 상태로 표시

    // 역추적선 숨기기 (새로운 동을 선택하면 기존 역추적선 제거)
    selectedSensorForTraceback = null;
    d3.selectAll('.traceback-group *').remove();

    // 해당 동으로 줌인
    zoomIntoDong(event.target, d);
}
