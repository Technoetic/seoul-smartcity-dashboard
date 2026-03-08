// ===== ui-traceback.js =====
// 프로젝트 역할: 이상이 감지된 센서를 클릭하면 바람의 방향을 따라 오염물질의 발원지를 추적하는 기능
// 연결 파일:
//   - dong-markers.js: 센서 마커 클릭 시 이 파일의 handleSensorClick 함수를 호출
//   - sensor-data.js: 센서 상태(정상/주의/위험) 정보를 가져옴
//   - wind-data.js: 풍향 데이터를 가져와서 역추적 방향 계산
//   - location.js: 발원지 클릭 시 해당 지역으로 이동

// 센서 클릭 이벤트 핸들러
// 이상이 감지된 센서를 클릭하면 바람의 방향을 따라 발원지를 추적합니다
function handleSensorClick(sensor, projection, traceGroup, scale = 1) {
    // 디버깅용 콘솔 로그 (개발 중 문제 해결을 위한 출력)
    console.log('========================================');
    console.log('🔍 센서 클릭 이벤트 발생!');
    console.log('  - 센서 ID:', sensor.id);
    console.log('  - 센서 위치:', sensor.lat, sensor.lng);
    console.log('  - projection 존재:', !!projection); // 좌표 변환 함수 확인
    console.log('  - traceGroup 존재:', !!traceGroup); // 역추적선 그룹 확인
    console.log('  - API 캐시 센서 수:', Object.keys(apiDataCache.bySensor || {}).length);

    // 센서의 상태 정보 가져오기 (정상/주의/위험)
    const sensorData = getSensorData(sensor.id);

    console.log('  - getSensorData 결과:', sensorData);
    console.log('  - 상태:', sensorData?.status);
    console.log('  - 대기오염 감지:', sensorData?.pollutionDetected);
    console.log('  - 이상항목:', sensorData?.abnormalItems);

    // API 데이터가 없거나 정상 센서는 클릭해도 역추적선 표시 안함
    // (정상 센서는 추적할 필요가 없음)
    if (!sensorData || sensorData.status === 'normal') {
        console.log('  ❌ 정상 센서 - 역추적 안함');
        console.log('========================================');
        return;
    }

    // 같은 센서를 다시 클릭하면 역추적선 숨김 (토글 기능)
    if (selectedSensorForTraceback === sensor.id) {
        hideTraceback(traceGroup); // 역추적선 제거
        selectedSensorForTraceback = null; // 선택 해제
        console.log('  → 역추적선 숨김');
        return;
    }

    console.log('  → 역추적선 표시 시작');

    selectedSensorForTraceback = sensor.id; // 현재 센서를 선택된 센서로 저장

    // 기존 역추적선 제거 (다른 센서의 역추적선이 있었다면)
    traceGroup.selectAll('*').remove();

    // traceGroup을 최상위로 이동 (다른 요소들 위에 표시)
    traceGroup.raise();

    // 최초 발원지까지 추적 (서울 경계를 벗어날 때까지)
    // 바람의 방향을 따라 거슬러 올라가면서 오염물질의 발원지를 찾습니다
    const originDirection = windData.direction; // 현재 풍향 (0~360도)
    const stepDistance = 0.008; // 한 단계당 이동 거리 (약 800m)
    const radians = originDirection * Math.PI / 180; // 각도를 라디안으로 변환 (수학 계산용)
    const maxSteps = 50; // 최대 추적 단계 (무한루프 방지)

    // 추적 시작 위치 (센서 위치)
    let currentLat = sensor.lat;
    let currentLng = sensor.lng;
    let originLat = sensor.lat; // 발원지 위도 (업데이트됨)
    let originLng = sensor.lng; // 발원지 경도 (업데이트됨)
    let exitedSeoul = false; // 서울 경계를 벗어났는지 여부
    let lastInsideLocation = null; // 서울 내 마지막 위치 정보

    // 풍향을 따라 서울 경계를 벗어날 때까지 추적
    for (let step = 0; step < maxSteps; step++) {
        // 풍향 방향으로 한 단계 이동
        currentLat += Math.cos(radians) * stepDistance; // 위도 변경
        currentLng += Math.sin(radians) * stepDistance; // 경도 변경

        // 현재 위치가 서울 내에 있는지 확인
        const location = findLocationByCoords(currentLng, currentLat);

        if (location.district) {
            // 아직 서울 내에 있음 - 계속 추적
            lastInsideLocation = location; // 마지막 서울 내 위치 저장
            originLat = currentLat;
            originLng = currentLng;
        } else {
            // 서울 경계를 벗어남 - 최종 발원지는 서울 외곽
            exitedSeoul = true;
            // 발원지 마커 위치는 서울 경계 바로 밖으로 설정
            originLat = currentLat;
            originLng = currentLng;
            break; // 추적 종료
        }
    }

    // 위도/경도를 화면 좌표(픽셀)로 변환
    const sensorPos = projection([sensor.lng, sensor.lat]); // 센서 위치
    let originPos = projection([originLng, originLat]); // 발원지 위치

    if (!sensorPos || !originPos) return; // 좌표 변환 실패 시 종료

    // 최종 발원지 라벨 생성 및 이동할 구 결정
    let originLabel; // 발원지 라벨 텍스트
    let targetDistrict = null; // 클릭 시 이동할 구
    let targetDong = null;    // 클릭 시 이동할 동

    if (exitedSeoul) {
        // 서울 외곽으로 추적됨 - 마지막으로 거쳐온 구 정보도 표시
        if (lastInsideLocation) {
            originLabel = `⚠ 추정 발원지: 서울 외곽 (${lastInsideLocation.district} 방면)`;
            targetDistrict = lastInsideLocation.district;
            targetDong = lastInsideLocation.dong;
        } else {
            originLabel = '⚠ 추정 발원지: 서울 외곽';
        }
    } else {
        // 서울 내에서 추적 종료 (maxSteps 도달)
        const finalLocation = findLocationByCoords(originLng, originLat);
        originLabel = `⚠ 추정 발원지: ${finalLocation.district}${finalLocation.dong ? ' ' + finalLocation.dong : ''} 방면`;
        targetDistrict = finalLocation.district;
        targetDong = finalLocation.dong;
    }

    // 마커 표시 거리 제한 (화면 내에 보이도록) - 스케일 적용
    // 발원지가 너무 멀면 화면 밖으로 나가므로 최대 거리를 제한합니다
    const maxDisplayDistance = 120 / scale; // 최대 표시 거리 (스케일에 맞게 조정)
    const dx = originPos[0] - sensorPos[0]; // X축 거리
    const dy = originPos[1] - sensorPos[1]; // Y축 거리
    const actualDistance = Math.sqrt(dx * dx + dy * dy); // 피타고라스 정리로 실제 거리 계산

    if (actualDistance > maxDisplayDistance) {
        // 거리가 너무 멀면 최대 거리로 제한 (비율 계산)
        const ratio = maxDisplayDistance / actualDistance;
        originPos = [
            sensorPos[0] + dx * ratio, // 제한된 X 좌표
            sensorPos[1] + dy * ratio  // 제한된 Y 좌표
        ];
    }

    // 클릭 시 해당 구/동으로 이동하는 핸들러
    // 발원지 마커를 클릭하면 해당 지역으로 지도가 이동합니다
    const handleOriginClick = targetDistrict ? function(event) {
        event.stopPropagation(); // 이벤트 버블링 방지 (부모 요소 클릭 이벤트 차단)

        // 이미 해당 위치에 있으면 이동하지 않음
        const alreadyAtDistrict = selectedDistrict === targetDistrict;
        const alreadyAtDong = !targetDong || selectedDong === targetDong ||
            (selectedDong && targetDong && (
                selectedDong.includes(targetDong.replace(/[0-9·]/g, '')) ||
                targetDong.includes(selectedDong.replace(/[0-9·]/g, ''))
            ));

        if (alreadyAtDistrict && alreadyAtDong) {
            console.log('🎯 발원지 클릭 - 이미 해당 위치에 있음');
            return; // 이미 해당 위치에 있으면 이동하지 않음
        }

        console.log('🎯 발원지 클릭 - 이동할 구:', targetDistrict, ', 동:', targetDong);
        navigateToDistrict(targetDistrict, targetDong); // 발원지로 이동
    } : null; // targetDistrict가 없으면 null (클릭 이벤트 없음)

    // 발원지 마커 먼저 그리기 (스케일 적용)
    // SVG circle 요소로 발원지를 표시합니다 (보라색 원)
    const markerRadius = 10 / scale; // 줌 레벨에 따라 크기 조정
    const originMarker = traceGroup.append('circle')
        .attr('class', 'origin-marker') // CSS 클래스
        .attr('cx', originPos[0]) // 중심 X 좌표
        .attr('cy', originPos[1]) // 중심 Y 좌표
        .attr('r', 0) // 초기 반지름 0 (애니메이션 시작)
        .attr('stroke-width', 2 / scale) // 테두리 두께
        .style('cursor', targetDistrict ? 'pointer' : 'default'); // 클릭 가능하면 손가락 커서

    // 클릭 이벤트는 transition 전에 추가 (애니메이션 전에 이벤트 등록)
    if (handleOriginClick) {
        originMarker.on('click', handleOriginClick);
    }

    // 애니메이션 적용 (0에서 시작해서 점점 커짐)
    originMarker.transition()
        .duration(400) // 0.4초
        .attr('r', markerRadius); // 최종 반지름

    // 라벨 배경 (가독성 향상) - 스케일 적용
    // 텍스트 뒤에 배경을 그려서 가독성을 높입니다
    const fontSize = 12 / scale; // 폰트 크기
    const labelWidth = (originLabel.length * 12 + 24) / scale; // 라벨 너비 (텍스트 길이에 비례)
    const labelHeight = 24 / scale; // 라벨 높이
    const labelY = originPos[1] - (38 / scale); // 라벨 Y 위치 (마커 위쪽)

    traceGroup.append('rect')
        .attr('class', 'origin-label-bg') // CSS 클래스
        .attr('x', originPos[0] - labelWidth / 2) // 중앙 정렬
        .attr('y', labelY)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 5 / scale) // 둥근 모서리 X
        .attr('ry', 5 / scale) // 둥근 모서리 Y
        .attr('fill', 'rgba(155, 89, 182, 0.95)') // 보라색 배경
        .attr('stroke', '#ffffff') // 흰색 테두리
        .attr('stroke-width', 1.5 / scale)
        .attr('opacity', 0) // 초기 투명도 (애니메이션 시작)
        .style('cursor', targetDistrict ? 'pointer' : 'default')
        .on('click', handleOriginClick) // 클릭 이벤트
        .transition()
        .duration(300) // 0.3초
        .delay(200) // 0.2초 지연 (마커 애니메이션 후)
        .attr('opacity', 1); // 최종 투명도

    // 라벨 텍스트 (예: "⚠ 추정 발원지: 서울 외곽 (강남구 방면)")
    traceGroup.append('text')
        .attr('class', 'origin-label') // CSS 클래스
        .attr('x', originPos[0]) // 중앙 정렬
        .attr('y', labelY + labelHeight / 2 + (1 / scale)) // 배경 중앙에 배치
        .attr('font-size', fontSize + 'px') // 폰트 크기
        .attr('opacity', 0) // 초기 투명도
        .style('cursor', targetDistrict ? 'pointer' : 'default')
        .style('pointer-events', 'all') // 클릭 이벤트 활성화
        .text(originLabel) // 텍스트 내용
        .on('click', handleOriginClick) // 클릭 이벤트
        .transition()
        .duration(300)
        .delay(200)
        .attr('opacity', 1); // 페이드인 애니메이션

    // 역추적선 그리기 (발원지 → 센서 방향) - 스케일 적용
    // 발원지에서 센서까지 점선을 그립니다
    const statusColor = sensorData.status === 'danger' ? '#e74c3c' : '#f39c12'; // 위험=빨강, 주의=주황
    const lineStrokeWidth = 2 / scale; // 선 두께
    const dashArray = `${8 / scale}, ${4 / scale}`; // 점선 패턴 (선 길이, 간격)

    traceGroup.append('line')
        .attr('class', `traceback-line status-${sensorData.status}`) // CSS 클래스
        .attr('x1', originPos[0]) // 시작점 X (발원지)
        .attr('y1', originPos[1]) // 시작점 Y (발원지)
        .attr('x2', originPos[0]) // 초기 끝점 X (시작점과 동일 - 애니메이션 시작)
        .attr('y2', originPos[1]) // 초기 끝점 Y (시작점과 동일)
        .attr('stroke-width', lineStrokeWidth)
        .attr('stroke-dasharray', dashArray) // 점선 스타일
        .transition()
        .duration(500) // 0.5초
        .delay(300) // 0.3초 지연 (라벨 애니메이션 후)
        .attr('x2', sensorPos[0]) // 최종 끝점 X (센서 위치)
        .attr('y2', sensorPos[1]); // 최종 끝점 Y (센서 위치) - 선이 그려지는 애니메이션

    // 화살표 (발원지 → 센서 방향으로 센서 쪽에 표시) - 스케일 적용
    // 역추적선의 방향을 명확히 하기 위해 화살표를 추가합니다
    const angle = Math.atan2(sensorPos[1] - originPos[1], sensorPos[0] - originPos[0]); // 각도 계산
    const arrowSize = 10 / scale; // 화살표 크기

    // 화살표를 센서 바로 앞에 위치시키기 (센서에서 떨어진 곳)
    const arrowDist = 15 / scale; // 센서로부터 거리
    const arrowX = sensorPos[0] - Math.cos(angle) * arrowDist; // 화살표 X 위치
    const arrowY = sensorPos[1] - Math.sin(angle) * arrowDist; // 화살표 Y 위치

    traceGroup.append('polygon') // 삼각형 모양 화살표
        .attr('points', `0,-${arrowSize/2} ${arrowSize},0 0,${arrowSize/2}`) // 삼각형 좌표
        .attr('fill', statusColor) // 화살표 색상 (위험=빨강, 주의=주황)
        .attr('opacity', 0) // 초기 투명도
        .attr('transform', `translate(${arrowX}, ${arrowY}) rotate(${angle * 180 / Math.PI})`) // 위치 및 회전
        .transition()
        .duration(300)
        .delay(700) // 0.7초 지연 (선 애니메이션 후)
        .attr('opacity', 0.9); // 페이드인
}

// 역추적선 숨기기
// 센서를 다시 클릭하거나 다른 센서를 선택하면 기존 역추적선을 제거합니다
function hideTraceback(traceGroup) {
    traceGroup.selectAll('*') // 모든 자식 요소 선택
        .transition()
        .duration(300) // 0.3초 페이드아웃
        .attr('opacity', 0) // 투명하게
        .remove(); // DOM에서 제거
}
