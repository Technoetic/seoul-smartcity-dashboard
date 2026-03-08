// ===== replay-mode.js =====
// 이 파일의 역할: 과거 데이터 재생(리플레이) 모드의 시간 컨트롤 담당
// - 리플레이 모드 켜기/끄기
// - 날짜 선택, 시간 슬라이더 조작
// - 자동 재생 (시간순으로 데이터를 연속 재생)
// - 이전/다음 시간 버튼 기능
// - 연결 파일: replay-data.js (데이터 로드), replay-ui.js (화면 업데이트), data.js (실시간 데이터)
// ================================

// LRU 캐시 관리 헬퍼
// 이 함수가 하는 일: 최근에 로드한 데이터를 메모리에 저장 (48시간분까지), 오래된 데이터는 자동 삭제
function addToReplayCache(cacheKey, data) {
    // LRU (Least Recently Used): 가장 오래 전에 사용한 데이터를 먼저 삭제
    if (replayMode.cachedKeys.length >= 48) {
        // 48개를 초과하면 가장 오래된 데이터 삭제
        const oldKey = replayMode.cachedKeys.shift(); // 배열 첫 번째 요소 제거
        delete replayMode.cachedData[oldKey]; // 원본 데이터 삭제
        delete replayMode.processedCache[oldKey]; // 처리된 데이터 삭제
    }
    // 새 데이터 추가
    replayMode.cachedKeys.push(cacheKey); // 키 목록에 추가
    replayMode.cachedData[cacheKey] = data || []; // 데이터 저장
}

// 오늘 날짜 가져오기 (YYYY-MM-DD 형식)
// 이 함수가 하는 일: 현재 날짜를 "2025-01-15" 형식의 문자열로 변환
function getTodayDate() {
    const today = new Date(); // 현재 날짜 객체
    return today.toISOString().split('T')[0]; // ISO 형식에서 날짜 부분만 추출
}

// Replay 날짜 입력 초기화
// 이 함수가 하는 일: 날짜 선택 입력창에 선택 가능한 날짜 범위 설정 (과거~오늘)
function initReplayDateInput() {
    const dateInput = document.getElementById('replayDate'); // 날짜 입력 요소
    if (dateInput) {
        const today = getTodayDate();
        // 시작일 ~ 오늘까지만 선택 가능 (미래 날짜 불가)
        dateInput.min = replayApiConfig.dateRange.start; // 최소 날짜
        dateInput.max = today; // 최대 날짜 (오늘)
        dateInput.value = today; // 기본값: 오늘 날짜
        console.log('Date input initialized:', dateInput.min, '-', dateInput.max, '(today:', today, ')');
    }
}

// Replay 모드 토글
// 이 함수가 하는 일: 실시간 모드와 리플레이 모드를 전환 (사용자가 리플레이 버튼을 누를 때 실행)
function toggleReplayMode() {
    // 모드 전환 (실시간 <-> 리플레이)
    replayMode.enabled = !replayMode.enabled;

    // UI 요소들 가져오기
    const toggle = document.getElementById('replayToggle'); // 리플레이 토글 버튼
    const content = document.getElementById('replayContent'); // 리플레이 컨트롤 패널
    const statusBadge = document.getElementById('apiStatusBadge'); // 상단 상태 배지
    const liveIndicator = document.getElementById('liveStatusIndicator'); // 실시간 표시기
    const replayIndicator = document.getElementById('replayTimeIndicator'); // 리플레이 시간 표시기
    const replayTimeDisplay = document.getElementById('replayTimeDisplay'); // 리플레이 시간 텍스트

    console.log('Toggle Replay Mode:', replayMode.enabled);
    console.log('Replay Indicator Element:', replayIndicator);

    if (replayMode.enabled) {
        // 리플레이 모드 활성화
        toggle.classList.add('active'); // 버튼에 활성화 표시
        toggle.setAttribute('aria-checked', 'true'); // 접근성: 토글 상태 업데이트
        content.classList.add('visible'); // 컨트롤 패널 표시

        // 상단 표시기 전환 (실시간 → 리플레이) - 가장 먼저!
        if (liveIndicator) liveIndicator.style.display = 'none'; // 실시간 표시 숨김
        if (replayIndicator) {
            replayIndicator.style.display = 'flex'; // 리플레이 표시
            console.log('Replay indicator shown:', replayIndicator);
        }

        // 상태 배지 변경
        if (statusBadge) {
            statusBadge.textContent = 'REPLAY'; // 텍스트 변경
            statusBadge.style.background = '#9b59b6'; // 보라색으로 변경
        }

        // 날짜 범위 설정 (DB 메타데이터 기반)
        try {
            const dateInput = document.getElementById('replayDate');
            const today = getTodayDate();
            if (dateInput) {
                // 날짜 입력창 범위 설정
                dateInput.min = replayApiConfig.dateRange.start; // 최소 날짜
                dateInput.max = today; // 최대 날짜 (오늘)
                dateInput.value = today; // 기본값: 오늘
                replayMode.date = today;
            }
            replayMode.hour = 12; // 기본 시간: 12시

            // DB 메타데이터 비동기 로드 후 데이터 로드 (Race Condition 방지)
            fetchReplayMetadata().then(meta => {
                if (meta && dateInput) {
                    // 서버에서 받은 실제 데이터 범위로 업데이트
                    dateInput.min = meta.min_date;
                    if (meta.max_date < today) {
                        dateInput.max = meta.max_date;
                    }
                    console.log('Date range updated from DB:', meta.min_date, '~', dateInput.max);
                }
                // 메타데이터 로드 완료 후 데이터 로드
                loadReplayData();
            }).catch(() => {
                // 메타데이터 실패 시에도 데이터 로드 시도
                loadReplayData();
            });
        } catch (e) {
            console.error('Replay date setup error:', e);
        }

        // 초기 시간 즉시 표시
        if (replayTimeDisplay) {
            const initialTime = `${replayMode.date || getTodayDate()} ${String(replayMode.hour || 12).padStart(2, '0')}:00`;
            replayTimeDisplay.textContent = initialTime;
        }
    } else {
        // 리플레이 모드 비활성화 (실시간 모드로 복귀)
        toggle.classList.remove('active'); // 버튼 비활성화 표시
        toggle.setAttribute('aria-checked', 'false'); // 접근성: 토글 상태 업데이트
        content.classList.remove('visible'); // 컨트롤 패널 숨김
        stopReplayPlay(); // 자동 재생 중지

        // 상단 표시기 전환 (리플레이 → 실시간)
        if (liveIndicator) liveIndicator.style.display = 'flex'; // 실시간 표시
        if (replayIndicator) {
            replayIndicator.style.display = 'none'; // 리플레이 표시 숨김
        }

        // 실시간 모드로 복귀
        if (statusBadge) {
            statusBadge.textContent = 'LIVE'; // 텍스트 변경
            statusBadge.style.background = '#2ecc71'; // 초록색으로 변경
        }
        document.getElementById('replayStatus').textContent = '날짜를 선택하세요';

        // 실시간 데이터 다시 로드
        updateFromApi();
    }
}

