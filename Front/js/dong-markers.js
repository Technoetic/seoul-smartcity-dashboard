// ===== dong-markers.js =====
// 프로젝트 역할: 동 오버레이 위에 센서 마커들을 배치하고, 클릭/호버 이벤트를 처리하는 파일
// 연결 파일:
//   - dong-overlay.js: 동 오버레이 생성 시 이 파일의 addSensorMarkersToOverlay 함수 호출
//   - ui-tooltip.js: 센서에 마우스 올렸을 때 툴팁 표시
//   - ui-traceback.js: 센서 클릭 시 역추적선 표시
//   - sensor-data.js: 센서 상태(정상/주의/위험) 정보

// 오버레이에 센서 마커 추가
// 동 오버레이가 생성되면 그 위에 센서들을 점으로 표시합니다
function addSensorMarkersToOverlay(dongGroup, districtName, dongFeatures, scale) {
    if (!sensorData || !sensorData[districtName]) return; // 센서 데이터가 없으면 종료

    const districtSensors = sensorData[districtName]; // 해당 구의 센서 데이터
    const allSensors = []; // 모든 센서를 담을 배열

    // 동 이름으로 feature를 찾는 헬퍼 함수
    // 센서 데이터의 동 이름과 GeoJSON의 동 이름이 다를 수 있어서 유연하게 찾습니다
    function findDongFeature(dongName) {
        // 정확한 매칭 시도
        let feature = dongFeatures.find(f => f.properties.name === dongName);
        if (feature) return feature; // 찾았으면 반환

        // 부분 매칭 시도 (센서 데이터의 동 이름이 다를 수 있음)
        // 예: "역삼1동" vs "역삼동"
        feature = dongFeatures.find(f =>
            f.properties.name.includes(dongName.split('-')[0]) ||
            dongName.includes(f.properties.name)
        );
        return feature;
    }

    // 점이 동 영역 내에 있는지 확인
    // d3.geoContains: 특정 좌표가 지도 영역 안에 있는지 판단하는 함수
    function isPointInDong(lng, lat, dongFeature) {
        if (!dongFeature || !dongFeature.geometry) return false;
        return d3.geoContains(dongFeature, [lng, lat]);
    }

    // 동 영역 내 랜덤 위치 생성
    // 센서 위치가 정확하지 않을 때 동의 중심 근처에 랜덤하게 배치합니다
    function getRandomPointInDong(dongFeature) {
        if (!dongFeature) return null;
        const bounds = mapPath.bounds(dongFeature); // 동의 경계 박스
        const centroid = mapPath.centroid(dongFeature); // 동의 중심점

        // 중심점에서 약간 랜덤하게 offset
        const offsetX = (Math.random() - 0.5) * (bounds[1][0] - bounds[0][0]) * 0.5;
        const offsetY = (Math.random() - 0.5) * (bounds[1][1] - bounds[0][1]) * 0.5;

        return {
            px: centroid[0] + offsetX, // 랜덤 X 좌표
            py: centroid[1] + offsetY  // 랜덤 Y 좌표
        };
    }

    // 구 전체 경계 체크 함수
    // 센서가 해당 구 내에 있는지 확인합니다
    function isPointInDistrict(lng, lat) {
        return dongFeatures.some(f => d3.geoContains(f, [lng, lat]));
    }

    // 구 전체 경계 박스 계산
    // 모든 동의 경계를 포함하는 최소/최대 좌표를 계산합니다
    let districtBounds = null;
    dongFeatures.forEach(f => {
        const b = mapPath.bounds(f); // 각 동의 경계 박스
        if (!districtBounds) {
            // 첫 번째 동의 경계로 초기화
            districtBounds = [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
        } else {
            // 기존 경계와 비교하여 최소/최대값 갱신
            districtBounds[0][0] = Math.min(districtBounds[0][0], b[0][0]); // 최소 X
            districtBounds[0][1] = Math.min(districtBounds[0][1], b[0][1]); // 최소 Y
            districtBounds[1][0] = Math.max(districtBounds[1][0], b[1][0]); // 최대 X
            districtBounds[1][1] = Math.max(districtBounds[1][1], b[1][1]); // 최대 Y
        }
    });

    // 모든 동의 센서를 모아서 배열로 만들기
    // 동별로 나뉘어진 센서 데이터를 하나의 배열로 통합합니다
    Object.keys(districtSensors).forEach(dongNameFromData => {
        const dongFeature = findDongFeature(dongNameFromData); // 해당 동의 지도 데이터
        // dongFeature가 없으면 첫 번째 동 사용 (fallback)
        const targetDong = dongFeature || dongFeatures[0];

        // 해당 동의 모든 센서 순회
        districtSensors[dongNameFromData].forEach(sensor => {
            const coords = [sensor.lng, sensor.lat]; // 센서의 위도/경도
            let projected = mapProjection(coords); // 위도/경도를 화면 좌표로 변환
            if (!projected) return; // 투영 실패 시 스킵
            let px = projected[0]; // X 좌표
            let py = projected[1]; // Y 좌표

            // 센서가 구 경계 내에 있는지 확인 (좌표 + 투영 위치 둘 다 체크)
            const isInsideGeo = isPointInDistrict(sensor.lng, sensor.lat); // 지리적 위치 확인
            const isInsideBounds = districtBounds &&
                px >= districtBounds[0][0] && px <= districtBounds[1][0] &&
                py >= districtBounds[0][1] && py <= districtBounds[1][1]; // 화면 좌표 확인

            if (!isInsideGeo || !isInsideBounds) {
                // 경계 밖이면 해당 동의 중심 근처로 배치 (보정)
                const centroid = mapPath.centroid(targetDong);
                const bounds = mapPath.bounds(targetDong);
                const offsetX = (Math.random() - 0.5) * (bounds[1][0] - bounds[0][0]) * 0.4;
                const offsetY = (Math.random() - 0.5) * (bounds[1][1] - bounds[0][1]) * 0.4;
                px = centroid[0] + offsetX;
                py = centroid[1] + offsetY;
            }

            // 센서 정보를 배열에 추가 (위치 정보 포함)
            allSensors.push({
                ...sensor, // 기존 센서 데이터 (id, lat, lng 등)
                dong: dongNameFromData, // 동 이름
                px: px, // 화면 X 좌표
                py: py  // 화면 Y 좌표
            });
        });
    });

    if (allSensors.length === 0) return; // 센서가 없으면 종료

    // 센서 마커 그룹
    // SVG 그룹을 만들어서 모든 센서 마커를 담습니다
    const markerGroup = dongGroup.append('g').attr('class', 'sensor-overlay-group');

    // 역추적선 그룹 생성
    // 센서 클릭 시 역추적선을 그릴 그룹을 미리 만들어둡니다
    let traceGroup = dongGroup.select('.traceback-group');
    if (traceGroup.empty()) {
        traceGroup = dongGroup.append('g').attr('class', 'traceback-group');
    }

    // 센서 마커 생성 (원 모양)
    const sensorMarkers = markerGroup.selectAll('circle.sensor-overlay-marker')
        .data(allSensors) // 센서 데이터 바인딩
        .enter() // 새로운 데이터에 대해 요소 생성
        .append('circle')
        .attr('class', d => `sensor-overlay-marker sensor-marker-${getSensorStatus(d.id)} model-${getSensorModelType(d.id)}`)
        .attr('cx', d => d.px) // 중심 X 좌표
        .attr('cy', d => d.py) // 중심 Y 좌표
        .attr('r', 5 / scale) // 반지름 (줌 레벨에 따라 조정)
        .attr('fill', d => {
            // 센서 상태에 따른 색상
            const status = getSensorStatus(d.id);
            if (status === 'danger') return '#e17055'; // 위험: 빨강
            if (status === 'warning') return '#fdcb6e'; // 주의: 주황
            return '#00b894'; // 정상: 초록
        })
        .attr('stroke', d => getSensorModelType(d.id) === 'o' ? '#00d9ff' : '#fff') // 센서 모델 타입에 따른 테두리
        .attr('stroke-width', 1.5 / scale) // 테두리 두께
        .attr('opacity', 0) // 초기 투명도 (애니메이션 시작)
        .style('cursor', d => getSensorStatus(d.id) !== 'normal' ? 'pointer' : 'default'); // 이상 센서는 클릭 가능

    // 이벤트 핸들러 별도 등록
    // 센서 마커에 마우스/클릭 이벤트를 연결합니다
    sensorMarkers
        .on('mouseenter', function(event, d) {
            // 센서에 마우스를 올렸을 때 툴팁 표시
            showSensorTooltip(event, d);
        })
        .on('mouseleave', hideSensorTooltip) // 센서에서 마우스가 벗어났을 때 툴팁 숨김
        .on('click', function(event, d) {
            // 센서를 클릭했을 때
            event.stopPropagation(); // 이벤트 버블링 방지
            console.log('🖱️ 센서 클릭됨:', d.id);
            const status = getSensorStatus(d.id);
            console.log('  - 센서 상태:', status);
            // warning 또는 danger 상태의 센서만 역추적 (정상 센서는 역추적 안함)
            if (status === 'warning' || status === 'danger') {
                // 현재 뷰에 맞는 스케일 사용 (dongZoom일 때는 currentDongScale)
                const currentScale = currentView === 'dongZoom' ? currentDongScale :
                                    (currentView === 'dong' ? currentDistrictScale : scale);
                handleSensorClick(d, mapProjection, traceGroup, currentScale); // 역추적선 표시
            } else {
                console.log('  - 정상 상태 센서 - 역추적 미실행');
            }
        });

    // 페이드인 애니메이션
    // 센서들이 하나씩 순차적으로 나타나는 효과
    sensorMarkers.transition()
        .duration(400) // 0.4초
        .delay((d, i) => 300 + i * 5) // 각 센서마다 5ms씩 지연 (순차 효과)
        .attr('opacity', 1); // 최종 투명도
}
