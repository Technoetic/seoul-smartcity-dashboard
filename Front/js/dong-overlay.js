// ===== dong-overlay.js =====
// 프로젝트 역할: 특정 구를 클릭했을 때 그 구의 동(洞) 경계선들을 지도 위에 오버레이로 표시하는 파일
// 연결 파일:
//   - district-zoom.js: 구 줌인 시 이 파일의 addDongOverlay 함수 호출
//   - dong-markers.js: 동 오버레이 위에 센서 마커 배치
//   - dong-zoom.js: 동 클릭 시 줌 애니메이션 실행
//   - location.js: 발원지 클릭 시 특정 동으로 자동 이동

// 동 경계선 오버레이 추가 함수
// 구를 클릭하면 그 구의 모든 동(洞) 경계선을 그리고, 센서 마커를 배치합니다
function addDongOverlay(g, districtFeature, scale) {
    if (!dongGeoData) return; // 동 지도 데이터가 없으면 종료

    const districtName = districtFeature.properties.name; // 구 이름 (예: "강남구")
    initDongDataForDistrict(districtName); // 해당 구의 동 데이터 초기화

    // 해당 구의 행정구역 코드로 동 목록 필터링
    const code = districtCodes[districtName]; // 구 코드 (예: "11680")
    const dongFeatures = dongGeoData.features.filter(f =>
        f.properties.code && f.properties.code.startsWith(code) // 코드가 일치하는 동만 선택
    );

    if (dongFeatures.length === 0) return; // 동이 없으면 종료

    // 기존 오버레이 제거 (중복 방지)
    g.selectAll('.dong-overlay-group').remove();

    // 오버레이 그룹 생성 (동 경계선, 센서, 라벨 등을 담는 그룹)
    const dongGroup = g.append('g').attr('class', 'dong-overlay-group');

    // 1. 전체 화면 배경 (고급스러운 인디고)
    // 선택된 구 외의 영역을 어둡게 처리하기 위한 배경
    const container = document.getElementById('seoulMap');
    const viewWidth = container.clientWidth || 800; // 지도 컨테이너 너비
    const viewHeight = Math.max(container.clientHeight, 500); // 지도 컨테이너 높이

    // 현재 transform을 고려하여 화면 전체를 덮는 배경
    const bounds = mapPath.bounds(districtFeature); // 구의 경계 박스
    const cx = (bounds[0][0] + bounds[1][0]) / 2; // 중심 X
    const cy = (bounds[0][1] + bounds[1][1]) / 2; // 중심 Y

    // 매우 큰 어두운 배경 사각형 (화면 전체를 덮음)
    dongGroup.append('rect')
        .attr('class', 'dong-background')
        .attr('x', cx - (viewWidth / scale) * 5) // 중심에서 왼쪽으로 5배 확장
        .attr('y', cy - (viewHeight / scale) * 5) // 중심에서 위쪽으로 5배 확장
        .attr('width', (viewWidth / scale) * 10) // 너비 10배
        .attr('height', (viewHeight / scale) * 10) // 높이 10배
        .attr('fill', 'rgba(15, 23, 42, 0.78)') // 어두운 인디고색 (반투명)
        .attr('pointer-events', 'none'); // 클릭 이벤트 무시

    // 2. 동마다 clipPath 생성 (구 경계선과 동일한 방식)
    // clipPath: SVG 요소를 특정 영역으로 자르는 기능 (동 경계선을 벗어나지 않도록)
    const defs = d3.select('#seoulMap svg defs'); // SVG의 <defs> 영역
    dongFeatures.forEach((d, i) => {
        // 기존 clipPath 제거 후 재생성 (중복 방지)
        defs.select(`#clip-dong-${districtName}-${i}`).remove();
        defs.append('clipPath')
            .attr('id', `clip-dong-${districtName}-${i}`) // 각 동마다 고유 ID
            .append('path')
            .attr('d', mapPath(d)); // 동 경계선 경로
    });

    // 3. 동 배경 (동 영역 채움) - 두근 효과가 적용될 레이어
    // 마우스를 올렸을 때 "두근!" 하고 커지는 효과를 위한 레이어
    dongGroup.selectAll('path.dong-fill')
        .data(dongFeatures) // 동 목록 데이터 바인딩
        .enter() // 새로운 데이터에 대해 요소 생성
        .append('path')
        .attr('class', 'dong-fill')
        .attr('data-dong', d => d.properties.name) // 동 이름 저장 (나중에 찾기 위함)
        .attr('d', mapPath) // 동 경계선 경로
        .attr('fill', '#1a2744') // 어두운 파란색 배경
        .attr('stroke', 'none') // 테두리 없음
        .attr('pointer-events', 'none') // 클릭 이벤트 무시 (호버 영역은 별도)
        .style('transform-origin', 'center') // 두근 효과의 중심점
        .style('transform-box', 'fill-box'); // 변형 기준 박스

    // 구 평균 온도 가져오기 (동별 데이터가 없을 때 fallback)
    // 동별로 온도가 없으면 구 전체 평균 온도를 사용합니다
    const districtApiData = apiDataCache.byDistrict ? apiDataCache.byDistrict[districtName] : null;
    const districtAvgTemp = districtApiData?.avgTemp; // 구 평균 온도

    // 디버깅 로그 (개발 중 데이터 확인용)
    console.log('🌡️ 동 오버레이 온도 데이터:', {
        districtName,
        districtAvgTemp,
        apiDataCache: apiDataCache.byDistrict ? Object.keys(apiDataCache.byDistrict) : 'empty',
        dongDataKeys: Object.keys(dongData).filter(k => k.startsWith(districtName))
    });

    // 동별 온도 가져오기 (없으면 구 평균 사용)
    // 각 동의 온도를 가져오는 헬퍼 함수
    function getDongTemp(dongName) {
        const key = `${districtName}_${dongName}`; // 예: "강남구_역삼동"
        const dongTemp = dongData[key]?.temp;
        if (dongTemp !== null && dongTemp !== undefined && !isNaN(dongTemp)) {
            return dongTemp; // 동별 온도가 있으면 반환
        }
        // 동별 온도가 없으면 구 평균 온도 사용 (fallback)
        return districtAvgTemp;
    }

    // 5. 동 경계선 (온도 기반 색상, clipPath로 내부에만 표시 - 구 경계선과 동일)
    // 각 동의 온도에 따라 경계선 색상이 변합니다 (파랑=추움, 빨강=더움)
    dongGroup.selectAll('path.dong-overlay-border')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', d => {
            const temp = getDongTemp(d.properties.name); // 동의 온도
            return `dong-overlay-border dong-stroke ${getTempLevel(temp)}`; // CSS 클래스 (온도 레벨)
        })
        .attr('d', mapPath) // 동 경계선 경로
        .attr('data-dong', d => d.properties.name)
        .attr('fill', 'none') // 채우기 없음 (테두리만)
        .attr('stroke', d => {
            const temp = getDongTemp(d.properties.name);
            return getTempColor(temp); // 온도에 따른 색상 (파랑~빨강 그라데이션)
        })
        .attr('stroke-width', 2.5) // 테두리 두께
        .attr('clip-path', (d, i) => `url(#clip-dong-${districtName}-${i})`) // clipPath 적용
        .attr('pointer-events', 'none') // 클릭 이벤트 무시
        .style('filter', d => {
            const temp = getDongTemp(d.properties.name);
            return getTempGlow(temp); // 온도에 따른 글로우 효과
        })
        .attr('opacity', 0) // 초기 투명도 (애니메이션 시작)
        .transition()
        .duration(400) // 0.4초
        .attr('opacity', 1); // 페이드인

    // 6. 동 분리선 (얇은 어두운 선 - 경계 구분용)
    // 동과 동 사이의 경계를 명확히 구분하기 위한 얇은 선
    dongGroup.selectAll('path.dong-border')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', 'dong-border')
        .attr('d', mapPath) // 동 경계선 경로
        .attr('fill', 'none') // 채우기 없음
        .attr('stroke', '#0d1525') // 매우 어두운 회색
        .attr('stroke-width', 0.8) // 얇은 선
        .attr('pointer-events', 'none') // 클릭 이벤트 무시
        .attr('opacity', 0) // 초기 투명도
        .transition()
        .duration(400) // 0.4초
        .attr('opacity', 1); // 페이드인

    // 7. 풍향/풍속 애니메이션
    // 바람의 방향과 속도를 시각적으로 표시하는 애니메이션을 시작합니다
    startWindAnimationForOverlay(dongGroup, districtFeature, scale, viewWidth, viewHeight);

    // 8. 동 호버 영역 (센서 마커보다 먼저 배치하여 센서 마커가 위에 오도록)
    // 투명한 영역을 만들어서 마우스 이벤트를 받습니다
    dongGroup.selectAll('path.dong-overlay-path')
        .data(dongFeatures)
        .enter()
        .append('path')
        .attr('class', 'dong-overlay-path')
        .attr('d', mapPath) // 동 경계선 경로
        .attr('data-dong', d => d.properties.name)
        .attr('fill', 'transparent') // 투명 (보이지 않지만 클릭/호버 가능)
        .attr('stroke', 'none')
        .attr('cursor', 'pointer') // 손가락 커서
        .style('transform-origin', 'center')
        .style('transform-box', 'fill-box')
        .on('mouseenter', function(event, d) {
            // 마우스를 동 위에 올렸을 때
            // 동 줌인 상태에서는 hover 효과 무시
            if (currentView === 'dongZoom') return;

            // 해당 동의 dong-fill 요소에 두근 효과 적용
            const dongName = d.properties.name;
            const fillElement = dongGroup.select(`.dong-fill[data-dong="${dongName}"]`).node();
            if (fillElement) {
                triggerHoverPulse(fillElement); // 두근! 효과
            }
            showDongInfo(dongName); // 정보박스에 동 정보 표시
        })
        .on('mouseleave', function(event, d) {
            // 마우스가 동을 벗어났을 때
            // 동 줌인 상태에서는 hover 효과 무시
            if (currentView === 'dongZoom') return;

            // 해당 동의 dong-fill 요소 효과 리셋
            const dongName = d.properties.name;
            const fillElement = dongGroup.select(`.dong-fill[data-dong="${dongName}"]`).node();
            if (fillElement) {
                resetHoverPulse(fillElement); // 두근 효과 해제
            }
            showDistrictTotalInfo(); // 구 전체 정보 표시
        })
        .on('click', function(event, d) {
            // 동을 클릭했을 때
            event.stopPropagation(); // 이벤트 버블링 방지
            // 동 줌인 상태에서 다른 동 클릭 시에도 이동 허용
            zoomIntoDongOverlay(d, scale); // 동으로 줌인
        });

    // 10. 동 라벨 (가장 위에 표시)
    // 각 동의 중심에 동 이름을 표시합니다 (예: "역삼동", "서초동" 등)
    dongGroup.selectAll('text.dong-overlay-label')
        .data(dongFeatures)
        .enter()
        .append('text')
        .attr('class', 'dong-overlay-label')
        .attr('x', d => mapPath.centroid(d)[0]) // 동의 중심점 X 좌표
        .attr('y', d => mapPath.centroid(d)[1]) // 동의 중심점 Y 좌표
        .attr('text-anchor', 'middle') // 가운데 정렬
        .attr('dominant-baseline', 'middle') // 세로 가운데 정렬
        .attr('fill', '#ffffff') // 흰색 텍스트
        .attr('font-size', d => {
            // 동의 크기에 따라 폰트 크기 자동 조정 (작은 동은 작은 글씨)
            const baseSize = calculateFontSize(d, mapPath, d.properties.name, 12, 24);
            return (baseSize / scale) + 'px'; // 줌 레벨에 맞게 조정
        })
        .attr('font-weight', 'bold') // 굵은 글씨
        .attr('pointer-events', 'none') // 클릭 이벤트 무시 (텍스트는 클릭 안됨)
        .style('text-shadow', `0 0 ${3/scale}px #000, 0 0 ${6/scale}px #000`) // 검은색 그림자 (가독성)
        .text(d => d.properties.name) // 동 이름
        .attr('opacity', 0) // 초기 투명도
        .transition()
        .duration(400) // 0.4초
        .delay(200) // 0.2초 지연
        .attr('opacity', 1); // 페이드인

    // 11. 센서 마커 (동 호버 영역, 라벨 위에 배치하여 마우스 이벤트가 센서에 도달하도록)
    // dong-markers.js 파일의 함수를 호출하여 센서 마커를 배치합니다
    addSensorMarkersToOverlay(dongGroup, districtName, dongFeatures, scale);

    // 예약된 동으로 자동 이동 (발원지 클릭 시)
    // 역추적선에서 발원지를 클릭했을 때 해당 동으로 자동 이동하는 기능
    if (pendingDongNavigation) {
        const targetDongName = pendingDongNavigation; // 이동할 동 이름
        pendingDongNavigation = null; // 초기화 (중복 실행 방지)

        console.log('📍 동 자동 이동 예약됨:', targetDongName);
        console.log('📍 현재 구의 동 목록:', dongFeatures.map(f => f.properties.name));

        // 동 오버레이 로딩 완료 후 해당 동으로 이동
        setTimeout(() => {
            // 동 이름으로 feature 찾기 (다양한 매칭 방식 지원)
            // API 동 이름과 GeoJSON 동 이름이 다를 수 있어서 유연하게 매칭
            const normalizedTarget = targetDongName.replace(/[0-9·\s-]/g, ''); // 숫자, 점, 공백, 하이픈 제거

            const targetDongFeature = dongFeatures.find(f => {
                const fName = f.properties.name;
                const normalizedFName = fName.replace(/[0-9·\s-]/g, '');

                // 정확한 매칭
                if (fName === targetDongName) return true;
                // 포함 매칭 (예: "역삼동" ⊆ "역삼1동")
                if (fName.includes(targetDongName) || targetDongName.includes(fName)) return true;
                // 정규화된 이름 매칭
                if (normalizedFName === normalizedTarget) return true;
                if (normalizedFName.includes(normalizedTarget) || normalizedTarget.includes(normalizedFName)) return true;

                return false;
            });

            if (targetDongFeature) {
                // 매칭 성공 - 해당 동으로 이동
                console.log('🎯 동으로 자동 이동:', targetDongName, '→', targetDongFeature.properties.name);
                zoomIntoDongOverlay(targetDongFeature, scale);
            } else {
                // 매칭 실패
                console.log('⚠ 동을 찾을 수 없음:', targetDongName);
                // 매칭 실패 시 첫 번째 동으로 이동 (fallback)
                if (dongFeatures.length > 0) {
                    console.log('🔄 첫 번째 동으로 대체 이동:', dongFeatures[0].properties.name);
                    zoomIntoDongOverlay(dongFeatures[0], scale);
                }
            }
        }, 800); // 동 오버레이 애니메이션 완료 후 (0.8초)
    }
}

