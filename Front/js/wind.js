// ===== wind.js =====
// 역할: 지도 위에 바람 방향을 시각화하는 파티클 애니메이션 구현
// 연결: anomaly.js의 windData를 읽어서 바람 방향/속도 반영, map.js/view.js에서 호출
// 기능: 바람 파티클 생성, 애니메이션 루프, 풍향 표시기 업데이트

// wind.js - 바람 애니메이션

// 바람 파티클 애니메이션 관련 변수
let windParticles = [];      // 파티클 객체 배열 (위치, 속도 등)
let windAnimationId = null;  // requestAnimationFrame ID (애니메이션 중단용)
let currentWindGroup = null; // 현재 활성화된 파티클 그룹 (SVG 요소)

// 풍향을 텍스트로 변환
// 각도(degree)를 방위(북, 남, 동, 서)로 변환
// 예: 0도 → 북, 90도 → 동, 180도 → 남, 270도 → 서
function getWindDirectionText(degrees) {
    const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const index = Math.round(degrees / 45) % 8;  // 45도씩 8방위로 나눔
    return directions[index];
}

// 통합 바람 파티클 애니메이션
// 지도의 모든 뷰(서울 전체, 구 상세, 동 확대)에서 사용되는 통합 애니메이션 함수
function startWindAnimation(options) {
    const { container, mode, width, height, scale, districtFeature } = options;
    // mode: 'city'(서울 전체) | 'district'(구 상세) | 'overlay'(동 확대)

    stopWindAnimation();  // 기존 애니메이션 중단
    currentWindGroup = container.append('g').attr('class', 'wind-particles');  // SVG 그룹 생성

    // 뷰 모드별 파티클 설정 (개수, 크기, 속도, 투명도)
    const config = {
        city: { numParticles: 80, sizeMin: 1.5, sizeMax: 3.5, speedMin: 0.5, speedMax: 2.0, opacityMin: 0.3, opacityMax: 0.7 },
        district: { numParticles: 60, sizeMin: 1, sizeMax: 3, speedMin: 0.5, speedMax: 2.0, opacityMin: 0.3, opacityMax: 0.7 },
        overlay: { numParticles: 400, sizeMin: 3, sizeMax: 7, speedMin: 0.5, speedMax: 1.5, opacityMin: 0.5, opacityMax: 0.9 }
    }[mode] || config.district;

    windParticles = [];  // 파티클 배열 초기화

    // overlay 모드(동 확대)일 때: 특정 지역 영역 내에서만 파티클 생성
    if (mode === 'overlay' && districtFeature && scale) {
        const bounds = mapPath.bounds(districtFeature);  // 구 영역의 경계 박스
        const cx = (bounds[0][0] + bounds[1][0]) / 2;    // 중심 X
        const cy = (bounds[0][1] + bounds[1][1]) / 2;    // 중심 Y
        const areaWidth = (width / scale) * 10;           // 파티클 생성 영역 너비
        const areaHeight = (height / scale) * 10;         // 파티클 생성 영역 높이
        const startX = cx - areaWidth / 2;
        const startY = cy - areaHeight / 2;

        // 영역 내에 랜덤하게 파티클 배치
        for (let i = 0; i < config.numParticles; i++) {
            windParticles.push({
                x: startX + Math.random() * areaWidth,
                y: startY + Math.random() * areaHeight,
                speed: (config.speedMin + Math.random() * (config.speedMax - config.speedMin)) / scale,
                size: (config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin)) / scale,
                opacity: config.opacityMin + Math.random() * (config.opacityMax - config.opacityMin),
                areaWidth, areaHeight, startX, startY  // 영역 정보 저장
            });
        }
    }
    // city/district 모드: 전체 화면에 랜덤하게 파티클 생성
    else {
        for (let i = 0; i < config.numParticles; i++) {
            windParticles.push({
                x: Math.random() * width,   // 랜덤 X 좌표
                y: Math.random() * height,  // 랜덤 Y 좌표
                speed: config.speedMin + Math.random() * (config.speedMax - config.speedMin),
                size: config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin),
                opacity: config.opacityMin + Math.random() * (config.opacityMax - config.opacityMin)
            });
        }
    }

    // 파티클 SVG 요소 생성 (D3.js 데이터 바인딩)
    const circles = currentWindGroup.selectAll('circle.wind-particle')
        .data(windParticles)    // 파티클 데이터 바인딩
        .enter()
        .append('circle')       // SVG circle 요소 생성
        .attr('class', 'wind-particle')
        .attr('r', d => d.size)         // 반지름
        .attr('opacity', d => d.opacity); // 투명도

    // overlay 모드일 때는 하늘색으로 표시
    if (mode === 'overlay') {
        circles.attr('fill', 'rgba(0, 217, 255, 0.8)');
    }

    // 애니메이션 루프 (매 프레임마다 실행)
    function animate() {
        // 풍향을 라디안으로 변환 (180도 빼는 이유: 바람이 불어오는 방향 표시)
        const radians = (windData.direction - 180) * Math.PI / 180;

        // overlay 모드: 특정 영역 내에서만 순환
        if (mode === 'overlay') {
            const baseSpeed = (windData.speed || 2) * 0.15 / scale;
            windParticles.forEach(p => {
                // 풍향에 따라 X, Y 좌표 이동
                p.x += Math.sin(radians) * baseSpeed * p.speed * 10;
                p.y -= Math.cos(radians) * baseSpeed * p.speed * 10;
                // 영역을 벗어나면 반대편에서 다시 나타남 (순환)
                if (p.x < p.startX) p.x = p.startX + p.areaWidth;
                if (p.x > p.startX + p.areaWidth) p.x = p.startX;
                if (p.y < p.startY) p.y = p.startY + p.areaHeight;
                if (p.y > p.startY + p.areaHeight) p.y = p.startY;
            });
        }
        // city/district 모드: 전체 화면에서 순환
        else {
            const speedFactor = windData.speed * 0.8;
            windParticles.forEach(p => {
                // 풍향에 따라 X, Y 좌표 이동
                p.x += Math.sin(radians) * p.speed * speedFactor;
                p.y -= Math.cos(radians) * p.speed * speedFactor;
                // 화면을 벗어나면 반대편에서 다시 나타남
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;
            });
        }

        // 파티클 위치 업데이트 (SVG 요소 이동)
        currentWindGroup.selectAll('circle.wind-particle')
            .data(windParticles)
            .attr('cx', d => d.x)  // X 좌표 갱신
            .attr('cy', d => d.y); // Y 좌표 갱신

        // 다음 프레임 예약 (60fps로 애니메이션)
        windAnimationId = requestAnimationFrame(animate);
    }

    animate();  // 애니메이션 시작
}

