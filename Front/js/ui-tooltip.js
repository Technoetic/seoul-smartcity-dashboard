// ===== ui-tooltip.js =====
// 프로젝트 역할: 센서 위에 마우스를 올렸을 때 상세 정보를 툴팁으로 표시하는 파일
// 연결 파일:
//   - dong-markers.js: 센서 마커에 mouseenter/mouseleave 이벤트 연결
//   - sensor-data.js: 센서 상태(정상/주의/위험) 및 이상 항목 정보
//   - data-api.js: 실시간 API 데이터를 가져와서 툴팁에 표시

// 센서 툴팁 표시 (실시간 API 데이터만)
// 센서에 마우스를 올리면 팝업창처럼 상세 정보를 보여줍니다
function showSensorTooltip(event, sensor) {
    // 툴팁 요소 가져오기 또는 생성
    let tooltip = document.getElementById('sensorTooltip');
    if (!tooltip) {
        // 툴팁이 없으면 새로 생성
        tooltip = document.createElement('div');
        tooltip.id = 'sensorTooltip';
        tooltip.className = 'sensor-tooltip';
        document.querySelector('.map-container').appendChild(tooltip);
    }

    // 센서 상태 정보 가져오기
    const sensorDataObj = getSensorData(sensor.id);
    const status = sensorDataObj.status; // 'normal', 'warning', 'danger', 'unknown'
    // 상태를 한글로 변환
    const statusText = status === 'danger' ? '위험' : status === 'warning' ? '주의' : status === 'unknown' ? '데이터없음' : '정상';
    // 상태에 따른 색상 (빨강/주황/회색/초록)
    const statusColor = status === 'danger' ? '#e74c3c' : status === 'warning' ? '#f39c12' : status === 'unknown' ? '#7f8c8d' : '#2ecc71';

    // API에서 가져온 실시간 데이터 표시
    const apiSensor = apiDataCache.bySensor[sensor.id]; // 해당 센서의 API 데이터
    let realtimeHtml = ''; // 실시간 데이터 HTML

    if (apiSensor && apiSensor.measurements) {
        // API 데이터가 있으면 측정값 표시
        const m = apiSensor.measurements; // 측정값 객체
        // 값 포맷팅 함수 (소수점 자리수 조정, null이면 '-' 표시)
        const formatVal = (val, unit, decimals = 1) => {
            if (val === null || isNaN(val)) return '-';
            return val.toFixed(decimals) + unit;
        };

        // 실시간 측정값 HTML 생성
        realtimeHtml = `
            <div class="tooltip-section">
                <div class="tooltip-section-title">📡 실시간 측정값</div>
                <div class="tooltip-grid">
                    <span class="tooltip-label">온도:</span><span>${formatVal(m.temp, '°C')}</span>
                    <span class="tooltip-label">습도:</span><span>${formatVal(m.humidity, '%', 0)}</span>
                    <span class="tooltip-label">소음:</span><span>${formatVal(m.noise, 'dB', 0)}</span>
                    <span class="tooltip-label">조도:</span><span>${formatVal(m.light, 'lux', 0)}</span>
                    <span class="tooltip-label">자외선:</span><span>${formatVal(m.uv, '')}</span>
                    <span class="tooltip-label">풍속:</span><span>${formatVal(m.windSpeed, 'm/s')}</span>
                </div>
                ${apiSensor.measurementTime ? `<div class="tooltip-time">측정: ${apiSensor.measurementTime.replace('_', ' ')}</div>` : ''}
            </div>
        `;

        // 대기오염 물질 데이터 섹션 (o3, nh3, h2s, co, no2, so2 중 하나라도 있으면 표시)
        const hasPollutionData = [m.o3, m.nh3, m.h2s, m.co, m.no2, m.so2].some(v => v !== null && v !== undefined);
        if (hasPollutionData) {
            realtimeHtml += `
                <div class="tooltip-section">
                    <div class="tooltip-section-title">🏭 대기오염 물질</div>
                    <div class="tooltip-grid">
                        <span class="tooltip-label">O3:</span><span>${formatVal(m.o3, 'ppm', 3)}</span>
                        <span class="tooltip-label">NH3:</span><span>${formatVal(m.nh3, 'ppm', 3)}</span>
                        <span class="tooltip-label">H2S:</span><span>${formatVal(m.h2s, 'ppm', 3)}</span>
                        <span class="tooltip-label">CO:</span><span>${formatVal(m.co, 'ppm', 3)}</span>
                        <span class="tooltip-label">NO2:</span><span>${formatVal(m.no2, 'ppm', 3)}</span>
                        <span class="tooltip-label">SO2:</span><span>${formatVal(m.so2, 'ppm', 3)}</span>
                    </div>
                </div>
            `;
        }
    } else {
        // API 데이터가 없으면 대기중 메시지 표시
        realtimeHtml = `
            <div class="tooltip-section waiting">
                <div class="tooltip-waiting-title">⏳ 데이터 수신 대기중</div>
                <div class="tooltip-waiting-msg">API에서 데이터를 불러오는 중입니다...</div>
            </div>
        `;
    }

    // 이상 항목 목록 생성
    // 센서에서 이상이 감지된 항목들을 목록으로 표시합니다 (예: 온도 과다, 소음 과다 등)
    let abnormalHtml = '';
    if (sensorDataObj.abnormalItems && sensorDataObj.abnormalItems.length > 0) {
        abnormalHtml = `
            <div class="tooltip-abnormal-separator">
                <div class="tooltip-abnormal-title" style="color: ${statusColor};">⚠ 이상 감지 항목</div>
                ${sensorDataObj.abnormalItems.map(item => {
                    const levelColor = item.level === 'danger' ? '#e74c3c' : '#f39c12'; // 위험=빨강, 주의=주황
                    const levelText = item.level === 'danger' ? '위험' : '주의';
                    return `<div class="tooltip-abnormal-item" style="color: ${levelColor};">
                        • ${item.name}: ${item.value.toFixed(2)}${item.unit} [${levelText}]
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    // 이상 센서 클릭 안내
    // 이상이 있는 센서는 클릭하면 발원지를 추적할 수 있다는 안내 표시
    const clickHint = (status === 'warning' || status === 'danger') ?
        `<div class="tooltip-click-hint">
            💡 클릭하여 발원지 추적
        </div>` : '';

    // 툴팁 내용 구성 (HTML)
    // 센서 기본 정보 + 실시간 측정값 + 이상 항목 + 클릭 안내
    tooltip.innerHTML = `
        <div class="tooltip-abnormal-title" style="color: ${statusColor};">S-DoT 센서 [${statusText}]</div>
        <div>ID: ${sensor.id}</div>
        <div>동: ${sensor.dong || apiSensor?.dong || '-'}</div>
        <div>위도: ${sensor.lat.toFixed(6)}</div>
        <div>경도: ${sensor.lng.toFixed(6)}</div>
        ${realtimeHtml}
        ${abnormalHtml}
        ${clickHint}
    `;

    // 툴팁 테두리 색상 (상태에 따라 변경)
    tooltip.style.borderColor = statusColor;

    // 툴팁 위치 계산 (마우스 커서 근처)
    const mapContainer = document.querySelector('.map-container');
    const rect = mapContainer.getBoundingClientRect(); // 지도 컨테이너 위치
    tooltip.style.left = (event.clientX - rect.left + 15) + 'px'; // 마우스 X 위치 + 15px 오른쪽
    tooltip.style.top = (event.clientY - rect.top - 10) + 'px'; // 마우스 Y 위치 - 10px 위쪽
    tooltip.classList.add('visible'); // 툴팁 표시
}

// 센서 툴팁 숨기기
// 센서에서 마우스가 벗어나면 툴팁을 숨깁니다
function hideSensorTooltip() {
    const tooltip = document.getElementById('sensorTooltip');
    if (tooltip) {
        tooltip.classList.remove('visible'); // 'visible' 클래스 제거하면 CSS로 숨김 처리
    }
}