// 날짜 변경 핸들러
// 이 함수가 하는 일: 사용자가 날짜를 선택하면 해당 날짜의 데이터 로드
function onReplayDateChange() {
    const dateInput = document.getElementById('replayDate');
    replayMode.date = dateInput.value; // 선택한 날짜 저장

    if (replayMode.date) {
        loadReplayData(); // 새 날짜의 데이터 로드
    }
}

// 시간 슬라이더 변경 핸들러
// 이 함수가 하는 일: 사용자가 시간 슬라이더를 움직이면 해당 시간의 데이터 로드
function onReplaySliderChange(value) {
    replayMode.hour = parseInt(value); // 선택한 시간 (0~23)
    const timeValue = document.getElementById('replayTimeValue'); // 슬라이더 옆 시간 표시
    const replayTimeDisplay = document.getElementById('replayTimeDisplay'); // 상단 시간 표시
    const timeStr = `${String(replayMode.hour).padStart(2, '0')}:00`; // "09:00" 형식

    timeValue.textContent = timeStr;

    // 상단 navbar 시간 표시 업데이트
    if (replayTimeDisplay && replayMode.date) {
        const fullTimeStr = `${replayMode.date} ${timeStr}`; // "2025-01-15 09:00"
        replayTimeDisplay.textContent = fullTimeStr;
    }

    if (replayMode.date) {
        loadReplayData(); // 새 시간의 데이터 로드
    }
}

// 이전 시간
// 이 함수가 하는 일: 한 시간 전으로 이동 (0시면 전날 23시로)
function replayPrevHour() {
    const slider = document.getElementById('replaySlider');
    if (replayMode.hour > 0) {
        // 같은 날 내에서 한 시간 이전
        replayMode.hour--;
        slider.value = replayMode.hour;
        onReplaySliderChange(replayMode.hour);
    } else {
        // 0시 → 전날 23시로 이동
        const dateInput = document.getElementById('replayDate');
        const currentDate = new Date(replayMode.date);
        currentDate.setDate(currentDate.getDate() - 1); // 하루 빼기
        const prevDate = currentDate.toISOString().split('T')[0];
        if (dateInput && prevDate >= dateInput.min) {
            // 날짜 범위 내에 있으면 이동
            dateInput.value = prevDate;
            replayMode.date = prevDate;
            replayMode.hour = 23;
            slider.value = 23;
            onReplaySliderChange(23);
        }
    }
}

// 다음 시간
// 이 함수가 하는 일: 한 시간 후로 이동 (23시면 다음날 0시로)
function replayNextHour() {
    const slider = document.getElementById('replaySlider');
    if (replayMode.hour < 23) {
        // 같은 날 내에서 한 시간 이후
        replayMode.hour++;
        slider.value = replayMode.hour;
        onReplaySliderChange(replayMode.hour);
    } else {
        // 23시 → 다음날 0시로 이동
        const dateInput = document.getElementById('replayDate');
        const currentDate = new Date(replayMode.date);
        currentDate.setDate(currentDate.getDate() + 1); // 하루 더하기
        const nextDate = currentDate.toISOString().split('T')[0];
        if (dateInput && nextDate <= dateInput.max) {
            // 날짜 범위 내에 있으면 이동
            dateInput.value = nextDate;
            replayMode.date = nextDate;
            replayMode.hour = 0;
            slider.value = 0;
            onReplaySliderChange(0);
        }
    }
}

