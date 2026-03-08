// ===== utils.js =====
// 역할: 프로젝트 전체에서 사용하는 공통 유틸리티 함수 모음
// 연결: 모든 파일에서 필요할 때 호출
// 기능: 좌표로 지역 찾기, 센서 상태 판단, 온도 색상 변환, 평균 계산 등

// utils.js - 유틸리티 함수

        // 좌표(경도, 위도)로 해당 위치의 구와 동 이름 찾기
        // lng: 경도, lat: 위도
        function findLocationByCoords(lng, lat) {
            const coords = [lng, lat];  // D3.js가 사용하는 좌표 형식
            let district = null;        // 찾은 구 이름
            let dong = null;            // 찾은 동 이름

            // 1단계: 먼저 구 찾기 (GeoJSON의 각 구 경계와 비교)
            if (geoData && geoData.features) {
                for (const feature of geoData.features) {
                    // d3.geoContains: 좌표가 해당 영역 안에 있는지 확인
                    if (d3.geoContains(feature, coords)) {
                        district = feature.properties.name;
                        break;
                    }
                }
            }

            // 2단계: 구를 찾았으면 해당 구의 동 찾기
            if (district && dongGeoData && dongGeoData.features) {
                // 해당 구의 코드로 동들 필터링 (예: 강남구=1123 → 1123으로 시작하는 동만)
                const code = districtCodes[district];
                const dongFeatures = code ? dongGeoData.features.filter(f =>
                    f.properties.code && f.properties.code.startsWith(code)
                ) : [];

                for (const feature of dongFeatures) {
                    if (d3.geoContains(feature, coords)) {
                        dong = feature.properties.name || feature.properties.EMD_KOR_NM;
                        break;
                    }
                }
            }

            return { district, dong };  // 찾은 구와 동 반환
        }

        // 센서 상태에 따른 CSS 클래스 반환
        // 센서 상태: normal(정상), warning(주의), danger(위험), unknown(알 수 없음)
        function getSensorStatusClass(sensorId) {
            const status = getSensorStatus(sensorId);  // anomaly.js에서 정의된 함수
            return `status-${status}`;  // 예: "status-normal", "status-danger"
        }

        // 센서 모델 타입 반환
        // V02Q처럼 V로 시작하면 'v', OC3처럼 O로 시작하면 'o'
        function getSensorModelType(sensorId) {
            if (!sensorId) return 'v';
            const firstChar = sensorId.charAt(0).toUpperCase();
            return firstChar === 'O' ? 'o' : 'v';
        }

        // 온도 값에 따른 레벨 문자열 반환
        // 지도 색상을 결정할 때 사용
        function getTempLevel(temp) {
            if (temp === null || temp === undefined || isNaN(temp)) return 'level-unknown';
            if (temp < 0) return 'level-cold';      // 0도 미만
            if (temp < 10) return 'level-cool';     // 0-10도
            if (temp < 25) return 'level-good';     // 10-25도
            if (temp < 35) return 'level-bad';      // 25-35도
            return 'level-danger';                   // 35도 이상
        }

        // 온도 레벨에 따른 색상 코드 반환 (HEX 색상)
        function getTempColor(temp) {
            if (temp === null || temp === undefined || isNaN(temp)) return '#7f8c8d';  // 회색
            if (temp < 0) return '#3498db';      // 파란색
            if (temp < 10) return '#00d9ff';     // 하늘색
            if (temp < 25) return '#2ecc71';     // 초록색
            if (temp < 35) return '#f39c12';     // 주황색
            return '#e74c3c';                    // 빨간색
        }

        // 온도 레벨에 따른 발광 효과(glow filter) 반환
        // CSS filter 속성에 사용
        function getTempGlow(temp) {
            if (temp === null || temp === undefined || isNaN(temp)) return 'drop-shadow(0 0 1px rgba(127, 140, 141, 0.3))';
            if (temp < 0) return 'drop-shadow(0 0 2px rgba(52, 152, 219, 0.5))';
            if (temp < 10) return 'drop-shadow(0 0 2px rgba(0, 217, 255, 0.4))';
            if (temp < 25) return 'drop-shadow(0 0 2px rgba(46, 204, 113, 0.4))';
            if (temp < 35) return 'drop-shadow(0 0 3px rgba(243, 156, 18, 0.5))';
            return 'drop-shadow(0 0 4px rgba(231, 76, 60, 0.6))';
        }

        // 동 이름 정규화 (숫자, 특수문자 제거)
        // 예: "역삼1동" → "역삼", "논현2동" → "논현"
        // 동 이름 매칭할 때 사용
        function normalizeDongName(dongName) {
            return dongName.replace(/[0-9()·동가\-\s]/g, '');
        }

        // 유효한 값들의 평균 계산 (null, NaN 제외)
        // 배열에서 숫자만 골라서 평균을 구합니다.
        function calculateAverage(values) {
            const valid = values.filter(v => v !== null && v !== undefined && !isNaN(v));
            return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
        }

        // 지역 크기에 맞는 폰트 크기 계산
        // 큰 구는 큰 글씨, 작은 구는 작은 글씨로 자동 조절
        function calculateFontSize(feature, path, text, minSize = 6, maxSize = 14) {
            const bounds = path.bounds(feature);  // 지역의 경계 박스 구하기
            const width = bounds[1][0] - bounds[0][0];   // 가로 크기
            const height = bounds[1][1] - bounds[0][1];  // 세로 크기

            // 텍스트 길이에 따른 폰트 크기 계산 (가로 기준)
            const charWidth = 0.6; // 대략적인 문자 폭 비율
            const textLength = text.length;
            const maxFontByWidth = (width * 0.8) / (textLength * charWidth);

            // 세로 기준 폰트 크기
            const maxFontByHeight = height * 0.25;

            // 둘 중 작은 값 선택, min/max 범위 내로 제한
            const fontSize = Math.min(maxFontByWidth, maxFontByHeight);
            return Math.max(minSize, Math.min(maxSize, fontSize));
        }

        // throttle: 지정 시간 간격으로만 함수 실행 (마우스 호버, 스크롤 등)
        function throttle(func, wait) {
            let lastTime = 0;
            return function(...args) {
                const now = Date.now();
                if (now - lastTime >= wait) {
                    lastTime = now;
                    func.apply(this, args);
                }
            };
        }

        // debounce: 연속 호출 후 마지막 호출만 실행 (슬라이더, 입력 필드 등)
        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