// 바람 애니메이션 중지
// 화면 전환 시 기존 애니메이션을 정리합니다.
function stopWindAnimation() {
    if (windAnimationId) {
        cancelAnimationFrame(windAnimationId);  // 애니메이션 루프 중단
        windAnimationId = null;
    }
    if (currentWindGroup) {
        currentWindGroup.remove();  // SVG 요소 제거
        currentWindGroup = null;
    }
}

// 하위 호환용 래퍼 함수 (기존 코드에서 호출하는 함수명 유지)
// 서울시 전체 뷰용 바람 애니메이션 시작
function startWindAnimationForCity(g, width, height) {
    startWindAnimation({ container: g, mode: 'city', width, height });
}

// 동 확대 뷰용 바람 애니메이션 시작
function startWindAnimationForOverlay(dongGroup, districtFeature, scale, viewWidth, viewHeight) {
    startWindAnimation({ container: dongGroup, mode: 'overlay', width: viewWidth, height: viewHeight, scale, districtFeature });
}

// 풍향 표시기 업데이트 (정보 패널)
// 화면 왼쪽 정보 박스에 풍향/풍속 정보를 표시합니다.
function updateWindIndicator() {
    const infoWindDir = document.getElementById('infoWindDir');      // 풍향 텍스트
    const infoWindSpeed = document.getElementById('infoWindSpeed');  // 풍속 텍스트
    const infoWindArrow = document.getElementById('infoWindArrow');  // 풍향 화살표 아이콘

    if (infoWindDir) {
        infoWindDir.textContent = `${getWindDirectionText(windData.direction)}풍`;
    }
    if (infoWindSpeed) {
        infoWindSpeed.textContent = `${windData.speed.toFixed(1)} m/s`;  // 소수점 1자리
    }
    if (infoWindArrow) {
        // 화살표를 풍향에 맞게 회전 (180도 더하는 이유: 바람이 불어오는 방향)
        infoWindArrow.setAttribute('transform', `rotate(${windData.direction + 180})`);
    }
}
