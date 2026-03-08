// ===== sensor-layer.js =====
// 이 파일의 역할: 지도 위에 센서 위치를 표시하는 레이어(층) 관리
// - S-DoT(서울시 센서), ASOS(종관기상관측), AWS(자동기상관측) 센서를 지도에 표시/숨김
// - 각 센서 타입마다 다른 색상과 크기로 표시
// - 연결 파일: map.js (지도 기본 기능), data.js (센서 데이터), config.js (센서 좌표)
// ================================

// 센서 레이어 토글
// 이 함수가 하는 일: 사용자가 버튼을 누르면 특정 센서 레이어를 보이거나 숨김
function toggleSensorLayer(type) {
    // 현재 상태를 반대로 바꿈 (켜져있으면 끄고, 꺼져있으면 켬)
    sensorLayerState[type] = !sensorLayerState[type];
    // 해당 버튼 요소를 찾아서 (예: 'toggleSdot', 'toggleAsos')
    const toggle = document.getElementById('toggle' + type.charAt(0).toUpperCase() + type.slice(1));

    if (sensorLayerState[type]) {
        // 레이어를 켜는 경우
        if (toggle) {
            toggle.classList.add('active');
            toggle.setAttribute('aria-pressed', 'true');
        }
        drawSensorLayer(type); // 지도에 센서 표시
    } else {
        // 레이어를 끄는 경우
        if (toggle) {
            toggle.classList.remove('active');
            toggle.setAttribute('aria-pressed', 'false');
        }
        removeSensorLayer(type); // 지도에서 센서 제거
    }
}

// 센서 레이어 그리기
// 이 함수가 하는 일: 지도 위에 센서들을 동그란 점으로 표시 (센서 타입에 따라 색상과 크기 다름)
function drawSensorLayer(type) {
    const svg = d3.select('#seoulMap svg'); // SVG 지도 요소 선택
    const g = svg.select('.map-group'); // 지도 그룹 요소 선택
    if (g.empty()) return; // 지도가 없으면 종료

    // 기존 레이어 제거 (중복 방지)
    g.selectAll(`.station-layer-${type}`).remove();

    // 라벨 뒤에 삽입 (라벨이 센서 점 위에 표시되도록)
    const firstLabel = g.select('.district-label');
    let layerGroup;
    if (!firstLabel.empty()) {
        // 라벨이 있으면 그 앞에 삽입 (레이어 순서 조정)
        layerGroup = g.insert('g', '.district-label').attr('class', `station-layer-${type}`);
    } else {
        // 라벨이 없으면 마지막에 추가
        layerGroup = g.append('g').attr('class', `station-layer-${type}`);
    }

    // 센서 데이터 및 스타일 설정
    let stations = []; // 센서 목록
    let markerClass = ''; // CSS 클래스명
    let markerSize = 4; // 센서 점 크기
    let markerColor = ''; // 센서 점 색상

    if (type === 'sdot') {
        // S-DoT 센서 - sensorData에서 모든 센서 추출 (구 > 동 > 센서 구조)
        Object.values(sensorData).forEach(districtDongs => {
            Object.values(districtDongs).forEach(dongSensors => {
                dongSensors.forEach(sensor => {
                    stations.push({
                        id: sensor.id,
                        name: sensor.id,
                        lat: sensor.lat, // 위도
                        lng: sensor.lng  // 경도
                    });
                });
            });
        });
        markerClass = 'sdot';
        markerSize = 3; // 작은 크기
        markerColor = '#2ecc71'; // 초록색
    } else if (type === 'asos') {
        // ASOS 종관기상관측소
        stations = asosStations;
        markerClass = 'asos';
        markerSize = 6; // 큰 크기
        markerColor = '#e74c3c'; // 빨간색
    } else if (type === 'aws') {
        // AWS 자동기상관측소
        stations = awsStations;
        markerClass = 'aws';
        markerSize = 5; // 중간 크기
        markerColor = '#9b59b6'; // 보라색
    } else if (type === 'rtd') {
        // RTD 실시간 도시데이터 관측 지점
        stations = rtdStations;
        markerClass = 'rtd';
        markerSize = 4; // AWS와 S-DoT 사이 크기
        markerColor = '#f39c12'; // 주황색
    }

    // 현재 지도 투영 사용 (위경도를 화면 좌표로 변환하는 도구)
    if (!mapProjection) return;

    // 각 센서를 지도에 동그란 점으로 그리기
    stations.forEach(station => {
        // 위경도를 화면 픽셀 좌표로 변환
        const coords = mapProjection([station.lng, station.lat]);
        if (coords) {
            // SVG 원(circle) 추가
            layerGroup.append('circle')
                .attr('class', `station-marker-${markerClass}`) // CSS 클래스 적용
                .attr('cx', coords[0]) // X 좌표
                .attr('cy', coords[1]) // Y 좌표
                .attr('r', markerSize) // 반지름
                .attr('fill', markerColor) // 채우기 색상
                .attr('stroke', '#ffffff') // 테두리 흰색
                .attr('stroke-width', 1) // 테두리 두께
                .attr('opacity', 0) // 처음엔 투명
                .style('pointer-events', 'none') // 마우스 이벤트 비활성화
                .transition() // 애니메이션 효과
                .duration(300) // 0.3초 동안
                .attr('opacity', 0.9); // 서서히 나타남
        }
    });
}

// 센서 레이어 제거
// 이 함수가 하는 일: 지도에서 특정 센서 레이어를 완전히 제거
function removeSensorLayer(type) {
    const svg = d3.select('#seoulMap svg'); // SVG 지도 선택
    const g = svg.select('.map-group'); // 지도 그룹 선택
    if (!g.empty()) {
        // 해당 센서 레이어의 모든 요소 제거
        g.selectAll(`.station-layer-${type}`).remove();
    }
}

// 전체 지도 복귀 시 센서 레이어 다시 그리기
// 이 함수가 하는 일: 지도 확대/축소 후 활성화된 센서 레이어를 다시 그림
function redrawActiveSensorLayers() {
    // 모든 센서 타입을 확인하여
    Object.keys(sensorLayerState).forEach(type => {
        if (sensorLayerState[type]) {
            // 활성화되어 있는 레이어만 다시 그리기
            drawSensorLayer(type);
        }
    });
}
