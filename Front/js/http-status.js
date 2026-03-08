// ===== http-status.js =====
// 이 파일의 역할: 서울 공공데이터 API 서버의 상태와 응답 속도를 모니터링
// - API 서버에 테스트 요청을 보내서 정상 작동 여부 확인
// - 응답 시간(latency) 측정
// - 상태에 따라 화면에 표시 (정상, 느림, 에러, 오프라인)
// - 연결 파일: config.js (API 설정), data.js (실제 데이터 요청)
// ================================

// HTTP 상태 확인
// 이 함수가 하는 일: 서울시 API 서버에 테스트 요청을 보내서 상태와 응답 속도를 확인
async function checkHttpStatus() {
    // 화면에 표시할 요소들
    const httpStatusEl = document.getElementById('httpStatus'); // 상태 박스 (색상 변경)
    const httpStatusText = document.getElementById('httpStatusText'); // 상태 텍스트 (OK, SLOW, ERROR 등)
    const httpLatency = document.getElementById('httpLatency'); // 응답 시간 표시 (ms)

    // 테스트 요청 URL (FastAPI 프록시의 헬스 체크 엔드포인트 사용)
    const testUrl = `${REPLAY_API_BASE}/health`;
    const startTime = performance.now(); // 요청 시작 시간 기록

    try {
        // API 서버에 요청
        const response = await fetch(testUrl, {
            method: 'GET',
            cache: 'no-cache' // 캐시 사용 안함 (실제 응답 속도 측정)
        });

        const endTime = performance.now(); // 응답 받은 시간 기록
        const latency = Math.round(endTime - startTime); // 응답 시간 계산 (밀리초)

        if (response.ok) {
            // HTTP 200 OK
            const data = await response.json(); // JSON 데이터 파싱
            if (data.status === 'OK') {
                // 정상 응답 (서버가 올바르게 작동 중)
                httpStatusEl.className = 'http-status ok'; // 초록색 표시
                httpStatusText.textContent = `HTTP ${response.status} OK`;
                httpLatency.textContent = `(${latency}ms)`; // 응답 시간 표시

                // 응답 속도에 따른 상태 표시
                if (latency > 2000) {
                    // 2초 이상이면 느림 표시
                    httpStatusEl.className = 'http-status slow'; // 노란색 표시
                    httpStatusText.textContent = `HTTP ${response.status} SLOW`;
                }
            } else {
                // API 에러 응답
                httpStatusEl.className = 'http-status error'; // 빨간색 표시
                httpStatusText.textContent = `API ERROR`; // 에러 표시
                httpLatency.textContent = `(${latency}ms)`;
            }
        } else {
            // HTTP 에러 (404, 500 등)
            httpStatusEl.className = 'http-status error';
            httpStatusText.textContent = `HTTP ${response.status}`; // HTTP 상태 코드 표시
            httpLatency.textContent = `ERROR`;
        }
    } catch (error) {
        // 네트워크 에러 (서버 연결 실패, 타임아웃 등)
        httpStatusEl.className = 'http-status error';
        httpStatusText.textContent = 'OFFLINE'; // 오프라인 표시
        httpLatency.textContent = '(연결 실패)';
    }
}
