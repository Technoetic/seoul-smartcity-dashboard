// ===== sensor-markers.js =====
// 프로젝트 역할: 지도 위의 센서 마커들의 시각적 상태(색상, 커서 등)를 업데이트하는 파일
// 연결 파일:
//   - main.js: 센서 데이터 변경 시 이 파일의 함수를 호출
//   - sensor-data.js: 센서 상태(정상/주의/위험) 정보를 가져옴
//   - ui-traceback.js: 센서 상태 변경 시 역추적선을 초기화

// 센서 상태 시각적 업데이트
// 이 함수는 모든 센서 마커의 색상과 스타일을 최신 상태로 갱신합니다.
function updateSensorMarkers() {
    // 화면에 있는 모든 센서 마커를 하나씩 찾아서 업데이트합니다
    d3.selectAll('.sensor-marker').each(function() {
        const marker = d3.select(this); // 현재 센서 마커 선택
        const sensorId = marker.attr('data-sensor-id'); // 센서 ID 가져오기
        const statusClass = getSensorStatusClass(sensorId); // 센서 상태에 따른 CSS 클래스 가져오기

        // 기존 상태 클래스 제거 후 새 클래스 적용
        // 예: 'sensor-marker status-warning', 'sensor-marker status-danger' 등
        marker.attr('class', `sensor-marker ${statusClass}`);

        // 이상 센서는 클릭 가능 커서로 변경 (pointer), 정상 센서는 기본 커서(default)
        marker.style('cursor', getSensorStatus(sensorId) !== 'normal' ? 'pointer' : 'default');
    });

    // 역추적선 선택 해제 (센서 상태가 바뀌면 기존 역추적선은 무효가 됨)
    selectedSensorForTraceback = null; // 선택된 센서 초기화
    d3.selectAll('.traceback-group *').remove(); // 화면에서 역추적선 모두 제거
}
