// ===== location.js =====
// 프로젝트 역할: 지역 진입 시 화면 중앙에 지역명을 표시하고, 발원지 클릭 시 해당 지역으로 이동하는 기능
// 연결 파일:
//   - dong-zoom.js: 줌 애니메이션 완료 후 이 파일의 showLocationAnnounce 함수 호출
//   - ui-traceback.js: 발원지 마커 클릭 시 이 파일의 navigateToDistrict 함수 호출
//   - main.js: 전체 지도 렌더링
//   - district-zoom.js: 구 줌인 애니메이션

// 지역 진입 연출 표시
// 구나 동으로 이동했을 때 화면 중앙에 "강남구 역삼동" 같은 안내를 표시합니다
function showLocationAnnounce(districtName, dongName = null, subtitle = null) {
    // 위치 안내 오버레이 요소들 가져오기
    const overlay = document.getElementById('locationAnnounce'); // 전체 오버레이
    const districtEl = document.getElementById('announceDistrict'); // 구 이름
    const dongEl = document.getElementById('announceDong'); // 동 이름
    const subtitleEl = document.getElementById('announceSubtitle'); // 부제목

    // 텍스트 설정
    districtEl.textContent = districtName; // 예: "강남구"
    dongEl.textContent = dongName || ''; // 예: "역삼동" (없으면 빈 문자열)
    subtitleEl.textContent = subtitle || '추정 발원지 도착'; // 부제목 (기본값)

    // 동 이름이 없으면 숨김 (구만 표시할 때)
    dongEl.style.display = dongName ? 'block' : 'none';

    // 애니메이션 리셋 (이전 애니메이션 제거)
    districtEl.style.animation = 'none';
    dongEl.style.animation = 'none';
    subtitleEl.style.animation = 'none';

    // 리플로우 강제 (브라우저가 스타일 변경을 즉시 적용하도록)
    void districtEl.offsetWidth;

    // 애니메이션 재시작
    districtEl.style.animation = 'locationZoomIn 0.6s ease-out forwards'; // 구 이름 줌인
    dongEl.style.animation = 'locationFadeIn 0.5s ease-out 0.3s forwards'; // 동 이름 페이드인 (0.3초 지연)
    subtitleEl.style.animation = 'locationFadeIn 0.5s ease-out 0.5s forwards'; // 부제목 페이드인 (0.5초 지연)

    // 표시
    overlay.classList.add('visible'); // CSS로 오버레이 표시

    // 2.5초 후 페이드아웃
    setTimeout(() => {
        overlay.classList.remove('visible'); // 오버레이 숨김
    }, 2500);
}

// 특정 구/동으로 이동 (발원지 클릭 시)
// 역추적선의 발원지를 클릭했을 때 해당 지역으로 부드럽게 이동합니다
function navigateToDistrict(districtName, dongName = null) {
    // 역추적선 숨기기 (이동하면 기존 역추적선은 무의미)
    selectedSensorForTraceback = null;
    d3.selectAll('.traceback-group *').remove(); // 역추적선 제거

    // 바람 애니메이션 중지 (화면 전환 중 혼란 방지)
    stopWindAnimation();

    document.getElementById('backButton').classList.remove('visible'); // 뒤로가기 버튼 숨김

    // 지도 요소들 가져오기
    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('g'); // 지도 그룹
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // 1단계: 현재 동 지도를 축소하면서 빠져나오기 (슈우욱~)
    // 현재 보고 있던 지도를 작게 축소하면서 화면 중앙으로 모읍니다
    g.transition()
        .duration(700) // 0.7초
        .ease(d3.easeCubicInOut) // 부드러운 가속/감속
        .attr('transform', `translate(${width/2}, ${height/2}) scale(0.1)`) // 화면 중앙으로 작게 축소
        .on('end', () => {
            // 애니메이션 완료 후 실행

            // 전체 지도 렌더링 (새로운 지도로 교체)
            renderMap();
            selectedDong = null; // 선택된 동 초기화

            // 새 지도는 처음에 축소 상태에서 시작
            const newSvg = d3.select('#seoulMap svg');
            const newG = newSvg.select('.map-group');

            newG.attr('transform', `translate(${width/2}, ${height/2}) scale(0.1)`); // 작은 상태에서 시작

            // 전체 지도가 펼쳐지는 애니메이션
            newG.transition()
                .duration(600) // 0.6초
                .ease(d3.easeCubicOut) // 감속
                .attr('transform', 'translate(0,0) scale(1)') // 원래 크기로 펼쳐짐
                .on('end', () => {
                    // 애니메이션 완료 후 실행

                    // 2단계: 해당 구로 줌인 (슈우욱~)
                    setTimeout(() => {
                        // 목표 구의 지도 데이터 찾기
                        const targetFeature = geoData.features.find(f => f.properties.name === districtName);
                        if (!targetFeature) return; // 구를 찾지 못하면 종료

                        // 목표 구의 DOM 요소 찾기
                        const targetElement = document.querySelector(`.district-path[data-district="${districtName}"]`);
                        if (!targetElement) return; // 요소를 찾지 못하면 종료

                        selectedDistrict = districtName; // 선택된 구 저장
                        // 발원지 이동 시에는 특별 자막 표시
                        pendingLocationSubtitle = '추정 발원지 도착';

                        // 동 정보가 있으면 구 줌인 후 동으로 이동 예약
                        if (dongName) {
                            pendingDongNavigation = dongName; // 동 이동 예약 (dong-overlay.js에서 처리)
                        }

                        zoomIntoDistrict(targetElement, targetFeature); // 구로 줌인
                    }, 200); // 0.2초 지연
                });
        });
}
