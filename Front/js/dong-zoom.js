// ===== dong-zoom.js =====
// 프로젝트 역할: 동(洞)을 클릭했을 때 줌인/줌아웃 애니메이션을 처리하는 파일
// 연결 파일:
//   - dong-overlay.js: 동 클릭 시 이 파일의 zoomIntoDongOverlay 함수 호출
//   - ui-info.js: 줌 애니메이션 완료 후 정보박스 업데이트
//   - location.js: 위치 안내 연출 표시
//   - main.js: 줌 상태(currentView) 관리

// 동 줌인 (오버레이 상태에서)
// 동을 클릭하면 해당 동으로 부드럽게 줌인합니다
function zoomIntoDongOverlay(dongFeature, currentScale) {
    selectedDong = dongFeature.properties.name; // 선택된 동 이름 저장

    // 줌 애니메이션을 위한 요소 선택
    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group'); // 지도 그룹
    const width = container.clientWidth || 800; // 컨테이너 너비
    const height = Math.max(container.clientHeight, 500); // 컨테이너 높이

    // 동의 경계 박스 계산
    const bounds = mapPath.bounds(dongFeature); // 동의 최소/최대 좌표
    const dx = bounds[1][0] - bounds[0][0]; // 너비
    const dy = bounds[1][1] - bounds[0][1]; // 높이
    const x = (bounds[0][0] + bounds[1][0]) / 2; // 중심 X
    const y = (bounds[0][1] + bounds[1][1]) / 2; // 중심 Y
    // 동 줌인 시 더 크게 확대 (화면에 꽉 차도록)
    const scale = Math.min(80, 0.92 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y]; // 중심으로 이동

    // 이미 dongZoom 상태면 먼저 모든 동 투명도 리셋
    // (다른 동이 선택되어 있었을 때 초기화)
    if (currentView === 'dongZoom') {
        g.selectAll('.dong-overlay-path').attr('fill', 'transparent'); // 투명하게
        g.selectAll('.dong-overlay-border, .dong-border').attr('opacity', 1); // 경계선 보이기
        g.selectAll('.dong-overlay-label').attr('opacity', 1); // 라벨 보이기
    }

    // 다른 동 페이드아웃 (선택된 동만 강조)
    g.selectAll('.dong-overlay-path')
        .filter(d => d !== dongFeature) // 선택된 동이 아닌 것들만
        .transition()
        .duration(300) // 0.3초
        .attr('fill', 'rgba(0, 0, 0, 0.5)'); // 어둡게

    // 다른 동의 경계선 흐리게
    g.selectAll('.dong-overlay-border')
        .transition()
        .duration(300)
        .attr('opacity', 0.3); // 투명도 30%

    // 다른 동의 라벨 숨기기
    g.selectAll('.dong-overlay-label')
        .filter(d => d !== dongFeature)
        .transition()
        .duration(300)
        .attr('opacity', 0); // 투명하게

    // 선택된 동 라벨 크기 조정 (더 크게)
    g.selectAll('.dong-overlay-label')
        .filter(d => d === dongFeature) // 선택된 동만
        .transition()
        .duration(500) // 0.5초
        .attr('font-size', `${35 / scale}px`) // 폰트 크기 증가
        .attr('opacity', 1); // 완전 불투명

    // 센서 마커 크기 조정 (줌 레벨에 맞게)
    g.selectAll('.sensor-overlay-marker')
        .transition()
        .duration(500)
        .attr('r', 5 / scale) // 반지름 조정
        .attr('stroke-width', 1 / scale); // 테두리 두께 조정

    // 줌인 애니메이션 (지도를 확대하고 이동)
    g.transition()
        .duration(600) // 0.6초
        .ease(d3.easeCubicInOut) // 부드러운 가속/감속
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            // 애니메이션 완료 후 실행
            currentView = 'dongZoom'; // 현재 뷰 상태 변경
            currentDongScale = scale; // 현재 줌 스케일 저장

            // d3.zoom 상태 동기화 (휠 줌 튕김 방지)
            // 마우스 휠 줌과 프로그래밍 줌을 일치시킵니다
            if (currentZoom) {
                const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                svg.call(currentZoom.transform, newTransform);
            }

            // 정보박스에 선택된 동 정보 표시
            showDongInfo(selectedDong);

            // 동 진입 연출 표시 (화면 중앙에 "강남구 역삼동" 같은 안내)
            const subtitle = pendingLocationSubtitle || '서울특별시';
            pendingLocationSubtitle = null; // 사용 후 초기화
            showLocationAnnounce(selectedDistrict, selectedDong, subtitle);
        });
}

