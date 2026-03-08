// ===== map.js =====
// 역할: D3.js를 사용하여 서울시 지도를 그리고 색상을 업데이트하는 파일
// 연결: init.js에서 renderMap() 호출, api.js에서 updateMapColorsFromApi() 호출
// 기능: 지도 렌더링, 온도에 따른 지역 색상 변경, 센서 마커 표시

// map.js - D3 지도 렌더링

// 지도 색상 업데이트 (API 데이터 기반 - 온도 기준)
// 이 함수는 실시간 온도 데이터에 따라 지도의 각 구/동 색상을 변경합니다.
// 파란색(추움) → 초록색(적정) → 노란색(더움) → 빨간색(매우 더움)
function updateMapColorsFromApi() {
    if (currentView === 'city') {
        // 서울시 전체 뷰: 각 구의 색상을 온도에 따라 업데이트
        d3.selectAll('.district-stroke').each(function() {
            const el = d3.select(this);
            const name = el.attr('data-district');  // 구 이름 가져오기
            const apiData = apiDataCache.byDistrict[name];  // 해당 구의 API 데이터

            // 온도 기반 색상 레벨 결정 (데이터 없으면 회색)
            let level = 'level-unknown';  // 기본값: 데이터 없음
            if (apiData && apiData.avgTemp !== null && !isNaN(apiData.avgTemp)) {
                const temp = apiData.avgTemp;
                // 온도 범위별 색상 레벨 분류
                if (temp < 0) level = 'level-cold';        // 0도 미만: 파란색
                else if (temp < 10) level = 'level-cool';  // 0-10도: 하늘색
                else if (temp < 25) level = 'level-good';  // 10-25도: 초록색 (적정)
                else if (temp < 35) level = 'level-bad';   // 25-35도: 주황색
                else level = 'level-danger';               // 35도 이상: 빨간색
            }
            el.attr('class', `district-stroke ${level}`);  // CSS 클래스 적용
        });
    } else if (selectedDistrict) {
        // 구 상세 뷰: 각 동의 색상을 온도에 따라 업데이트
        // 구 평균 온도 가져오기 (동별 데이터가 없을 때 대체값으로 사용)
        const districtApiData = apiDataCache.byDistrict ? apiDataCache.byDistrict[selectedDistrict] : null;
        const districtAvgTemp = districtApiData?.avgTemp;

        d3.selectAll('.dong-stroke').each(function() {
            const el = d3.select(this);
            const dongName = el.attr('data-dong');  // 동 이름
            const key = `${selectedDistrict}_${dongName}`;
            const data = dongData[key];  // 동별 데이터

            // 동별 온도가 있으면 사용, 없으면 구 평균 온도 사용
            let temp = (data && data.temp !== null) ? data.temp : districtAvgTemp;

            // 온도에 따른 색상과 발광 효과 결정
            let level = 'level-unknown';
            let strokeColor = '#7f8c8d';  // 기본 색상 (회색)
            let glowFilter = 'drop-shadow(0 0 2px rgba(127, 140, 141, 0.5))';  // 기본 발광

            if (temp !== null && temp !== undefined && !isNaN(temp)) {
                // 온도 범위별 색상과 발광 효과 설정
                if (temp < 0) {
                    level = 'level-cold';
                    strokeColor = '#3498db';  // 파란색
                    glowFilter = 'drop-shadow(0 0 3px rgba(52, 152, 219, 0.8))';
                } else if (temp < 10) {
                    level = 'level-cool';
                    strokeColor = '#00d9ff';  // 하늘색
                    glowFilter = 'drop-shadow(0 0 3px rgba(0, 217, 255, 0.6))';
                } else if (temp < 25) {
                    level = 'level-good';
                    strokeColor = '#2ecc71';  // 초록색
                    glowFilter = 'drop-shadow(0 0 3px rgba(46, 204, 113, 0.6))';
                } else if (temp < 35) {
                    level = 'level-bad';
                    strokeColor = '#f39c12';  // 주황색
                    glowFilter = 'drop-shadow(0 0 5px rgba(243, 156, 18, 0.7))';
                } else {
                    level = 'level-danger';
                    strokeColor = '#e74c3c';  // 빨간색
                    glowFilter = 'drop-shadow(0 0 6px rgba(231, 76, 60, 0.8))';
                }
            }

            // dong-overlay-border 클래스 보존 (기존 클래스 유지)
            const isOverlay = el.classed('dong-overlay-border');
            el.attr('class', `dong-stroke ${level}${isOverlay ? ' dong-overlay-border' : ''}`);

            // 직접 stroke 색상과 glow 효과 적용 (동적으로 색상 변경)
            el.attr('stroke', strokeColor);
            el.style('filter', glowFilter);
        });
    }

    // 센서 마커 색상도 함께 업데이트
    updateSensorMarkers();
}

