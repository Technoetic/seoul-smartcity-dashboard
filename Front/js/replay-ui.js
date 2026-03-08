// ===== replay-ui.js =====
// 이 파일의 역할: 리플레이 데이터를 화면에 표시하는 UI 업데이트 담당
// - 로드한 과거 데이터를 지도와 정보창에 적용
// - 시간 변경 시 시각적 효과 (플래시, 애니메이션)
// - 센서 좌표 업데이트 및 동 데이터 갱신
// - 연결 파일: replay-data.js (데이터 로드), map.js (지도 색상 변경), info.js (정보창 업데이트), data.js (센서 데이터)
// ================================

// 리플레이 빨리감기 효과 표시
// 이 함수가 하는 일: 시간이 변경될 때 상단 시간 표시에 깜빡임 효과를 줌
function showReplayEffect(timeStr) {
    const replayTimeDisplay = document.getElementById('replayTimeDisplay'); // 상단 시간 텍스트
    const replayIndicator = document.getElementById('replayTimeIndicator'); // 상단 인디케이터 박스

    // 상단 navbar에 시간 표시 업데이트 + 플래시 효과
    if (replayTimeDisplay) {
        // 시간 변경 시 깜빡임 효과
        replayTimeDisplay.style.transform = 'scale(1.2)'; // 크기 확대
        replayTimeDisplay.style.color = '#ffeb3b'; // 노란색으로 변경
        replayTimeDisplay.textContent = timeStr; // 시간 텍스트 변경

        // 0.2초 후 원래대로 복귀
        setTimeout(() => {
            replayTimeDisplay.style.transform = 'scale(1)'; // 원래 크기
            replayTimeDisplay.style.color = '#ffffff'; // 흰색으로 복귀
        }, 200);
    }

    // 인디케이터 전체 플래시 효과 (보라색 그림자)
    if (replayIndicator) {
        replayIndicator.style.boxShadow = '0 0 30px rgba(155, 89, 182, 1)'; // 강한 그림자
        setTimeout(() => {
            replayIndicator.style.boxShadow = '0 0 15px rgba(155, 89, 182, 0.6)'; // 약한 그림자로 복귀
        }, 300);
    }
}