// 줌아웃
// 뒤로가기 버튼을 누르거나 줌아웃할 때 실행되는 함수
function zoomOut() {
    if (currentView === 'city') return; // 이미 서울시 전체 뷰면 종료

    // 동 줌인 상태에서는 구 레벨로 돌아감
    if (currentView === 'dongZoom') {
        zoomOutToDong(); // 동 → 구
        return;
    }

    // 구 레벨(dong)에서는 서울시 전체로 돌아감
    document.getElementById('backButton').classList.remove('visible'); // 뒤로가기 버튼 숨김

    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');

    // 동 오버레이 페이드아웃 후 제거
    g.selectAll('.dong-overlay-group')
        .transition()
        .duration(300) // 0.3초
        .attr('opacity', 0) // 투명하게
        .on('end', function() {
            d3.select(this).remove(); // DOM에서 제거
        });

    // 다른 구들 페이드인 (서울시 전체 지도 복원)
    g.selectAll('.district-path') // 구 영역
        .transition()
        .duration(600)
        .attr('opacity', 1); // 불투명하게

    g.selectAll('.district-stroke') // 구 경계선
        .transition()
        .duration(600)
        .attr('opacity', 1);

    g.selectAll('.district-label') // 구 라벨
        .transition()
        .duration(600)
        .attr('opacity', 1);

    // 줌아웃 애니메이션 (서울시 전체로 복원)
    g.transition()
        .duration(750) // 0.75초
        .ease(d3.easeCubicInOut) // 부드러운 가속/감속
        .attr('transform', 'translate(0,0) scale(1)') // 원래 크기와 위치로
        .on('end', () => {
            // 애니메이션 완료 후 실행
            currentView = 'city'; // 현재 뷰 상태 변경
            selectedDistrict = null; // 선택된 구 초기화
            selectedDong = null; // 선택된 동 초기화

            // d3.zoom 상태 동기화
            if (currentZoom) {
                svg.call(currentZoom.transform, d3.zoomIdentity); // 줌 상태 초기화
            }

            // 풍향/풍속 애니메이션 다시 시작 (서울시 전체)
            const width = container.clientWidth || 800;
            const height = Math.max(container.clientHeight, 500);
            startWindAnimationForCity(g, width, height);

            // 서울시 전체 데이터 표시
            showSeoulTotalInfo();

            // 센서 토글 패널 다시 보이기
            const sensorPanel = document.getElementById('sensorTogglePanel');
            if (sensorPanel) sensorPanel.style.display = 'flex';

            // 활성화된 센서 레이어 다시 그리기
            redrawActiveSensorLayers();
        });
}

// 동 줌인 상태에서 구 레벨로 돌아가기
// 동 → 구 (한 단계 뒤로)
function zoomOutToDong() {
    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('.map-group');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // 선택된 구의 줌 스케일 계산
    const districtFeature = geoData.features.find(f => f.properties.name === selectedDistrict);
    if (!districtFeature) return; // 구 정보가 없으면 종료

    // 구 전체가 보이도록 줌 레벨 계산
    const bounds = mapPath.bounds(districtFeature);
    const dx = bounds[1][0] - bounds[0][0]; // 너비
    const dy = bounds[1][1] - bounds[0][1]; // 높이
    const x = (bounds[0][0] + bounds[1][0]) / 2; // 중심 X
    const y = (bounds[0][1] + bounds[1][1]) / 2; // 중심 Y
    // 화면에 꽉 차도록 확대 비율 (zoomIntoDistrict와 동일)
    const scale = Math.min(35, 0.92 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // 모든 동 오버레이 다시 보이게 (어두웠던 동들 복원)
    g.selectAll('.dong-overlay-path')
        .transition()
        .duration(400) // 0.4초
        .attr('fill', 'transparent'); // 투명하게

    // 동 경계선 복원
    g.selectAll('.dong-overlay-border')
        .transition()
        .duration(400)
        .attr('opacity', 1); // 불투명하게

    // 동 라벨 복원 및 크기 조정
    g.selectAll('.dong-overlay-label')
        .transition()
        .duration(400)
        .attr('opacity', 1) // 불투명하게
        .attr('font-size', function(d) {
            // 확대된 스케일에 맞게 폰트 크기 조정
            const baseSize = calculateFontSize(d, mapPath, d.properties.name, 15, 28);
            return (baseSize / scale) + 'px';
        });

    // 센서 마커 크기 복구 (줌 레벨에 맞게)
    g.selectAll('.sensor-overlay-marker')
        .transition()
        .duration(400)
        .attr('r', 5 / scale) // 반지름
        .attr('stroke-width', 1 / scale); // 테두리 두께

    // 줌 리셋 (구 레벨로)
    g.transition()
        .duration(600) // 0.6초
        .ease(d3.easeCubicInOut) // 부드러운 가속/감속
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${scale})`)
        .on('end', () => {
            // 애니메이션 완료 후 실행
            // 상태 업데이트
            currentView = 'dong'; // 현재 뷰 상태 변경 (동 → 구)
            selectedDong = null; // 선택된 동 초기화
            currentDistrictScale = scale; // 현재 줌 스케일 저장

            // d3.zoom 상태 동기화 (휠 줌 튕김 방지)
            if (currentZoom) {
                const newTransform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
                svg.call(currentZoom.transform, newTransform);
            }

            // 구 평균 데이터 표시
            showDistrictTotalInfo();
        });
}