// 지도 렌더링
// 이 함수는 D3.js를 사용하여 서울시 지도를 화면에 그립니다.
function renderMap() {
    // GeoJSON 데이터가 없으면 에러 표시
    if (!geoData || !geoData.features) {
        console.error('GeoJSON 데이터가 없습니다');
        document.getElementById('seoulMap').innerHTML = '<div class="loading"><span>지도 데이터 로드 실패</span></div>';
        return;
    }

    const container = document.getElementById('seoulMap');
    container.innerHTML = '';  // 기존 내용 지우기

    // SVG 캔버스 크기 설정
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // D3로 SVG 요소 생성
    mapSvg = d3.select('#seoulMap')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // clipPath 정의를 위한 defs 생성 (구 내부에만 색상이 칠해지도록)
    const defs = mapSvg.append('defs');

    // 지도를 담을 그룹 생성 (줌/이동 시 이 그룹을 변환)
    const g = mapSvg.append('g').attr('class', 'map-group');

    // 지도 투영법 설정 (위경도 좌표를 화면 픽셀로 변환)
    mapProjection = d3.geoMercator()
        .center([126.985, 37.56])  // 서울시청 좌표
        .scale(Math.min(width, height) * 155)  // 확대 배율
        .translate([width / 2, height / 2]);   // 중앙 배치

    // 경로 생성기 (GeoJSON을 SVG path로 변환)
    mapPath = d3.geoPath().projection(mapProjection);

    // 각 구마다 clipPath 생성 (테두리가 구 경계를 넘지 않도록)
    geoData.features.forEach((d, i) => {
        defs.append('clipPath')
            .attr('id', `clip-district-${i}`)
            .append('path')
            .attr('d', mapPath(d));  // 구 경계선 path
    });

    // 1. 먼저 fill 레이어 (배경)
    g.selectAll('path.district-path')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', 'district-path')
        .attr('d', mapPath)
        .attr('data-district', d => d.properties.name)
        .on('mouseenter', throttle(function(event, d) { handleDistrictHover(event, d); }, 100))
        .on('mouseleave', throttle(function(event, d) { handleDistrictLeave(event, d); }, 100))
        .on('click', handleDistrictClick);

    // 2. stroke 레이어 (clipPath로 내부에만 테두리 표시)
    g.selectAll('path.district-stroke')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', d => {
            const apiData = apiDataCache.byDistrict[d.properties.name];
            const temp = apiData?.avgTemp;
            return `district-stroke ${getTempLevel(temp)}`;
        })
        .attr('d', mapPath)
        .attr('data-district', d => d.properties.name)
        .attr('clip-path', (d, i) => `url(#clip-district-${i})`);

    // 3. 구분선 레이어 (지역 경계를 검정색으로 구분)
    g.selectAll('path.district-border')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr('class', 'district-border')
        .attr('d', mapPath)
        .attr('fill', 'none')
        .attr('stroke', '#0a0f1a')
        .attr('stroke-width', 1.5)
        .attr('pointer-events', 'none');

    // 4. 라벨 (지역 크기에 맞게 폰트 크기 조절)
    // 특정 구 라벨 위치 보정값
    const labelOffsets = {
        "종로구": { x: 0, y: 25 },
        "성북구": { x: 0, y: 15 },
        "강북구": { x: -10, y: 0 },
        "노원구": { x: 0, y: 12 },
        "서대문구": { x: -10, y: 0 },
        "양천구": { x: 0, y: 10 },
        "구로구": { x: -10, y: 0 },
        "강남구": { x: -15, y: 0 }
    };

    g.selectAll('text.district-label')
        .data(geoData.features)
        .enter()
        .append('text')
        .attr('class', 'district-label')
        .attr('x', d => mapPath.centroid(d)[0] + (labelOffsets[d.properties.name]?.x || 0))
        .attr('y', d => mapPath.centroid(d)[1] + (labelOffsets[d.properties.name]?.y || 0))
        .attr('font-size', d => calculateFontSize(d, mapPath, d.properties.name, 8, 13) + 'px')
        .text(d => d.properties.name);

    currentZoom = d3.zoom()
        .scaleExtent([1, 100])
        .on('zoom', (event) => g.attr('transform', event.transform));

    mapSvg.call(currentZoom);
    mapSvg.on('dblclick.zoom', null);

    // 서울시 전체 지도에도 풍향/풍속 애니메이션 추가
    startWindAnimationForCity(g, width, height);

    currentView = 'city';

    // 서울시 전체 데이터 표시
    showSeoulTotalInfo();
}
