// ===== replay-data.js =====
// 이 파일의 역할: 과거 데이터를 서버에서 불러오는 API 통신 담당
// - MySQL 데이터베이스에서 특정 날짜/시간의 센서 데이터 조회
// - 데이터 범위 메타데이터 조회 (DB에 저장된 데이터의 시작일/종료일)
// - 타임아웃, 요청 취소 등 에러 처리
// - 연결 파일: replay-mode.js (시간 컨트롤), replay-ui.js (데이터 화면 표시), config.js (API 설정)
// ================================

// Replay API 호출 함수 (MySQL sdot_nature_all)
// 이 함수가 하는 일: 특정 날짜와 시간의 센서 데이터를 서버에서 가져옴
async function fetchReplayFromApi(date, hour) {
    // 이전 요청 취소 (사용자가 빠르게 시간을 바꾸면 중복 요청 방지)
    if (replayApiConfig.currentController) {
        replayApiConfig.currentController.abort();
    }
    // 새로운 요청 컨트롤러 생성
    const controller = new AbortController();
    replayApiConfig.currentController = controller;
    // 타임아웃 설정 (일정 시간 초과하면 자동 취소)
    const timeoutId = setTimeout(() => controller.abort(), replayApiConfig.fetchTimeout);

    try {
        // API URL 구성 (예: /api/v1/replay?date=2025-01-15&hour=12)
        const url = `${REPLAY_API_BASE}/api/v1/replay?date=${date}&hour=${hour}`;
        console.log('Replay API 호출:', url);
        // 서버에 데이터 요청
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId); // 타임아웃 해제
        if (!response.ok) throw new Error(`HTTP ${response.status}`); // HTTP 에러 체크
        const result = await response.json(); // JSON 데이터 파싱
        if (replayApiConfig.currentController === controller) {
            replayApiConfig.currentController = null; // 현재 요청 완료
        }
        console.log(`Replay API 응답: ${result.record_count}건 (actual_hour: ${result.actual_hour})`);
        return result; // { data: [...], record_count: 100, actual_hour: 12 }
    } catch (error) {
        clearTimeout(timeoutId);
        if (replayApiConfig.currentController === controller) {
            replayApiConfig.currentController = null;
        }
        if (error.name === 'AbortError') {
            throw new Error('데이터 로드 시간 초과');
        }
        throw error; // 기타 에러는 그대로 전달
    }
}

// Replay 메타데이터 조회 (DB 데이터 범위)
// 이 함수가 하는 일: 서버 DB에 저장된 데이터의 시작 날짜와 종료 날짜를 가져옴
async function fetchReplayMetadata() {
    try {
        const response = await fetch(`${REPLAY_API_BASE}/api/v1/metadata`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json(); // { min_date: "2024-01-01", max_date: "2025-01-15", total_records: 1000000 }
        // 날짜 범위 업데이트
        if (data.min_date) replayApiConfig.dateRange.start = data.min_date;
        if (data.max_date) replayApiConfig.dateRange.end = data.max_date;
        replayApiConfig.metadataLoaded = true; // 메타데이터 로드 완료 플래그
        console.log('Replay 메타데이터:', data.min_date, '~', data.max_date, `(${data.total_records}건)`);
        return data;
    } catch (error) {
        console.error('메타데이터 로드 실패:', error);
        return null; // 실패 시 null 반환
    }
}

// 과거 데이터 로드 (MySQL sdot_nature_all API)
// 이 함수가 하는 일: 선택한 날짜/시간의 데이터를 로드하고 화면에 표시 (캐시 우선 사용)
async function loadReplayData() {
    if (!replayMode.date) return; // 날짜 선택 안됨
    if (replayMode.isLoading) return; // 중복 요청 방지 (이미 로딩 중)

    const status = document.getElementById('replayStatus'); // 상태 메시지 표시 영역
    const cacheKey = `${replayMode.date}_${replayMode.hour}`; // 캐시 키 (예: "2025-01-15_12")

    // 이미 캐시에 있으면 바로 적용 (API 호출 안함)
    if (replayMode.cachedData[cacheKey]) {
        status.textContent = `${replayMode.date} 데이터 (캐시)`;
        applyReplayData(); // 캐시된 데이터로 화면 업데이트
        return;
    }

    // 캐시에 없으면 서버에서 로드
    replayMode.isLoading = true; // 로딩 플래그 설정
    status.textContent = 'DB 데이터 로딩 중...';
    status.classList.add('active'); // 로딩 표시

    try {
        // API 호출
        const result = await fetchReplayFromApi(replayMode.date, replayMode.hour);

        // LRU 캐시에 저장 (다음에 빠르게 사용)
        addToReplayCache(cacheKey, result.data);

        const count = result.record_count || 0; // 데이터 개수
        const actualHour = result.actual_hour; // 실제 데이터 시간 (요청한 시간에 데이터 없으면 가까운 시간)

        // 상태 메시지 표시
        if (actualHour !== replayMode.hour && count > 0) {
            // 요청한 시간과 다른 시간의 데이터를 가져온 경우
            status.textContent = `${replayMode.date} ${String(actualHour).padStart(2,'0')}:00 데이터 사용 (${count}건)`;
        } else {
            status.textContent = `${replayMode.date} 데이터 로드 완료 (${count}건)`;
        }
        applyReplayData(); // 화면에 데이터 적용

        // 자동 재생 프리페치 (다음 시간 미리 로드하여 끊김 없는 재생)
        if (replayMode.isPlaying && replayMode.hour < 23) {
            const nextKey = `${replayMode.date}_${replayMode.hour + 1}`;
            if (!replayMode.cachedData[nextKey]) {
                // 다음 시간 데이터를 백그라운드에서 미리 로드
                fetchReplayFromApi(replayMode.date, replayMode.hour + 1).then(r => {
                    addToReplayCache(nextKey, r.data);
                }).catch(() => {}); // 에러는 무시 (프리페치는 옵션)
            }
        }

    } catch (error) {
        console.error('Replay 데이터 로드 실패:', error);
        // 에러 메시지 표시
        if (error.message.includes('시간 초과')) {
            status.textContent = '데이터 로드 시간 초과';
        } else {
            status.textContent = '데이터 서버에 연결할 수 없습니다';
        }
    } finally {
        replayMode.isLoading = false; // 로딩 완료
    }
}