// Replay 데이터 적용
// 이 함수가 하는 일: 캐시에 저장된 과거 데이터를 지도와 정보창에 실제로 적용
function applyReplayData() {
    const cacheKey = `${replayMode.date}_${replayMode.hour}`; // 캐시 키
    const hourData = replayMode.cachedData[cacheKey]; // 해당 시간의 센서 데이터 배열

    // 항상 시간 표시 업데이트
    const timeStr = `${String(replayMode.hour).padStart(2, '0')}:00`; // "09:00"
    const fullTimeStr = `${replayMode.date} ${timeStr}`; // "2025-01-15 09:00"
    showReplayEffect(fullTimeStr); // 시각적 효과

    // 상태 업데이트
    const status = document.getElementById('replayStatus');

    // 현재 날짜/시간과 비교하여 미래인지 확인
    const now = new Date(); // 현재 시간
    const replayDateTime = new Date(`${replayMode.date}T${timeStr}:00`); // 리플레이 시간

    if (replayDateTime > now) {
        // 미래 시간 - 데이터 없음, 재생 중지
        stopReplayPlay(); // 자동 재생 중지

        status.textContent = `⏳ ${replayMode.date} ${timeStr} - 미래 시간 (데이터 없음)`;

        // 현재 선택된 지역 이름 가져오기
        let locationName = '서울시 전체';
        if (selectedDong && selectedDistrict) {
            locationName = `${selectedDistrict} ${selectedDong}`;
        } else if (selectedDistrict) {
            locationName = selectedDistrict;
        }

        // 정보창을 빈 데이터로 업데이트
        updateInfoBox(locationName, null, {
            avgTemp: null,
            avgHum: null,
            avgNoise: null,
            sensorCount: 0
        });

        // 하단 시간 표시
        document.getElementById('currentTime').textContent =
            `${replayMode.date} ${timeStr}:00 (미래)`;
        return; // 종료
    }

    if (hourData && hourData.length > 0) {
        // 데이터가 있는 경우
        // 데이터 처리 및 적용
        const processedKey = `${replayMode.date}_${replayMode.hour}`;
        let processed;
        if (replayMode.processedCache[processedKey]) {
            processed = replayMode.processedCache[processedKey];
        } else {
            processed = processApiData(hourData);
            replayMode.processedCache[processedKey] = processed;
        }
        apiDataCache.byDistrict = processed.byDistrict;
        apiDataCache.bySensor = processed.bySensor;
        apiDataCache.data = hourData;

        // DB 위치정보로 sensorData 좌표 업데이트 (replay 모드)
        Object.keys(processed.bySensor).forEach(sensorId => {
            const s = processed.bySensor[sensorId];
            if (s.lat && s.lng && s.district) {
                const districtKo = s.district;
                const dongName = s.dong || '기타';
                if (sensorData[districtKo]) {
                    // 해당 구에서 센서 찾기
                    let found = false;
                    Object.keys(sensorData[districtKo]).forEach(dong => {
                        const sensors = sensorData[districtKo][dong];
                        const idx = sensors.findIndex(sen => sen.id === sensorId);
                        if (idx !== -1) {
                            sensors[idx].lat = s.lat;
                            sensors[idx].lng = s.lng;
                            found = true;
                        }
                    });
                    // 기존에 없는 센서면 동에 추가
                    if (!found) {
                        // 가장 유사한 동 이름 찾기
                        let targetDong = Object.keys(sensorData[districtKo])[0];
                        Object.keys(sensorData[districtKo]).forEach(dong => {
                            if (dongName && dongName.includes(dong.replace(/[0-9()·동]/g, ''))) {
                                targetDong = dong;
                            }
                        });
                        if (targetDong) {
                            sensorData[districtKo][targetDong].push({
                                id: sensorId, lat: s.lat, lng: s.lng
                            });
                        }
                    }
                }
            }
        });

        // 동 뷰일 때 dongData 갱신 (replay 데이터 반영)
        if (selectedDistrict && (currentView === 'dong' || currentView === 'dongZoom')) {
            // 기존 dongData 초기화
            Object.keys(dongData).forEach(key => {
                if (key.startsWith(selectedDistrict + '_')) {
                    // 해당 구의 모든 동 데이터 초기화
                    dongData[key].temp = null;
                    dongData[key].humidity = null;
                    dongData[key].noise = null;
                    dongData[key].sensorCount = 0;
                }
            });
            // replay 센서 데이터로 dongData 채우기
            Object.values(processed.bySensor).forEach(sensor => {
                if (sensor.district === selectedDistrict) {
                    // 선택된 구의 센서만 처리
                    const dongKeys = Object.keys(dongData).filter(k => k.startsWith(selectedDistrict + '_'));
                    dongKeys.forEach(key => {
                        const dongName = key.replace(selectedDistrict + '_', ''); // "역삼1동"
                        const dongBase = dongName.replace(/[0-9()·동가]/g, ''); // "역삼"
                        const sensorDongBase = sensor.dong ? sensor.dong.replace(/[0-9()·동가\-]/g, '').replace(/(il|i|sam|sa|o|yuk|chil|pal|gu|sip)/g, '') : '';
                        // 동 이름 매칭 (여러 방식으로 시도)
                        if (sensor.dong && (
                            sensor.dong.includes(dongName) ||
                            dongName.includes(sensor.dong.replace(/[0-9가]*/g, '')) ||
                            dongBase === sensorDongBase ||
                            (dongBase.length >= 2 && sensorDongBase.includes(dongBase)) ||
                            (sensorDongBase.length >= 2 && dongBase.includes(sensorDongBase))
                        )) {
                            const m = sensor.measurements; // 센서 측정값
                            // 온도 평균 계산
                            if (m.temp !== null) {
                                if (dongData[key].temp === null) {
                                    // 첫 센서
                                    dongData[key].temp = m.temp;
                                    dongData[key].sensorCount = 1;
                                } else {
                                    // 여러 센서 평균
                                    dongData[key].temp = (dongData[key].temp * dongData[key].sensorCount + m.temp) / (dongData[key].sensorCount + 1);
                                    dongData[key].sensorCount++;
                                }
                            }
                            // 습도 (마지막 값 사용)
                            if (m.humidity !== null) dongData[key].humidity = m.humidity;
                        }
                    });
                }
            });
        }

        // 지도 색상 업데이트 (온도에 따라 색상 변경)
        updateMapColorsFromApi();

        // 서울시 전체 평균 계산 (모든 구의 평균을 다시 평균냄)
        let totalTemp = 0, totalHum = 0, totalNoise = 0;
        let tempCount = 0, humCount = 0, noiseCount = 0;

        Object.values(processed.byDistrict).forEach(district => {
            // 각 구의 평균값을 합산
            if (district.avgTemp !== null && !isNaN(district.avgTemp)) {
                totalTemp += district.avgTemp;
                tempCount++;
            }
            if (district.avgHum !== null && !isNaN(district.avgHum)) {
                totalHum += district.avgHum;
                humCount++;
            }
            if (district.avgNoise !== null && !isNaN(district.avgNoise)) {
                totalNoise += district.avgNoise;
                noiseCount++;
            }
        });

        // 서울시 전체 평균 데이터 객체
        const seoulTotalData = {
            avgTemp: tempCount > 0 ? totalTemp / tempCount : null, // 평균 온도
            avgHum: humCount > 0 ? totalHum / humCount : null, // 평균 습도
            avgNoise: noiseCount > 0 ? totalNoise / noiseCount : null, // 평균 소음
            sensorCount: hourData.length // 총 센서 개수
        };

        // 현재 뷰에 따라 적절한 데이터 표시
        if (currentView === 'dongZoom' && selectedDong && selectedDistrict) {
            // 동 확대 뷰: 해당 동 데이터만 표시
            const dongData = hourData.filter(d =>
                // 해당 구와 동에 속한 센서만 필터링
                (d._districtKo === selectedDistrict || d.CGG === selectedDistrict) &&
                d.DONG && d.DONG.includes(selectedDong.replace(/[0-9·동]/g, ''))
            );
            if (dongData.length > 0) {
                // 동 데이터 평균 계산
                let dTemp = 0, dHum = 0, dNoise = 0, dCount = 0;
                dongData.forEach(d => {
                    if (d.AVG_TP) { dTemp += parseFloat(d.AVG_TP); dCount++; }
                    if (d.AVG_HUM) { dHum += parseFloat(d.AVG_HUM); }
                    if (d.AVG_NIS) { dNoise += parseFloat(d.AVG_NIS); }
                });
                // 정보창에 동 데이터 표시
                updateInfoBox(`${selectedDistrict} ${selectedDong}`, null, {
                    avgTemp: dCount > 0 ? dTemp / dCount : null,
                    avgHum: dCount > 0 ? dHum / dCount : null,
                    avgNoise: dCount > 0 ? dNoise / dCount : null,
                    sensorCount: dongData.length
                });
            } else {
                // 해당 동에 데이터 없으면 서울 전체 평균 표시
                updateInfoBox(`${selectedDistrict} ${selectedDong}`, null, seoulTotalData);
            }
        } else if ((currentView === 'dong' || currentView === 'dongZoom') && selectedDistrict) {
            // 구 뷰: 해당 구 데이터 표시
            const districtData = processed.byDistrict[selectedDistrict];
            if (districtData) {
                updateInfoBox(selectedDistrict, null, districtData);
            } else {
                // 해당 구에 데이터 없으면 서울 전체 평균 표시
                updateInfoBox(selectedDistrict, null, seoulTotalData);
            }
        } else {
            // 서울시 전체 뷰
            updateInfoBox('서울시 전체', null, seoulTotalData);
        }

        // API 상태 배지를 REPLAY로 표시
        const badge = document.getElementById('apiStatusBadge');
        if (badge) {
            badge.style.background = '#9b59b6'; // 보라색
            badge.textContent = 'REPLAY';
        }

        // 상태 메시지
        status.textContent = `📅 ${replayMode.date} ${timeStr} (${hourData.length}개 센서)`;
        status.classList.add('active');

        // 현재 시간 표시 영역도 업데이트
        document.getElementById('currentTime').textContent =
            `${replayMode.date} ${timeStr}:00 (Replay)`;
    } else {
        // 데이터 없음 (해당 시간에 센서 데이터가 없는 경우)
        status.textContent = `📅 ${replayMode.date} ${timeStr} - 데이터 없음`;

        // 현재 선택된 지역에 맞게 표시
        let locationName = '서울시 전체';
        if (selectedDong && selectedDistrict) {
            locationName = `${selectedDistrict} ${selectedDong}`;
        } else if (selectedDistrict) {
            locationName = selectedDistrict;
        }

        // 정보 박스 초기화 (모든 값 null)
        updateInfoBox(locationName, null, {
            avgTemp: null,
            avgHum: null,
            avgNoise: null,
            sensorCount: 0
        });
    }
}

// 시간 업데이트
// 이 함수가 하는 일: 화면에 표시되는 현재 시간을 1초마다 업데이트 (실시간 모드에서만)
function updateTime() {
    // Replay 모드일 때는 시간을 업데이트하지 않음 (고정된 과거 시간 표시)
    if (replayMode.enabled) return;

    // 실시간 모드: 현재 시간을 한국 형식으로 표시
    document.getElementById('currentTime').textContent = new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }); // 예: "2025. 01. 15. 09:30:45"
}