// 시간 표시 UI만 업데이트 (데이터 로드 없이)
// 이 함수가 하는 일: 화면에 표시되는 시간만 변경 (데이터는 나중에 로드)
function updateReplayTimeUI(hour) {
    const timeValue = document.getElementById('replayTimeValue'); // 슬라이더 옆 시간
    const replayTimeDisplay = document.getElementById('replayTimeDisplay'); // 상단 시간
    const slider = document.getElementById('replaySlider'); // 슬라이더
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    slider.value = hour; // 슬라이더 위치 변경
    timeValue.textContent = timeStr; // 텍스트 변경
    if (replayTimeDisplay && replayMode.date) {
        replayTimeDisplay.textContent = `${replayMode.date} ${timeStr}`;
    }
}

// 자동 재생 토글 (적응형 속도: 캐시 히트 시 300ms, 미스 시 로드 완료 즉시)
// 이 함수가 하는 일: 자동으로 시간을 1시간씩 증가시키며 데이터를 연속 재생
function toggleReplayPlay() {
    const playBtn = document.getElementById('replayPlayBtn'); // 재생/일시정지 버튼

    if (replayMode.isPlaying) {
        // 재생 중이면 중지
        stopReplayPlay();
    } else {
        // 재생 시작
        if (!replayMode.date) {
            alert('날짜를 먼저 선택하세요');
            return;
        }
        replayMode.isPlaying = true;
        playBtn.classList.add('active'); // 버튼 활성화 표시
        playBtn.innerHTML = '⏸'; // 일시정지 아이콘으로 변경

        // 적응형 재생 루프
        async function playLoop() {
            while (replayMode.isPlaying) {
                if (replayMode.hour < 23) {
                    // 같은 날 내에서 다음 시간으로
                    const nextHour = replayMode.hour + 1;
                    const cacheKey = `${replayMode.date}_${nextHour}`;
                    const isCached = !!replayMode.cachedData[cacheKey]; // 캐시에 있는지 확인

                    // 다음 시간으로 이동 (UI만 업데이트)
                    replayMode.hour = nextHour;
                    updateReplayTimeUI(nextHour);

                    // isLoading 대기 (프리페치 진행 중일 수 있음)
                    while (replayMode.isLoading && replayMode.isPlaying) {
                        await new Promise(r => setTimeout(r, 50)); // 50ms마다 확인
                    }
                    // 데이터 로드 (캐시 히트면 즉시, 미스면 API 대기)
                    await loadReplayData();

                    // 캐시 히트: 속도에 따른 딜레이로 진행
                    // 캐시 미스: 로드 완료 후 즉시 진행 (추가 대기 없음)
                    if (isCached && replayMode.isPlaying) {
                        const baseDelay = 300; // 기본 딜레이 (1x 속도)
                        const delay = baseDelay / (replayMode.playSpeed || 1);
                        await new Promise(r => setTimeout(r, delay));
                    }
                } else {
                    // 23시 → 다음날 0시로 이동
                    const dateInput = document.getElementById('replayDate');
                    const currentDate = new Date(replayMode.date);
                    currentDate.setDate(currentDate.getDate() + 1);
                    const nextDate = currentDate.toISOString().split('T')[0];
                    if (dateInput && nextDate <= dateInput.max) {
                        // 다음 날로 이동 가능
                        dateInput.value = nextDate;
                        replayMode.date = nextDate;
                        replayMode.hour = 0;
                        updateReplayTimeUI(0);
                        while (replayMode.isLoading && replayMode.isPlaying) {
                            await new Promise(r => setTimeout(r, 50));
                        }
                        await loadReplayData();
                    } else {
                        // max_date 끝이면 재생 중지
                        stopReplayPlay();
                    }
                }
            }
        }
        playLoop(); // 재생 시작
    }
}

// 자동 재생 중지
// 이 함수가 하는 일: 자동 재생을 멈춤
function stopReplayPlay() {
    const playBtn = document.getElementById('replayPlayBtn');
    replayMode.isPlaying = false; // 재생 플래그 해제
    playBtn.classList.remove('active'); // 버튼 비활성화 표시
    playBtn.innerHTML = '▶'; // 재생 아이콘으로 변경
}

// 재생 속도 변경
// 이 함수가 하는 일: 0.5x, 1x, 2x 속도 버튼 클릭 시 재생 속도 변경
function setReplaySpeed(speed) {
    replayMode.playSpeed = speed;
    // 버튼 활성 상태 업데이트
    document.querySelectorAll('.replay-speed-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });
}

// 속도 버튼 이벤트 바인딩 (init.js의 initEventHandlers에서 호출 불필요 - 자체 초기화)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.replay-speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setReplaySpeed(parseFloat(btn.dataset.speed));
        });
    });
});
