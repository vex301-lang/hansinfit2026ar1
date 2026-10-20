# 한신초등학교 실시간 교복 AR 체험

## 특징
- 2027 교복 디자인 사양서 PDF 2~5쪽에서 추출한 앞면 도안 13개 포함
- 춘추복 / 동복 / 하복 / 체육복 및 바지형 / 치마형 선택
- 스마트폰 카메라와 MediaPipe Pose Landmarker로 어깨·골반·발목 위치 추정 후 교복 도안 겹쳐 표시
- 키(화면상의 신체 길이)에 따른 크기 조절, 수동 크기 슬라이더, 사진 저장
- 사진/영상 서버 업로드 없음, FASHN API/Render/Python 서버 불필요

## GitHub Pages 무료 배포
1. 이 ZIP 압축을 풉니다.
2. GitHub에 새 저장소를 만든 뒤 `index.html`과 `assets` 폴더를 저장소 최상위에 업로드합니다.
3. Settings → Pages → Build and deployment: Deploy from a branch → main / (root) → Save.
4. 몇 분 뒤 제공되는 `https://사용자명.github.io/저장소명/` 주소로 접속합니다.
5. 스마트폰에서 카메라 사용을 허용합니다.

## 로컬 PC 테스트
`python -m http.server 8000`을 실행하고 `http://localhost:8000`을 엽니다. 모바일에서 카메라를 쓰려면 HTTPS 사이트에서 열어야 합니다.

## 기술 및 한계
- MediaPipe Tasks Vision 0.10.22 JS와 Google의 pose_landmarker_lite 모델을 CDN에서 로딩하므로 최초 접속 때 인터넷이 필요합니다.
- AR 이미지 겹쳐보기입니다. 실제 의복 3D 변형, 가려짐 처리, 소매 관절 변형은 하지 않습니다.
- PDF 속 앞면 도안을 투명화해 사용하므로 흰색 셔츠의 윤곽이 희미할 수 있습니다.
- 춘추복은 재킷, 동복은 후드집업으로 임시 매핑했습니다. 체육복에는 치마 도안이 없어서 치마형도 체육복 바지로 표시됩니다.
- 스마트폰의 처리 성능, 촬영 구도, 조명, 모델 CDN 연결에 따라 추적 정확도가 달라집니다.
- 화면은 학생 사진을 기기에서만 처리합니다. 저장 버튼은 이용자의 기기로 다운로드합니다.
